import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';
import { IWorkflowContext, IWorkflowStepResult } from '../types/workflow.types';

/**
 * Hybrid Verification Workflow
 * 
 * Combines automated and manual approaches based on complexity and risk.
 * Routes simple/low-risk cases to automation, complex/high-risk to manual review.
 */

interface IHybridWorkflowContext extends IWorkflowContext {
  verificationId: string;
  userId: string;
  organizationId: string;
  level: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  routingDecision?: 'automated' | 'manual' | 'spot_check';
  documents?: any[];
  riskScore?: any;
  providerId?: string;
  providerResult?: any;
  requiresSpotCheck?: boolean;
}

/**
 * Step 1: Initialize Hybrid Verification
 */
async function initializeVerification(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Initializing verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'PENDING_DOCUMENTS',
      metadata: {
        workflowType: 'hybrid',
        workflowStep: 'initialization',
        startedAt: new Date()
      }
    });

    return {
      success: true,
      nextStep: 'assessComplexity',
      data: {
        message: 'Hybrid verification initialized'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error initializing verification:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 2: Assess Verification Complexity
 */
async function assessComplexity(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Assessing complexity for: ${context.verificationId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');
    const documents = await documentService.getDocumentsForVerification(context.verificationId);

    context.documents = documents;

    // Assess complexity based on:
    // - Number of documents
    // - Document quality
    // - Verification level
    // - Historical data
    const complexity = await calculateComplexity(context, documents);
    context.complexity = complexity;

    logger.info(`[HybridWorkflow] Complexity assessed: ${complexity}`);

    return {
      success: true,
      nextStep: 'routeVerification',
      data: {
        complexity,
        documentCount: documents.length
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error assessing complexity:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 3: Route Based on Complexity
 */
async function routeVerification(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Routing verification: ${context.verificationId}`);

    const riskService = reactoryContext.getService('reactory-kyc.RiskAssessmentService@1.0.0');
    
    // Calculate initial risk score
    const riskScore = await riskService.calculateRiskScore(context.verificationId, 'hybrid');
    context.riskScore = riskScore;

    // Routing logic
    let routingDecision: 'automated' | 'manual' | 'spot_check';

    if (context.complexity === 'simple' && riskScore.riskLevel === 'LOW') {
      // Simple, low-risk → Automated with spot-check sampling
      routingDecision = 'automated';
      context.requiresSpotCheck = Math.random() < 0.1; // 10% spot-check rate
    } else if (context.complexity === 'complex' || riskScore.riskLevel === 'HIGH' || riskScore.riskLevel === 'CRITICAL') {
      // Complex or high-risk → Manual review
      routingDecision = 'manual';
    } else {
      // Moderate complexity/risk → Automated with mandatory spot-check
      routingDecision = 'automated';
      context.requiresSpotCheck = true;
    }

    context.routingDecision = routingDecision;

    logger.info(`[HybridWorkflow] Routing decision: ${routingDecision} (complexity: ${context.complexity}, risk: ${riskScore.riskLevel})`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');
    await kycService.updateVerification(context.verificationId, {
      metadata: {
        complexity: context.complexity,
        routingDecision,
        requiresSpotCheck: context.requiresSpotCheck,
        riskLevel: riskScore.riskLevel
      }
    });

    // Route to next step
    if (routingDecision === 'manual') {
      return {
        success: true,
        nextStep: 'manualReview',
        data: { route: 'manual' }
      };
    } else {
      return {
        success: true,
        nextStep: 'automatedCheck',
        data: { 
          route: 'automated',
          spotCheck: context.requiresSpotCheck
        }
      };
    }
  } catch (error) {
    logger.error('[HybridWorkflow] Error routing verification:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 4: Automated Check (Provider-based)
 */
async function automatedCheck(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Running automated check for: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    // Select provider if not specified
    if (!context.providerId) {
      context.providerId = 'onfido'; // Default provider
    }

    await kycService.updateVerification(context.verificationId, {
      status: 'VALIDATING',
      providerId: context.providerId,
      metadata: {
        workflowStep: 'automated_check'
      }
    });

    // In a real implementation, this would call ProviderManager
    // For now, simulate provider check
    logger.info(`[HybridWorkflow] Automated check submitted to ${context.providerId}`);

    return {
      success: true,
      nextStep: 'processAutomatedResult',
      data: {
        providerId: context.providerId,
        status: 'submitted'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error in automated check:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalate'
    };
  }
}

/**
 * Step 5: Process Automated Result
 */
async function processAutomatedResult(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Processing automated result for: ${context.verificationId}`);

    // Wait for provider result (in practice, this would be event-driven)
    if (!context.providerResult) {
      return {
        success: false,
        nextStep: 'processAutomatedResult',
        data: { message: 'Awaiting provider result' }
      };
    }

    const result = context.providerResult;
    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      providerResponse: result,
      metadata: {
        providerDecision: result.decision,
        providerConfidence: result.confidence
      }
    });

    // Evaluate result
    if (result.decision === 'clear' && result.confidence >= 0.85) {
      // High confidence pass
      if (context.requiresSpotCheck) {
        return {
          success: true,
          nextStep: 'spotCheck',
          data: { decision: 'clear', confidence: result.confidence }
        };
      } else {
        return {
          success: true,
          nextStep: 'autoApprove',
          data: { decision: 'clear', confidence: result.confidence }
        };
      }
    } else if (result.decision === 'rejected') {
      return {
        success: true,
        nextStep: 'reject',
        data: { decision: 'rejected' }
      };
    } else {
      // Unclear result - escalate to manual
      return {
        success: false,
        nextStep: 'escalate',
        data: {
          reason: 'Unclear provider result',
          confidence: result.confidence
        }
      };
    }
  } catch (error) {
    logger.error('[HybridWorkflow] Error processing automated result:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalate'
    };
  }
}

/**
 * Step 6: Spot Check (Random sampling for quality assurance)
 */
async function spotCheck(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Spot check required for: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'UNDER_REVIEW',
      metadata: {
        workflowStep: 'spot_check',
        spotCheckRequired: true,
        automatedDecision: 'approved',
        assignedForSpotCheck: new Date()
      }
    });

    // In a real implementation, this would assign to a reviewer
    // For now, just mark as under review

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'UNDER_REVIEW',
        message: 'Verification queued for spot-check review'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error in spot check:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 7: Manual Review
 */
async function manualReview(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Manual review for: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'UNDER_REVIEW',
      metadata: {
        workflowStep: 'manual_review',
        routedToManual: true,
        assignedAt: new Date()
      }
    });

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'UNDER_REVIEW',
        message: 'Verification routed to manual review'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error in manual review:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 8: Auto-Approve
 */
async function autoApprove(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Auto-approving verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'AUTO_APPROVED',
      metadata: {
        approvedAt: new Date(),
        approvedBy: 'system',
        workflow: 'hybrid',
        riskScore: context.riskScore?.totalScore,
        providerId: context.providerId
      }
    });

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'AUTO_APPROVED',
        message: 'Verification automatically approved'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error auto-approving:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 9: Reject
 */
async function reject(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Rejecting verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'REJECTED',
      metadata: {
        rejectedAt: new Date(),
        rejectedBy: 'system',
        workflow: 'hybrid',
        reason: 'Automated verification failed'
      }
    });

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'REJECTED',
        message: 'Verification rejected'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error rejecting:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 10: Escalate to Manual Review
 */
async function escalate(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Escalating to manual review: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'UNDER_REVIEW',
      metadata: {
        escalatedAt: new Date(),
        escalationReason: 'Automated process inconclusive',
        originalWorkflow: 'hybrid'
      }
    });

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'UNDER_REVIEW',
        message: 'Verification escalated to manual review'
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error escalating:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 11: Complete Workflow
 */
async function complete(
  context: IHybridWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[HybridWorkflow] Completing workflow for: ${context.verificationId}`);

    return {
      success: true,
      nextStep: null,
      data: {
        message: 'Hybrid verification workflow completed',
        verificationId: context.verificationId,
        finalRoute: context.routingDecision
      }
    };
  } catch (error) {
    logger.error('[HybridWorkflow] Error completing workflow:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Helper: Calculate verification complexity
 */
async function calculateComplexity(
  context: IHybridWorkflowContext,
  documents: any[]
): Promise<'simple' | 'moderate' | 'complex'> {
  // Complexity scoring factors:
  let complexityScore = 0;

  // 1. Verification level
  const levelScores = {
    BASIC: 0,
    INTERMEDIATE: 1,
    ADVANCED: 2,
    ENHANCED: 3
  };
  complexityScore += levelScores[context.level] || 1;

  // 2. Number of documents
  if (documents.length > 5) complexityScore += 2;
  else if (documents.length > 3) complexityScore += 1;

  // 3. Document quality
  const poorQualityDocs = documents.filter(doc => 
    doc.metadata?.quality === 'poor' || doc.metadata?.needsManualReview
  );
  complexityScore += poorQualityDocs.length;

  // 4. Document types (some types are more complex)
  const complexDocTypes = ['BANK_STATEMENT', 'UTILITY_BILL', 'TAX_RETURN'];
  const hasComplexDocs = documents.some(doc => 
    complexDocTypes.includes(doc.documentType)
  );
  if (hasComplexDocs) complexityScore += 1;

  // Determine complexity level
  if (complexityScore <= 2) return 'simple';
  if (complexityScore <= 4) return 'moderate';
  return 'complex';
}

/**
 * Workflow Definition
 */
export const HybridVerificationWorkflow: Reactory.Server.IReactoryWorkflowDefinition = {
  id: 'reactory-kyc.HybridVerificationWorkflow@1.0.0',
  name: 'Hybrid Verification Workflow',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Combines automated and manual approaches based on complexity and risk',
  
  // Workflow steps
  steps: {
    initializeVerification,
    assessComplexity,
    routeVerification,
    automatedCheck,
    processAutomatedResult,
    spotCheck,
    manualReview,
    autoApprove,
    reject,
    escalate,
    complete
  },

  // Entry point
  entryStep: 'initializeVerification',

  // State machine transitions
  transitions: {
    initializeVerification: ['assessComplexity', 'failed'],
    assessComplexity: ['routeVerification', 'failed'],
    routeVerification: ['automatedCheck', 'manualReview', 'failed'],
    automatedCheck: ['processAutomatedResult', 'escalate', 'failed'],
    processAutomatedResult: ['autoApprove', 'spotCheck', 'reject', 'escalate', 'processAutomatedResult', 'failed'],
    spotCheck: ['complete', 'failed'],
    manualReview: ['complete', 'failed'],
    autoApprove: ['complete', 'failed'],
    reject: ['complete', 'failed'],
    escalate: ['complete', 'failed'],
    complete: [],
    failed: []
  },

  // Workflow metadata
  metadata: {
    category: 'kyc',
    tags: ['verification', 'hybrid', 'adaptive', 'routing'],
    estimatedDuration: '30 minutes - 3 business days',
    requiresHumanReview: 'conditional'
  }
};

export default HybridVerificationWorkflow;

