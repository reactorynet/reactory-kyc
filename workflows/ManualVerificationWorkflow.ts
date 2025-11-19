import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';
import { IWorkflowContext, IWorkflowStepResult } from '../types/workflow.types';

/**
 * Manual Verification Workflow
 * 
 * Handles the complete manual verification process with human review.
 * All verifications go through a KYC reviewer for approval.
 */

interface IManualWorkflowContext extends IWorkflowContext {
  verificationId: string;
  userId: string;
  organizationId: string;
  level: string;
  documents?: any[];
  riskScore?: any;
  reviewerId?: string;
  reviewDecision?: 'approved' | 'rejected' | 'additional_info';
  additionalRequirements?: string[];
}

/**
 * Step 1: Initialize Manual Verification
 */
async function initializeVerification(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Initializing verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    // Update status to indicate pending documents
    await kycService.updateVerification(context.verificationId, {
      status: 'PENDING_DOCUMENTS',
      metadata: {
        workflowStep: 'initialization',
        startedAt: new Date()
      }
    });

    return {
      success: true,
      nextStep: 'requestDocuments',
      data: {
        message: 'Verification initialized. Awaiting document upload.',
        requiredDocuments: getRequiredDocuments(context.level)
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error initializing verification:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 2: Request Required Documents
 */
async function requestDocuments(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Requesting documents for: ${context.verificationId}`);

    const requiredDocs = getRequiredDocuments(context.level);

    // In a real implementation, this would send notifications to the user
    // For now, we just log the requirements
    logger.info(`[ManualWorkflow] Required documents: ${requiredDocs.join(', ')}`);

    return {
      success: true,
      nextStep: 'waitForDocuments',
      data: {
        requiredDocuments: requiredDocs,
        message: 'Please upload the required documents'
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error requesting documents:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 3: Wait for Document Upload
 * (This is typically triggered by external event - document upload)
 */
async function waitForDocuments(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Checking documents for: ${context.verificationId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');
    const documents = await documentService.getDocumentsForVerification(context.verificationId);

    // Check if all required documents are present
    const requiredDocs = getRequiredDocuments(context.level);
    const uploadedTypes = documents.map(doc => doc.documentType);
    const allPresent = requiredDocs.every(type => uploadedTypes.includes(type));

    if (allPresent) {
      context.documents = documents;
      return {
        success: true,
        nextStep: 'validateDocuments',
        data: {
          documentsReceived: documents.length,
          message: 'All required documents received'
        }
      };
    } else {
      const missing = requiredDocs.filter(type => !uploadedTypes.includes(type));
      return {
        success: false,
        nextStep: 'waitForDocuments',
        data: {
          missingDocuments: missing,
          message: 'Still waiting for required documents'
        }
      };
    }
  } catch (error) {
    logger.error('[ManualWorkflow] Error checking documents:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 4: Validate Documents
 */
async function validateDocuments(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Validating documents for: ${context.verificationId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');
    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    let allValid = true;
    const validationResults = [];

    // Validate each document
    for (const doc of context.documents) {
      const result = await documentService.validateKYCDocument(doc._id.toString(), {
        status: 'pending',
        notes: 'Automated validation pending manual review'
      });

      validationResults.push({
        documentId: doc._id,
        type: doc.documentType,
        valid: result.validationStatus !== 'invalid'
      });

      if (result.validationStatus === 'invalid') {
        allValid = false;
      }
    }

    // Update verification status
    await kycService.updateVerification(context.verificationId, {
      status: 'SUBMITTED',
      metadata: {
        workflowStep: 'validation',
        validationResults,
        allDocumentsValid: allValid
      }
    });

    return {
      success: true,
      nextStep: 'calculateRisk',
      data: {
        validationResults,
        allValid
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error validating documents:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 5: Calculate Risk Score
 */
async function calculateRisk(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Calculating risk for: ${context.verificationId}`);

    const riskService = reactoryContext.getService('reactory-kyc.RiskAssessmentService@1.0.0');
    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    // Calculate risk score
    const riskScore = await riskService.calculateRiskScore(context.verificationId, 'manual');
    context.riskScore = riskScore;

    // Update verification with risk information
    await kycService.updateVerification(context.verificationId, {
      metadata: {
        riskScore: riskScore.totalScore,
        riskLevel: riskScore.riskLevel
      }
    });

    return {
      success: true,
      nextStep: 'assignReviewer',
      data: {
        riskScore: riskScore.totalScore,
        riskLevel: riskScore.riskLevel
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error calculating risk:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 6: Assign to Reviewer
 */
async function assignReviewer(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Assigning reviewer for: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    // Update status to under review
    // In a real implementation, this would assign to a specific reviewer
    // based on workload, expertise, risk level, etc.
    await kycService.updateVerification(context.verificationId, {
      status: 'UNDER_REVIEW',
      metadata: {
        workflowStep: 'review',
        assignedAt: new Date(),
        reviewStarted: new Date()
      }
    });

    logger.info(`[ManualWorkflow] Verification ${context.verificationId} assigned to review queue`);

    return {
      success: true,
      nextStep: 'awaitReview',
      data: {
        message: 'Verification assigned to reviewer',
        status: 'UNDER_REVIEW'
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error assigning reviewer:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 7: Await Manual Review
 * (This step waits for reviewer action - approval, rejection, or additional info request)
 */
async function awaitReview(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Awaiting review for: ${context.verificationId}`);

    // This step is typically triggered by external events (reviewer actions)
    // For workflow purposes, we check if a decision has been made

    if (!context.reviewDecision) {
      return {
        success: false,
        nextStep: 'awaitReview',
        data: {
          message: 'Awaiting reviewer decision'
        }
      };
    }

    // Route based on decision
    switch (context.reviewDecision) {
      case 'approved':
        return {
          success: true,
          nextStep: 'approve',
          data: { decision: 'approved' }
        };
      case 'rejected':
        return {
          success: true,
          nextStep: 'reject',
          data: { decision: 'rejected' }
        };
      case 'additional_info':
        return {
          success: true,
          nextStep: 'requestAdditionalInfo',
          data: { decision: 'additional_info' }
        };
      default:
        return {
          success: false,
          nextStep: 'awaitReview',
          data: { message: 'Invalid decision' }
        };
    }
  } catch (error) {
    logger.error('[ManualWorkflow] Error in review step:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 8a: Approve Verification
 */
async function approve(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Approving verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.approveVerification(
      context.verificationId,
      context.reviewerId,
      'Manual review completed - approved'
    );

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'MANUALLY_APPROVED',
        message: 'Verification approved by reviewer'
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error approving verification:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 8b: Reject Verification
 */
async function reject(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Rejecting verification: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.rejectVerification(
      context.verificationId,
      context.reviewerId,
      'Verification rejected after manual review'
    );

    return {
      success: true,
      nextStep: 'complete',
      data: {
        status: 'REJECTED',
        message: 'Verification rejected by reviewer'
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error rejecting verification:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 8c: Request Additional Information
 */
async function requestAdditionalInfo(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Requesting additional info for: ${context.verificationId}`);

    const kycService = reactoryContext.getService('reactory-kyc.KYCService@1.0.0');

    await kycService.requestAdditionalInfo(
      context.verificationId,
      context.reviewerId,
      context.additionalRequirements || []
    );

    return {
      success: true,
      nextStep: 'requestDocuments',
      data: {
        status: 'ADDITIONAL_INFO_REQUIRED',
        requirements: context.additionalRequirements
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error requesting additional info:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 9: Complete Workflow
 */
async function complete(
  context: IManualWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[ManualWorkflow] Completing workflow for: ${context.verificationId}`);

    return {
      success: true,
      nextStep: null,
      data: {
        message: 'Manual verification workflow completed',
        verificationId: context.verificationId
      }
    };
  } catch (error) {
    logger.error('[ManualWorkflow] Error completing workflow:', error);
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
 * Workflow Definition
 */
export const ManualVerificationWorkflow: Reactory.Server.IReactoryWorkflowDefinition = {
  id: 'reactory-kyc.ManualVerificationWorkflow@1.0.0',
  name: 'Manual Verification Workflow',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Complete manual verification process with human review',
  
  // Workflow steps
  steps: {
    initializeVerification,
    requestDocuments,
    waitForDocuments,
    validateDocuments,
    calculateRisk,
    assignReviewer,
    awaitReview,
    approve,
    reject,
    requestAdditionalInfo,
    complete
  },

  // Entry point
  entryStep: 'initializeVerification',

  // State machine transitions
  transitions: {
    initializeVerification: ['requestDocuments', 'failed'],
    requestDocuments: ['waitForDocuments', 'failed'],
    waitForDocuments: ['validateDocuments', 'waitForDocuments', 'failed'],
    validateDocuments: ['calculateRisk', 'failed'],
    calculateRisk: ['assignReviewer', 'failed'],
    assignReviewer: ['awaitReview', 'failed'],
    awaitReview: ['approve', 'reject', 'requestAdditionalInfo', 'awaitReview', 'failed'],
    approve: ['complete', 'failed'],
    reject: ['complete', 'failed'],
    requestAdditionalInfo: ['requestDocuments', 'failed'],
    complete: [],
    failed: []
  },

  // Workflow metadata
  metadata: {
    category: 'kyc',
    tags: ['verification', 'manual', 'compliance'],
    estimatedDuration: '2-5 business days',
    requiresHumanReview: true
  }
};

export default ManualVerificationWorkflow;

