/**
 * KYC Core Types and Interfaces
 */

/**
 * KYC Verification Level
 */
export enum VerificationLevel {
  BASIC = 'BASIC',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  ENHANCED = 'ENHANCED'
}

/**
 * KYC Verification Status
 */
export enum VerificationStatus {
  INITIATED = 'INITIATED',
  PENDING_DOCUMENTS = 'PENDING_DOCUMENTS',
  SUBMITTED = 'SUBMITTED',
  VALIDATING = 'VALIDATING',
  PROCESSING = 'PROCESSING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  AUTO_APPROVED = 'AUTO_APPROVED',
  MANUALLY_APPROVED = 'MANUALLY_APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
  ADDITIONAL_INFO_REQUIRED = 'ADDITIONAL_INFO_REQUIRED',
  RETRY_PENDING = 'RETRY_PENDING',
  COMPLETED = 'COMPLETED',
  TERMINATED = 'TERMINATED'
}

/**
 * Document Types
 */
export enum DocumentType {
  PASSPORT = 'PASSPORT',
  NATIONAL_ID = 'NATIONAL_ID',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  BANK_STATEMENT = 'BANK_STATEMENT',
  UTILITY_BILL = 'UTILITY_BILL',
  SELFIE = 'SELFIE',
  LIVENESS_VIDEO = 'LIVENESS_VIDEO'
}

/**
 * Risk Level
 */
export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Workflow Type
 */
export enum WorkflowType {
  MANUAL = 'MANUAL',
  AUTOMATED = 'AUTOMATED',
  HYBRID = 'HYBRID'
}

/**
 * KYC Verification Interface
 */
export interface IKYCVerification {
  id: string;
  userId: string;
  organizationId: string;
  level: VerificationLevel;
  status: VerificationStatus;
  workflowType: WorkflowType;
  providerId?: string;
  providerCheckId?: string;
  providerResponse?: any;
  reviewerId?: string;
  documents: string[]; // Document IDs
  riskScoreId?: string;
  initiatedAt: Date;
  completedAt?: Date;
  completedBy?: string;
  rejectionReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * KYC Document Interface
 */
export interface IKYCDocument {
  id: string;
  verificationId: string;
  documentType: DocumentType;
  documentNumber?: string;
  issuingCountry?: string;
  issueDate?: Date;
  expiryDate?: Date;
  fileId: string; // Reference to ReactoryFile
  fileUrl?: string;
  encryptedFileUrl?: string;
  fileHash: string;
  extractedData?: Record<string, any>;
  validationStatus: 'pending' | 'valid' | 'invalid' | 'expired';
  uploadedAt: Date;
  validatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Risk Score Interface
 */
export interface IKYCRiskScore {
  id: string;
  verificationId: string;
  totalScore: number;
  scoreBreakdown: Record<string, number>;
  riskLevel: RiskLevel;
  riskFactors: IRiskFactor[];
  assessmentMethod: string;
  calculatedAt: Date;
  updatedAt: Date;
}

/**
 * Risk Factor Interface
 */
export interface IRiskFactor {
  factor: string;
  score: number;
  weight: number;
  description?: string;
}

/**
 * Verification Level Configuration
 */
export interface IVerificationLevelConfig {
  level: VerificationLevel;
  requiredDocuments: DocumentType[];
  optionalDocuments?: DocumentType[];
  requiresLiveness: boolean;
  requiresManualReview: boolean;
  riskThreshold: number;
  validityPeriodDays: number;
}

/**
 * KYC Service Configuration
 */
export interface IKYCServiceConfig {
  enabledWorkflows: WorkflowType[];
  defaultWorkflow: WorkflowType;
  verificationLevels: Record<VerificationLevel, IVerificationLevelConfig>;
  riskAssessment: {
    enabled: boolean;
    autoApproveThreshold: number;
    manualReviewThreshold: number;
    rejectThreshold: number;
  };
  documentRetention: {
    days: number;
    archiveAfterDays: number;
  };
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

