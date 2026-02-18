import Reactory from '@reactorynet/reactory-core';
import { service } from '@reactory/server-core/application/decorators/service';
import { roles } from '@reactory/server-core/authentication/decorators';
import logger from '@reactory/server-core/logging';

/**
 * KYC Audit Service
 * 
 * Wrapper around ReactoryAuditService providing KYC-specific audit logging
 * convenience methods and standardized event formats.
 */
@service({
  id: 'reactory-kyc.KYCAuditService@1.0.0',
  name: 'KYCAuditService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'KYC-specific audit logging service wrapper',
  serviceType: 'audit',
  lifeCycle: 'singleton',
  dependencies: [
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
})
class KYCAuditService implements Reactory.Service.IReactoryService {
  name: string = 'KYCAuditService';
  nameSpace: string = 'reactory-kyc';
  version: string = '1.0.0';
  context: Reactory.Server.IReactoryContext;

  private readonly MODULE_NAME = 'reactory-kyc';
  private readonly MODULE_VERSION = '1.0.0';

  constructor(props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) {
    this.context = context;
  }

  /**
   * Get the ReactoryAuditService instance
   */
  private get auditService(): any {
    return this.context.getService('core.ReactoryAuditService@1.0.0');
  }

  /**
   * Log verification event
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN', 'SYSTEM'])
  async logVerificationEvent(params: {
    action: string;
    verificationId: string;
    userId?: string;
    outcome: 'success' | 'failure' | 'pending';
    before?: any;
    after?: any;
    details?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'user',
        actorId: params.userId || this.context.user?._id?.toString() || 'system',
        action: `kyc.verification.${params.action}`,
        resourceType: 'kyc_verification',
        resourceId: params.verificationId,
        eventType: this.mapActionToEventType(params.action),
        outcome: params.outcome,
        before: params.before,
        after: params.after,
        details: params.details,
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged verification event - ${params.action} - ${params.verificationId}`);
    } catch (error) {
      logger.error('Error logging verification event:', error);
      // Don't throw - audit logging should not break the main flow
    }
  }

  /**
   * Log document access event
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN', 'SYSTEM'])
  async logDocumentAccess(params: {
    documentId: string;
    verificationId: string;
    userId?: string;
    action: 'view' | 'download' | 'upload' | 'delete' | 'validate';
    outcome: 'success' | 'failure';
    details?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'user',
        actorId: params.userId || this.context.user?._id?.toString() || 'system',
        action: `kyc.document.${params.action}`,
        resourceType: 'kyc_document',
        resourceId: params.documentId,
        eventType: params.action === 'upload' ? 'create' : 
                   params.action === 'delete' ? 'delete' :
                   params.action === 'validate' ? 'update' : 'read',
        outcome: params.outcome,
        details: {
          ...params.details,
          verificationId: params.verificationId
        },
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged document access - ${params.action} - ${params.documentId}`);
    } catch (error) {
      logger.error('Error logging document access:', error);
    }
  }

  /**
   * Log provider request event
   */
  @roles(['SYSTEM', 'ADMIN'])
  async logProviderRequest(params: {
    providerId: string;
    verificationId: string;
    request: any;
    response?: any;
    outcome: 'success' | 'failure' | 'pending';
    responseTime?: number;
    error?: string;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'system',
        actorId: 'kyc-provider-service',
        action: 'kyc.provider.request',
        resourceType: 'kyc_provider',
        resourceId: params.providerId,
        eventType: 'execute',
        outcome: params.outcome,
        details: {
          verificationId: params.verificationId,
          request: this.sanitizeProviderData(params.request),
          response: params.response ? this.sanitizeProviderData(params.response) : undefined,
          responseTime: params.responseTime,
          error: params.error
        },
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged provider request - ${params.providerId} - ${params.outcome}`);
    } catch (error) {
      logger.error('Error logging provider request:', error);
    }
  }

  /**
   * Log risk assessment event
   */
  @roles(['SYSTEM', 'KYC_REVIEWER', 'ADMIN'])
  async logRiskAssessment(params: {
    verificationId: string;
    riskScoreId: string;
    totalScore: number;
    riskLevel: string;
    assessmentMethod: string;
    userId?: string;
    details?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'user',
        actorId: params.userId || this.context.user?._id?.toString() || 'system',
        action: 'kyc.risk.assess',
        resourceType: 'kyc_risk_score',
        resourceId: params.riskScoreId,
        eventType: 'create',
        outcome: 'success',
        details: {
          verificationId: params.verificationId,
          totalScore: params.totalScore,
          riskLevel: params.riskLevel,
          assessmentMethod: params.assessmentMethod,
          ...params.details
        },
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged risk assessment - ${params.verificationId} - ${params.riskLevel}`);
    } catch (error) {
      logger.error('Error logging risk assessment:', error);
    }
  }

  /**
   * Log reviewer action
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async logReviewerAction(params: {
    action: 'approve' | 'reject' | 'request_info' | 'assign' | 'unassign';
    verificationId: string;
    reviewerId: string;
    reason?: string;
    before?: any;
    after?: any;
    details?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'user',
        actorId: params.reviewerId,
        action: `kyc.review.${params.action}`,
        resourceType: 'kyc_verification',
        resourceId: params.verificationId,
        eventType: 'update',
        outcome: 'success',
        before: params.before,
        after: params.after,
        details: {
          reason: params.reason,
          ...params.details
        },
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged reviewer action - ${params.action} - ${params.verificationId}`);
    } catch (error) {
      logger.error('Error logging reviewer action:', error);
    }
  }

  /**
   * Log data access for GDPR compliance
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN'])
  async logDataAccess(params: {
    userId: string;
    accessedBy: string;
    dataType: 'personal_info' | 'documents' | 'verification_history' | 'risk_score';
    reason: string;
    details?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'user',
        actorId: params.accessedBy,
        action: 'kyc.data.access',
        resourceType: 'user_data',
        resourceId: params.userId,
        eventType: 'read',
        outcome: 'success',
        details: {
          dataType: params.dataType,
          reason: params.reason,
          ...params.details
        },
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged data access - ${params.dataType} - ${params.userId}`);
    } catch (error) {
      logger.error('Error logging data access:', error);
    }
  }

  /**
   * Log compliance event (data retention, deletion, export)
   */
  @roles(['ADMIN', 'SYSTEM'])
  async logComplianceEvent(params: {
    action: 'export' | 'delete' | 'anonymize' | 'retain' | 'purge';
    resourceType: string;
    resourceId: string;
    reason: string;
    userId?: string;
    details?: any;
  }): Promise<void> {
    try {
      await this.auditService.logAuditEvent({
        actorType: 'user',
        actorId: params.userId || this.context.user?._id?.toString() || 'system',
        action: `kyc.compliance.${params.action}`,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        eventType: params.action === 'delete' ? 'delete' : 
                   params.action === 'export' ? 'read' : 'update',
        outcome: 'success',
        details: {
          reason: params.reason,
          ...params.details
        },
        moduleName: this.MODULE_NAME,
        moduleVersion: this.MODULE_VERSION
      });

      logger.debug(`KYCAuditService: Logged compliance event - ${params.action} - ${params.resourceId}`);
    } catch (error) {
      logger.error('Error logging compliance event:', error);
    }
  }

  /**
   * Generate audit report for KYC operations
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async generateAuditReport(params: {
    startDate: Date;
    endDate: Date;
    userId?: string;
    verificationId?: string;
    actions?: string[];
    organizationId?: string;
  }): Promise<any> {
    try {
      const filter: any = {
        moduleName: this.MODULE_NAME,
        startDate: params.startDate,
        endDate: params.endDate
      };

      if (params.userId) {
        filter.actorId = params.userId;
      }

      if (params.verificationId) {
        filter.resourceId = params.verificationId;
      }

      if (params.actions && params.actions.length > 0) {
        filter.actions = params.actions;
      }

      if (params.organizationId) {
        filter.organizationId = params.organizationId;
      }

      const report = await this.auditService.generateComplianceReport(filter);

      logger.info(`KYCAuditService: Generated audit report - ${report.totalEvents} events`);

      return report;
    } catch (error) {
      logger.error('Error generating audit report:', error);
      throw error;
    }
  }

  /**
   * Export audit logs for KYC operations
   */
  @roles(['ADMIN'])
  async exportAuditLogs(params: {
    startDate: Date;
    endDate: Date;
    format: 'json' | 'csv';
    userId?: string;
    verificationId?: string;
  }): Promise<string> {
    try {
      const filter: any = {
        moduleName: this.MODULE_NAME,
        startDate: params.startDate,
        endDate: params.endDate
      };

      if (params.userId) {
        filter.actorId = params.userId;
      }

      if (params.verificationId) {
        filter.resourceId = params.verificationId;
      }

      const logs = await this.auditService.queryAuditLogs(filter, { limit: 10000 });

      let exportData: string;
      if (params.format === 'csv') {
        exportData = await this.auditService.convertToCsv(logs.logs);
      } else {
        exportData = JSON.stringify(logs.logs, null, 2);
      }

      logger.info(`KYCAuditService: Exported ${logs.total} audit logs`);

      return exportData;
    } catch (error) {
      logger.error('Error exporting audit logs:', error);
      throw error;
    }
  }

  /**
   * Query KYC audit logs
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async queryKYCAuditLogs(params: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    verificationId?: string;
    actions?: string[];
    outcomes?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    try {
      const filter: any = {
        moduleName: this.MODULE_NAME
      };

      if (params.startDate) filter.startDate = params.startDate;
      if (params.endDate) filter.endDate = params.endDate;
      if (params.userId) filter.actorId = params.userId;
      if (params.verificationId) filter.resourceId = params.verificationId;
      if (params.actions) filter.actions = params.actions;
      if (params.outcomes) filter.outcomes = params.outcomes;

      const pagination = {
        limit: params.limit || 100,
        offset: params.offset || 0
      };

      const result = await this.auditService.queryAuditLogs(filter, pagination);

      logger.debug(`KYCAuditService: Queried ${result.total} audit logs`);

      return result;
    } catch (error) {
      logger.error('Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Map action to event type
   */
  private mapActionToEventType(action: string): string {
    const createActions = ['initiate', 'create', 'upload'];
    const updateActions = ['update', 'submit', 'validate', 'process', 'approve', 'reject'];
    const deleteActions = ['delete', 'remove', 'terminate'];

    if (createActions.some(a => action.includes(a))) return 'create';
    if (updateActions.some(a => action.includes(a))) return 'update';
    if (deleteActions.some(a => action.includes(a))) return 'delete';
    
    return 'read';
  }

  /**
   * Sanitize provider data to remove sensitive information
   */
  private sanitizeProviderData(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };
    
    // Remove sensitive fields
    const sensitiveFields = ['apiKey', 'secret', 'token', 'password', 'authorization'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Remove nested sensitive data
    if (sanitized.headers) {
      if (sanitized.headers.authorization) sanitized.headers.authorization = '[REDACTED]';
      if (sanitized.headers.apiKey) sanitized.headers.apiKey = '[REDACTED]';
    }

    return sanitized;
  }

  setExecutionContext(executionContext: Reactory.Server.IReactoryContext): boolean {
    this.context = executionContext;
    return true;
  }
}

export default KYCAuditService;

export const KYCAuditServiceDefinition: Reactory.Service.IReactoryServiceDefinition<KYCAuditService> = {
  id: 'reactory-kyc.KYCAuditService@1.0.0',
  name: 'KYCAuditService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'KYC-specific audit logging service wrapper',
  dependencies: [
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
  serviceType: 'audit',
  service: (props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) => {
    return new KYCAuditService(props, context);
  },
};

