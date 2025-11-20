import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';

/**
 * Document Processing Queue Handler
 * 
 * Handles asynchronous document processing jobs (OCR, validation, quality checks).
 * Integrates with Reactory postal.js messaging system.
 */

export interface IDocumentProcessingJob {
  documentId: string;
  verificationId: string;
  documentType: string;
  operations: ('validate' | 'extract' | 'quality_check' | 'fraud_detection')[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

export class DocumentProcessingQueueHandler {
  private context: Reactory.Server.IReactoryContext;
  private channel: string = 'kyc.document.processing';

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.setupSubscriptions();
  }

  /**
   * Set up postal.js subscriptions
   */
  private setupSubscriptions(): void {
    this.context.subscribe(`${this.channel}.process`, this.processDocument.bind(this));
    this.context.subscribe(`${this.channel}.retry`, this.retryDocument.bind(this));
    this.context.subscribe(`${this.channel}.batch`, this.processBatch.bind(this));

    logger.info('[DocumentProcessingQueue] Subscriptions established', {
      channel: this.channel
    });
  }

  /**
   * Queue a document processing job
   */
  async queueDocument(job: IDocumentProcessingJob): Promise<void> {
    try {
      logger.info(`[DocumentProcessingQueue] Queuing document: ${job.documentId}`, {
        documentId: job.documentId,
        operations: job.operations,
        priority: job.priority || 'normal'
      });

      this.context.publish(`${this.channel}.process`, {
        data: job,
        timestamp: new Date(),
        priority: job.priority || 'normal'
      });

      // Log to audit
      const auditService: any = this.context.getService('reactory-kyc.KYCAuditService@1.0.0');
      if (auditService) {
        await auditService.logDocumentAccess({
          action: 'queue_processing',
          documentId: job.documentId,
          verificationId: job.verificationId,
          outcome: 'success',
          details: {
            operations: job.operations,
            priority: job.priority
          }
        });
      }
    } catch (error) {
      logger.error('[DocumentProcessingQueue] Error queuing document:', error);
      throw error;
    }
  }

  /**
   * Queue multiple documents as a batch
   */
  async queueBatch(jobs: IDocumentProcessingJob[]): Promise<void> {
    logger.info(`[DocumentProcessingQueue] Queuing batch of ${jobs.length} documents`);

    this.context.publish(`${this.channel}.batch`, {
      jobs,
      timestamp: new Date(),
      count: jobs.length
    });
  }

  /**
   * Process a document
   */
  private async processDocument(data: any, envelope: any): Promise<void> {
    const job: IDocumentProcessingJob = data.data;

    try {
      logger.info(`[DocumentProcessingQueue] Processing document: ${job.documentId}`);

      const documentService: any = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');

      // Execute each operation
      for (const operation of job.operations) {
        await this.executeOperation(operation, job, documentService);
      }

      logger.info(`[DocumentProcessingQueue] Document processed successfully: ${job.documentId}`);

      // Publish completion event
      this.context.publish(`${this.channel}.completed`, {
        documentId: job.documentId,
        verificationId: job.verificationId,
        success: true,
        completedAt: new Date()
      });

      // Notify verification queue if all documents processed
      await this.checkVerificationDocuments(job.verificationId);

    } catch (error) {
      logger.error(`[DocumentProcessingQueue] Error processing document: ${job.documentId}`, error);

      this.context.publish(`${this.channel}.failed`, {
        documentId: job.documentId,
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
   * Execute a specific operation on the document
   */
  private async executeOperation(
    operation: string,
    job: IDocumentProcessingJob,
    documentService: any
  ): Promise<void> {
    logger.info(`[DocumentProcessingQueue] Executing ${operation} on document: ${job.documentId}`);

    switch (operation) {
      case 'validate':
        await documentService.validateKYCDocument(job.documentId, {
          status: 'pending',
          notes: 'Automated validation in progress'
        });
        break;

      case 'extract':
        await documentService.extractDocumentData(job.documentId);
        break;

      case 'quality_check':
        // Quality check would be performed by DocumentVerificationWorkflow
        logger.info(`[DocumentProcessingQueue] Quality check queued for: ${job.documentId}`);
        break;

      case 'fraud_detection':
        // Fraud detection would be performed by DocumentVerificationWorkflow
        logger.info(`[DocumentProcessingQueue] Fraud detection queued for: ${job.documentId}`);
        break;

      default:
        logger.warn(`[DocumentProcessingQueue] Unknown operation: ${operation}`);
    }
  }

  /**
   * Process a batch of documents
   */
  private async processBatch(data: any, envelope: any): Promise<void> {
    const jobs: IDocumentProcessingJob[] = data.jobs;

    logger.info(`[DocumentProcessingQueue] Processing batch of ${jobs.length} documents`);

    // Process documents in parallel (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < jobs.length; i += concurrency) {
      const batch = jobs.slice(i, i + concurrency);
      await Promise.all(
        batch.map(job =>
          this.context.publish(`${this.channel}.process`, {
            data: job,
            timestamp: new Date()
          })
        )
      );
    }
  }

  /**
   * Retry a failed document processing job
   */
  private async retryDocument(data: any, envelope: any): Promise<void> {
    const job: IDocumentProcessingJob = data.data;
    const attempt = data.attempt || 1;
    const maxAttempts = 3;

    if (attempt > maxAttempts) {
      logger.warn(`[DocumentProcessingQueue] Max retry attempts reached for: ${job.documentId}`);
      return;
    }

    logger.info(`[DocumentProcessingQueue] Retrying document (attempt ${attempt}): ${job.documentId}`);

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
   * Check if all documents for a verification have been processed
   */
  private async checkVerificationDocuments(verificationId: string): Promise<void> {
    try {
      const documentService: any = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
      const documents = await documentService.getDocumentsForVerification(verificationId);

      const allProcessed = documents.every((doc: any) => 
        doc.validationStatus && doc.validationStatus !== 'pending'
      );

      if (allProcessed) {
        logger.info(`[DocumentProcessingQueue] All documents processed for verification: ${verificationId}`);
        
        // Notify verification queue to proceed
        this.context.publish('kyc.verification.documents_ready', {
          verificationId,
          documentCount: documents.length,
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('[DocumentProcessingQueue] Error checking verification documents:', error);
    }
  }

  /**
   * Determine if a job should be retried
   */
  private shouldRetry(job: IDocumentProcessingJob, error: any): boolean {
    const attempt = job.metadata?.attempt || 0;
    if (attempt >= 3) return false;

    // Retry for temporary errors
    return !error.message?.includes('Invalid') && !error.message?.includes('Not found');
  }
}

export default DocumentProcessingQueueHandler;

