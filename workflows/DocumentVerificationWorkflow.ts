import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';
import { IWorkflowContext, IWorkflowStepResult } from '../types/workflow.types';

/**
 * Document Verification Workflow
 * 
 * Specialized workflow for verifying individual documents.
 * Performs quality checks, OCR extraction, validation, and fraud detection.
 */

interface IDocumentWorkflowContext extends IWorkflowContext {
  documentId: string;
  verificationId?: string;
  documentType: string;
  extractedData?: any;
  qualityScore?: number;
  validationResult?: 'valid' | 'invalid' | 'needs_review';
  fraudIndicators?: string[];
}

/**
 * Step 1: Initialize Document Verification
 */
async function initializeDocumentCheck(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Initializing document check: ${context.documentId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');
    const document = await documentService.getKYCDocument(context.documentId);

    if (!document) {
      throw new Error('Document not found');
    }

    context.documentType = document.documentType;
    context.verificationId = document.verificationId?.toString();

    return {
      success: true,
      nextStep: 'checkQuality',
      data: {
        documentId: context.documentId,
        documentType: context.documentType
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error initializing:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 2: Check Document Quality
 */
async function checkQuality(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Checking quality for: ${context.documentId}`);

    // Quality checks:
    // - Image resolution
    // - Brightness/contrast
    // - Blur detection
    // - Completeness (all edges visible)
    // - Color vs grayscale
    // - File format appropriateness

    const qualityScore = await assessDocumentQuality(context, reactoryContext);
    context.qualityScore = qualityScore;

    logger.info(`[DocumentWorkflow] Quality score: ${qualityScore}`);

    if (qualityScore < 50) {
      // Poor quality - reject immediately
      return {
        success: false,
        nextStep: 'markInvalid',
        data: {
          reason: 'Poor document quality',
          qualityScore
        }
      };
    } else if (qualityScore < 70) {
      // Moderate quality - flag for review
      return {
        success: true,
        nextStep: 'extractData',
        data: {
          qualityScore,
          flagForReview: true
        }
      };
    } else {
      // Good quality - proceed
      return {
        success: true,
        nextStep: 'extractData',
        data: {
          qualityScore,
          flagForReview: false
        }
      };
    }
  } catch (error) {
    logger.error('[DocumentWorkflow] Error checking quality:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 3: Extract Data (OCR)
 */
async function extractData(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Extracting data from: ${context.documentId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');
    
    // Perform OCR/data extraction
    const extractedData = await documentService.extractDocumentData(context.documentId);
    context.extractedData = extractedData;

    logger.info(`[DocumentWorkflow] Extracted data: ${JSON.stringify(extractedData).substring(0, 100)}...`);

    return {
      success: true,
      nextStep: 'validateType',
      data: {
        extractedData,
        fieldsExtracted: Object.keys(extractedData).length
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error extracting data:', error);
    // Non-fatal - can proceed with manual review
    context.extractedData = {};
    return {
      success: true,
      nextStep: 'validateType',
      data: {
        extractionFailed: true,
        error: error.message
      }
    };
  }
}

/**
 * Step 4: Validate Document Type
 */
async function validateType(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Validating type for: ${context.documentId}`);

    const extractedData = context.extractedData || {};
    const documentType = context.documentType;

    // Validate that extracted data matches expected document type
    const typeValidation = await validateDocumentType(documentType, extractedData);

    if (!typeValidation.valid) {
      return {
        success: false,
        nextStep: 'markInvalid',
        data: {
          reason: 'Document type mismatch',
          expected: documentType,
          detected: typeValidation.detectedType
        }
      };
    }

    return {
      success: true,
      nextStep: 'checkExpiry',
      data: {
        typeValidated: true
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error validating type:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'needsReview'
    };
  }
}

/**
 * Step 5: Check Expiry Date
 */
async function checkExpiry(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Checking expiry for: ${context.documentId}`);

    const extractedData = context.extractedData || {};
    const expiryDate = extractedData.expiryDate || extractedData.validUntil;

    if (!expiryDate) {
      // Some documents don't have expiry dates (e.g., birth certificates)
      if (requiresExpiryDate(context.documentType)) {
        return {
          success: false,
          nextStep: 'needsReview',
          data: {
            reason: 'Expiry date not found',
            documentType: context.documentType
          }
        };
      } else {
        return {
          success: true,
          nextStep: 'detectFraud',
          data: { expiryNotRequired: true }
        };
      }
    }

    // Check if document is expired
    const expiryDateObj = new Date(expiryDate);
    const now = new Date();

    if (expiryDateObj < now) {
      return {
        success: false,
        nextStep: 'markInvalid',
        data: {
          reason: 'Document expired',
          expiryDate: expiryDateObj
        }
      };
    }

    // Check if expiring soon (within 30 days)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = expiryDateObj < thirtyDaysFromNow;

    return {
      success: true,
      nextStep: 'detectFraud',
      data: {
        expiryDate: expiryDateObj,
        expiringSoon
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error checking expiry:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'needsReview'
    };
  }
}

/**
 * Step 6: Detect Fraud Indicators
 */
async function detectFraud(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Detecting fraud for: ${context.documentId}`);

    const fraudIndicators: string[] = [];

    // Fraud detection checks:
    // 1. Metadata inconsistencies
    // 2. Font inconsistencies
    // 3. Image manipulation signs
    // 4. Suspicious patterns
    // 5. Known fraud database match

    const indicators = await performFraudDetection(context, reactoryContext);
    fraudIndicators.push(...indicators);

    context.fraudIndicators = fraudIndicators;

    if (fraudIndicators.length > 0) {
      logger.warn(`[DocumentWorkflow] Fraud indicators detected: ${fraudIndicators.join(', ')}`);

      if (fraudIndicators.length >= 3) {
        // High fraud risk - mark invalid
        return {
          success: false,
          nextStep: 'markInvalid',
          data: {
            reason: 'Fraud indicators detected',
            indicators: fraudIndicators
          }
        };
      } else {
        // Some indicators - needs review
        return {
          success: false,
          nextStep: 'needsReview',
          data: {
            reason: 'Possible fraud indicators',
            indicators: fraudIndicators
          }
        };
      }
    }

    return {
      success: true,
      nextStep: 'markValid',
      data: {
        fraudCheckPassed: true
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error detecting fraud:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'needsReview'
    };
  }
}

/**
 * Step 7a: Mark Document Valid
 */
async function markValid(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Marking valid: ${context.documentId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');

    await documentService.validateKYCDocument(context.documentId, {
      status: 'valid',
      notes: 'Document passed automated validation',
      extractedData: context.extractedData,
      qualityScore: context.qualityScore
    });

    context.validationResult = 'valid';

    return {
      success: true,
      nextStep: 'complete',
      data: {
        validationResult: 'valid',
        message: 'Document validated successfully'
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error marking valid:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 7b: Mark Document Invalid
 */
async function markInvalid(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Marking invalid: ${context.documentId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');

    await documentService.validateKYCDocument(context.documentId, {
      status: 'invalid',
      notes: 'Document failed automated validation',
      extractedData: context.extractedData,
      qualityScore: context.qualityScore,
      fraudIndicators: context.fraudIndicators
    });

    context.validationResult = 'invalid';

    return {
      success: true,
      nextStep: 'complete',
      data: {
        validationResult: 'invalid',
        message: 'Document marked as invalid'
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error marking invalid:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 7c: Flag for Manual Review
 */
async function needsReview(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Flagging for review: ${context.documentId}`);

    const documentService = reactoryContext.getService('reactory-kyc.KYCDocumentService@1.0.0');

    await documentService.validateKYCDocument(context.documentId, {
      status: 'pending',
      notes: 'Document requires manual review',
      extractedData: context.extractedData,
      qualityScore: context.qualityScore,
      fraudIndicators: context.fraudIndicators,
      requiresManualReview: true
    });

    context.validationResult = 'needs_review';

    return {
      success: true,
      nextStep: 'complete',
      data: {
        validationResult: 'needs_review',
        message: 'Document flagged for manual review'
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error flagging for review:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Step 8: Complete Document Verification
 */
async function complete(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<IWorkflowStepResult> {
  try {
    logger.info(`[DocumentWorkflow] Completing workflow for: ${context.documentId}`);

    return {
      success: true,
      nextStep: null,
      data: {
        message: 'Document verification completed',
        documentId: context.documentId,
        validationResult: context.validationResult,
        qualityScore: context.qualityScore
      }
    };
  } catch (error) {
    logger.error('[DocumentWorkflow] Error completing:', error);
    return {
      success: false,
      error: error.message,
      nextStep: 'failed'
    };
  }
}

/**
 * Helper: Assess document quality
 */
async function assessDocumentQuality(
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<number> {
  // In a real implementation, this would use image processing libraries
  // to analyze:
  // - Resolution (DPI)
  // - Brightness/contrast
  // - Blur/sharpness
  // - Completeness
  // For now, return a simulated score
  return 85; // 0-100 scale
}

/**
 * Helper: Validate document type matches extracted data
 */
async function validateDocumentType(
  documentType: string,
  extractedData: any
): Promise<{ valid: boolean; detectedType?: string }> {
  // In a real implementation, this would analyze extracted fields
  // to confirm they match the expected document type
  
  const requiredFields: Record<string, string[]> = {
    PASSPORT: ['passportNumber', 'surname', 'givenNames', 'nationality', 'dateOfBirth', 'expiryDate'],
    NATIONAL_ID: ['idNumber', 'surname', 'firstName', 'dateOfBirth'],
    DRIVERS_LICENSE: ['licenseNumber', 'surname', 'firstName', 'dateOfBirth', 'expiryDate'],
    PROOF_OF_ADDRESS: ['address', 'name', 'date'],
    BANK_STATEMENT: ['accountNumber', 'name', 'address', 'statementDate']
  };

  const required = requiredFields[documentType] || [];
  const extractedFields = Object.keys(extractedData);
  
  // Check if at least 50% of required fields are present
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
  context: IDocumentWorkflowContext,
  reactoryContext: Reactory.Server.IReactoryContext
): Promise<string[]> {
  const indicators: string[] = [];

  // In a real implementation, this would perform:
  // 1. Metadata analysis (EXIF data tampering)
  // 2. Font analysis (inconsistent fonts)
  // 3. Edge detection (signs of photoshopping)
  // 4. Pattern matching (known fake documents)
  // 5. Watermark/security feature detection

  const qualityScore = context.qualityScore || 0;
  const extractedData = context.extractedData || {};

  // Simulated checks
  if (qualityScore > 95) {
    // Suspiciously high quality (possible scan of fake)
    indicators.push('unusually_high_quality');
  }

  if (Object.keys(extractedData).length < 3) {
    // Very few fields extracted (possible blank/tampered document)
    indicators.push('insufficient_data_extracted');
  }

  return indicators;
}

/**
 * Workflow Definition
 */
export const DocumentVerificationWorkflow: Reactory.Server.IReactoryWorkflowDefinition = {
  id: 'reactory-kyc.DocumentVerificationWorkflow@1.0.0',
  name: 'Document Verification Workflow',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  description: 'Specialized workflow for verifying individual documents',
  
  // Workflow steps
  steps: {
    initializeDocumentCheck,
    checkQuality,
    extractData,
    validateType,
    checkExpiry,
    detectFraud,
    markValid,
    markInvalid,
    needsReview,
    complete
  },

  // Entry point
  entryStep: 'initializeDocumentCheck',

  // State machine transitions
  transitions: {
    initializeDocumentCheck: ['checkQuality', 'failed'],
    checkQuality: ['extractData', 'markInvalid', 'failed'],
    extractData: ['validateType', 'failed'],
    validateType: ['checkExpiry', 'markInvalid', 'needsReview', 'failed'],
    checkExpiry: ['detectFraud', 'markInvalid', 'needsReview', 'failed'],
    detectFraud: ['markValid', 'markInvalid', 'needsReview', 'failed'],
    markValid: ['complete', 'failed'],
    markInvalid: ['complete', 'failed'],
    needsReview: ['complete', 'failed'],
    complete: [],
    failed: []
  },

  // Workflow metadata
  metadata: {
    category: 'kyc',
    tags: ['document', 'validation', 'ocr', 'fraud-detection'],
    estimatedDuration: '1-5 minutes',
    requiresHumanReview: 'conditional'
  }
};

export default DocumentVerificationWorkflow;

