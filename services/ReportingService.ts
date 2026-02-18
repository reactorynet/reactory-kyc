import Reactory from '@reactorynet/reactory-core';
import { ObjectId } from 'mongodb';
import { service } from '@reactory/server-core/application/decorators/service';
import { roles } from '@reactory/server-core/authentication/decorators';
import ApiError from '@reactory/server-core/exceptions';
import logger from '@reactory/server-core/logging';
import { KYCVerification } from '../models/KYCVerification';
import { KYCDocument } from '../models/KYCDocument';
import { KYCRiskScore } from '../models/KYCRiskScore';
import { KYCProvider } from '../models/KYCProvider';

/**
 * Reporting Service
 * 
 * Generates reports and statistics for KYC operations
 */
@service({
  id: 'reactory-kyc.ReportingService@1.0.0',
  name: 'ReportingService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Service for generating KYC reports and statistics',
  serviceType: 'data',
  lifeCycle: 'singleton',
  dependencies: [
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
})
class ReportingService implements Reactory.Service.IReactoryService {
  name: string = 'ReportingService';
  nameSpace: string = 'reactory-kyc';
  version: string = '1.0.0';
  context: Reactory.Server.IReactoryContext;

  constructor(props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) {
    this.context = context;
  }

  /**
   * Get audit service
   */
  private get auditService(): any {
    return this.context.getService('core.ReactoryAuditService@1.0.0');
  }

  /**
   * Generate verification statistics
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async getVerificationStatistics(params: {
    startDate?: Date;
    endDate?: Date;
    organizationId?: string;
  }): Promise<any> {
    try {
      const match: any = {};

      if (params.startDate || params.endDate) {
        match.createdAt = {};
        if (params.startDate) match.createdAt.$gte = params.startDate;
        if (params.endDate) match.createdAt.$lte = params.endDate;
      }

      if (params.organizationId) {
        match.organizationId = new ObjectId(params.organizationId);
      }

      const pipeline = [
        { $match: match },
        {
          $facet: {
            totalCounts: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  initiated: {
                    $sum: { $cond: [{ $eq: ['$status', 'INITIATED'] }, 1, 0] }
                  },
                  submitted: {
                    $sum: { $cond: [{ $eq: ['$status', 'SUBMITTED'] }, 1, 0] }
                  },
                  processing: {
                    $sum: { $cond: [{ $eq: ['$status', 'PROCESSING'] }, 1, 0] }
                  },
                  underReview: {
                    $sum: { $cond: [{ $eq: ['$status', 'UNDER_REVIEW'] }, 1, 0] }
                  },
                  autoApproved: {
                    $sum: { $cond: [{ $eq: ['$status', 'AUTO_APPROVED'] }, 1, 0] }
                  },
                  manuallyApproved: {
                    $sum: { $cond: [{ $eq: ['$status', 'MANUALLY_APPROVED'] }, 1, 0] }
                  },
                  rejected: {
                    $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] }
                  },
                  failed: {
                    $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
                  }
                }
              }
            ],
            byLevel: [
              {
                $group: {
                  _id: '$level',
                  count: { $sum: 1 }
                }
              }
            ],
            byWorkflowType: [
              {
                $group: {
                  _id: '$workflowType',
                  count: { $sum: 1 }
                }
              }
            ],
            byMonth: [
              {
                $group: {
                  _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                  },
                  count: { $sum: 1 }
                }
              },
              { $sort: { '_id.year': 1, '_id.month': 1 } }
            ],
            avgProcessingTime: [
              {
                $match: {
                  completedAt: { $exists: true }
                }
              },
              {
                $project: {
                  processingTime: {
                    $subtract: ['$completedAt', '$initiatedAt']
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  avgTime: { $avg: '$processingTime' }
                }
              }
            ]
          }
        }
      ];

      const result = await KYCVerification.aggregate(pipeline);
      const stats = result[0];

      return {
        summary: stats.totalCounts[0] || {},
        byLevel: this.formatGroupedData(stats.byLevel),
        byWorkflowType: this.formatGroupedData(stats.byWorkflowType),
        byMonth: stats.byMonth || [],
        avgProcessingTimeMs: stats.avgProcessingTime[0]?.avgTime || 0,
        avgProcessingTimeHours: ((stats.avgProcessingTime[0]?.avgTime || 0) / 3600000).toFixed(2)
      };
    } catch (error) {
      logger.error('Error generating verification statistics:', error);
      throw error;
    }
  }

  /**
   * Generate document statistics
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async getDocumentStatistics(params: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    try {
      const match: any = {};

      if (params.startDate || params.endDate) {
        match.uploadedAt = {};
        if (params.startDate) match.uploadedAt.$gte = params.startDate;
        if (params.endDate) match.uploadedAt.$lte = params.endDate;
      }

      const pipeline = [
        { $match: match },
        {
          $facet: {
            totalCounts: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  pending: {
                    $sum: { $cond: [{ $eq: ['$validationStatus', 'pending'] }, 1, 0] }
                  },
                  valid: {
                    $sum: { $cond: [{ $eq: ['$validationStatus', 'valid'] }, 1, 0] }
                  },
                  invalid: {
                    $sum: { $cond: [{ $eq: ['$validationStatus', 'invalid'] }, 1, 0] }
                  },
                  expired: {
                    $sum: { $cond: [{ $eq: ['$validationStatus', 'expired'] }, 1, 0] }
                  }
                }
              }
            ],
            byType: [
              {
                $group: {
                  _id: '$documentType',
                  count: { $sum: 1 },
                  validCount: {
                    $sum: { $cond: [{ $eq: ['$validationStatus', 'valid'] }, 1, 0] }
                  }
                }
              }
            ]
          }
        }
      ];

      const result = await KYCDocument.aggregate(pipeline);
      const stats = result[0];

      return {
        summary: stats.totalCounts[0] || {},
        byType: stats.byType || []
      };
    } catch (error) {
      logger.error('Error generating document statistics:', error);
      throw error;
    }
  }

  /**
   * Generate risk assessment statistics
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async getRiskStatistics(params: {
    startDate?: Date;
    endDate?: Date;
    organizationId?: string;
  }): Promise<any> {
    try {
      return await KYCRiskScore.aggregate([
        {
          $match: this.buildDateMatch(params.startDate, params.endDate, 'calculatedAt')
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  avgScore: { $avg: '$totalScore' },
                  minScore: { $min: '$totalScore' },
                  maxScore: { $max: '$totalScore' }
                }
              }
            ],
            byRiskLevel: [
              {
                $group: {
                  _id: '$riskLevel',
                  count: { $sum: 1 },
                  avgScore: { $avg: '$totalScore' }
                }
              }
            ],
            byAssessmentMethod: [
              {
                $group: {
                  _id: '$assessmentMethod',
                  count: { $sum: 1 },
                  avgScore: { $avg: '$totalScore' }
                }
              }
            ],
            scoreDistribution: [
              {
                $bucket: {
                  groupBy: '$totalScore',
                  boundaries: [0, 20, 40, 60, 80, 100],
                  default: 'Other',
                  output: {
                    count: { $sum: 1 }
                  }
                }
              }
            ]
          }
        }
      ]);
    } catch (error) {
      logger.error('Error generating risk statistics:', error);
      throw error;
    }
  }

  /**
   * Generate provider statistics
   */
  @roles(['ADMIN'])
  async getProviderStatistics(): Promise<any> {
    try {
      return await KYCProvider.getStatistics();
    } catch (error) {
      logger.error('Error generating provider statistics:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async generateComplianceReport(params: {
    startDate: Date;
    endDate: Date;
    organizationId?: string;
    format?: 'json' | 'csv';
  }): Promise<any> {
    try {
      logger.info('Generating compliance report');

      // Get verification statistics
      const verificationStats = await this.getVerificationStatistics(params);

      // Get document statistics
      const documentStats = await this.getDocumentStatistics(params);

      // Get risk statistics
      const riskStats = await this.getRiskStatistics(params);

      // Get audit statistics from core service
      const auditStats = await this.auditService.generateAuditReport({
        startDate: params.startDate,
        endDate: params.endDate,
        moduleName: 'reactory-kyc',
        organizationId: params.organizationId
      });

      const report = {
        generatedAt: new Date(),
        period: {
          startDate: params.startDate,
          endDate: params.endDate
        },
        verifications: verificationStats,
        documents: documentStats,
        riskAssessment: riskStats[0] || {},
        audit: {
          totalEvents: auditStats.totalEvents || 0,
          byAction: auditStats.statistics?.byAction || {},
          byOutcome: auditStats.statistics?.byOutcome || {}
        }
      };

      if (params.format === 'csv') {
        return this.convertReportToCsv(report);
      }

      return report;
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw error;
    }
  }

  /**
   * Generate performance report
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async generatePerformanceReport(params: {
    startDate: Date;
    endDate: Date;
    organizationId?: string;
  }): Promise<any> {
    try {
      const match = this.buildDateMatch(params.startDate, params.endDate, 'createdAt');
      
      if (params.organizationId) {
        match.organizationId = new ObjectId(params.organizationId);
      }

      const result = await KYCVerification.aggregate([
        { $match: match },
        {
          $facet: {
            completionRate: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  completed: {
                    $sum: {
                      $cond: [
                        {
                          $in: ['$status', ['AUTO_APPROVED', 'MANUALLY_APPROVED', 'COMPLETED']]
                        },
                        1,
                        0
                      ]
                    }
                  }
                }
              },
              {
                $project: {
                  total: 1,
                  completed: 1,
                  rate: {
                    $cond: [
                      { $eq: ['$total', 0] },
                      0,
                      { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
                    ]
                  }
                }
              }
            ],
            autoApprovalRate: [
              {
                $match: {
                  status: { $in: ['AUTO_APPROVED', 'MANUALLY_APPROVED'] }
                }
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  autoApproved: {
                    $sum: { $cond: [{ $eq: ['$status', 'AUTO_APPROVED'] }, 1, 0] }
                  }
                }
              },
              {
                $project: {
                  total: 1,
                  autoApproved: 1,
                  rate: {
                    $cond: [
                      { $eq: ['$total', 0] },
                      0,
                      { $multiply: [{ $divide: ['$autoApproved', '$total'] }, 100] }
                    ]
                  }
                }
              }
            ],
            rejectionRate: [
              {
                $match: {
                  status: { $in: ['AUTO_APPROVED', 'MANUALLY_APPROVED', 'REJECTED'] }
                }
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  rejected: {
                    $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] }
                  }
                }
              },
              {
                $project: {
                  total: 1,
                  rejected: 1,
                  rate: {
                    $cond: [
                      { $eq: ['$total', 0] },
                      0,
                      { $multiply: [{ $divide: ['$rejected', '$total'] }, 100] }
                    ]
                  }
                }
              }
            ]
          }
        }
      ]);

      return {
        generatedAt: new Date(),
        period: {
          startDate: params.startDate,
          endDate: params.endDate
        },
        metrics: result[0]
      };
    } catch (error) {
      logger.error('Error generating performance report:', error);
      throw error;
    }
  }

  /**
   * Get dashboard metrics
   */
  @roles(['ADMIN', 'KYC_REVIEWER'])
  async getDashboardMetrics(organizationId?: string): Promise<any> {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get counts for various statuses
      const match: any = { createdAt: { $gte: last30Days } };
      if (organizationId) {
        match.organizationId = new ObjectId(organizationId);
      }

      const [
        pendingCount,
        underReviewCount,
        completedToday,
        completedThisMonth,
        avgRiskScore
      ] = await Promise.all([
        KYCVerification.countDocuments({ ...match, status: { $in: ['SUBMITTED', 'PROCESSING', 'VALIDATING'] } }),
        KYCVerification.countDocuments({ ...match, status: 'UNDER_REVIEW' }),
        KYCVerification.countDocuments({
          ...match,
          completedAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) },
          status: { $in: ['AUTO_APPROVED', 'MANUALLY_APPROVED'] }
        }),
        KYCVerification.countDocuments({
          ...match,
          status: { $in: ['AUTO_APPROVED', 'MANUALLY_APPROVED'] }
        }),
        KYCRiskScore.getAverageScore(last30Days, now)
      ]);

      return {
        pendingVerifications: pendingCount,
        awaitingReview: underReviewCount,
        completedToday,
        completedLast30Days: completedThisMonth,
        averageRiskScore: Math.round(avgRiskScore.avgScore),
        totalAssessments: avgRiskScore.count
      };
    } catch (error) {
      logger.error('Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Helper: Build date match query
   */
  private buildDateMatch(startDate?: Date, endDate?: Date, field: string = 'createdAt'): any {
    const match: any = {};
    if (startDate || endDate) {
      match[field] = {};
      if (startDate) match[field].$gte = startDate;
      if (endDate) match[field].$lte = endDate;
    }
    return match;
  }

  /**
   * Helper: Format grouped data
   */
  private formatGroupedData(data: any[]): Record<string, number> {
    return data.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {});
  }

  /**
   * Helper: Convert report to CSV
   */
  private convertReportToCsv(report: any): string {
    // Simple CSV conversion for compliance report
    const lines: string[] = [
      'KYC Compliance Report',
      `Generated: ${report.generatedAt}`,
      `Period: ${report.period.startDate} to ${report.period.endDate}`,
      '',
      'Verification Summary',
      `Total: ${report.verifications.summary.total || 0}`,
      `Approved: ${(report.verifications.summary.autoApproved || 0) + (report.verifications.summary.manuallyApproved || 0)}`,
      `Rejected: ${report.verifications.summary.rejected || 0}`,
      `Pending: ${report.verifications.summary.submitted || 0}`,
      '',
      'Document Summary',
      `Total: ${report.documents.summary.total || 0}`,
      `Valid: ${report.documents.summary.valid || 0}`,
      `Invalid: ${report.documents.summary.invalid || 0}`,
      ''
    ];

    return lines.join('\n');
  }

  setExecutionContext(executionContext: Reactory.Server.IReactoryContext): boolean {
    this.context = executionContext;
    return true;
  }
}

export default ReportingService;

export const ReportingServiceDefinition: Reactory.Service.IReactoryServiceDefinition<ReportingService> = {
  id: 'reactory-kyc.ReportingService@1.0.0',
  name: 'ReportingService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Service for generating KYC reports and statistics',
  dependencies: [
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
  serviceType: 'data',
  service: (props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) => {
    return new ReportingService(props, context);
  },
};

