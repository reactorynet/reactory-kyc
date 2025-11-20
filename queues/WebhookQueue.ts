import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';

/**
 * Webhook Queue Handler
 * 
 * Handles incoming webhooks from external providers (Trulio, Onfido).
 * Validates, processes, and updates verification status.
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
  private channel: string = 'kyc.webhook';

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.setupSubscriptions();
  }

  /**
   * Set up postal.js subscriptions
   */
  private setupSubscriptions(): void {
    this.context.subscribe(`${this.channel}.process`, this.processWebhook.bind(this));
    this.context.subscribe(`${this.channel}.retry`, this.retryWebhook.bind(this));

    logger.info('[WebhookQueue] Subscriptions established', {
      channel: this.channel
    });
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

      this.context.publish(`${this.channel}.process`, {
        data: job,
        timestamp: new Date()
      });

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
  private async processWebhook(data: any, envelope: any): Promise<void> {
    const job: IWebhookJob = data.data;

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

      this.context.publish(`${this.channel}.processed`, {
        providerId: job.providerId,
        webhookId: job.webhookId,
        success: true,
        processedAt: new Date()
      });

    } catch (error) {
      logger.error(`[WebhookQueue] Error processing webhook from: ${job.providerId}`, error);

      this.context.publish(`${this.channel}.failed`, {
        providerId: job.providerId,
        webhookId: job.webhookId,
        error: error.message,
        failedAt: new Date()
      });

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
    // If verification is complete, trigger notifications
    if (webhookData.status === 'complete' || webhookData.status === 'completed') {
      this.context.publish('kyc.notification.verification_complete', {
        verificationId: webhookData.verificationId,
        result: webhookData.result,
        timestamp: new Date()
      });
    }
  }

  /**
   * Retry a failed webhook processing
   */
  private async retryWebhook(data: any, envelope: any): Promise<void> {
    const job: IWebhookJob = data.data;
    const attempt = data.attempt || 1;
    const maxAttempts = 3;

    if (attempt > maxAttempts) {
      logger.warn(`[WebhookQueue] Max retry attempts reached for webhook: ${job.webhookId}`);
      return;
    }

    logger.info(`[WebhookQueue] Retrying webhook (attempt ${attempt}): ${job.webhookId}`);

    const delay = Math.pow(2, attempt) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    job.metadata = {
      ...job.metadata,
      attempt,
      lastError: data.error,
      retriedAt: new Date()
    };

    this.context.publish(`${this.channel}.process`, {
      data: job,
      timestamp: new Date()
    });
  }

  /**
   * Determine if a webhook should be retried
   */
  private shouldRetry(job: IWebhookJob, error: any): boolean {
    // Don't retry signature validation failures
    if (error.message?.includes('Invalid') && error.message?.includes('signature')) {
      return false;
    }

    const attempt = job.metadata?.attempt || 0;
    if (attempt >= 3) return false;

    // Retry for temporary errors
    return true;
  }
}

export default WebhookQueueHandler;

