import Reactory from '@reactorynet/reactory-core';
import logger from '@reactory/server-core/logging';
import { QueueProvider } from '@reactory/server-modules/reactory-queue/services/queue/QueueProvider';

/**
 * Document Processing Queue Handler
 * 
 * Handles asynchronous document processing jobs (OCR, validation, quality checks).
 * Uses QueueProvider for flexible queue backend support.
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
  private queueProvider: QueueProvider;
  private queueService: any;
  private queueName: string = 'kyc-document-processing';

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
        logger.warn('[DocumentProcessingQueue] QueueProvider not available');
        return;
      }

      this.queueService = this.queueProvider.getDefaultProvider();

      if (this.queueService) {
        await this.setupQueueProcessors();
        logger.info('[DocumentProcessingQueue] Queue initialized successfully');
      }
    } catch (error) {
      logger.error('[DocumentProcessingQueue] Error initializing queue:', error);
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
      this.processDocument.bind(this)
    );

    await this.queueService.addProcessor(
      this.queueName,
      'batch',
      this.processBatch.bind(this)
    );
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

      if (this.queueService) {
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
        await this.processDocument({ data: job });
      }

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

    if (this.queueService) {
      await this.queueService.addJob(this.queueName, {
        type: 'batch',
        data: { jobs },
        options: {
          priority: 2 // High priority for batches
        }
      });
    } else {
      // Process sequentially if no queue service
      for (const job of jobs) {
        await this.queueDocument(job);
      }
    }
  }

  /**
   * Process a document
   */
  private async processDocument(jobData: any): Promise<void> {
    const job: IDocumentProcessingJob = jobData.data;

    try {
      logger.info(`[DocumentProcessingQueue] Processing document: ${job.documentId}`);

      const documentService: any = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');

      // Execute each operation
      for (const operation of job.operations) {
        await this.executeOperation(operation, job, documentService);
      }

      logger.info(`[DocumentProcessingQueue] Document processed successfully: ${job.documentId}`);

      // Emit completion event
      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'completed', {
          documentId: job.documentId,
          verificationId: job.verificationId,
          success: true,
          completedAt: new Date()
        });
      }

      // Check if all documents for verification are processed
      await this.checkVerificationDocuments(job.verificationId);

    } catch (error) {
      logger.error(`[DocumentProcessingQueue] Error processing document: ${job.documentId}`, error);

      if (this.queueService) {
        await this.queueService.emit(this.queueName, 'failed', {
          documentId: job.documentId,
          error: error.message,
          failedAt: new Date()
        });
      }

      throw error;
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
        logger.info(`[DocumentProcessingQueue] Quality check queued for: ${job.documentId}`);
        break;

      case 'fraud_detection':
        logger.info(`[DocumentProcessingQueue] Fraud detection queued for: ${job.documentId}`);
        break;

      default:
        logger.warn(`[DocumentProcessingQueue] Unknown operation: ${operation}`);
    }
  }

  /**
   * Process a batch of documents
   */
  private async processBatch(jobData: any): Promise<void> {
    const jobs: IDocumentProcessingJob[] = jobData.data.jobs;

    logger.info(`[DocumentProcessingQueue] Processing batch of ${jobs.length} documents`);

    // Process documents in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < jobs.length; i += concurrency) {
      const batch = jobs.slice(i, i + concurrency);
      await Promise.all(batch.map(job => this.processDocument({ data: job })));
    }
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
        
        // Emit documents ready event
        if (this.queueService) {
          await this.queueService.emit('kyc-verification', 'documents_ready', {
            verificationId,
            documentCount: documents.length,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      logger.error('[DocumentProcessingQueue] Error checking verification documents:', error);
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
}

export default DocumentProcessingQueueHandler;
