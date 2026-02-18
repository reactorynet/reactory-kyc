import Reactory from '@reactorynet/reactory-core';
import logger from '@reactory/server-core/logging';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import {
  IProviderConfig,
  IProviderCheckRequest,
  IProviderCheckResponse,  
  IProviderWebhookPayload
} from '../types/provider.types';

/**
 * Base Provider Abstract Class
 * 
 * Abstract base class for all KYC verification providers.
 * Provides common functionality and enforces implementation of required methods.
 */
export abstract class BaseProvider {
  protected providerId: string;
  protected config: IProviderConfig;
  protected httpClient: AxiosInstance;
  protected context: Reactory.Server.IReactoryContext;

  constructor(providerId: string, config: IProviderConfig, context: Reactory.Server.IReactoryContext) {
    this.providerId = providerId;
    this.config = config;
    this.context = context;

    // Validate configuration
    this.validateConfig(config);

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: config.apiUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Reactory-KYC/1.0.0',
        ...this.getAuthHeaders()
      }
    });

    // Add request/response interceptors
    this.setupInterceptors();
  }

  /**
   * Validate provider configuration
   */
  protected validateConfig(config: IProviderConfig): void {
    if (!config.apiUrl) {
      throw new Error(`[${this.providerId}] API URL is required`);
    }

    if (!config.apiKey) {
      throw new Error(`[${this.providerId}] API Key is required`);
    }

    logger.info(`[${this.providerId}] Configuration validated successfully`);
  }

  /**
   * Get authentication headers for API requests
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Setup HTTP client interceptors
   */
  protected setupInterceptors(): void {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        logger.debug(`[${this.providerId}] Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error(`[${this.providerId}] Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug(`[${this.providerId}] Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        logger.error(`[${this.providerId}] Response error:`, error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a verification check with the provider
   */
  abstract createCheck(request: IProviderCheckRequest): Promise<IProviderCheckResponse>;

  /**
   * Get the status of a verification check
   */
  abstract getCheckStatus(checkId: string): Promise<IProviderCheckResponse>;

  /**
   * Get the result of a completed verification check
   */
  abstract getCheckResult(checkId: string): Promise<any>;

  /**
   * Download the verification report
   */
  abstract downloadReport(checkId: string): Promise<Buffer | string>;

  /**
   * Handle incoming webhook from provider
   */
  abstract handleWebhook(payload: IProviderWebhookPayload): Promise<any>;

  /**
   * Verify webhook signature
   */
  protected verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const computedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );
    } catch (error) {
      logger.error(`[${this.providerId}] Webhook signature verification failed:`, error);
      return false;
    }
  }

  /**
   * Build request data for provider API
   */
  protected buildRequest(data: any): any {
    // Override in subclasses for provider-specific formatting
    return data;
  }

  /**
   * Parse response from provider API
   */
  protected parseResponse(response: any): any {
    // Override in subclasses for provider-specific parsing
    return response;
  }

  /**
   * Handle rate limiting
   */
  protected async handleRateLimit(retryAfter?: number): Promise<void> {
    const delay = retryAfter || 5000; // Default 5 seconds
    logger.warn(`[${this.providerId}] Rate limited, retrying after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Retry request with exponential backoff
   */
  protected async retryRequest<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on 4xx errors (except 429)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          throw error;
        }

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          await this.handleRateLimit(retryAfter ? parseInt(retryAfter) * 1000 : undefined);
          continue;
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`[${this.providerId}] Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Log provider request
   */
  protected async logProviderRequest(
    action: string,
    request: any,
    response?: any,
    error?: any
  ): Promise<void> {
    const auditService = this.context.getService('reactory-kyc.KYCAuditService@1.0.0');
    
    if (auditService) {
      await auditService.logProviderRequest({
        providerId: this.providerId,
        verificationId: request.verificationId || 'unknown',
        request: this.sanitizeData(request),
        response: response ? this.sanitizeData(response) : undefined,
        outcome: error ? 'failure' : 'success',
        error: error?.message
      });
    }
  }

  /**
   * Sanitize sensitive data from logs
   */
  protected sanitizeData(data: any): any {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data));
    const sensitiveFields = ['apiKey', 'api_key', 'token', 'secret', 'password', 'authorization'];

    const sanitize = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;

      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(sanitized);
    return sanitized;
  }

  /**
   * Get provider ID
   */
  getProviderId(): string {
    return this.providerId;
  }

  /**
   * Get provider configuration
   */
  getConfig(): IProviderConfig {
    return this.config;
  }

  /**
   * Check if provider is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Override in subclasses for provider-specific health check
      const response = await this.httpClient.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error(`[${this.providerId}] Health check failed:`, error);
      return false;
    }
  }
}

export default BaseProvider;

