import Reactory from '@reactorynet/reactory-core';
import { BaseProvider } from './BaseProvider';
import {
  IProviderConfig,
  IProviderCheckRequest,
  IProviderCheckResponse,
  IProviderCheckStatus,
  IProviderWebhookPayload
} from '../types/provider.types';
import { verifyOnfidoSignature } from './utils';
import logger from '@reactory/server-core/logging';
import ApiError from '@reactory/server-core/exceptions';

/**
 * Onfido Provider
 * 
 * Integration with Onfido identity verification service
 * Supports applicant creation, document upload, and automated verification
 */
export class OnfidoProvider extends BaseProvider {
  constructor(config: IProviderConfig, context: Reactory.Server.IReactoryContext) {
    super('onfido', config, context);
  }

  /**
   * Get authentication headers for Onfido API
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Token token=${this.config.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create an applicant in Onfido
   */
  async createApplicant(applicantData: any): Promise<string> {
    try {
      logger.info(`[Onfido] Creating applicant: ${applicantData.email}`);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.post('/v3/applicants', {
          first_name: applicantData.firstName,
          last_name: applicantData.lastName,
          email: applicantData.email,
          dob: applicantData.dateOfBirth,
          address: applicantData.address ? {
            flat_number: applicantData.address.flat,
            building_number: applicantData.address.building,
            building_name: applicantData.address.buildingName,
            street: applicantData.address.street,
            sub_street: applicantData.address.subStreet,
            town: applicantData.address.city,
            state: applicantData.address.state,
            postcode: applicantData.address.postalCode,
            country: applicantData.address.country
          } : undefined
        });
      });

      const applicantId = response.data.id;
      logger.info(`[Onfido] Applicant created: ${applicantId}`);

      return applicantId;
    } catch (error: any) {
      logger.error('[Onfido] Error creating applicant:', error);
      throw new ApiError(
        `Failed to create Onfido applicant: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Upload a document for an applicant
   */
  async uploadDocument(applicantId: string, document: any): Promise<string> {
    try {
      logger.info(`[Onfido] Uploading document for applicant: ${applicantId}`);

      // Create FormData for document upload
      const formData = new FormData();
      formData.append('file', document.file);
      formData.append('type', this.mapDocumentType(document.type));
      
      if (document.side) {
        formData.append('side', document.side); // 'front' or 'back'
      }

      const response = await this.retryRequest(async () => {
        return await this.httpClient.post(`/v3/applicants/${applicantId}/documents`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      });

      const documentId = response.data.id;
      logger.info(`[Onfido] Document uploaded: ${documentId}`);

      return documentId;
    } catch (error: any) {
      logger.error('[Onfido] Error uploading document:', error);
      throw new ApiError(
        `Failed to upload document to Onfido: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Create a verification check with Onfido
   */
  async createCheck(request: IProviderCheckRequest): Promise<IProviderCheckResponse> {
    try {
      logger.info(`[Onfido] Creating verification check for user ${request.userId}`);

      // Step 1: Create applicant
      const applicantId = await this.createApplicant(request.applicantData);

      // Step 2: Upload documents (if provided)
      if (request.documents && request.documents.length > 0) {
        for (const doc of request.documents) {
          await this.uploadDocument(applicantId, doc);
        }
      }

      // Step 3: Create check
      const checkRequest = this.buildOnfidoCheckRequest(request, applicantId);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.post(`/v3/applicants/${applicantId}/checks`, checkRequest);
      });

      const result = this.parseOnfidoResponse(response.data, applicantId);

      // Log provider request
      await this.logProviderRequest('createCheck', request, result);

      logger.info(`[Onfido] Check created successfully: ${result.checkId}`);

      return result;
    } catch (error: any) {
      logger.error('[Onfido] Error creating check:', error);
      await this.logProviderRequest('createCheck', request, undefined, error);
      
      throw new ApiError(
        `Onfido verification check failed: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Get the status of a verification check
   */
  async getCheckStatus(checkId: string): Promise<IProviderCheckStatus> {
    try {
      logger.debug(`[Onfido] Getting check status: ${checkId}`);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/v3/checks/${checkId}`);
      });

      const status: IProviderCheckStatus = {
        checkId,
        status: this.mapOnfidoStatus(response.data.status),
        completedAt: response.data.completed_at_iso8601 ? new Date(response.data.completed_at_iso8601) : undefined,
        result: response.data.result
      };

      return status;
    } catch (error: any) {
      logger.error(`[Onfido] Error getting check status for ${checkId}:`, error);
      throw new ApiError(
        `Failed to get Onfido check status: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Get the result of a completed verification check
   */
  async getCheckResult(checkId: string): Promise<any> {
    try {
      logger.debug(`[Onfido] Getting check result: ${checkId}`);

      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/v3/checks/${checkId}`);
      });

      const check = response.data;

      // Get detailed report breakdown
      const reports = check.reports || [];

      return {
        checkId,
        outcome: check.result, // 'clear', 'consider', 'unidentified'
        status: this.mapOnfidoStatus(check.status),
        breakdown: {
          document: reports.find((r: any) => r.name === 'document'),
          facial_similarity: reports.find((r: any) => r.name === 'facial_similarity_photo'),
          identity: reports.find((r: any) => r.name === 'identity_enhanced'),
          watchlist: reports.find((r: any) => r.name === 'watchlist_enhanced')
        },
        reports,
        metadata: {
          applicantId: check.applicant_id,
          href: check.href
        }
      };
    } catch (error: any) {
      logger.error(`[Onfido] Error getting check result for ${checkId}:`, error);
      throw new ApiError(
        `Failed to get Onfido check result: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Download the verification report
   */
  async downloadReport(checkId: string): Promise<Buffer> {
    try {
      logger.debug(`[Onfido] Downloading report: ${checkId}`);

      // Onfido doesn't have a single report endpoint, but we can get the PDF
      const response = await this.retryRequest(async () => {
        return await this.httpClient.get(`/v3/checks/${checkId}/download`, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'application/pdf'
          }
        });
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      logger.error(`[Onfido] Error downloading report for ${checkId}:`, error);
      throw new ApiError(
        `Failed to download Onfido report: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  /**
   * Handle incoming webhook from Onfido
   */
  async handleWebhook(payload: IProviderWebhookPayload): Promise<any> {
    try {
      logger.info('[Onfido] Processing webhook');

      // Verify webhook signature
      if (!this.config.webhookSecret) {
        throw new ApiError('Webhook secret not configured for Onfido');
      }

      const signature = payload.headers['x-sha2-signature'] || payload.headers['X-SHA2-Signature'];
      
      if (!signature) {
        throw new ApiError('Missing webhook signature');
      }

      const isValid = verifyOnfidoSignature(
        JSON.stringify(payload.body),
        signature,
        this.config.webhookSecret
      );

      if (!isValid) {
        throw new ApiError('Invalid webhook signature');
      }

      // Process webhook event
      const event = payload.body;
      
      logger.info(`[Onfido] Webhook event: ${event.action} for resource ${event.resource_type}:${event.object.id}`);

      return {
        eventType: event.action, // 'check.completed', 'check.started', etc.
        resourceType: event.resource_type,
        resourceId: event.object.id,
        status: event.object.status,
        result: event.object.result,
        data: event.object,
        timestamp: event.completed_at_iso8601
      };
    } catch (error: any) {
      logger.error('[Onfido] Error processing webhook:', error);
      throw error;
    }
  }

  /**
   * Build Onfido-specific check request
   */
  private buildOnfidoCheckRequest(request: IProviderCheckRequest, applicantId: string): any {
    // Determine report names based on requested checks
    const reportNames = [];

    if (request.checks?.document !== false) {
      reportNames.push('document');
    }

    if (request.checks?.identity !== false) {
      reportNames.push('identity_enhanced');
    }

    if (request.checks?.liveness === true) {
      reportNames.push('facial_similarity_photo');
    }

    if (request.checks?.fraud !== false) {
      reportNames.push('watchlist_enhanced');
    }

    return {
      applicant_id: applicantId,
      report_names: reportNames,
      applicant_provides_data: false,
      asynchronous: true,
      suppress_form_emails: true,
      webhook_ids: request.webhookId ? [request.webhookId] : undefined,
      consider: request.considerOptions || []
    };
  }

  /**
   * Parse Onfido response to standard format
   */
  private parseOnfidoResponse(response: any, applicantId: string): IProviderCheckResponse {
    return {
      providerId: 'onfido',
      checkId: response.id,
      status: this.mapOnfidoStatus(response.status),
      createdAt: new Date(response.created_at),
      expiresAt: undefined, // Onfido checks don't expire
      webhookUrl: response.webhook_url,
      metadata: {
        applicantId,
        href: response.href
      }
    };
  }

  /**
   * Map Onfido status to standard status
   */
  private mapOnfidoStatus(onfidoStatus: string): string {
    const statusMap: Record<string, string> = {
      'in_progress': 'processing',
      'awaiting_applicant': 'pending',
      'complete': 'completed',
      'withdrawn': 'cancelled',
      'paused': 'paused',
      'reopened': 'processing'
    };

    return statusMap[onfidoStatus] || onfidoStatus;
  }

  /**
   * Map document type to Onfido format
   */
  private mapDocumentType(type: string): string {
    const typeMap: Record<string, string> = {
      'PASSPORT': 'passport',
      'NATIONAL_ID': 'national_identity_card',
      'DRIVERS_LICENSE': 'driving_licence',
      'RESIDENCE_PERMIT': 'residence_permit',
      'SELFIE': 'selfie',
      'LIVENESS_VIDEO': 'live_video'
    };

    return typeMap[type] || type.toLowerCase();
  }

  /**
   * Onfido-specific health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Onfido doesn't have a health endpoint, so we'll try to get SDK token
      const response = await this.httpClient.post('/v3/sdk_token', {
        applicant_id: 'health-check',
        referrer: '*://localhost/*'
      });
      
      // If we get a 422 (validation error), service is up but request is invalid (expected)
      return response.status === 201 || response.status === 422;
    } catch (error: any) {
      // Service is up if we get 422 (validation error)
      if (error.response?.status === 422) {
        return true;
      }
      
      logger.error('[Onfido] Health check failed:', error);
      return false;
    }
  }
}

export default OnfidoProvider;

