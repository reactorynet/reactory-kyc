import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';

/**
 * Notification Queue Handler
 * 
 * Handles asynchronous notification delivery (email, SMS, push).
 * Integrates with Reactory postal.js messaging system.
 */

export interface INotificationJob {
  type: 'email' | 'sms' | 'push';
  recipient: {
    userId?: string;
    email?: string;
    phone?: string;
    deviceToken?: string;
  };
  template: string;
  data: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
}

export class NotificationQueueHandler {
  private context: Reactory.Server.IReactoryContext;
  private channel: string = 'kyc.notification';

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.setupSubscriptions();
  }

  /**
   * Set up postal.js subscriptions
   */
  private setupSubscriptions(): void {
    this.context.subscribe(`${this.channel}.send`, this.sendNotification.bind(this));
    this.context.subscribe(`${this.channel}.retry`, this.retryNotification.bind(this));

    logger.info('[NotificationQueue] Subscriptions established', {
      channel: this.channel
    });
  }

  /**
   * Queue a notification
   */
  async queueNotification(job: INotificationJob): Promise<void> {
    try {
      logger.info(`[NotificationQueue] Queuing ${job.type} notification`, {
        type: job.type,
        template: job.template,
        priority: job.priority || 'normal'
      });

      this.context.publish(`${this.channel}.send`, {
        data: job,
        timestamp: new Date(),
        priority: job.priority || 'normal'
      });
    } catch (error) {
      logger.error('[NotificationQueue] Error queuing notification:', error);
      throw error;
    }
  }

  /**
   * Send a notification
   */
  private async sendNotification(data: any, envelope: any): Promise<void> {
    const job: INotificationJob = data.data;

    try {
      logger.info(`[NotificationQueue] Sending ${job.type} notification: ${job.template}`);

      switch (job.type) {
        case 'email':
          await this.sendEmail(job);
          break;
        case 'sms':
          await this.sendSMS(job);
          break;
        case 'push':
          await this.sendPush(job);
          break;
        default:
          throw new Error(`Unknown notification type: ${job.type}`);
      }

      logger.info(`[NotificationQueue] Notification sent successfully: ${job.template}`);

      this.context.publish(`${this.channel}.sent`, {
        type: job.type,
        template: job.template,
        success: true,
        sentAt: new Date()
      });

    } catch (error) {
      logger.error(`[NotificationQueue] Error sending notification: ${job.template}`, error);

      this.context.publish(`${this.channel}.failed`, {
        type: job.type,
        template: job.template,
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
   * Send email notification
   */
  private async sendEmail(job: INotificationJob): Promise<void> {
    logger.info(`[NotificationQueue] Sending email to: ${job.recipient.email}`);

    // In a real implementation, this would use an email service
    // For now, just log the email details
    logger.info('[NotificationQueue] Email details:', {
      to: job.recipient.email,
      template: job.template,
      data: job.data
    });

    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(job: INotificationJob): Promise<void> {
    logger.info(`[NotificationQueue] Sending SMS to: ${job.recipient.phone}`);

    // In a real implementation, this would use an SMS service (Twilio, etc.)
    logger.info('[NotificationQueue] SMS details:', {
      to: job.recipient.phone,
      template: job.template,
      data: job.data
    });

    // Simulate SMS sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Send push notification
   */
  private async sendPush(job: INotificationJob): Promise<void> {
    logger.info(`[NotificationQueue] Sending push to device: ${job.recipient.deviceToken}`);

    // In a real implementation, this would use a push service (FCM, APNS, etc.)
    logger.info('[NotificationQueue] Push details:', {
      to: job.recipient.deviceToken,
      template: job.template,
      data: job.data
    });

    // Simulate push sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Retry a failed notification
   */
  private async retryNotification(data: any, envelope: any): Promise<void> {
    const job: INotificationJob = data.data;
    const attempt = data.attempt || 1;
    const maxAttempts = 3;

    if (attempt > maxAttempts) {
      logger.warn(`[NotificationQueue] Max retry attempts reached for: ${job.template}`);
      return;
    }

    logger.info(`[NotificationQueue] Retrying notification (attempt ${attempt}): ${job.template}`);

    const delay = Math.pow(2, attempt) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    job.metadata = {
      ...job.metadata,
      attempt,
      lastError: data.error,
      retriedAt: new Date()
    };

    this.context.publish(`${this.channel}.send`, {
      data: job,
      timestamp: new Date()
    });
  }

  /**
   * Determine if a notification should be retried
   */
  private shouldRetry(job: INotificationJob, error: any): boolean {
    const attempt = job.metadata?.attempt || 0;
    if (attempt >= 3) return false;

    // Don't retry invalid recipient errors
    if (error.message?.includes('Invalid') || error.message?.includes('Not found')) {
      return false;
    }

    // Retry for temporary errors
    return true;
  }

  /**
   * Helper: Queue verification status notification
   */
  async notifyVerificationStatus(
    verificationId: string,
    status: string,
    userId: string,
    userEmail: string
  ): Promise<void> {
    const templates: Record<string, string> = {
      'SUBMITTED': 'verification_submitted',
      'UNDER_REVIEW': 'verification_under_review',
      'ADDITIONAL_INFO_REQUIRED': 'verification_additional_info',
      'AUTO_APPROVED': 'verification_approved',
      'MANUALLY_APPROVED': 'verification_approved',
      'REJECTED': 'verification_rejected'
    };

    const template = templates[status];
    if (!template) return;

    await this.queueNotification({
      type: 'email',
      recipient: {
        userId,
        email: userEmail
      },
      template,
      data: {
        verificationId,
        status
      },
      priority: status === 'REJECTED' ? 'high' : 'normal'
    });
  }
}

export default NotificationQueueHandler;

