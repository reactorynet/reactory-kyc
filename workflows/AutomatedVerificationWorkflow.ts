import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';
import { IWorkflowContext, IWorkflowStepResult } from '../types/workflow.types';

/**
 * Automated Verification Workflow
 * 
 * Fully automated verification using AI/ML providers and risk assessment.
 * Auto-approves low-risk verifications, escalates high-risk to manual review.
 */

interface IAutomatedWorkflowContext extends IWorkflowContext {
  verificationId: string;
  userId: string;
  organizationId: string;
  level: string;
  providerId?: string;
  providerCheckId?: string;
  providerResult?: any;
  documents?: any[];
  riskScore?: any;
  autoApprovalThreshold?: number;
}

/**
 * Step 1: Initialize Automated Verification
 */
async function initializeVerification(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Initializing verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    // Set default auto-approval threshold
    context.autoApprovalThreshold = context.autoApprovalThreshold || 70;

    await kycService.updateVerification(context.verificationId, {
      status: 'PENDING_DOCUMENTS',
      metadata: {
        workflowType: 'automated',
        workflowStep: 'initialization',
        autoApprovalThreshold: context.autoApprovalThreshold,
        startedAt: new Date()
      }
    });

    return {
      success: true,
      nextStep: 'collectData',
      data: {
        message: 'Automated verification initialized',
        threshold: context.autoApprovalThreshold
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error initializing verification:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 2: Collect Required Data
 */
async function collectData(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Collecting data for: ${context.verificationId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');
    const documents = await documentService.getDocumentsForVerification(context.verificationId);

    // Check if all required documents are present
    const requiredDocs = getRequiredDocuments(context.level);
    const uploadedTypes = documents.map(doc => doc.documentType);
    const allPresent = requiredDocs.every(type => uploadedTypes.includes(type));

    if (!allPresent) {
      const missing = requiredDocs.filter(type => !uploadedTypes.includes(type));
      logger.warn(`[AutomatedWorkflow] Missing documents: ${missing.join(', ')}`);
      
      return {
        success: false,
        nextStep: 'escalateToManual',
        data: {
          reason: 'Missing required documents',
          missingDocuments: missing
        }
      };
    }

    context.documents = documents;

    return {
      success: true,
      nextStep: 'selectProvider',
      data: {
        documentsCollected: documents.length
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error collecting data:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 3: Select Best Provider
 */
async function selectProvider(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Selecting provider for: ${context.verificationId}`);

    // If provider already specified, use it
    if (context.providerId) {
      return {
        success: true,
        nextStep: 'submitToProvider',
        data: {
          providerId: context.providerId,
          source: 'specified'
        }
      };
    }

    // Otherwise, select best available provider
    // In a real implementation, this would query the KYCProvider model
    // and select based on capabilities, performance, cost, etc.
    const bestProvider = await selectBestProvider(context, reactoryContext);

    if (!bestProvider) {
      logger.warn('[AutomatedWorkflow] No provider available, escalating to manual');
      return {
        success: false,
        nextStep: 'escalateToManual',
        data: {
          reason: 'No automated provider available'
        }
      };
    }

    context.providerId = bestProvider;

    return {
      success: true,
      nextStep: 'submitToProvider',
      data: {
        providerId: bestProvider,
        source: 'auto-selected'
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error selecting provider:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalateToManual'
    };
  }
}

/**
 * Step 4: Submit to Provider
 */
async function submitToProvider(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Submitting to provider ${context.providerId}: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    // Update status
    await kycService.updateVerification(context.verificationId, {
      status: 'VALIDATING',
      providerId: context.providerId,
      metadata: {
        workflowStep: 'provider_submission',
        submittedAt: new Date()
      }
    });

    // In a real implementation, this would call the ProviderManager
    // to execute the actual provider check
    // For now, we simulate a provider submission
    logger.info(`[AutomatedWorkflow] Provider submission simulated for ${context.providerId}`);

    return {
      success: true,
      nextStep: 'waitForProviderResult',
      data: {
        providerId: context.providerId,
        status: 'submitted'
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error submitting to provider:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalateToManual'
    };
  }
}

/**
 * Step 5: Wait for Provider Result
 */
async function waitForProviderResult(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Waiting for provider result: ${context.verificationId}`);

    // This step is typically triggered by webhook or polling
    // For workflow purposes, we check if result is available

    if (!context.providerResult) {
      return {
        success: false,
        nextStep: 'waitForProviderResult',
        data: {
          message: 'Awaiting provider result'
        }
      };
    }

    return {
      success: true,
      nextStep: 'processProviderResult',
      data: {
        result: context.providerResult
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error waiting for provider result:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalateToManual'
    };
  }
}

/**
 * Step 6: Process Provider Result
 */
async function processProviderResult(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Processing provider result: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');
    const result = context.providerResult;

    // Store provider response
    await kycService.updateVerification(context.verificationId, {
      providerResponse: result,
      metadata: {
        workflowStep: 'provider_processing',
        providerDecision: result.decision,
        providerConfidence: result.confidence
      }
    });

    // Check provider decision
    if (result.decision === 'clear' && result.confidence >= 0.8) {
      return {
        success: true,
        nextStep: 'calculateRisk',
        data: {
          providerDecision: 'clear',
          confidence: result.confidence
        }
      };
    } else if (result.decision === 'rejected') {
      return {
        success: true,
        nextStep: 'reject',
        data: {
          providerDecision: 'rejected',
          reason: result.reason
        }
      };
    } else {
      // Unclear or low confidence - escalate
      return {
        success: false,
        nextStep: 'escalateToManual',
        data: {
          reason: 'Provider result unclear or low confidence',
          providerDecision: result.decision,
          confidence: result.confidence
        }
      };
    }
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error processing provider result:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalateToManual'
    };
  }
}

/**
 * Step 7: Calculate Risk Score
 */
async function calculateRisk(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Calculating risk for: ${context.verificationId}`);

    const riskService = reactoryContext.getService('reactory-kyc.RiskAssessmentService@1.0.0');
    const riskScore = await riskService.calculateRiskScore(context.verificationId, 'automated');
    
    context.riskScore = riskScore;

    logger.info(`[AutomatedWorkflow] Risk score: ${riskScore.totalScore}, Level: ${riskScore.riskLevel}`);

    return {
      success: true,
      nextStep: 'evaluateAutoApproval',
      data: {
        riskScore: riskScore.totalScore,
        riskLevel: riskScore.riskLevel
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error calculating risk:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalateToManual'
    };
  }
}

/**
 * Step 8: Evaluate Auto-Approval
 */
async function evaluateAutoApproval(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Evaluating auto-approval for: ${context.verificationId}`);

    const riskScore = context.riskScore;
    const threshold = context.autoApprovalThreshold || 70;

    // Check if can auto-approve
    const canAutoApprove = riskScore.canAutoApprove && riskScore.canAutoApprove(threshold);

    if (canAutoApprove) {
      logger.info(`[AutomatedWorkflow] Auto-approval criteria met (score: ${riskScore.totalScore})`);
      return {
        success: true,
        nextStep: 'autoApprove',
        data: {
          decision: 'auto-approve',
          riskScore: riskScore.totalScore
        }
      };
    } else {
      logger.info(`[AutomatedWorkflow] Auto-approval criteria not met, escalating to manual`);
      return {
        success: false,
        nextStep: 'escalateToManual',
        data: {
          reason: 'Risk score below auto-approval threshold',
          riskScore: riskScore.totalScore,
          threshold
        }
      };
    }
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error evaluating auto-approval:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'escalateToManual'
    };
  }
}

/**
 * Step 9: Auto-Approve
 */
async function autoApprove(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Auto-approving verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'AUTO_APPROVED',
      metadata: {
        approvedAt: new Date(),
        approvedBy: 'system',
        riskScore: context.riskScore.totalScore,
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
    logger.error('[AutomatedWorkflow] Error auto-approving:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 10: Reject
 */
async function reject(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Rejecting verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'REJECTED',
      metadata: {
        rejectedAt: new Date(),
        rejectedBy: 'system',
        reason: 'Automated verification failed',
        providerId: context.providerId
      }
    });

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'REJECTED',
        message: 'Verification automatically rejected'
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error rejecting:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 11: Escalate to Manual Review
 */
async function escalateToManual(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Escalating to manual review: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.updateVerification(context.verificationId, {
      status: 'UNDER_REVIEW',
      metadata: {
        escalatedAt: new Date(),
        escalationReason: context.riskScore ? 
          'Risk score below threshold' : 
          'Automated verification inconclusive',
        originalWorkflow: 'automated'
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
    logger.error('[AutomatedWorkflow] Error escalating:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 12: Complete Workflow
 */
async function complete(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[AutomatedWorkflow] Completing workflow for: ${context.verificationId}`);

    return {
      success: true,
      nextStep: null,
      data: {
        message: 'Automated verification workflow completed',
        verificationId: context.verificationId
      }
    };
  } catch (error) {
    logger.error('[AutomatedWorkflow] Error completing workflow:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Helper: Get required documents by verification level
 */
function getRequiredDocuments(level: string): string[] {
  const requirements: Record<string, string[]> = {
    BASIC: ['NATIONAL_ID', 'SELFIE'],
    INTERMEDIATE: ['NATIONAL_ID', 'PROOF_OF_ADDRESS', 'SELFIE'],
    ADVANCED: ['PASSPORT', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SELFIE'],
    ENHANCED: ['PASSPORT', 'NATIONAL_ID', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'SELFIE', 'LIVENESS_VIDEO']
  };

  return requirements[level] || requirements.INTERMEDIATE;
}

/**
 * Helper: Select best provider
 */
async function selectBestProvider(
  context: IAutomatedWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<string | null> {
  // In a real implementation, this would query KYCProvider model
  // and select based on:
  // - Capabilities match
  // - Success rate
  // - Response time
  // - Cost
  // - Current load
  
  // For now, return a default provider
  return 'onfido'; // or 'trulio'
}

/**
 * Workflow Definition
 */
export const AutomatedVerificationWorkflow: Reactory.Server.IReactoryWorkflowDefinition = {
  id: 'reactory-kyc.AutomatedVerificationWorkflow@1.0.0',
  name: 'Automated Verification Workflow',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Fully automated verification using AI/ML providers and risk assessment',
  
  // Workflow steps
  steps: {
    initializeVerification,
    collectData,
    selectProvider,
    submitToProvider,
    waitForProviderResult,
    processProviderResult,
    calculateRisk,
    evaluateAutoApproval,
    autoApprove,
    reject,
    escalateToManual,
    complete
  },

  // Entry point
  entryStep: 'initializeVerification',

  // State machine transitions
  transitions: {
    initializeVerification: ['collectData', 'failed'],
    collectData: ['selectProvider', 'escalateToManual', 'failed'],
    selectProvider: ['submitToProvider', 'escalateToManual', 'failed'],
    submitToProvider: ['waitForProviderResult', 'escalateToManual', 'failed'],
    waitForProviderResult: ['processProviderResult', 'waitForProviderResult', 'escalateToManual', 'failed'],
    processProviderResult: ['calculateRisk', 'reject', 'escalateToManual', 'failed'],
    calculateRisk: ['evaluateAutoApproval', 'escalateToManual', 'failed'],
    evaluateAutoApproval: ['autoApprove', 'escalateToManual', 'failed'],
    autoApprove: ['complete', 'failed'],
    reject: ['complete', 'failed'],
    escalateToManual: ['complete', 'failed'],
    complete: [],
    failed: []
  },

  // Workflow metadata
  metadata: {
    category: 'kyc',
    tags: ['verification', 'automated', 'ai', 'provider'],
    estimatedDuration: '5-30 minutes',
    requiresHumanReview: false
  }
};

export default AutomatedVerificationWorkflow;

