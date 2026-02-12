import Reactory from '@reactory/reactory-core';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import sharp from 'sharp';
import { service } from '@reactory/server-core/application/decorators/service';
import { roles } from '@reactory/server-core/authentication/decorators';
import ApiError from '@reactory/server-core/exceptions';
import logger from '@reactory/server-core/logging';
import { KYCDocument, IKYCDocumentDocument } from '../models/KYCDocument';
import { KYCVerification, IKYCVerificationDocument } from '../models/KYCVerification';
import ReactoryAuditService from 'modules/reactory-core/services/ReactoryAuditService';

/**
 * KYC Document Service
 * 
 * Manages document uploads, validation, and processing for KYC verification
 * Integrates with ReactoryFileService for secure file storage
 */
@service({
  id: 'reactory-kyc.KYCDocumentService@1.0.0',
  name: 'KYCDocumentService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Service for managing KYC document uploads, validation, and processing',
  serviceType: 'data',
  lifeCycle: 'singleton',
  dependencies: [
    { id: 'core.ReactoryFileService@1.0.0', alias: 'fileService' },
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
})
class KYCDocumentService implements Reactory.Service.IReactoryService {
  name: string = 'KYCDocumentService';
  nameSpace: string = 'reactory-kyc';
  version: string = '1.0.0';
  context: Reactory.Server.IReactoryContext;
  
  constructor(props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) {
    this.context = context;
  }

  public setFileService(fileService: Reactory.Service.IReactoryFileService) {
    // Placeholder for dependency injection if needed    
  }

  public setAuditService(auditService: ReactoryAuditService) {
    // Placeholder for dependency injection if needed
  }

  /**
   * Get the ReactoryFileService instance
   */
  private get fileService(): Reactory.Service.IReactoryFileService {
    return this.context.getService<Reactory.Service.IReactoryFileService>('core.ReactoryFileService@1.0.0');
  }

  /**
   * Get the ReactoryAuditService instance
   */
  private get auditService(): any {
    return this.context.getService('core.ReactoryAuditService@1.0.0');
  }

  /**
   * Calculate file hash for integrity verification
   */
  private async calculateFileHash(buffer: Buffer): Promise<string> {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validate document type and metadata
   */
  private validateDocumentMetadata(documentType: string, metadata?: any): void {
    const validTypes = [
      'PASSPORT',
      'NATIONAL_ID',
      'DRIVERS_LICENSE',
      'PROOF_OF_ADDRESS',
      'BANK_STATEMENT',
      'UTILITY_BILL',
      'SELFIE',
      'LIVENESS_VIDEO'
    ];

    if (!validTypes.includes(documentType)) {
      throw new ApiError(`Invalid document type: ${documentType}`);
    }

    // Validate document-specific requirements
    if (['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(documentType)) {
      if (!metadata?.issuingCountry) {
        throw new ApiError(`Issuing country required for ${documentType}`);
      }
    }

    if (documentType === 'PROOF_OF_ADDRESS' || documentType === 'UTILITY_BILL') {
      if (!metadata?.issueDate) {
        throw new ApiError(`Issue date required for ${documentType}`);
      }
      
      // Check that proof of address is not older than 3 months
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      if (new Date(metadata.issueDate) < threeMonthsAgo) {
        throw new ApiError(`${documentType} must not be older than 3 months`);
      }
    }
  }

  /**
   * Process and optimize image for storage
   */
  private async processImage(buffer: Buffer, mimetype: string): Promise<Buffer> {
    try {
      if (mimetype.startsWith('image/')) {
        // Optimize image: resize if too large, convert to JPEG for consistency
        const image = sharp(buffer);
        const metadata = await image.metadata();

        // Resize if width or height exceeds 2048px
        const maxDimension = 2048;
        if (metadata.width > maxDimension || metadata.height > maxDimension) {
          return await image
            .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        }

        // Convert to JPEG for standardization
        return await image.jpeg({ quality: 90 }).toBuffer();
      }

      return buffer;
    } catch (error) {
      logger.error('Error processing image:', error);
      return buffer; // Return original if processing fails
    }
  }

  /**
   * Upload a KYC document
   */
  @roles(['USER'])
  async uploadKYCDocument(
    verificationId: string,
    documentType: string,
    file: Reactory.Service.IFile,
    metadata?: {
      documentNumber?: string;
      issuingCountry?: string;
      issueDate?: Date;
      expiryDate?: Date;
    }
  ): Promise<IKYCDocumentDocument> {
    try {
      logger.info(`KYCDocumentService.uploadKYCDocument: ${verificationId} - ${documentType}`);

      // Validate verification exists
      const verification = await KYCVerification.findById(verificationId);
      if (!verification) {
        throw new ApiError('Verification not found');
      }

      // Validate user owns this verification
      if (verification.userId.toString() !== this.context.user._id.toString()) {
        throw new ApiError('Unauthorized: Cannot upload document for this verification');
      }

      // Validate document metadata
      this.validateDocumentMetadata(documentType, metadata);

      // Check if document type already exists for this verification
      const existingDoc = await KYCDocument.findOne({
        verificationId: new ObjectId(verificationId),
        documentType
      });

      if (existingDoc) {
        throw new ApiError(`Document of type ${documentType} already exists for this verification`);
      }

      // Upload file using ReactoryFileService
      const virtualPath = `/kyc/verifications/${verificationId}/documents`;
      const filename = `${documentType.toLowerCase()}_${Date.now()}`;

      const reactoryFile = await this.fileService.uploadFile({
        file,
        filename,
        isUserSpecific: false,
        virtualPath,
        uploadContext: `kyc::verification::${verificationId}::document`,
        catalog: true,
        rename: false
      });

      if (!reactoryFile || !reactoryFile.id) {
        throw new ApiError('Failed to upload file');
      }

      // Use the file hash from ReactoryFile (already calculated during upload)
      const fileHash = reactoryFile.hash || crypto.createHash('sha256').update(reactoryFile.id.toString()).digest('hex');

      // Create KYC document record
      const kycDocument = new KYCDocument({
        verificationId: new ObjectId(verificationId),
        documentType,
        documentNumber: metadata?.documentNumber,
        issuingCountry: metadata?.issuingCountry,
        issueDate: metadata?.issueDate,
        expiryDate: metadata?.expiryDate,
        fileId: reactoryFile.id,
        fileUrl: reactoryFile.link,
        fileHash,
        validationStatus: 'pending',
        uploadedAt: new Date()
      });

      await kycDocument.save();

      // Update verification with document reference
      verification.documents.push(kycDocument._id as ObjectId);
      
      // Update verification status if needed
      if (verification.status === 'INITIATED' || verification.status === 'PENDING_DOCUMENTS') {
        verification.status = 'SUBMITTED';
      }
      
      await verification.save();

      // Log audit event
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: this.context.user._id.toString(),
          action: 'kyc.document.upload',
          resourceType: 'kyc_document',
          resourceId: kycDocument._id.toString(),
          eventType: 'create',
          outcome: 'success',
          details: {
            verificationId,
            documentType,
            fileId: reactoryFile.id.toString(),
            fileHash
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      logger.info(`KYCDocumentService.uploadKYCDocument: Document uploaded successfully - ${kycDocument._id}`);

      return kycDocument;
    } catch (error) {
      logger.error('Error uploading KYC document:', error);
      
      // Log audit event for failure
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: this.context.user._id.toString(),
          action: 'kyc.document.upload',
          resourceType: 'kyc_document',
          resourceId: verificationId,
          eventType: 'create',
          outcome: 'failure',
          details: {
            error: error.message,
            documentType
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      throw error;
    }
  }

  /**
   * Get a KYC document by ID
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN'])
  async getKYCDocument(documentId: string): Promise<IKYCDocumentDocument> {
    try {
      const document = await KYCDocument.findById(documentId).populate('verificationId');

      if (!document) {
        throw new ApiError('Document not found');
      }

      // Check authorization
      const verification = document.verificationId as any;
      const isOwner = verification.userId.toString() === this.context.user._id.toString();
      const isReviewer = this.context.hasRole('KYC_REVIEWER') || this.context.hasRole('ADMIN');

      if (!isOwner && !isReviewer) {
        throw new ApiError('Unauthorized: Cannot access this document');
      }

      // Log document access
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: String(this.context.user._id),
          action: 'kyc.document.view',
          resourceType: 'kyc_document',
          resourceId: documentId,
          eventType: 'read',
          outcome: 'success',
          details: {
            verificationId: verification._id.toString(),
            documentType: document.documentType
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      return document;
    } catch (error) {
      logger.error('Error getting KYC document:', error);
      throw error;
    }
  }

  /**
   * Validate a KYC document
   */
  @roles(['KYC_REVIEWER', 'ADMIN', 'SYSTEM'])
  async validateKYCDocument(
    documentId: string,
    validationResult: {
      status: 'valid' | 'invalid' | 'expired';
      errors?: string[];
    }
  ): Promise<IKYCDocumentDocument> {
    try {
      const document = await KYCDocument.findById(documentId);

      if (!document) {
        throw new ApiError('Document not found');
      }

      const previousStatus = document.validationStatus;

      document.validationStatus = validationResult.status;
      document.validationErrors = validationResult.errors || [];
      document.validatedAt = new Date();

      await document.save();

      // Log audit event
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: String(this.context.user._id),
          action: 'kyc.document.validate',
          resourceType: 'kyc_document',
          resourceId: documentId,
          eventType: 'update',
          outcome: 'success',
          before: { validationStatus: previousStatus },
          after: { validationStatus: validationResult.status },
          details: {
            errors: validationResult.errors,
            verificationId: document.verificationId.toString()
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      logger.info(`KYCDocumentService.validateKYCDocument: Document validated - ${documentId} - ${validationResult.status}`);

      return document;
    } catch (error) {
      logger.error('Error validating KYC document:', error);
      throw error;
    }
  }

  /**
   * Extract data from document (placeholder for OCR/parsing integration)
   */
  @roles(['SYSTEM', 'KYC_REVIEWER', 'ADMIN'])
  async extractDocumentData(documentId: string): Promise<Record<string, any>> {
    try {
      const document = await KYCDocument.findById(documentId);

      if (!document) {
        throw new ApiError('Document not found');
      }

      // TODO: Integrate with OCR/document parsing services
      // For now, return placeholder data
      const extractedData = {
        documentNumber: document.documentNumber,
        issuingCountry: document.issuingCountry,
        issueDate: document.issueDate,
        expiryDate: document.expiryDate,
        // Additional fields would be extracted via OCR
      };

      // Update document with extracted data
      document.extractedData = extractedData;
      await document.save();

      logger.info(`KYCDocumentService.extractDocumentData: Data extracted - ${documentId}`);

      return extractedData;
    } catch (error) {
      logger.error('Error extracting document data:', error);
      throw error;
    }
  }

  /**
   * Delete a KYC document
   */
  @roles(['USER', 'ADMIN'])
  async deleteKYCDocument(documentId: string): Promise<boolean> {
    try {
      const document = await KYCDocument.findById(documentId).populate('verificationId');

      if (!document) {
        throw new ApiError('Document not found');
      }

      // Check authorization
      const verification = document.verificationId as any;
      const isOwner = verification.userId.toString() === this.context.user._id.toString();
      const isAdmin = this.context.hasRole('ADMIN');

      if (!isOwner && !isAdmin) {
        throw new ApiError('Unauthorized: Cannot delete this document');
      }

      // Only allow deletion if verification is not completed
      if (verification.status === 'COMPLETED' || verification.status === 'AUTO_APPROVED' || verification.status === 'MANUALLY_APPROVED') {
        throw new ApiError('Cannot delete document from completed verification');
      }

      // Delete the physical file
      // Note: In production, consider soft-delete for audit purposes
      // await this.fileService.deleteFile(document.fileId);

      // Remove document reference from verification
      await KYCVerification.updateOne(
        { _id: verification._id },
        { $pull: { documents: document._id } }
      );

      // Delete document record
      await KYCDocument.deleteOne({ _id: documentId });

      // Log audit event
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: String(this.context.user._id),
          action: 'kyc.document.delete',
          resourceType: 'kyc_document',
          resourceId: documentId,
          eventType: 'delete',
          outcome: 'success',
          before: {
            documentType: document.documentType,
            fileId: document.fileId.toString()
          },
          details: {
            verificationId: verification._id.toString()
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      logger.info(`KYCDocumentService.deleteKYCDocument: Document deleted - ${documentId}`);

      return true;
    } catch (error) {
      logger.error('Error deleting KYC document:', error);
      throw error;
    }
  }

  /**
   * Link an existing file to a KYC verification
   */
  @roles(['USER', 'ADMIN'])
  async linkDocumentToVerification(
    fileId: string,
    verificationId: string,
    documentType: string,
    metadata?: {
      documentNumber?: string;
      issuingCountry?: string;
      issueDate?: Date;
      expiryDate?: Date;
    }
  ): Promise<IKYCDocumentDocument> {
    try {
      logger.info(`KYCDocumentService.linkDocumentToVerification: ${fileId} -> ${verificationId}`);

      // Validate verification exists
      const verification = await KYCVerification.findById(verificationId);
      if (!verification) {
        throw new ApiError('Verification not found');
      }

      // Validate user owns this verification
      if (verification.userId.toString() !== this.context.user._id.toString()) {
        throw new ApiError('Unauthorized: Cannot link document to this verification');
      }

      // Validate document metadata
      this.validateDocumentMetadata(documentType, metadata);

      // Create KYC document record
      const kycDocument = new KYCDocument({
        verificationId: new ObjectId(verificationId),
        documentType,
        documentNumber: metadata?.documentNumber,
        issuingCountry: metadata?.issuingCountry,
        issueDate: metadata?.issueDate,
        expiryDate: metadata?.expiryDate,
        fileId: new ObjectId(fileId),
        fileHash: crypto.createHash('sha256').update(fileId).digest('hex'), // Placeholder
        validationStatus: 'pending',
        uploadedAt: new Date()
      });

      await kycDocument.save();

      // Update verification with document reference
      verification.documents.push(kycDocument._id as ObjectId);
      await verification.save();

      logger.info(`KYCDocumentService.linkDocumentToVerification: Document linked - ${kycDocument._id}`);

      return kycDocument;
    } catch (error) {
      logger.error('Error linking document to verification:', error);
      throw error;
    }
  }

  /**
   * Get all documents for a verification
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN'])
  async getDocumentsForVerification(verificationId: string): Promise<IKYCDocumentDocument[]> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      // Check authorization
      const isOwner = verification.userId.toString() === this.context.user._id.toString();
      const isReviewer = this.context.hasRole('KYC_REVIEWER') || this.context.hasRole('ADMIN');

      if (!isOwner && !isReviewer) {
        throw new ApiError('Unauthorized: Cannot access documents for this verification');
      }

      const documents = await KYCDocument.find({ verificationId: new ObjectId(verificationId) })
        .sort({ uploadedAt: -1 });

      return documents;
    } catch (error) {
      logger.error('Error getting documents for verification:', error);
      throw error;
    }
  }

  setExecutionContext(executionContext: Reactory.Server.IReactoryContext): boolean {
    this.context = executionContext;
    return true;
  }
}

export default KYCDocumentService;

export const KYCDocumentServiceDefinition: Reactory.Service.IReactoryServiceDefinition<KYCDocumentService> = {
  id: 'reactory-kyc.KYCDocumentService@1.0.0',
  name: 'KYCDocumentService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Service for managing KYC document uploads, validation, and processing',
  dependencies: [
    { id: 'core.ReactoryFileService@1.0.0', alias: 'fileService' },
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
  serviceType: 'data',
  service: (props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) => {
    return new KYCDocumentService(props, context);
  },
};

