import Reactory from '@reactory/reactory-core';
import { roles } from '@reactory/server-core/authentication/decorators';
import { resolver, property, query, mutation } from '@reactory/server-core/models/graphql/decorators/resolver';
import { 
  IKYCService,
  IKYCDocumentService,
  IRiskAssessmentService,
  IReportingService
} from '../../types';

/**
 * Helper function to get KYC Service
 */
const getKYCService = (context: Reactory.Server.IReactoryContext): IKYCService => {
  return context.getService("reactory-kyc.KYCService@1.0.0") as IKYCService;
};

/**
 * Helper function to get KYC Document Service
 */
const getDocumentService = (context: Reactory.Server.IReactoryContext): IKYCDocumentService => {
  return context.getService("reactory-kyc.KYCDocumentService@1.0.0") as IKYCDocumentService;
};

/**
 * Helper function to get Risk Assessment Service
 */
const getRiskService = (context: Reactory.Server.IReactoryContext): IRiskAssessmentService => {
  return context.getService("reactory-kyc.RiskAssessmentService@1.0.0") as IRiskAssessmentService;
};

/**
 * Helper function to get Reporting Service
 */
const getReportingService = (context: Reactory.Server.IReactoryContext): IReportingService => {
  return context.getService("reactory-kyc.ReportingService@1.0.0") as IReportingService;
};

/**
 * KYC GraphQL Resolver
 * Provides GraphQL API for KYC verification operations
 */
@resolver
class KYCResolver {
  resolver: any;

  // ============================================================================
  // VERIFICATION QUERIES
  // ============================================================================

  /**
   * Get a single KYC verification by ID
   */
  @roles(["USER"], 'args.context')
  @query("kycVerification")
  async getVerification(
    obj: any,
    params: { id: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      return await kycService.getVerificationStatus(params.id);
    } catch (error) {
      context.log('Error fetching KYC verification', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Get list of KYC verifications with filtering and pagination
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @query("kycVerifications")
  async getVerifications(
    obj: any,
    params: {
      filter?: any,
      page?: number,
      pageSize?: number
    },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      const { filter = {}, page = 1, pageSize = 20 } = params;

      // Get verifications with filter
      const verifications = await kycService.getVerificationHistory(
        filter.userId,
        { 
          status: filter.status,
          level: filter.level,
          workflow: filter.workflow,
          createdAfter: filter.createdAfter,
          createdBefore: filter.createdBefore
        }
      );

      // Apply pagination
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedData = verifications.slice(start, end);

      return {
        success: true,
        data: paginatedData,
        total: verifications.length,
        page,
        pageSize
      };
    } catch (error) {
      context.log('Error fetching KYC verifications', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        data: [],
        total: 0,
        page: params.page || 1,
        pageSize: params.pageSize || 20
      };
    }
  }

  /**
   * Get verification history for a user
   */
  @roles(["USER"], 'args.context')
  @query("kycVerificationHistory")
  async getVerificationHistory(
    obj: any,
    params: { userId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      
      // Users can only view their own history unless they're an admin
      if (params.userId !== context.user.id && !context.hasRole('KYC_ADMIN')) {
        throw new Error('Unauthorized to view verification history for this user');
      }

      return await kycService.getVerificationHistory(params.userId);
    } catch (error) {
      context.log('Error fetching verification history', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Get verification statistics
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @query("kycVerificationStatistics")
  async getVerificationStatistics(
    obj: any,
    params: { startDate?: Date, endDate?: Date },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const reportingService = getReportingService(context);
      return await reportingService.getVerificationStatistics(params.startDate, params.endDate);
    } catch (error) {
      context.log('Error fetching verification statistics', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  // ============================================================================
  // DOCUMENT QUERIES
  // ============================================================================

  /**
   * Get a single KYC document by ID
   */
  @roles(["USER"], 'args.context')
  @query("kycDocument")
  async getDocument(
    obj: any,
    params: { id: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const documentService = getDocumentService(context);
      return await documentService.getDocument(params.id);
    } catch (error) {
      context.log('Error fetching KYC document', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Get list of KYC documents with filtering and pagination
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @query("kycDocuments")
  async getDocuments(
    obj: any,
    params: {
      filter?: any,
      page?: number,
      pageSize?: number
    },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const documentService = getDocumentService(context);
      const { filter = {}, page = 1, pageSize = 20 } = params;

      // Get documents with filter
      const documents = await documentService.getDocumentsByVerification(
        filter.verificationId || filter.userId
      );

      // Apply status filter if provided
      let filteredDocs = documents;
      if (filter.status && filter.status.length > 0) {
        filteredDocs = documents.filter(doc => filter.status.includes(doc.status));
      }

      // Apply type filter if provided
      if (filter.type && filter.type.length > 0) {
        filteredDocs = filteredDocs.filter(doc => filter.type.includes(doc.type));
      }

      // Apply pagination
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginatedData = filteredDocs.slice(start, end);

      return {
        success: true,
        data: paginatedData,
        total: filteredDocs.length,
        page,
        pageSize
      };
    } catch (error) {
      context.log('Error fetching KYC documents', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        data: [],
        total: 0,
        page: params.page || 1,
        pageSize: params.pageSize || 20
      };
    }
  }

  /**
   * Get documents by verification ID
   */
  @roles(["USER"], 'args.context')
  @query("kycDocumentsByVerification")
  async getDocumentsByVerification(
    obj: any,
    params: { verificationId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const documentService = getDocumentService(context);
      return await documentService.getDocumentsByVerification(params.verificationId);
    } catch (error) {
      context.log('Error fetching documents by verification', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  // ============================================================================
  // RISK ASSESSMENT QUERIES
  // ============================================================================

  /**
   * Get risk score for a verification
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @query("kycRiskScore")
  async getRiskScore(
    obj: any,
    params: { verificationId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const riskService = getRiskService(context);
      return await riskService.getRiskScore(params.verificationId);
    } catch (error) {
      context.log('Error fetching risk score', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  // ============================================================================
  // PROVIDER QUERIES
  // ============================================================================

  /**
   * Get all KYC providers
   */
  @roles(["KYC_ADMIN"], 'args.context')
  @query("kycProviders")
  async getProviders(
    obj: any,
    params: any,
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const { KYCProvider } = context.models;
      return await KYCProvider.find({ enabled: true }).lean();
    } catch (error) {
      context.log('Error fetching KYC providers', { error }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Get a single KYC provider by ID
   */
  @roles(["KYC_ADMIN"], 'args.context')
  @query("kycProvider")
  async getProvider(
    obj: any,
    params: { id: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const { KYCProvider } = context.models;
      return await KYCProvider.findById(params.id).lean();
    } catch (error) {
      context.log('Error fetching KYC provider', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Get provider health status
   */
  @roles(["KYC_ADMIN"], 'args.context')
  @query("kycProviderHealth")
  async getProviderHealth(
    obj: any,
    params: any,
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      // This would call a method on the provider manager
      return {
        healthy: true,
        providers: [],
        timestamp: new Date()
      };
    } catch (error) {
      context.log('Error fetching provider health', { error }, 'error', 'KYCResolver');
      throw error;
    }
  }

  // ============================================================================
  // REPORTING QUERIES
  // ============================================================================

  /**
   * Generate verification report
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @query("kycVerificationReport")
  async getVerificationReport(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const reportingService = getReportingService(context);
      return await reportingService.generateVerificationReport(
        params.input.startDate,
        params.input.endDate,
        params.input.format || 'JSON',
        params.input.filters
      );
    } catch (error) {
      context.log('Error generating verification report', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Generate risk report
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @query("kycRiskReport")
  async getRiskReport(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const reportingService = getReportingService(context);
      return await reportingService.generateRiskReport(
        params.input.startDate,
        params.input.endDate,
        params.input.format || 'JSON',
        params.input.filters
      );
    } catch (error) {
      context.log('Error generating risk report', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  @roles(["KYC_ADMIN"], 'args.context')
  @query("kycComplianceReport")
  async getComplianceReport(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const reportingService = getReportingService(context);
      return await reportingService.generateComplianceReport(
        params.input.startDate,
        params.input.endDate,
        params.input.format || 'JSON',
        params.input.filters
      );
    } catch (error) {
      context.log('Error generating compliance report', { error, params }, 'error', 'KYCResolver');
      throw error;
    }
  }

  // ============================================================================
  // VERIFICATION MUTATIONS
  // ============================================================================

  /**
   * Initiate a new KYC verification
   */
  @roles(["USER"], 'args.context')
  @mutation("initiateKYCVerification")
  async initiateVerification(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      const { userId, level, workflow, metadata } = params.input;

      const verification = await kycService.initiateVerification(
        userId,
        level,
        workflow,
        metadata
      );

      return {
        success: true,
        message: 'Verification initiated successfully',
        verification
      };
    } catch (error) {
      context.log('Error initiating verification', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        verification: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Update a KYC verification
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @mutation("updateKYCVerification")
  async updateVerification(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      const { verificationId, status, notes, metadata } = params.input;

      const updates: any = {};
      if (status) updates.status = status;
      if (notes) {
        updates.$push = {
          notes: {
            author: context.user.id,
            content: notes,
            timestamp: new Date(),
            isInternal: true
          }
        };
      }
      if (metadata) updates.metadata = { ...metadata };

      const verification = await kycService.updateVerification(verificationId, updates);

      return {
        success: true,
        message: 'Verification updated successfully',
        verification
      };
    } catch (error) {
      context.log('Error updating verification', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        verification: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Approve a KYC verification
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @mutation("approveKYCVerification")
  async approveVerification(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      const { verificationId, notes } = params.input;

      const verification = await kycService.approveVerification(verificationId, notes);

      return {
        success: true,
        message: 'Verification approved successfully',
        verification
      };
    } catch (error) {
      context.log('Error approving verification', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        verification: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Reject a KYC verification
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @mutation("rejectKYCVerification")
  async rejectVerification(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      const { verificationId, reason, notes } = params.input;

      const verification = await kycService.rejectVerification(
        verificationId,
        reason,
        notes
      );

      return {
        success: true,
        message: 'Verification rejected',
        verification
      };
    } catch (error) {
      context.log('Error rejecting verification', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        verification: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Request additional information for verification
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @mutation("requestAdditionalKYCInfo")
  async requestAdditionalInfo(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      const { verificationId, requestedDocuments, message } = params.input;

      const verification = await kycService.requestAdditionalInfo(
        verificationId,
        requestedDocuments,
        message
      );

      return {
        success: true,
        message: 'Additional information requested',
        verification
      };
    } catch (error) {
      context.log('Error requesting additional info', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        verification: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Cancel a KYC verification
   */
  @roles(["USER", "KYC_ADMIN"], 'args.context')
  @mutation("cancelKYCVerification")
  async cancelVerification(
    obj: any,
    params: { verificationId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const kycService = getKYCService(context);
      
      const verification = await kycService.updateVerification(
        params.verificationId,
        { status: 'CANCELLED' }
      );

      return {
        success: true,
        message: 'Verification cancelled',
        verification
      };
    } catch (error) {
      context.log('Error cancelling verification', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        verification: null,
        errors: [error.message]
      };
    }
  }

  // ============================================================================
  // DOCUMENT MUTATIONS
  // ============================================================================

  /**
   * Upload a KYC document
   */
  @roles(["USER"], 'args.context')
  @mutation("uploadKYCDocument")
  async uploadDocument(
    obj: any,
    params: { input: any },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const documentService = getDocumentService(context);
      const { verificationId, type, file, metadata } = params.input;

      const document = await documentService.uploadDocument(
        verificationId,
        type,
        file,
        metadata
      );

      return {
        success: true,
        message: 'Document uploaded successfully',
        document
      };
    } catch (error) {
      context.log('Error uploading document', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        document: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Delete a KYC document
   */
  @roles(["USER", "KYC_ADMIN"], 'args.context')
  @mutation("deleteKYCDocument")
  async deleteDocument(
    obj: any,
    params: { documentId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const documentService = getDocumentService(context);
      await documentService.deleteDocument(params.documentId);

      return {
        success: true,
        message: 'Document deleted successfully',
        document: null
      };
    } catch (error) {
      context.log('Error deleting document', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        document: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Validate a KYC document
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @mutation("validateKYCDocument")
  async validateDocument(
    obj: any,
    params: { documentId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const documentService = getDocumentService(context);
      const document = await documentService.validateDocument(params.documentId);

      return {
        success: true,
        message: 'Document validated successfully',
        document
      };
    } catch (error) {
      context.log('Error validating document', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        document: null,
        errors: [error.message]
      };
    }
  }

  // ============================================================================
  // RISK ASSESSMENT MUTATIONS
  // ============================================================================

  /**
   * Calculate risk score for a verification
   */
  @roles(["KYC_ADMIN", "KYC_REVIEWER"], 'args.context')
  @mutation("calculateRiskScore")
  async calculateRiskScore(
    obj: any,
    params: { verificationId: string },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const riskService = getRiskService(context);
      const riskScore = await riskService.calculateRiskScore(params.verificationId);

      return {
        success: true,
        message: 'Risk score calculated successfully',
        riskScore
      };
    } catch (error) {
      context.log('Error calculating risk score', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        riskScore: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Update risk score for a verification
   */
  @roles(["KYC_ADMIN"], 'args.context')
  @mutation("updateRiskScore")
  async updateRiskScore(
    obj: any,
    params: { 
      verificationId: string, 
      score: number, 
      notes?: string 
    },
    context: Reactory.Server.IReactoryContext
  ) {
    try {
      const riskService = getRiskService(context);
      const riskScore = await riskService.updateRiskScore(
        params.verificationId,
        params.score,
        params.notes
      );

      return {
        success: true,
        message: 'Risk score updated successfully',
        riskScore
      };
    } catch (error) {
      context.log('Error updating risk score', { error, params }, 'error', 'KYCResolver');
      return {
        success: false,
        message: error.message,
        riskScore: null,
        errors: [error.message]
      };
    }
  }

  // ============================================================================
  // PROPERTY RESOLVERS
  // ============================================================================

  /**
   * Resolve KYCVerification.id field
   */
  @property("KYCVerification", "id")
  verificationId(obj: any) {
    return obj._id || obj.id;
  }

  /**
   * Resolve KYCVerification.documents field
   */
  @property("KYCVerification", "documents")
  async verificationDocuments(
    obj: any,
    args: any,
    context: Reactory.Server.IReactoryContext
  ) {
    if (obj.documents && obj.documents.length > 0 && typeof obj.documents[0] === 'object') {
      return obj.documents;
    }

    const documentService = getDocumentService(context);
    return await documentService.getDocumentsByVerification(obj._id || obj.id);
  }

  /**
   * Resolve KYCVerification.riskScore field
   */
  @property("KYCVerification", "riskScore")
  async verificationRiskScore(
    obj: any,
    args: any,
    context: Reactory.Server.IReactoryContext
  ) {
    if (obj.riskScore && typeof obj.riskScore === 'object') {
      return obj.riskScore;
    }

    try {
      const riskService = getRiskService(context);
      return await riskService.getRiskScore(obj._id || obj.id);
    } catch (error) {
      return null;
    }
  }

  /**
   * Resolve KYCDocument.id field
   */
  @property("KYCDocument", "id")
  documentId(obj: any) {
    return obj._id || obj.id;
  }

  /**
   * Resolve KYCRiskScore.id field
   */
  @property("KYCRiskScore", "id")
  riskScoreId(obj: any) {
    return obj._id || obj.id;
  }

  /**
   * Resolve KYCProvider.id field
   */
  @property("KYCProvider", "id")
  providerId(obj: any) {
    return obj._id || obj.id;
  }
}

export default KYCResolver;

