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
 * Hybrid Verification Workflow
 * 
 * Combines automated and manual approaches based on complexity and risk.
 * Routes simple/low-risk cases to automation, complex/high-risk to manual review.
 */

class HybridWorkflowData {
  public verificationId: string;
  public userId: string;
  public organizationId: string;
  public level: string;
  public complexity?: 'simple' | 'moderate' | 'complex';
  public routingDecision?: 'automated' | 'manual' | 'spot_check';
  public documents?: any[];
  public riskScore?: any;
  public providerId?: string;
  public providerResult?: any;
  public requiresSpotCheck?: boolean;
}

abstract class HybridWorkflowStep extends StepBody {
  public context: Reactory.Server.IReactoryContext;
  public data: HybridWorkflowData;

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
 * Step 1: Initialize Hybrid Verification
 */
class InitializeVerification extends HybridWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      await this.initializeServices();
      logger.info(`[HybridWorkflow] Initializing verification: ${this.data.verificationId}`);

      const kycService = this.context.getService('reactory-kyc.KYCService@1.0.0');

      await kycService.updateVerification(this.data.verificationId, {
        status: 'PENDING_DOCUMENTS',
        metadata: {
          workflowType: 'hybrid',
          workflowStep: 'initialization',
          startedAt: new Date()
        }
      });

      logger.info('[HybridWorkflow] Verification initialized');
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[HybridWorkflow] Error initializing verification:', error);
      throw error;
    }
  }
}

/**
 * Step 2: Assess Verification Complexity
 */
class AssessComplexity extends HybridWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[HybridWorkflow] Assessing complexity for: ${this.data.verificationId}`);

      const documentService = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
      const documents = await documentService.getDocumentsForVerification(this.data.verificationId);

      this.data.documents = documents;

      const complexity = await calculateComplexity(this.data, documents);
      this.data.complexity = complexity;

      logger.info(`[HybridWorkflow] Complexity assessed: ${complexity}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[HybridWorkflow] Error assessing complexity:', error);
      throw error;
    }
  }
}

/**
 * Step 3: Route Based on Complexity
 */
class RouteVerification extends HybridWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[HybridWorkflow] Routing verification: ${this.data.verificationId}`);

      const riskService = this.context.getService('reactory-kyc.RiskAssessmentService@1.0.0');
      
      const riskScore = await riskService.calculateRiskScore(this.data.verificationId, 'hybrid');
      this.data.riskScore = riskScore;

      let routingDecision: 'automated' | 'manual' | 'spot_check';

      if (this.data.complexity === 'simple' && riskScore.riskLevel === 'LOW') {
        routingDecision = 'automated';
        this.data.requiresSpotCheck = Math.random() < 0.1; // 10% spot-check rate
      } else if (this.data.complexity === 'complex' || riskScore.riskLevel === 'HIGH' || riskScore.riskLevel === 'CRITICAL') {
        routingDecision = 'manual';
      } else {
        routingDecision = 'automated';
        this.data.requiresSpotCheck = true;
      }

      this.data.routingDecision = routingDecision;

      logger.info(`[HybridWorkflow] Routing decision: ${routingDecision} (complexity: ${this.data.complexity}, risk: ${riskScore.riskLevel})`);

      const kycService = this.context.getService('reactory-kyc.KYCService@1.0.0');
      await kycService.updateVerification(this.data.verificationId, {
        metadata: {
          complexity: this.data.complexity,
          routingDecision,
          requiresSpotCheck: this.data.requiresSpotCheck,
          riskLevel: riskScore.riskLevel
        }
      });

      return ExecutionResult.next();
    } catch (error) {
      logger.error('[HybridWorkflow] Error routing verification:', error);
      throw error;
    }
  }
}

/**
 * Step 4: Automated Check (if routed)
 */
class AutomatedCheck extends HybridWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      if (this.data.routingDecision === 'manual') {
        logger.info('[HybridWorkflow] Skipping automated check (manual route)');
        return ExecutionResult.next();
      }

      logger.info(`[HybridWorkflow] Running automated check for: ${this.data.verificationId}`);

      const kycService = this.context.getService('reactory-kyc.KYCService@1.0.0');

      if (!this.data.providerId) {
        this.data.providerId = 'onfido'; // Default provider
      }

      await kycService.updateVerification(this.data.verificationId, {
        status: 'VALIDATING',
        providerId: this.data.providerId,
        metadata: {
          workflowStep: 'automated_check'
        }
      });

      logger.info('[HybridWorkflow] Automated check submitted');
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[HybridWorkflow] Error in automated check:', error);
      throw error;
    }
  }
}

/**
 * Step 5: Complete Workflow
 */
class Complete extends HybridWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[HybridWorkflow] Completing workflow for: ${this.data.verificationId}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[HybridWorkflow] Error completing workflow:', error);
      throw error;
    }
  }
}

/**
 * Helper: Calculate verification complexity
 */
async function calculateComplexity(
  data: HybridWorkflowData,
  documents: any[]
): Promise<'simple' | 'moderate' | 'complex'> {
  let complexityScore = 0;

  const levelScores = {
    BASIC: 0,
    INTERMEDIATE: 1,
    ADVANCED: 2,
    ENHANCED: 3
  };
  complexityScore += levelScores[data.level] || 1;

  if (documents.length > 5) complexityScore += 2;
  else if (documents.length > 3) complexityScore += 1;

  const poorQualityDocs = documents.filter(doc => 
    doc.metadata?.quality === 'poor' || doc.metadata?.needsManualReview
  );
  complexityScore += poorQualityDocs.length;

  const complexDocTypes = ['BANK_STATEMENT', 'UTILITY_BILL', 'TAX_RETURN'];
  const hasComplexDocs = documents.some(doc => 
    complexDocTypes.includes(doc.documentType)
  );
  if (hasComplexDocs) complexityScore += 1;

  if (complexityScore <= 2) return 'simple';
  if (complexityScore <= 4) return 'moderate';
  return 'complex';
}

/**
 * Main workflow that orchestrates the hybrid verification process
 */
class HybridVerificationWorkflowImpl implements WorkflowBase<HybridWorkflowData> {
  id: string = 'reactory-kyc.HybridVerificationWorkflow@1.0.0';
  version: string = '1.0.0';

  public build(builder: any) {
    builder
      .startWith(InitializeVerification)
        .input((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          step.data = data;
        })
        .output((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          data = step.data;
        })
      .then(AssessComplexity)
        .input((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          step.data = data;
        })
        .output((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          data = step.data;
        })
      .then(RouteVerification)
        .input((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          step.data = data;
        })
        .output((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          data = step.data;
        })
      .then(AutomatedCheck)
        .input((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          step.data = data;
        })
        .output((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          data = step.data;
        })
      .then(Complete)
        .input((step: HybridWorkflowStep, data: HybridWorkflowData) => {
          step.data = data;
        });
  }
}

export const HybridVerificationWorkflow: Reactory.Workflow.IWorkflow = {
  id: 'reactory-kyc.HybridVerificationWorkflow@1.0.0',
  nameSpace: 'reactory-kyc',
  name: 'HybridVerificationWorkflow',
  component: HybridVerificationWorkflowImpl,
  category: 'workflow',
  autoStart: false,
  version: '1.0.0',
} as Reactory.Workflow.IWorkflow;

export default HybridVerificationWorkflow;
