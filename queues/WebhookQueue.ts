import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';
import { QueueProvider } from '@reactory/server-modules/reactory-queue/services/queue/QueueProvider';

/**
 * Webhook Queue Handler
 * 
 * Handles incoming webhooks from external providers (Trulio, Onfido).
 * Validates, processes, and updates verification status.
 * Uses QueueProvider for flexible queue backend support.
 */

export interface IWebhookJob {
  providerId: string;
  webhookId?: string;
  payload: any;
  headers: Record<string, string>;
  signature?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class WebhookQueueHandler {
  private context: Reactory.Server.IReactoryContext;
  private queueProvider: QueueProvider;
  private queueService: any;
  private queueName: string = 'kyc-webhook';

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.initializeQueue();
  }

  /**
   * Initialize queue provider and service
   */
  private async initializeQueue(): Promise<void> {
    try {
      this.queueProvider = this.context.getService('reactory.QueueProvider@1.0.0') as QueueProvider;
      
      if (!this.queueProvider) {
        logger.warn('[WebhookQueue] QueueProvider not available');
        return;
      }

      this.queueService = this.queueProvider.getDefaultProvider();

      if (this.queueService) {
        await this.setupQueueProcessors();
        logger.info('[WebhookQueue] Queue initialized successfully');
      }
    } catch (error) {
      logger.error('[WebhookQueue] Error initializing queue:', error);
    }
  }

  /**
   * Set up queue processors
   */
  private async setupQueueProcessors(): Promise<void> {
    if (!this.queueService) return;

    await this.queueService.addProcessor(
      this.queueName,
      'process',
      this.processWebhook.bind(this)
    );
  }

  /**
   * Queue a webhook for processing
   */
  async queueWebhook(job: IWebhookJob): Promise<void> {
    try {
      logger.info(`[WebhookQueue] Queuing webhook from provider: ${job.providerId}`, {
        providerId: job.providerId,
        webhookId: job.webhookId,
        timestamp: job.timestamp
      });

      if (this.queueService) {
        await this.queueService.addJob(this.queueName, {
          type: 'process',
          data: job,
          options: {
            priority: 1, // High priority for webhooks
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        });
      } else {
        await this.processWebhook({ data: job });
      }

      // Log to audit
      const auditService: any = this.context.getService('reactory-kyc.KYCAuditService@1.0.0');
      if (auditService) {
        await auditService.logProviderRequest({
          action: 'webhook_received',
          providerId: job.providerId,
          requestData: { webhookId: job.webhookId },
          outcome: 'queued'
        });
      }
    } catch (error) {
      logger.error('[WebhookQueue] Error queuing webhook:', error);
      throw error;
    }
  }

  /**
   * Process a webhook
   */
  private async processWebhook(jobData: any): Promise<void> {
    const job: IWebhookJob = jobData.data;

    try {
      logger.info(`[WebhookQueue] Processing webhook from: ${job.providerId}`);

      // Step 1: Verify webhook signature
      const isValid = await this.verifyWebhookSignature(job);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      // Step 2: Extract relevant data
      const webhookData = this.extractWebhookData(job);

      // Step 3: Update verification status based on provider response
      if (webhookData.verificationId) {
        await this.updateVerificationFromWebhook(webhookData);
      }

      // Step 4: Trigger any follow-up actions
      await this.triggerFollowUpActions(webhookData);

      logger.info(`[WebhookQueue] Webhook processed successfully from: ${job.providerId}`);

      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'processed', {
          providerId: job.providerId,
          webhookId: job.webhookId,
          success: true,
          processedAt: new Date()
        });
      }

    } catch (error) {
      logger.error(`[WebhookQueue] Error processing webhook from: ${job.providerId}`, error);

      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'failed', {
          providerId: job.providerId,
          webhookId: job.webhookId,
          error: error.message,
          failedAt: new Date()
        });
      }

      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  private async verifyWebhookSignature(job: IWebhookJob): Promise<boolean> {
    try {
      logger.info(`[WebhookQueue] Verifying signature for provider: ${job.providerId}`);

      // Get provider-specific verification utility
      const { verifyWebhookSignature } = await import('../providers/utils/webhookVerification');

      const isValid = verifyWebhookSignature(
        job.payload,
        job.signature || job.headers['x-signature'] || '',
        process.env[`${job.providerId.toUpperCase()}_WEBHOOK_SECRET`] || '',
        job.providerId
      );

      if (!isValid) {
        logger.warn(`[WebhookQueue] Invalid signature from provider: ${job.providerId}`);
      }

      return isValid;
    } catch (error) {
      logger.error('[WebhookQueue] Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Extract relevant data from webhook payload
   */
  private extractWebhookData(job: IWebhookJob): any {
    const payload = job.payload;

    // Provider-specific payload parsing
    switch (job.providerId) {
      case 'trulio':
        return this.parseTrulioWebhook(payload);
      case 'onfido':
        return this.parseOnfidoWebhook(payload);
      default:
        return this.parseGenericWebhook(payload);
    }
  }

  /**
   * Parse Trulio webhook payload
   */
  private parseTrulioWebhook(payload: any): any {
    return {
      providerId: 'trulio',
      providerCheckId: payload.check_id,
      verificationId: payload.metadata?.verificationId,
      status: payload.status,
      result: payload.result,
      decision: payload.decision,
      confidence: payload.confidence,
      completedAt: payload.completed_at,
      rawPayload: payload
    };
  }

  /**
   * Parse Onfido webhook payload
   */
  private parseOnfidoWebhook(payload: any): any {
    return {
      providerId: 'onfido',
      providerCheckId: payload.object?.id,
      verificationId: payload.object?.metadata?.verificationId,
      status: payload.object?.status,
      result: payload.object?.result,
      decision: payload.object?.decision,
      completedAt: payload.object?.completed_at,
      rawPayload: payload
    };
  }

  /**
   * Parse generic webhook payload
   */
  private parseGenericWebhook(payload: any): any {
    return {
      providerId: 'generic',
      rawPayload: payload
    };
  }

  /**
   * Update verification based on webhook data
   */
  private async updateVerificationFromWebhook(webhookData: any): Promise<void> {
    try {
      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');
      const auditService: any = this.context.getService('reactory-kyc.KYCAuditService@1.0.0');

      // Map provider status to our status
      let status = 'VALIDATING';
      if (webhookData.status === 'complete' || webhookData.status === 'completed') {
        if (webhookData.result === 'clear' || webhookData.decision === 'approve') {
          status = 'AUTO_APPROVED';
        } else if (webhookData.result === 'consider' || webhookData.decision === 'review') {
          status = 'UNDER_REVIEW';
        } else {
          status = 'REJECTED';
        }
      }

      // Update verification
      await kycService.updateVerification(webhookData.verificationId, {
        status,
        providerCheckId: webhookData.providerCheckId,
        providerResponse: webhookData.rawPayload,
        metadata: {
          providerStatus: webhookData.status,
          providerResult: webhookData.result,
          providerDecision: webhookData.decision,
          providerConfidence: webhookData.confidence,
          updatedViaWebhook: true,
          webhookReceivedAt: new Date()
        }
      });

      // Log provider response
      await auditService.logProviderRequest({
        action: 'webhook_processed',
        providerId: webhookData.providerId,
        verificationId: webhookData.verificationId,
        requestData: {
          checkId: webhookData.providerCheckId,
          status: webhookData.status
        },
        responseData: webhookData.rawPayload,
        outcome: 'success'
      });

      logger.info(`[WebhookQueue] Updated verification: ${webhookData.verificationId} to status: ${status}`);
    } catch (error) {
      logger.error('[WebhookQueue] Error updating verification from webhook:', error);
      throw error;
    }
  }

  /**
   * Trigger follow-up actions based on webhook
   */
  private async triggerFollowUpActions(webhookData: any): Promise<void> {
    // If verification is complete, emit notification event
    if (webhookData.status === 'complete' || webhookData.status === 'completed') {
      if (this.queueService) {
        await this.queueService.emit('kyc-notification', 'verification_complete', {
          verificationId: webhookData.verificationId,
          result: webhookData.result,
          timestamp: new Date()
        });
      }
    }
  }
}

export default WebhookQueueHandler;
