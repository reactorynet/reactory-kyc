import Reactory from '@reactorynet/reactory-core';
import logger from '@reactory/server-core/logging';
import { QueueProvider } from '@reactory/server-modules/reactory-queue/services/queue/QueueProvider';

/**
 * Notification Queue Handler
 * 
 * Handles asynchronous notification delivery (email, SMS, push).
 * Uses QueueProvider for flexible queue backend support.
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
  private queueProvider: QueueProvider;
  private queueService: any;
  private queueName: string = 'kyc-notification';

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
        logger.warn('[NotificationQueue] QueueProvider not available');
        return;
      }

      this.queueService = this.queueProvider.getDefaultProvider();

      if (this.queueService) {
        await this.setupQueueProcessors();
        logger.info('[NotificationQueue] Queue initialized successfully');
      }
    } catch (error) {
      logger.error('[NotificationQueue] Error initializing queue:', error);
    }
  }

  /**
   * Set up queue processors
   */
  private async setupQueueProcessors(): Promise<void> {
    if (!this.queueService) return;

    await this.queueService.addProcessor(
      this.queueName,
      'send',
      this.sendNotification.bind(this)
    );
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

      if (this.queueService) {
        await this.queueService.addJob(this.queueName, {
          type: 'send',
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
        await this.sendNotification({ data: job });
      }
    } catch (error) {
      logger.error('[NotificationQueue] Error queuing notification:', error);
      throw error;
    }
  }

  /**
   * Send a notification
   */
  private async sendNotification(jobData: any): Promise<void> {
    const job: INotificationJob = jobData.data;

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

      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'sent', {
          type: job.type,
          template: job.template,
          success: true,
          sentAt: new Date()
        });
      }

    } catch (error) {
      logger.error(`[NotificationQueue] Error sending notification: ${job.template}`, error);

      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'failed', {
          type: job.type,
          template: job.template,
          error: error.message,
          failedAt: new Date()
        });
      }

      throw error;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(job: INotificationJob): Promise<void> {
    logger.info(`[NotificationQueue] Sending email to: ${job.recipient.email}`);

    // In a real implementation, this would use an email service
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
   * Get priority value for queue system
   */
  private getPriorityValue(priority?: string): number {
    const priorities: Record<string, number> = {
      'high': 1,
      'normal': 2,
      'low': 3
    };
    return priorities[priority || 'normal'] || 2;
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
