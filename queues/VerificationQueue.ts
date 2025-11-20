import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';

/**
 * Verification Queue Handler
 * 
 * Handles asynchronous verification processing jobs.
 * Integrates with Reactory postal.js messaging system.
 */

export interface IVerificationJob {
  verificationId: string;
  userId: string;
  workflowType: 'manual' | 'automated' | 'hybrid';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

export class VerificationQueueHandler {
  private context: Reactory.Server.IReactoryContext;
  private channel: string = 'kyc.verification';

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.setupSubscriptions();
  }

  /**
   * Set up postal.js subscriptions for verification jobs
   */
  private setupSubscriptions(): void {
    // Subscribe to verification job requests
    this.context.subscribe(`${this.channel}.process`, this.processVerification.bind(this));
    this.context.subscribe(`${this.channel}.retry`, this.retryVerification.bind(this));
    this.context.subscribe(`${this.channel}.cancel`, this.cancelVerification.bind(this));

    logger.info('[VerificationQueue] Subscriptions established', {
      channel: this.channel
    });
  }

  /**
   * Queue a new verification job
   */
  async queueVerification(job: IVerificationJob): Promise<void> {
    try {
      logger.info(`[VerificationQueue] Queuing verification: ${job.verificationId}`, {
        verificationId: job.verificationId,
        workflowType: job.workflowType,
        priority: job.priority || 'normal'
      });

      // Publish to postal.js
      this.context.publish(`${this.channel}.process`, {
        data: job,
        timestamp: new Date(),
        priority: job.priority || 'normal'
      });

      // Log to audit
      const auditService: any = this.context.getService('reactory-kyc.KYCAuditService@1.0.0');
      if (auditService) {
        await auditService.logVerificationEvent({
          action: 'queue',
          verificationId: job.verificationId,
          userId: job.userId,
          outcome: 'success',
          details: {
            workflowType: job.workflowType,
            priority: job.priority
          }
        });
      }
    } catch (error) {
      logger.error('[VerificationQueue] Error queuing verification:', error);
      throw error;
    }
  }

  /**
   * Process a verification job
   */
  private async processVerification(data: any, envelope: any): Promise<void> {
    const job: IVerificationJob = data.data;

    try {
      logger.info(`[VerificationQueue] Processing verification: ${job.verificationId}`);

      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');
      
      // Update status to processing
      await kycService.updateVerification(job.verificationId, {
        status: 'PROCESSING',
        metadata: {
          queuedAt: data.timestamp,
          startedProcessing: new Date()
        }
      });

      // Trigger workflow based on type
      await kycService.processVerification(job.verificationId);

      logger.info(`[VerificationQueue] Verification processed successfully: ${job.verificationId}`);

      // Publish completion event
      this.context.publish(`${this.channel}.completed`, {
        verificationId: job.verificationId,
        success: true,
        completedAt: new Date()
      });

    } catch (error) {
      logger.error(`[VerificationQueue] Error processing verification: ${job.verificationId}`, error);

      // Publish failure event
      this.context.publish(`${this.channel}.failed`, {
        verificationId: job.verificationId,
        error: error.message,
        failedAt: new Date()
      });

      // Optionally retry
      if (this.shouldRetry(job, error)) {
        this.context.publish(`${this.channel}.retry`, {
          data: job,
          attempt: (job.metadata?.attempt || 0) + 1,
          error: error.message
        });
      }
    }
  }

  /**
   * Retry a failed verification
   */
  private async retryVerification(data: any, envelope: any): Promise<void> {
    const job: IVerificationJob = data.data;
    const attempt = data.attempt || 1;
    const maxAttempts = 3;

    if (attempt > maxAttempts) {
      logger.warn(`[VerificationQueue] Max retry attempts reached for: ${job.verificationId}`);
      
      this.context.publish(`${this.channel}.max_retries_exceeded`, {
        verificationId: job.verificationId,
        attempts: attempt
      });
      
      return;
    }

    logger.info(`[VerificationQueue] Retrying verification (attempt ${attempt}): ${job.verificationId}`);

    // Wait before retrying (exponential backoff)
    const delay = Math.pow(2, attempt) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Update metadata with retry info
    job.metadata = {
      ...job.metadata,
      attempt,
      lastError: data.error,
      retriedAt: new Date()
    };

    // Requeue
    this.context.publish(`${this.channel}.process`, {
      data: job,
      timestamp: new Date()
    });
  }

  /**
   * Cancel a verification job
   */
  private async cancelVerification(data: any, envelope: any): Promise<void> {
    const verificationId = data.verificationId;

    try {
      logger.info(`[VerificationQueue] Cancelling verification: ${verificationId}`);

      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');
      
      await kycService.updateVerification(verificationId, {
        status: 'CANCELLED',
        metadata: {
          cancelledAt: new Date(),
          cancelReason: data.reason || 'User requested'
        }
      });

      this.context.publish(`${this.channel}.cancelled`, {
        verificationId,
        cancelledAt: new Date()
      });

    } catch (error) {
      logger.error(`[VerificationQueue] Error cancelling verification: ${verificationId}`, error);
    }
  }

  /**
   * Determine if a job should be retried
   */
  private shouldRetry(job: IVerificationJob, error: any): boolean {
    // Don't retry validation errors or user errors
    if (error.message?.includes('Invalid') || error.message?.includes('Unauthorized')) {
      return false;
    }

    // Don't retry if already attempted multiple times
    const attempt = job.metadata?.attempt || 0;
    if (attempt >= 3) {
      return false;
    }

    // Retry for temporary errors (network, timeout, etc.)
    return true;
  }
}

export default VerificationQueueHandler;

