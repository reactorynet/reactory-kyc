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
 * Document Verification Workflow
 * 
 * Specialized workflow for verifying individual documents.
 * Performs quality checks, OCR extraction, validation, and fraud detection.
 */

class DocumentWorkflowData {
  public documentId: string;
  public verificationId?: string;
  public documentType: string;
  public extractedData?: any;
  public qualityScore?: number;
  public validationResult?: 'valid' | 'invalid' | 'needs_review';
  public fraudIndicators?: string[];
}

abstract class DocumentWorkflowStep extends StepBody {
  public context: Reactory.Server.IReactoryContext;
  public data: DocumentWorkflowData;

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
 * Step 1: Initialize Document Verification
 */
class InitializeDocumentCheck extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      await this.initializeServices();
      logger.info(`[DocumentWorkflow] Initializing document check: ${this.data.documentId}`);

      const documentService = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
      const document = await documentService.getKYCDocument(this.data.documentId);

      if (!document) {
        throw new Error('Document not found');
      }

      this.data.documentType = document.documentType;
      this.data.verificationId = document.verificationId?.toString();

      logger.info(`[DocumentWorkflow] Document initialized: ${this.data.documentType}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error initializing:', error);
      throw error;
    }
  }
}

/**
 * Step 2: Check Document Quality
 */
class CheckQuality extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Checking quality for: ${this.data.documentId}`);

      const qualityScore = await assessDocumentQuality(this.data, this.context);
      this.data.qualityScore = qualityScore;

      logger.info(`[DocumentWorkflow] Quality score: ${qualityScore}`);

      if (qualityScore < 50) {
        logger.warn('[DocumentWorkflow] Poor document quality');
      }

      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error checking quality:', error);
      throw error;
    }
  }
}

/**
 * Step 3: Extract Data (OCR)
 */
class ExtractData extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Extracting data from: ${this.data.documentId}`);

      const documentService = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');
      
      const extractedData = await documentService.extractDocumentData(this.data.documentId);
      this.data.extractedData = extractedData;

      logger.info(`[DocumentWorkflow] Extracted ${Object.keys(extractedData).length} fields`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error extracting data:', error);
      this.data.extractedData = {};
      return ExecutionResult.next();
    }
  }
}

/**
 * Step 4: Validate Document Type
 */
class ValidateType extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Validating type for: ${this.data.documentId}`);

      const extractedData = this.data.extractedData || {};
      const documentType = this.data.documentType;

      const typeValidation = await validateDocumentType(documentType, extractedData);

      if (!typeValidation.valid) {
        logger.warn('[DocumentWorkflow] Document type mismatch');
      }

      logger.info('[DocumentWorkflow] Type validated');
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error validating type:', error);
      throw error;
    }
  }
}

/**
 * Step 5: Check Expiry Date
 */
class CheckExpiry extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Checking expiry for: ${this.data.documentId}`);

      const extractedData = this.data.extractedData || {};
      const expiryDate = extractedData.expiryDate || extractedData.validUntil;

      if (!expiryDate) {
        if (requiresExpiryDate(this.data.documentType)) {
          logger.warn('[DocumentWorkflow] Expiry date not found');
        }
      } else {
        const expiryDateObj = new Date(expiryDate);
        const now = new Date();

        if (expiryDateObj < now) {
          logger.warn('[DocumentWorkflow] Document expired');
        }
      }

      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error checking expiry:', error);
      throw error;
    }
  }
}

/**
 * Step 6: Detect Fraud Indicators
 */
class DetectFraud extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Detecting fraud for: ${this.data.documentId}`);

      const indicators = await performFraudDetection(this.data, this.context);
      this.data.fraudIndicators = indicators;

      if (indicators.length > 0) {
        logger.warn(`[DocumentWorkflow] Fraud indicators detected: ${indicators.join(', ')}`);
      }

      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error detecting fraud:', error);
      throw error;
    }
  }
}

/**
 * Step 7: Mark Document Status
 */
class MarkDocumentStatus extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Marking document status: ${this.data.documentId}`);

      const documentService = this.context.getService('reactory-kyc.KYCDocumentService@1.0.0');

      let status: 'valid' | 'invalid' | 'pending';
      
      if (this.data.fraudIndicators && this.data.fraudIndicators.length >= 3) {
        status = 'invalid';
      } else if (this.data.qualityScore && this.data.qualityScore < 50) {
        status = 'invalid';
      } else if (this.data.fraudIndicators && this.data.fraudIndicators.length > 0) {
        status = 'pending';
      } else if (this.data.qualityScore && this.data.qualityScore < 70) {
        status = 'pending';
      } else {
        status = 'valid';
      }

      this.data.validationResult = status === 'pending' ? 'needs_review' : status;

      await documentService.validateKYCDocument(this.data.documentId, {
        status,
        notes: `Document verification workflow completed`,
        extractedData: this.data.extractedData,
        qualityScore: this.data.qualityScore,
        fraudIndicators: this.data.fraudIndicators
      });

      logger.info(`[DocumentWorkflow] Document marked as: ${status}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error marking document status:', error);
      throw error;
    }
  }
}

/**
 * Step 8: Complete Workflow
 */
class Complete extends DocumentWorkflowStep {
  async run(stepContext: StepExecutionContext): Promise<ExecutionResult> {
    try {
      logger.info(`[DocumentWorkflow] Completing workflow for: ${this.data.documentId}`);
      return ExecutionResult.next();
    } catch (error) {
      logger.error('[DocumentWorkflow] Error completing workflow:', error);
      throw error;
    }
  }
}

/**
 * Helper: Assess document quality
 */
async function assessDocumentQuality(
  data: DocumentWorkflowData,
  context: Reactory.Server.IReactoryContext
): Promise<number> {
  // In a real implementation, this would use image processing libraries
  return 85; // 0-100 scale
}

/**
 * Helper: Validate document type matches extracted data
 */
async function validateDocumentType(
  documentType: string,
  extractedData: any
): Promise<{ valid: boolean; detectedType?: string }> {
  const requiredFields: Record<string, string[]> = {
    PASSPORT: ['passportNumber', 'surname', 'givenNames', 'nationality', 'dateOfBirth', 'expiryDate'],
    NATIONAL_ID: ['idNumber', 'surname', 'firstName', 'dateOfBirth'],
    DRIVERS_LICENSE: ['licenseNumber', 'surname', 'firstName', 'dateOfBirth', 'expiryDate'],
    PROOF_OF_ADDRESS: ['address', 'name', 'date'],
    BANK_STATEMENT: ['accountNumber', 'name', 'address', 'statementDate']
  };

  const required = requiredFields[documentType] || [];
  const extractedFields = Object.keys(extractedData);
  
  const matchCount = required.filter(field => extractedFields.includes(field)).length;
  const matchPercentage = required.length > 0 ? (matchCount / required.length) * 100 : 100;

  return {
    valid: matchPercentage >= 50,
    detectedType: documentType
  };
}

/**
 * Helper: Check if document type requires expiry date
 */
function requiresExpiryDate(documentType: string): boolean {
  const expiryRequired = [
    'PASSPORT',
    'NATIONAL_ID',
    'DRIVERS_LICENSE',
    'RESIDENCE_PERMIT',
    'VISA'
  ];
  return expiryRequired.includes(documentType);
}

/**
 * Helper: Perform fraud detection
 */
async function performFraudDetection(
  data: DocumentWorkflowData,
  context: Reactory.Server.IReactoryContext
): Promise<string[]> {
  const indicators: string[] = [];

  const qualityScore = data.qualityScore || 0;
  const extractedData = data.extractedData || {};

  if (qualityScore > 95) {
    indicators.push('unusually_high_quality');
  }

  if (Object.keys(extractedData).length < 3) {
    indicators.push('insufficient_data_extracted');
  }

  return indicators;
}

/**
 * Main workflow that orchestrates the document verification process
 */
class DocumentVerificationWorkflowImpl implements WorkflowBase<DocumentWorkflowData> {
  id: string = 'reactory-kyc.DocumentVerificationWorkflow@1.0.0';
  version: string = '1.0.0';

  public build(builder: any) {
    builder
      .startWith(InitializeDocumentCheck)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(CheckQuality)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(ExtractData)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(ValidateType)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(CheckExpiry)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(DetectFraud)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(MarkDocumentStatus)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        })
        .output((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          data = step.data;
        })
      .then(Complete)
        .input((step: DocumentWorkflowStep, data: DocumentWorkflowData) => {
          step.data = data;
        });
  }
}

export const DocumentVerificationWorkflow: Reactory.Workflow.IWorkflow = {
  id: 'reactory-kyc.DocumentVerificationWorkflow@1.0.0',
  nameSpace: 'reactory-kyc',
  name: 'DocumentVerificationWorkflow',
  component: DocumentVerificationWorkflowImpl,
  category: 'workflow',
  autoStart: false,
  version: '1.0.0',
} as Reactory.Workflow.IWorkflow;

export default DocumentVerificationWorkflow;
