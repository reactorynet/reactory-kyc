/**
 * KYC Queue Handlers
 * 
 * Export all queue handlers for the KYC module.
 * Integrates with Reactory postal.js messaging system.
 */

import Reactory from '@reactorynet/reactory-core';
import VerificationQueueHandler from './VerificationQueue';
import DocumentProcessingQueueHandler from './DocumentProcessingQueue';
import NotificationQueueHandler from './NotificationQueue';
import WebhookQueueHandler from './WebhookQueue';

export {
  VerificationQueueHandler,
  DocumentProcessingQueueHandler,
  NotificationQueueHandler,
  WebhookQueueHandler,
};

/**
 * Initialize all queue handlers for the KYC module
 */
export function initializeKYCQueues(context: Reactory.Server.IReactoryContext): {
  verification: VerificationQueueHandler;
  documentProcessing: DocumentProcessingQueueHandler;
  notification: NotificationQueueHandler;
  webhook: WebhookQueueHandler;
} {
  return {
    verification: new VerificationQueueHandler(context),
    documentProcessing: new DocumentProcessingQueueHandler(context),
    notification: new NotificationQueueHandler(context),
    webhook: new WebhookQueueHandler(context),
  };
}

export default {
  VerificationQueueHandler,
  DocumentProcessingQueueHandler,
  NotificationQueueHandler,
  WebhookQueueHandler,
  initializeKYCQueues,
};
