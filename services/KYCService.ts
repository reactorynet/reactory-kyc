import Reactory from '@reactorynet/reactory-core';
import { ObjectId } from 'mongodb';
import { service } from '@reactory/server-core/application/decorators/service';
import { roles } from '@reactory/server-core/authentication/decorators';
import ApiError from '@reactory/server-core/exceptions';
import logger from '@reactory/server-core/logging';
import { KYCVerification, IKYCVerificationDocument } from '../models/KYCVerification';
import { KYCDocument } from '../models/KYCDocument';
import { KYCRiskScore } from '../models/KYCRiskScore';
import { ProviderManager } from '../providers/ProviderManager';

/**
 * KYC Service
 * 
 * Main orchestration service for KYC verification processes.
 * Coordinates document management, risk assessment, provider integration, and audit logging.
 */
@service({
  id: 'reactory-kyc.KYCService@1.0.0',
  name: 'KYCService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Main KYC verification orchestration service',
  serviceType: 'data',
  lifeCycle: 'singleton',
  dependencies: [
    { id: 'reactory-kyc.KYCDocumentService@1.0.0', alias: 'documentService' },
    { id: 'reactory-kyc.RiskAssessmentService@1.0.0', alias: 'riskService' },
    { id: 'reactory-kyc.KYCAuditService@1.0.0', alias: 'auditService' }
  ],
})
class KYCService implements Reactory.Service.IReactoryService {
  name: string = 'KYCService';
  nameSpace: string = 'reactory-kyc';
  version: string = '1.0.0';
  context: Reactory.Server.IReactoryContext;
  private providerManager: ProviderManager;

  constructor(props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) {
    this.context = context;
    this.providerManager = new ProviderManager(context);
  }

  /**
   * Get service dependencies
   */
  private get documentService(): any {
    return this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
  }

  private get riskService(): any {
    return this.context.getService('reactory-kyc.RiskAssessmentService@1.0.0');
  }

  private get auditService(): any {
    return this.context.getService('reactory-kyc.KYCAuditService@1.0.0');
  }

  /**
   * Initiate a new KYC verification
   */
  @roles(['USER'])
  async initiateVerification(params: {
    level?: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'ENHANCED';
    workflowType?: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
    providerId?: string;
    metadata?: Record<string, any>;
  }): Promise<IKYCVerificationDocument> {
    try {
      const userId = this.context.user._id;
      const organizationId = this.context.partner._id;

      logger.info(`Initiating KYC verification for user ${userId}`);

      // Determine verification level
      const level = params.level || await this.determineVerificationLevel();

      // Create verification record
      const verification = new KYCVerification({
        userId: new ObjectId(userId),
        organizationId: new ObjectId(organizationId),
        level,
        status: 'INITIATED',
        workflowType: params.workflowType || 'HYBRID',
        providerId: params.providerId,
        initiatedAt: new Date(),
        metadata: params.metadata
      });

      await verification.save();

      // Log audit event
      await this.auditService.logVerificationEvent({
        action: 'initiate',
        verificationId: verification._id.toString(),
        userId: userId.toString(),
        outcome: 'success',
        details: {
          level,
          workflowType: verification.workflowType
        }
      });

      logger.info(`Verification initiated: ${verification._id}`);

      return verification;
    } catch (error) {
      logger.error('Error initiating verification:', error);
      throw error;
    }
  }

  /**
   * Get verification status
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN'])
  async getVerificationStatus(verificationId: string): Promise<IKYCVerificationDocument> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      // Check authorization
      const isOwner = verification.userId.toString() === this.context.user._id.toString();
      const isReviewer = this.context.hasRole('KYC_REVIEWER') || this.context.hasRole('ADMIN');

      if (!isOwner && !isReviewer) {
        throw new ApiError('Unauthorized: Cannot access this verification');
      }

      return verification;
    } catch (error) {
      logger.error('Error getting verification status:', error);
      throw error;
    }
  }

  /**
   * Update verification status
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN', 'SYSTEM'])
  async updateVerification(
    verificationId: string,
    updates: {
      status?: string;
      providerId?: string;
      providerCheckId?: string;
      providerResponse?: any;
      metadata?: Record<string, any>;
    }
  ): Promise<IKYCVerificationDocument> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      const before = { status: verification.status };

      // Update fields
      if (updates.status) verification.status = updates.status as any;
      if (updates.providerId) verification.providerId = updates.providerId;
      if (updates.providerCheckId) verification.providerCheckId = updates.providerCheckId;
      if (updates.providerResponse) verification.providerResponse = updates.providerResponse;
      if (updates.metadata) {
        verification.metadata = { ...verification.metadata, ...updates.metadata };
      }

      await verification.save();

      // Log audit event
      await this.auditService.logVerificationEvent({
        action: 'update',
        verificationId: verification._id.toString(),
        userId: this.context.user?._id?.toString(),
        outcome: 'success',
        before,
        after: { status: verification.status },
        details: updates
      });

      logger.info(`Verification updated: ${verificationId}`);

      return verification;
    } catch (error) {
      logger.error('Error updating verification:', error);
      throw error;
    }
  }

  /**
   * Submit verification for processing
   */
  @roles(['USER'])
  async submitVerification(verificationId: string): Promise<IKYCVerificationDocument> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      // Check ownership
      if (verification.userId.toString() !== this.context.user._id.toString()) {
        throw new ApiError('Unauthorized: Cannot submit this verification');
      }

      // Validate verification can be submitted
      if (!['INITIATED', 'PENDING_DOCUMENTS', 'ADDITIONAL_INFO_REQUIRED'].includes(verification.status)) {
        throw new ApiError(`Cannot submit verification in status: ${verification.status}`);
      }

      // Check if all required documents are present
      const documents = await KYCDocument.find({ verificationId: new ObjectId(verificationId) });
      
      if (!await this.validateRequiredDocuments(verification.level, documents)) {
        verification.status = 'PENDING_DOCUMENTS';
        await verification.save();
        throw new ApiError('Missing required documents for this verification level');
      }

      // Update status
      verification.status = 'SUBMITTED';
      await verification.save();

      // Trigger verification processing
      await this.processVerification(verificationId);

      logger.info(`Verification submitted: ${verificationId}`);

      return verification;
    } catch (error) {
      logger.error('Error submitting verification:', error);
      throw error;
    }
  }

  /**
   * Process verification (trigger workflow)
   */
  async processVerification(verificationId: string): Promise<void> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      logger.info(`Processing verification: ${verificationId} - Workflow: ${verification.workflowType}`);

      verification.status = 'PROCESSING';
      await verification.save();

      // Calculate risk score
      const riskScore = await this.riskService.calculateRiskScore(verificationId, 'automated');

      // Determine next step based on workflow type and risk score
      if (verification.workflowType === 'AUTOMATED') {
        await this.processAutomatedWorkflow(verification, riskScore);
      } else if (verification.workflowType === 'MANUAL') {
        await this.processManualWorkflow(verification);
      } else {
        // HYBRID
        await this.processHybridWorkflow(verification, riskScore);
      }

    } catch (error) {
      logger.error('Error processing verification:', error);
      
      // Update verification to failed state
      await this.updateVerification(verificationId, {
        status: 'FAILED',
        metadata: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * Approve verification
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async approveVerification(
    verificationId: string,
    reviewerId: string,
    notes?: string
  ): Promise<IKYCVerificationDocument> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      const before = { status: verification.status };

      verification.status = 'MANUALLY_APPROVED';
      verification.reviewerId = new ObjectId(reviewerId);
      verification.completedAt = new Date();
      verification.completedBy = reviewerId;
      
      if (notes) {
        verification.metadata = { ...verification.metadata, reviewNotes: notes };
      }

      await verification.save();

      // Log reviewer action
      await this.auditService.logReviewerAction({
        action: 'approve',
        verificationId: verification._id.toString(),
        reviewerId,
        before,
        after: { status: verification.status },
        details: { notes }
      });

      logger.info(`Verification approved by ${reviewerId}: ${verificationId}`);

      return verification;
    } catch (error) {
      logger.error('Error approving verification:', error);
      throw error;
    }
  }

  /**
   * Reject verification
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async rejectVerification(
    verificationId: string,
    reviewerId: string,
    reason: string
  ): Promise<IKYCVerificationDocument> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      const before = { status: verification.status };

      verification.status = 'REJECTED';
      verification.reviewerId = new ObjectId(reviewerId);
      verification.completedAt = new Date();
      verification.completedBy = reviewerId;
      verification.rejectionReason = reason;

      await verification.save();

      // Log reviewer action
      await this.auditService.logReviewerAction({
        action: 'reject',
        verificationId: verification._id.toString(),
        reviewerId,
        reason,
        before,
        after: { status: verification.status }
      });

      logger.info(`Verification rejected by ${reviewerId}: ${verificationId}`);

      return verification;
    } catch (error) {
      logger.error('Error rejecting verification:', error);
      throw error;
    }
  }

  /**
   * Request additional information
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async requestAdditionalInfo(
    verificationId: string,
    reviewerId: string,
    requirements: string[]
  ): Promise<IKYCVerificationDocument> {
    try {
      const verification = await KYCVerification.findById(verificationId);

      if (!verification) {
        throw new ApiError('Verification not found');
      }

      const before = { status: verification.status };

      verification.status = 'ADDITIONAL_INFO_REQUIRED';
      verification.reviewerId = new ObjectId(reviewerId);
      verification.metadata = {
        ...verification.metadata,
        additionalRequirements: requirements,
        requestedAt: new Date()
      };

      await verification.save();

      // Log reviewer action
      await this.auditService.logReviewerAction({
        action: 'request_info',
        verificationId: verification._id.toString(),
        reviewerId,
        before,
        after: { status: verification.status },
        details: { requirements }
      });

      logger.info(`Additional info requested by ${reviewerId}: ${verificationId}`);

      return verification;
    } catch (error) {
      logger.error('Error requesting additional info:', error);
      throw error;
    }
  }

  /**
   * Get verification history for a user
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN'])
  async getVerificationHistory(userId?: string): Promise<IKYCVerificationDocument[]> {
    try {
      const targetUserId = userId || this.context.user._id.toString();

      // Check authorization
      if (userId && userId !== this.context.user._id.toString()) {
        const isReviewer = this.context.hasRole('KYC_REVIEWER') || this.context.hasRole('ADMIN');
        if (!isReviewer) {
          throw new ApiError('Unauthorized: Cannot access verification history for this user');
        }
      }

      const verifications = await KYCVerification.find({
        userId: new ObjectId(targetUserId)
      }).sort({ createdAt: -1 });

      return verifications;
    } catch (error) {
      logger.error('Error getting verification history:', error);
      throw error;
    }
  }

  /**
   * Get verifications pending review
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async getPendingReviews(limit: number = 50): Promise<IKYCVerificationDocument[]> {
    try {
      const verifications = await KYCVerification.findPendingForReview(limit);
      return verifications;
    } catch (error) {
      logger.error('Error getting pending reviews:', error);
      throw error;
    }
  }

  /**
   * Process automated workflow
   */
  private async processAutomatedWorkflow(
    verification: IKYCVerificationDocument,
    riskScore: any
  ): Promise<void> {
    try {
      // Auto-approve if risk score meets threshold
      if (riskScore.canAutoApprove()) {
        verification.status = 'AUTO_APPROVED';
        verification.completedAt = new Date();
        verification.completedBy = 'system';
        await verification.save();

        logger.info(`Verification auto-approved: ${verification._id}`);
      } else {
        // Send to manual review
        verification.status = 'UNDER_REVIEW';
        await verification.save();

        logger.info(`Verification sent to manual review: ${verification._id}`);
      }
    } catch (error) {
      logger.error('Error in automated workflow:', error);
      throw error;
    }
  }

  /**
   * Process manual workflow
   */
  private async processManualWorkflow(verification: IKYCVerificationDocument): Promise<void> {
    try {
      // Always send to manual review
      verification.status = 'UNDER_REVIEW';
      await verification.save();

      logger.info(`Verification sent to manual review: ${verification._id}`);
    } catch (error) {
      logger.error('Error in manual workflow:', error);
      throw error;
    }
  }

  /**
   * Process hybrid workflow
   */
  private async processHybridWorkflow(
    verification: IKYCVerificationDocument,
    riskScore: any
  ): Promise<void> {
    try {
      // Use provider if configured
      if (verification.providerId) {
        await this.processWithProvider(verification);
      } else if (riskScore.canAutoApprove(75)) {
        // Higher threshold for hybrid auto-approval
        verification.status = 'AUTO_APPROVED';
        verification.completedAt = new Date();
        verification.completedBy = 'system';
        await verification.save();

        logger.info(`Verification auto-approved (hybrid): ${verification._id}`);
      } else {
        // Send to manual review
        verification.status = 'UNDER_REVIEW';
        await verification.save();

        logger.info(`Verification sent to manual review (hybrid): ${verification._id}`);
      }
    } catch (error) {
      logger.error('Error in hybrid workflow:', error);
      throw error;
    }
  }

  /**
   * Process verification with external provider
   */
  private async processWithProvider(verification: IKYCVerificationDocument): Promise<void> {
    try {
      if (!verification.providerId) {
        throw new ApiError('No provider configured for this verification');
      }

      logger.info(`Processing with provider: ${verification.providerId}`);

      // This would integrate with the provider
      // For now, we just update the status
      verification.status = 'VALIDATING';
      await verification.save();

      // TODO: Actual provider integration would happen here
      // const result = await this.providerManager.executeCheck(verification.providerId, checkRequest);
      // verification.providerCheckId = result.checkId;
      // await verification.save();

    } catch (error) {
      logger.error('Error processing with provider:', error);
      throw error;
    }
  }

  /**
   * Determine verification level based on context
   */
  private async determineVerificationLevel(): Promise<'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'ENHANCED'> {
    // This could be based on organization policy, user profile, transaction amount, etc.
    // For now, default to INTERMEDIATE
    return 'INTERMEDIATE';
  }

  /**
   * Validate required documents for verification level
   */
  private async validateRequiredDocuments(level: string, documents: any[]): Promise<boolean> {
    const requiredDocsByLevel: Record<string, string[]> = {
      BASIC: ['NATIONAL_ID', 'SELFIE'],
      INTERMEDIATE: ['NATIONAL_ID', 'PROOF_OF_ADDRESS', 'SELFIE'],
      ADVANCED: ['PASSPORT', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SELFIE'],
      ENHANCED: ['PASSPORT', 'NATIONAL_ID', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SELFIE', 'LIVENESS_VIDEO']
    };

    const requiredDocs = requiredDocsByLevel[level] || requiredDocsByLevel.INTERMEDIATE;
    const providedDocTypes = documents.map(doc => doc.documentType);

    return requiredDocs.every(type => providedDocTypes.includes(type));
  }

  setExecutionContext(executionContext: Reactory.Server.IReactoryContext): boolean {
    this.context = executionContext;
    return true;
  }
}

export default KYCService;

export const KYCServiceDefinition: Reactory.Service.IReactoryServiceDefinition<KYCService> = {
  id: 'reactory-kyc.KYCService@1.0.0',
  name: 'KYCService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Main KYC verification orchestration service',
  dependencies: [
    { id: 'reactory-kyc.KYCDocumentService@1.0.0', alias: 'documentService' },
    { id: 'reactory-kyc.RiskAssessmentService@1.0.0', alias: 'riskService' },
    { id: 'reactory-kyc.KYCAuditService@1.0.0', alias: 'auditService' }
  ],
  serviceType: 'data',
  service: (props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) => {
    return new KYCService(props, context);
  },
};

