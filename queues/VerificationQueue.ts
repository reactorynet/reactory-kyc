import Reactory from '@reactorynet/reactory-core';
import logger from '@reactory/server-core/logging';
import { QueueProvider } from '@reactory/server-modules/reactory-queue/services/queue/QueueProvider';

/**
 * Verification Queue Handler
 * 
 * Handles asynchronous verification processing jobs.
 * Uses QueueProvider for flexible queue backend support (BullMQ, In-Memory, AWS SQS).
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
  private queueProvider: QueueProvider;
  private queueService: any;
  private queueName: string = 'kyc-verification';

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.initializeQueue();
  }

  /**
   * Initialize queue provider and service
   */
  private async initializeQueue(): Promise<void> {
    try {
      // Get QueueProvider service
      this.queueProvider = this.context.getService('reactory.QueueProvider@1.0.0') as QueueProvider;
      
      if (!this.queueProvider) {
        logger.warn('[VerificationQueue] QueueProvider not available, using fallback');
        return;
      }

      // Get the default queue service (BullMQ, In-Memory, or AWS SQS)
      this.queueService = this.queueProvider.getDefaultProvider();

      if (this.queueService) {
        await this.setupQueueProcessors();
        logger.info('[VerificationQueue] Queue initialized successfully', {
          queueName: this.queueName,
          provider: this.queueProvider.getAvailableProviders()
        });
      }
    } catch (error) {
      logger.error('[VerificationQueue] Error initializing queue:', error);
    }
  }

  /**
   * Set up queue processors
   */
  private async setupQueueProcessors(): Promise<void> {
    if (!this.queueService) return;

    // Register processors for different job types
    await this.queueService.addProcessor(
      this.queueName,
      'process',
      this.processVerification.bind(this)
    );

    await this.queueService.addProcessor(
      this.queueName,
      'retry',
      this.retryVerification.bind(this)
    );

    await this.queueService.addProcessor(
      this.queueName,
      'cancel',
      this.cancelVerification.bind(this)
    );
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

      if (this.queueService) {
        // Use QueueProvider to add job
        await this.queueService.addJob(this.queueName, {
          type: 'process',
          data: job,
          options: {
            priority: this.getPriorityValue(job.priority),
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        });
      } else {
        // Fallback to direct processing
        logger.warn('[VerificationQueue] Queue service not available, processing directly');
        await this.processVerification({ data: job });
      }

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
  private async processVerification(jobData: any): Promise<void> {
    const job: IVerificationJob = jobData.data;

    try {
      logger.info(`[VerificationQueue] Processing verification: ${job.verificationId}`);

      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');
      
      // Update status to processing
      await kycService.updateVerification(job.verificationId, {
        status: 'PROCESSING',
        metadata: {
          queuedAt: new Date(),
          startedProcessing: new Date()
        }
      });

      // Trigger workflow based on type
      await kycService.processVerification(job.verificationId);

      logger.info(`[VerificationQueue] Verification processed successfully: ${job.verificationId}`);

      // Emit completion event
      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'completed', {
          verificationId: job.verificationId,
          success: true,
          completedAt: new Date()
        });
      }

    } catch (error) {
      logger.error(`[VerificationQueue] Error processing verification: ${job.verificationId}`, error);

      // Emit failure event
      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'failed', {
          verificationId: job.verificationId,
          error: error.message,
          failedAt: new Date()
        });
      }

      throw error; // Re-throw to trigger retry logic
    }
  }

  /**
   * Retry a failed verification
   */
  private async retryVerification(jobData: any): Promise<void> {
    const job: IVerificationJob = jobData.data;
    const attempt = jobData.attempt || 1;

    logger.info(`[VerificationQueue] Retrying verification (attempt ${attempt}): ${job.verificationId}`);

    // Update metadata with retry info
    job.metadata = {
      ...job.metadata,
      attempt,
      lastError: jobData.error,
      retriedAt: new Date()
    };

    // Process the job
    await this.processVerification({ data: job });
  }

  /**
   * Cancel a verification job
   */
  private async cancelVerification(jobData: any): Promise<void> {
    const verificationId = jobData.verificationId;

    try {
      logger.info(`[VerificationQueue] Cancelling verification: ${verificationId}`);

      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');
      
      await kycService.updateVerification(verificationId, {
        status: 'CANCELLED',
        metadata: {
          cancelledAt: new Date(),
          cancelReason: jobData.reason || 'User requested'
        }
      });

      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'cancelled', {
          verificationId,
          cancelledAt: new Date()
        });
      }

    } catch (error) {
      logger.error(`[VerificationQueue] Error cancelling verification: ${verificationId}`, error);
      throw error;
    }
  }

  /**
   * Get priority value for queue system
   */
  private getPriorityValue(priority?: string): number {
    const priorities: Record<string, number> = {
      'critical': 1,
      'high': 2,
      'normal': 3,
      'low': 4
    };
    return priorities[priority || 'normal'] || 3;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    if (!this.queueService) {
      return { available: false };
    }

    try {
      const stats = await this.queueService.getStats(this.queueName);
      return stats;
    } catch (error) {
      logger.error('[VerificationQueue] Error getting queue stats:', error);
      return { error: error.message };
    }
  }
}

export default VerificationQueueHandler;
