import Reactory from '@reactory/reactory-core';
import { ObjectId } from 'mongodb';
import { service } from '@reactory/server-core/models/graphql/decorators/resolver';
import { roles } from '@reactory/server-core/models/graphql/decorators';
import ApiError from '@reactory/server-core/exceptions';
import logger from '@reactory/server-core/logging';
import { KYCRiskScore, IKYCRiskScoreDocument, IRiskFactor } from '../models/KYCRiskScore';
import { KYCVerification, IKYCVerificationDocument } from '../models/KYCVerification';
import { KYCDocument } from '../models/KYCDocument';
import path from 'path';
import fs from 'fs';

/**
 * Risk Assessment Service
 * 
 * Calculates risk scores for KYC verifications based on multiple factors
 */

interface IRiskRule {
  id: string;
  name: string;
  description: string;
  weight: number;
  evaluate: (data: any) => number;
}

interface IRiskThresholds {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

@service({
  id: 'reactory-kyc.RiskAssessmentService@1.0.0',
  name: 'RiskAssessmentService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Service for calculating and managing KYC risk scores',
  serviceType: 'data',
  lifeCycle: 'singleton',
  dependencies: [
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
})
class RiskAssessmentService implements Reactory.Service.IReactoryService {
  name: string = 'RiskAssessmentService';
  nameSpace: string = 'reactory-kyc';
  version: string = '1.0.0';
  context: Reactory.Server.IReactoryContext;

  // Risk thresholds for determining risk levels
  private readonly thresholds: IRiskThresholds = {
    LOW: 70,      // Score >= 70
    MEDIUM: 50,   // Score >= 50 and < 70
    HIGH: 30,     // Score >= 30 and < 50
    CRITICAL: 0   // Score < 30
  };

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
   * Load risk rules from configuration
   */
  private loadRiskRules(): any {
    try {
      const rulesPath = path.join(__dirname, '../data/risk-rules.json');
      if (fs.existsSync(rulesPath)) {
        const rulesData = fs.readFileSync(rulesPath, 'utf-8');
        return JSON.parse(rulesData);
      }
      
      // Return default rules if file doesn't exist
      return this.getDefaultRiskRules();
    } catch (error) {
      logger.error('Error loading risk rules:', error);
      return this.getDefaultRiskRules();
    }
  }

  /**
   * Get default risk rules
   */
  private getDefaultRiskRules(): any {
    return {
      rules: [
        {
          id: 'document_validity',
          name: 'Document Validity',
          description: 'Check if all documents are valid and not expired',
          weight: 0.25,
          baseScore: 100
        },
        {
          id: 'document_completeness',
          name: 'Document Completeness',
          description: 'Check if all required documents are provided',
          weight: 0.20,
          baseScore: 100
        },
        {
          id: 'document_quality',
          name: 'Document Quality',
          description: 'Assess quality of uploaded documents',
          weight: 0.15,
          baseScore: 100
        },
        {
          id: 'user_history',
          name: 'User History',
          description: 'Check user verification history',
          weight: 0.15,
          baseScore: 100
        },
        {
          id: 'geographic_risk',
          name: 'Geographic Risk',
          description: 'Assess risk based on country and location',
          weight: 0.10,
          baseScore: 100
        },
        {
          id: 'provider_confidence',
          name: 'Provider Confidence',
          description: 'Confidence score from external provider',
          weight: 0.10,
          baseScore: 100
        },
        {
          id: 'data_consistency',
          name: 'Data Consistency',
          description: 'Check consistency of data across documents',
          weight: 0.05,
          baseScore: 100
        }
      ]
    };
  }

  /**
   * Determine risk level from total score
   */
  private determineRiskLevel(totalScore: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (totalScore >= this.thresholds.LOW) return 'LOW';
    if (totalScore >= this.thresholds.MEDIUM) return 'MEDIUM';
    if (totalScore >= this.thresholds.HIGH) return 'HIGH';
    return 'CRITICAL';
  }

  /**
   * Evaluate document validity factor
   */
  private async evaluateDocumentValidity(documents: any[]): Promise<{ score: number; description: string }> {
    if (documents.length === 0) {
      return { score: 0, description: 'No documents provided' };
    }

    const validDocuments = documents.filter(doc => doc.validationStatus === 'valid');
    const expiredDocuments = documents.filter(doc => doc.isExpired && doc.isExpired());
    const invalidDocuments = documents.filter(doc => doc.validationStatus === 'invalid');

    let score = 100;
    let issues: string[] = [];

    // Penalize for expired documents
    if (expiredDocuments.length > 0) {
      score -= expiredDocuments.length * 30;
      issues.push(`${expiredDocuments.length} expired document(s)`);
    }

    // Penalize for invalid documents
    if (invalidDocuments.length > 0) {
      score -= invalidDocuments.length * 40;
      issues.push(`${invalidDocuments.length} invalid document(s)`);
    }

    // Reward for valid documents
    const validityRatio = validDocuments.length / documents.length;
    score = Math.max(score, validityRatio * 100);

    return {
      score: Math.max(0, Math.min(100, score)),
      description: issues.length > 0 ? issues.join(', ') : 'All documents valid'
    };
  }

  /**
   * Evaluate document completeness factor
   */
  private async evaluateDocumentCompleteness(
    verification: IKYCVerificationDocument,
    documents: any[]
  ): Promise<{ score: number; description: string }> {
    // Define required documents by verification level
    const requiredDocsByLevel: Record<string, string[]> = {
      BASIC: ['NATIONAL_ID', 'SELFIE'],
      INTERMEDIATE: ['NATIONAL_ID', 'PROOF_OF_ADDRESS', 'SELFIE'],
      ADVANCED: ['PASSPORT', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SELFIE'],
      ENHANCED: ['PASSPORT', 'NATIONAL_ID', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SELFIE', 'LIVENESS_VIDEO']
    };

    const requiredDocs = requiredDocsByLevel[verification.level] || requiredDocsByLevel.INTERMEDIATE;
    const providedDocTypes = documents.map(doc => doc.documentType);
    const missingDocs = requiredDocs.filter(type => !providedDocTypes.includes(type));

    const completenessRatio = (requiredDocs.length - missingDocs.length) / requiredDocs.length;
    const score = completenessRatio * 100;

    return {
      score: Math.round(score),
      description: missingDocs.length > 0 
        ? `Missing documents: ${missingDocs.join(', ')}`
        : 'All required documents provided'
    };
  }

  /**
   * Evaluate document quality factor
   */
  private async evaluateDocumentQuality(documents: any[]): Promise<{ score: number; description: string }> {
    if (documents.length === 0) {
      return { score: 0, description: 'No documents to assess' };
    }

    // In production, this would check actual image quality metrics
    // For now, use validation status as a proxy
    let totalQuality = 0;
    const qualityScores: Record<string, number> = {
      valid: 100,
      pending: 70,
      processing: 60,
      invalid: 30,
      expired: 40
    };

    documents.forEach(doc => {
      totalQuality += qualityScores[doc.validationStatus] || 50;
    });

    const avgQuality = totalQuality / documents.length;

    return {
      score: Math.round(avgQuality),
      description: avgQuality >= 80 ? 'High quality' : avgQuality >= 60 ? 'Acceptable quality' : 'Poor quality'
    };
  }

  /**
   * Evaluate user history factor
   */
  private async evaluateUserHistory(userId: ObjectId): Promise<{ score: number; description: string }> {
    try {
      // Get user's previous verifications
      const previousVerifications = await KYCVerification.find({
        userId,
        status: { $in: ['COMPLETED', 'AUTO_APPROVED', 'MANUALLY_APPROVED', 'REJECTED', 'FAILED'] }
      }).sort({ createdAt: -1 }).limit(10);

      if (previousVerifications.length === 0) {
        return { score: 70, description: 'No previous verification history' };
      }

      const successful = previousVerifications.filter(v => 
        ['COMPLETED', 'AUTO_APPROVED', 'MANUALLY_APPROVED'].includes(v.status)
      ).length;

      const rejected = previousVerifications.filter(v => 
        ['REJECTED', 'FAILED'].includes(v.status)
      ).length;

      let score = 80; // Base score for having history

      // Boost for successful verifications
      score += successful * 5;

      // Penalize for rejections
      score -= rejected * 15;

      return {
        score: Math.max(0, Math.min(100, score)),
        description: `${successful} successful, ${rejected} rejected verification(s)`
      };
    } catch (error) {
      logger.error('Error evaluating user history:', error);
      return { score: 70, description: 'Unable to evaluate history' };
    }
  }

  /**
   * Evaluate geographic risk factor
   */
  private async evaluateGeographicRisk(documents: any[]): Promise<{ score: number; description: string }> {
    // In production, this would check against sanctioned countries list
    // and apply country-specific risk scores
    
    const countries = documents
      .filter(doc => doc.issuingCountry)
      .map(doc => doc.issuingCountry);

    if (countries.length === 0) {
      return { score: 50, description: 'No country information available' };
    }

    // Placeholder: In production, check against risk databases
    // For now, assume medium-low risk
    const uniqueCountries = [...new Set(countries)];
    
    // Multiple countries might indicate higher complexity
    let score = 80;
    if (uniqueCountries.length > 2) {
      score -= 10;
    }

    return {
      score,
      description: `Documents from ${uniqueCountries.length} country/countries: ${uniqueCountries.join(', ')}`
    };
  }

  /**
   * Evaluate provider confidence factor
   */
  private async evaluateProviderConfidence(
    verification: IKYCVerificationDocument
  ): Promise<{ score: number; description: string }> {
    if (!verification.providerId || !verification.providerResponse) {
      return { score: 60, description: 'No provider verification data' };
    }

    // Extract confidence score from provider response
    // This would be provider-specific in production
    const providerScore = verification.providerResponse?.confidence || 
                         verification.providerResponse?.score ||
                         60;

    return {
      score: providerScore,
      description: `Provider confidence: ${providerScore}%`
    };
  }

  /**
   * Evaluate data consistency factor
   */
  private async evaluateDataConsistency(
    verification: IKYCVerificationDocument,
    documents: any[]
  ): Promise<{ score: number; description: string }> {
    // In production, this would check:
    // - Name consistency across documents
    // - Date of birth consistency
    // - Address consistency
    // - Document numbers cross-reference

    if (documents.length < 2) {
      return { score: 80, description: 'Insufficient documents for consistency check' };
    }

    // Placeholder: assume good consistency unless validation errors found
    const inconsistentDocs = documents.filter(doc => 
      doc.validationErrors && doc.validationErrors.length > 0
    );

    let score = 90;
    score -= inconsistentDocs.length * 15;

    return {
      score: Math.max(0, score),
      description: inconsistentDocs.length > 0 
        ? `${inconsistentDocs.length} document(s) with data issues`
        : 'Data appears consistent'
    };
  }

  /**
   * Calculate risk score for a verification
   */
  @roles(['SYSTEM', 'KYC_REVIEWER', 'ADMIN'])
  async calculateRiskScore(
    verificationId: string,
    assessmentMethod: 'automated' | 'manual' | 'hybrid' | 'provider' = 'automated'
  ): Promise<IKYCRiskScoreDocument> {
    try {
      logger.info(`RiskAssessmentService.calculateRiskScore: ${verificationId} - ${assessmentMethod}`);

      // Get verification and documents
      const verification = await KYCVerification.findById(verificationId);
      if (!verification) {
        throw new ApiError('Verification not found');
      }

      const documents = await KYCDocument.find({
        verificationId: new ObjectId(verificationId)
      });

      // Load risk rules
      const riskConfig = this.loadRiskRules();
      const rules = riskConfig.rules;

      // Evaluate each risk factor
      const riskFactors: IRiskFactor[] = [];
      const scoreBreakdown: Record<string, number> = {};

      // Document validity
      const docValidity = await this.evaluateDocumentValidity(documents);
      const validityRule = rules.find((r: any) => r.id === 'document_validity');
      riskFactors.push({
        factor: 'Document Validity',
        score: docValidity.score,
        weight: validityRule?.weight || 0.25,
        description: docValidity.description
      });
      scoreBreakdown.document_validity = docValidity.score;

      // Document completeness
      const docCompleteness = await this.evaluateDocumentCompleteness(verification, documents);
      const completenessRule = rules.find((r: any) => r.id === 'document_completeness');
      riskFactors.push({
        factor: 'Document Completeness',
        score: docCompleteness.score,
        weight: completenessRule?.weight || 0.20,
        description: docCompleteness.description
      });
      scoreBreakdown.document_completeness = docCompleteness.score;

      // Document quality
      const docQuality = await this.evaluateDocumentQuality(documents);
      const qualityRule = rules.find((r: any) => r.id === 'document_quality');
      riskFactors.push({
        factor: 'Document Quality',
        score: docQuality.score,
        weight: qualityRule?.weight || 0.15,
        description: docQuality.description
      });
      scoreBreakdown.document_quality = docQuality.score;

      // User history
      const userHistory = await this.evaluateUserHistory(verification.userId);
      const historyRule = rules.find((r: any) => r.id === 'user_history');
      riskFactors.push({
        factor: 'User History',
        score: userHistory.score,
        weight: historyRule?.weight || 0.15,
        description: userHistory.description
      });
      scoreBreakdown.user_history = userHistory.score;

      // Geographic risk
      const geoRisk = await this.evaluateGeographicRisk(documents);
      const geoRule = rules.find((r: any) => r.id === 'geographic_risk');
      riskFactors.push({
        factor: 'Geographic Risk',
        score: geoRisk.score,
        weight: geoRule?.weight || 0.10,
        description: geoRisk.description
      });
      scoreBreakdown.geographic_risk = geoRisk.score;

      // Provider confidence
      const providerConf = await this.evaluateProviderConfidence(verification);
      const providerRule = rules.find((r: any) => r.id === 'provider_confidence');
      riskFactors.push({
        factor: 'Provider Confidence',
        score: providerConf.score,
        weight: providerRule?.weight || 0.10,
        description: providerConf.description
      });
      scoreBreakdown.provider_confidence = providerConf.score;

      // Data consistency
      const dataConsistency = await this.evaluateDataConsistency(verification, documents);
      const consistencyRule = rules.find((r: any) => r.id === 'data_consistency');
      riskFactors.push({
        factor: 'Data Consistency',
        score: dataConsistency.score,
        weight: consistencyRule?.weight || 0.05,
        description: dataConsistency.description
      });
      scoreBreakdown.data_consistency = dataConsistency.score;

      // Calculate weighted total score
      let totalScore = 0;
      riskFactors.forEach(factor => {
        totalScore += factor.score * factor.weight;
      });
      totalScore = Math.round(totalScore);

      // Determine risk level
      const riskLevel = this.determineRiskLevel(totalScore);

      // Check if risk score already exists
      let riskScore = await KYCRiskScore.findOne({ verificationId: new ObjectId(verificationId) });

      if (riskScore) {
        // Update existing risk score
        riskScore.totalScore = totalScore;
        riskScore.riskLevel = riskLevel;
        riskScore.scoreBreakdown = scoreBreakdown;
        riskScore.riskFactors = riskFactors;
        riskScore.assessmentMethod = assessmentMethod;
        riskScore.assessedBy = this.context.user?._id?.toString() || 'system';
        riskScore.calculatedAt = new Date();
      } else {
        // Create new risk score
        riskScore = new KYCRiskScore({
          verificationId: new ObjectId(verificationId),
          totalScore,
          riskLevel,
          scoreBreakdown,
          riskFactors,
          assessmentMethod,
          assessedBy: this.context.user?._id?.toString() || 'system',
          calculatedAt: new Date()
        });
      }

      await riskScore.save();

      // Update verification with risk score reference
      verification.riskScoreId = riskScore._id as ObjectId;
      await verification.save();

      // Log audit event
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: this.context.user?._id?.toString() || 'system',
          action: 'kyc.risk.calculate',
          resourceType: 'kyc_risk_score',
          resourceId: riskScore._id.toString(),
          eventType: 'create',
          outcome: 'success',
          details: {
            verificationId,
            totalScore,
            riskLevel,
            assessmentMethod,
            factorCount: riskFactors.length
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      logger.info(`RiskAssessmentService.calculateRiskScore: Score calculated - ${totalScore} (${riskLevel})`);

      return riskScore;
    } catch (error) {
      logger.error('Error calculating risk score:', error);
      
      // Log audit event for failure
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: this.context.user?._id?.toString() || 'system',
          action: 'kyc.risk.calculate',
          resourceType: 'kyc_risk_score',
          resourceId: verificationId,
          eventType: 'create',
          outcome: 'failure',
          details: {
            error: error.message,
            assessmentMethod
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      throw error;
    }
  }

  /**
   * Update risk score for a verification
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async updateRiskScore(
    verificationId: string,
    updates: {
      manualAdjustment?: number;
      notes?: string;
      additionalFactors?: IRiskFactor[];
    }
  ): Promise<IKYCRiskScoreDocument> {
    try {
      const riskScore = await KYCRiskScore.findOne({ verificationId: new ObjectId(verificationId) });

      if (!riskScore) {
        throw new ApiError('Risk score not found');
      }

      const previousScore = riskScore.totalScore;

      // Apply manual adjustment if provided
      if (updates.manualAdjustment !== undefined) {
        riskScore.totalScore = Math.max(0, Math.min(100, riskScore.totalScore + updates.manualAdjustment));
        riskScore.riskLevel = this.determineRiskLevel(riskScore.totalScore);
      }

      // Add notes
      if (updates.notes) {
        riskScore.notes = updates.notes;
      }

      // Add additional factors
      if (updates.additionalFactors) {
        riskScore.riskFactors.push(...updates.additionalFactors);
      }

      riskScore.assessmentMethod = 'manual';
      riskScore.assessedBy = this.context.user._id.toString();
      riskScore.updatedAt = new Date();

      await riskScore.save();

      // Log audit event
      if (this.auditService) {
        await this.auditService.logAuditEvent({
          actorType: 'user',
          actorId: this.context.user._id.toString(),
          action: 'kyc.risk.update',
          resourceType: 'kyc_risk_score',
          resourceId: riskScore._id.toString(),
          eventType: 'update',
          outcome: 'success',
          before: { totalScore: previousScore },
          after: { totalScore: riskScore.totalScore },
          details: {
            manualAdjustment: updates.manualAdjustment,
            notes: updates.notes
          },
          moduleName: 'reactory-kyc',
          moduleVersion: '1.0.0'
        });
      }

      logger.info(`RiskAssessmentService.updateRiskScore: Score updated - ${verificationId}`);

      return riskScore;
    } catch (error) {
      logger.error('Error updating risk score:', error);
      throw error;
    }
  }

  /**
   * Get risk score for a verification
   */
  @roles(['USER', 'KYC_REVIEWER', 'ADMIN'])
  async getRiskScore(verificationId: string): Promise<IKYCRiskScoreDocument | null> {
    try {
      const verification = await KYCVerification.findById(verificationId);
      if (!verification) {
        throw new ApiError('Verification not found');
      }

      // Check authorization
      const isOwner = verification.userId.toString() === this.context.user._id.toString();
      const isReviewer = this.context.hasRole(['KYC_REVIEWER', 'ADMIN']);

      if (!isOwner && !isReviewer) {
        throw new ApiError('Unauthorized: Cannot access risk score for this verification');
      }

      const riskScore = await KYCRiskScore.findOne({ verificationId: new ObjectId(verificationId) });

      return riskScore;
    } catch (error) {
      logger.error('Error getting risk score:', error);
      throw error;
    }
  }

  /**
   * Get risk statistics for reporting
   */
  @roles(['KYC_REVIEWER', 'ADMIN'])
  async getRiskStatistics(
    organizationId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalAssessments: number;
    averageScore: number;
    byRiskLevel: Record<string, number>;
    byMethod: Record<string, number>;
  }> {
    try {
      const match: any = {};

      if (startDate || endDate) {
        match.calculatedAt = {};
        if (startDate) match.calculatedAt.$gte = startDate;
        if (endDate) match.calculatedAt.$lte = endDate;
      }

      // If organizationId provided, join with verifications
      const pipeline: any[] = [];

      if (organizationId) {
        pipeline.push(
          {
            $lookup: {
              from: 'kyc_verifications',
              localField: 'verificationId',
              foreignField: '_id',
              as: 'verification'
            }
          },
          {
            $unwind: '$verification'
          },
          {
            $match: {
              'verification.organizationId': new ObjectId(organizationId),
              ...match
            }
          }
        );
      } else if (Object.keys(match).length > 0) {
        pipeline.push({ $match: match });
      }

      pipeline.push(
        {
          $facet: {
            totalAndAvg: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  avgScore: { $avg: '$totalScore' }
                }
              }
            ],
            byRiskLevel: [
              {
                $group: {
                  _id: '$riskLevel',
                  count: { $sum: 1 }
                }
              }
            ],
            byMethod: [
              {
                $group: {
                  _id: '$assessmentMethod',
                  count: { $sum: 1 }
                }
              }
            ]
          }
        }
      );

      const result = await KYCRiskScore.aggregate(pipeline);

      const stats = result[0];
      const totalAndAvg = stats.totalAndAvg[0] || { total: 0, avgScore: 0 };
      
      const byRiskLevel: Record<string, number> = {};
      stats.byRiskLevel.forEach((item: any) => {
        byRiskLevel[item._id] = item.count;
      });

      const byMethod: Record<string, number> = {};
      stats.byMethod.forEach((item: any) => {
        byMethod[item._id] = item.count;
      });

      return {
        totalAssessments: totalAndAvg.total,
        averageScore: Math.round(totalAndAvg.avgScore || 0),
        byRiskLevel,
        byMethod
      };
    } catch (error) {
      logger.error('Error getting risk statistics:', error);
      throw error;
    }
  }

  setExecutionContext(executionContext: Reactory.Server.IReactoryContext): boolean {
    this.context = executionContext;
    return true;
  }
}

export default RiskAssessmentService;

export const RiskAssessmentServiceDefinition: Reactory.Service.IReactoryServiceDefinition<RiskAssessmentService> = {
  id: 'reactory-kyc.RiskAssessmentService@1.0.0',
  name: 'RiskAssessmentService',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Service for calculating and managing KYC risk scores',
  dependencies: [
    { id: 'core.ReactoryAuditService@1.0.0', alias: 'auditService' }
  ],
  serviceType: 'data',
  service: (props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) => {
    return new RiskAssessmentService(props, context);
  },
};

