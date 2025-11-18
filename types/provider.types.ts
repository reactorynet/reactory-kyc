/**
 * KYC Provider Types and Interfaces
 */

import { DocumentType } from './kyc.types';

/**
 * Provider Configuration
 */
export interface IProviderConfig {
  id: string;
  name: string;
  type: 'trulio' | 'onfido' | 'custom';
  enabled: boolean;
  apiKey: string;
  apiUrl: string;
  webhookSecret: string;
  timeout: number;
  capabilities: string[];
  rateLimits?: {
    requestsPerSecond: number;
    requestsPerDay: number;
  };
}

/**
 * Provider Check Request
 */
export interface IProviderCheckRequest {
  applicantData: {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: string;
    address?: {
      street: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
    };
  };
  documents: {
    type: DocumentType;
    fileUrl: string;
    side?: 'front' | 'back';
  }[];
  checkTypes: string[];
  metadata?: Record<string, any>;
}

/**
 * Provider Check Response
 */
export interface IProviderCheckResponse {
  checkId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  result?: 'clear' | 'consider' | 'reject';
  confidence?: number;
  details?: Record<string, any>;
  reports?: IProviderReport[];
  createdAt: string;
  completedAt?: string;
}

/**
 * Provider Report
 */
export interface IProviderReport {
  reportId: string;
  name: string;
  result: string;
  subResults?: {
    name: string;
    result: string;
    details?: any;
  }[];
  breakdown?: Record<string, any>;
  properties?: Record<string, any>;
}

/**
 * Provider Webhook Payload
 */
export interface IProviderWebhookPayload {
  provider: string;
  event: string;
  resourceType: string;
  resourceId: string;
  data: any;
  timestamp: string;
  signature: string;
}

/**
 * Base Provider Interface
 */
export interface IKYCProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly config: IProviderConfig;

  /**
   * Initialize the provider
   */
  initialize(config: IProviderConfig): Promise<void>;

  /**
   * Create a verification check
   */
  createCheck(request: IProviderCheckRequest): Promise<IProviderCheckResponse>;

  /**
   * Get check status
   */
  getCheckStatus(checkId: string): Promise<IProviderCheckResponse>;

  /**
   * Get check result
   */
  getCheckResult(checkId: string): Promise<IProviderCheckResponse>;

  /**
   * Download report
   */
  downloadReport(checkId: string): Promise<Buffer | string>;

  /**
   * Handle webhook
   */
  handleWebhook(payload: IProviderWebhookPayload): Promise<void>;

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string): boolean;
}

