import Reactory from '@reactory/reactory-core';
import { BaseProvider } from './BaseProvider';
import {
  IProviderConfig,
  IProviderCheckRequest,
  IProviderCheckResponse,
  IProviderCheckStatus,
  IProviderWebhookPayload
} from '../types/provider.types';
import { verifyTrulioSignature } from './utils';
import logger from '@reactory/server-core/logging';
import ApiError from '@reactory/server-core/exceptions';

/**
 * Trulio Provider
 * 
 * Integration with Trulio KYC verification service
 * Supports identity verification, document verification, and liveness checks
 */
export class TrulioProvider extends BaseProvider {
  constructor(config: IProviderConfig, context: Reactory.Server.IReactoryContext) {
    super('trulio', config, context);
  }

  /**
   * Get authentication headers for Trulio API
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Trulio-Version': '2024-01-01'
    };
  }

  /**
   * Create a verification check with Trulio
   */
  async createCheck(request: IProviderCheckRequest): Promise<IProviderCheckResponse> {
    const startTime = Date.now();

    try {
      logger.info(`[Trulio] Creating verification check for user ${request.userId}`);

      // Build Trulio-specific request
      const trulioRequest = this.buildTrulioRequest(request);

      // Make API request with retry logic
      const response = await this.retryRequest(async () => {
        return await this.httpClient.post('/v1/checks', trulioRequest);
      });

      const result = this.parseTrulioResponse(response.data);

      // Log provider request
      await this.logProviderRequest('createCheck', request, result);

      logger.info(`[Trulio] Check created successfully: ${result.checkId}`);

      return result;
    } catch (error: any) {
      logger.error('[Trulio] Error creating check:', error);
      await this.logProviderRequest('createCheck', request, undefined, error);
      
      throw new ApiError(
        `Trulio verification check failed: ${error.response?.data?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Get the status of a verification check
   */
  async getCheckStatus(checkId: string): Promise<IProviderCheckStatus> {
    try {
      logger.debug(`[Trulio] Getting check status: ${checkId}`);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/v1/checks/${checkId}/status`);
      });

      const status: IProviderCheckStatus = {
        checkId,
        status: this.mapTrulioStatus(response.data.status),
        completedAt: response.data.completed_at ? new Date(response.data.completed_at) : undefined,
        result: response.data.result
      };

      return status;
    } catch (error: any) {
      logger.error(`[Trulio] Error getting check status for ${checkId}:`, error);
      throw new ApiError(
        `Failed to get Trulio check status: ${error.response?.data?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Get the result of a completed verification check
   */
  async getCheckResult(checkId: string): Promise<any> {
    try {
      logger.debug(`[Trulio] Getting check result: ${checkId}`);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/v1/checks/${checkId}/result`);
      });

      return {
        checkId,
        outcome: response.data.outcome, // 'approved', 'rejected', 'review'
        confidence: response.data.confidence_score,
        breakdown: {
          identity: response.data.identity_verification,
          document: response.data.document_verification,
          liveness: response.data.liveness_verification,
          fraud: response.data.fraud_checks
        },
        flags: response.data.flags || [],
        metadata: response.data.metadata
      };
    } catch (error: any) {
      logger.error(`[Trulio] Error getting check result for ${checkId}:`, error);
      throw new ApiError(
        `Failed to get Trulio check result: ${error.response?.data?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Download the verification report
   */
  async downloadReport(checkId: string): Promise<Buffer> {
    try {
      logger.debug(`[Trulio] Downloading report: ${checkId}`);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/v1/checks/${checkId}/report`, {
          responseType: 'arraybuffer'
        });
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error(`[Trulio] Error downloading report for ${checkId}:`, error);
      throw new ApiError(
        `Failed to download Trulio report: ${error.response?.data?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Handle incoming webhook from Trulio
   */
  async handleWebhook(payload: IProviderWebhookPayload): Promise<any> {
    try {
      logger.info('[Trulio] Processing webhook');

      // Verify webhook signature
      if (!this.config.webhookSecret) {
        throw new ApiError('Webhook secret not configured for Trulio');
      }

      const signature = payload.headers['x-trulio-signature'] || payload.headers['X-Trulio-Signature'];
      
      if (!signature) {
        throw new ApiError('Missing webhook signature');
      }

      const isValid = verifyTrulioSignature(
        JSON.stringify(payload.body),
        signature,
        this.config.webhookSecret
      );

      if (!isValid) {
        throw new ApiError('Invalid webhook signature');
      }

      // Process webhook event
      const event = payload.body;
      
      logger.info(`[Trulio] Webhook event: ${event.type} for check ${event.check_id}`);

      return {
        checkId: event.check_id,
        eventType: event.type,
        status: this.mapTrulioStatus(event.status),
        data: event.data,
        timestamp: event.timestamp
      };
    } catch (error: any) {
      logger.error('[Trulio] Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Build Trulio-specific request format
   */
  private buildTrulioRequest(request: IProviderCheckRequest): any {
    return {
      applicant: {
        first_name: request.applicantData.firstName,
        last_name: request.applicantData.lastName,
        email: request.applicantData.email,
        phone: request.applicantData.phone,
        date_of_birth: request.applicantData.dateOfBirth,
        address: request.applicantData.address ? {
          street: request.applicantData.address.street,
          city: request.applicantData.address.city,
          state: request.applicantData.address.state,
          postal_code: request.applicantData.address.postalCode,
          country: request.applicantData.address.country
        } : undefined
      },
      documents: request.documents?.map(doc => ({
        type: this.mapDocumentType(doc.type),
        file_id: doc.fileId,
        country: doc.country,
        number: doc.number
      })),
      checks: {
        identity: request.checks?.identity !== false,
        document: request.checks?.document !== false,
        liveness: request.checks?.liveness === true,
        fraud: request.checks?.fraud !== false
      },
      verification_level: request.verificationLevel || 'standard',
      callback_url: request.callbackUrl,
      metadata: {
        verification_id: request.verificationId,
        user_id: request.userId,
        ...request.metadata
      }
    };
  }

  /**
   * Parse Trulio response to standard format
   */
  private parseTrulioResponse(response: any): IProviderCheckResponse {
    return {
      providerId: 'trulio',
      checkId: response.check_id,
      status: this.mapTrulioStatus(response.status),
      createdAt: new Date(response.created_at),
      expiresAt: response.expires_at ? new Date(response.expires_at) : undefined,
      webhookUrl: response.webhook_url,
      metadata: response.metadata
    };
  }

  /**
   * Map Trulio status to standard status
   */
  private mapTrulioStatus(trulioStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'pending',
      'processing': 'processing',
      'completed': 'completed',
      'approved': 'approved',
      'rejected': 'rejected',
      'review': 'review_required',
      'error': 'error',
      'expired': 'expired'
    };

    return statusMap[trulioStatus] || 'unknown';
  }

  /**
   * Map document type to Trulio format
   */
  private mapDocumentType(type: string): string {
    const typeMap: Record<string, string> = {
      'PASSPORT': 'passport',
      'NATIONAL_ID': 'national_id',
      'DRIVERS_LICENSE': 'driving_license',
      'PROOF_OF_ADDRESS': 'proof_of_address',
      'SELFIE': 'selfie',
      'LIVENESS_VIDEO': 'liveness_video'
    };

    return typeMap[type] || type.toLowerCase();
  }

  /**
   * Trulio-specific health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/v1/health', { timeout: 5000 });
      return response.status === 200 && response.data.status === 'operational';
    } catch (error) {
      logger.error('[Trulio] Health check failed:', error);
      return false;
    }
  }
}

export default TrulioProvider;

