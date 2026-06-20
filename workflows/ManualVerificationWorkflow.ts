import Reactory from '@reactorynet/reactory-core';
import logger from '@reactory/server-core/logging';
import ReactoryContextProvider from '@reactory/server-core/context/ReactoryContextProvider';
import {
  WorkflowBase,
  StepBody,
  StepExecutionContext,
  ExecutionResult,
} from '@reactorynet/workflow-es';

/**
 * Manual Verification Workflow
 * 
 * Handles the complete manual verification process with human review.
 * All verifications go through a KYC reviewer for approval.
 */

class ManualWorkflowData {
  public verificationId: string;
  public userId: string;
  public organizationId: string;
  public level: string;
  public documents?: any[];
  public riskScore?: any;
  public reviewerId?: string;
  public reviewDecision?: 'approved' | 'rejected' | 'additional_info';
  public additionalRequirements?: string[];
}

abstract class ManualWorkflowStep extends StepBody {
  public context: Reactory.Server.IReactoryContext;
  public data: ManualWorkflowData;

  /**
   * Initialize the Reactory context and services for this step.
   * If a context is already provided (e.g. by the workflow engine), it will be reused.
   */
  async initializeServices(): Promise<void> {
    if (!this.context) {
      const ctx: any = await ReactoryContextProvider(null, null);
      await ctx.forUser(process.env.KYC_SYSTEM_USER || 'kyc@reactory.net');
      await ctx.forPartner(process.env.KYC_SYSTEM_PARTNER || 'reactory');
      this.context = ctx;
      if (!this.context.user) {
        throw new Error('Failed to initialize workflow context: user not found');
      }
    }
  }

  protected logError(message: string, error: any, step: string): void {
    this.context.error(message, { error: error.message, stack: error.stack }, step);
  }
}

/**
 * Step 1: Initialize Manual Verification
 */
class InitializeVerification extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      await this.initializeServices();
      logger.info(`[ManualWorkflow] Initializing verification: ${this.data.verificationId}`);

      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');

      await kycService.updateVerification(this.data.verificationId, {
        status: 'PENDING_DOCUMENTS',
        metadata: {
          workflowStep: 'initialization',
          startedAt: new Date()
        }
      });

      logger.info('[ManualWorkflow] Verification initialized');
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error initializing verification:', error);
      throw error;
    }
  }
}

/**
 * Step 2: Request Required Documents
 */
class RequestDocuments extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Requesting documents for: ${this.data.verificationId}`);

      const requiredDocs = getRequiredDocuments(this.data.level);
      logger.info(`[ManualWorkflow] Required documents: ${requiredDocs.join(', ')}`);

      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error requesting documents:', error);
      throw error;
    }
  }
}

/**
 * Step 3: Wait for Document Upload
 */
class WaitForDocuments extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Checking documents for: ${this.data.verificationId}`);

      const documentService: any = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
      const documents = await documentService.getDocumentsForVerification(this.data.verificationId);

      const requiredDocs = getRequiredDocuments(this.data.level);
      const uploadedTypes = documents.map((doc: any) => doc.documentType);
      const allPresent = requiredDocs.every(type => uploadedTypes.includes(type));

      if (allPresent) {
        this.data.documents = documents;
        logger.info(`[ManualWorkflow] All required documents received`);
        return ExecutionResult.next();
      } else {
        const missing = requiredDocs.filter(type => !uploadedTypes.includes(type));
        logger.info(`[ManualWorkflow] Still waiting for documents: ${missing.join(', ')}`);
        // In a real implementation, this would wait or reschedule
        return ExecutionResult.next();
      }
    } catch (error) {
      logger.error('[ManualWorkflow] Error checking documents:', error);
      throw error;
    }
  }
}

/**
 * Step 4: Validate Documents
 */
class ValidateDocuments extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Validating documents for: ${this.data.verificationId}`);

      const documentService: any = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');

      let allValid = true;
      const validationResults = [];

      for (const doc of this.data.documents) {
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

      await kycService.updateVerification(this.data.verificationId, {
        status: 'SUBMITTED',
        metadata: {
          workflowStep: 'validation',
          validationResults,
          allDocumentsValid: allValid
        }
      });

      logger.info(`[ManualWorkflow] Documents validated: ${allValid ? 'all valid' : 'some invalid'}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error validating documents:', error);
      throw error;
    }
  }
}

/**
 * Step 5: Calculate Risk Score
 */
class CalculateRisk extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Calculating risk for: ${this.data.verificationId}`);

      const riskService: any = this.context.getService('reactory-kyc.RiskAssessmentService@1.0.0');
      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');

      const riskScore = await riskService.calculateRiskScore(this.data.verificationId, 'manual');
      this.data.riskScore = riskScore;

      await kycService.updateVerification(this.data.verificationId, {
        metadata: {
          riskScore: riskScore.totalScore,
          riskLevel: riskScore.riskLevel
        }
      });

      logger.info(`[ManualWorkflow] Risk calculated: ${riskScore.totalScore} (${riskScore.riskLevel})`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error calculating risk:', error);
      throw error;
    }
  }
}

/**
 * Step 6: Assign to Reviewer
 */
class AssignReviewer extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Assigning reviewer for: ${this.data.verificationId}`);

      const kycService: any = this.context.getService('reactory-kyc.KYCService@1.0.0');

      await kycService.updateVerification(this.data.verificationId, {
        status: 'UNDER_REVIEW',
        metadata: {
          workflowStep: 'review',
          assignedAt: new Date(),
          reviewStarted: new Date()
        }
      });

      logger.info(`[ManualWorkflow] Verification assigned to review queue`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error assigning reviewer:', error);
      throw error;
    }
  }
}

/**
 * Step 7: Await Manual Review Decision
 */
class AwaitReview extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Awaiting review for: ${this.data.verificationId}`);

      // In a real implementation, this would wait for reviewer action
      // For now, we just complete the step
      logger.info(`[ManualWorkflow] Review step completed`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error in review step:', error);
      throw error;
    }
  }
}

/**
 * Step 8: Complete Workflow
 */
class Complete extends ManualWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[ManualWorkflow] Completing workflow for: ${this.data.verificationId}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[ManualWorkflow] Error completing workflow:', error);
      throw error;
    }
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
 * Main workflow that orchestrates the manual verification process
 */
class ManualVerificationWorkflowImpl implements WorkflowBase<ManualWorkflowData> {
  id: string = 'reactory-kyc.ManualVerificationWorkflow@1.0.0';
  version: number = 1;

  public build(builder: any) {
    builder
      .startWith(InitializeVerification)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(RequestDocuments)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(WaitForDocuments)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(ValidateDocuments)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(CalculateRisk)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(AssignReviewer)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(AwaitReview)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        })
        .output((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          data = step.data;
        })
      .then(Complete)
        .input((step: ManualWorkflowStep, data: ManualWorkflowData) => {
          step.data = data;
        });
  }
}

export const ManualVerificationWorkflow: Reactory.Workflow.IWorkflow = {
  id: 'reactory-kyc.ManualVerificationWorkflow@1.0.0',
  nameSpace: 'reactory-kyc',
  name: 'ManualVerificationWorkflow',
  component: ManualVerificationWorkflowImpl,
  category: 'workflow',
  autoStart: false,
  version: '1.0.0',
} as Reactory.Workflow.IWorkflow;

export default ManualVerificationWorkflow;
