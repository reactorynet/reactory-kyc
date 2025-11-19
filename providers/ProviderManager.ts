import Reactory from '@reactory/reactory-core';
import logger from '@reactory/server-core/logging';
import { BaseProvider } from './BaseProvider';
import { KYCProvider, IKYCProviderDocument } from '../models/KYCProvider';
import {
  IProviderCheckRequest,
  IProviderCheckResponse,
  IProviderCheckStatus,
  IProviderWebhookPayload
} from '../types/provider.types';
import ApiError from '@reactory/server-core/exceptions';

/**
 * Provider Manager
 * 
 * Manages multiple KYC verification providers and routes requests
 * to the appropriate provider based on configuration and availability.
 */
export class ProviderManager {
  private providers: Map<string, BaseProvider> = new Map();
  private context: Reactory.Server.IReactoryContext;

  constructor(context: Reactory.Server.IReactoryContext) {
    this.context = context;
  }

  /**
   * Register a provider
   */
  registerProvider(provider: BaseProvider): void {
    const providerId = provider.getProviderId();
    
    if (this.providers.has(providerId)) {
      logger.warn(`Provider ${providerId} is already registered, overwriting...`);
    }

    this.providers.set(providerId, provider);
    logger.info(`Provider ${providerId} registered successfully`);
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    if (this.providers.has(providerId)) {
      this.providers.delete(providerId);
      logger.info(`Provider ${providerId} unregistered successfully`);
    }
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): BaseProvider {
    const provider = this.providers.get(providerId);
    
    if (!provider) {
      throw new ApiError(`Provider ${providerId} not found or not registered`);
    }

    return provider;
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get available providers
   */
  async getAvailableProviders(): Promise<IKYCProviderDocument[]> {
    return await KYCProvider.findEnabled();
  }

  /**
   * Select best provider for a request
   */
  async selectBestProvider(capability?: string): Promise<BaseProvider> {
    // Get best provider from database based on performance metrics
    const providerModel = await KYCProvider.findBestProvider(capability);

    if (!providerModel) {
      throw new ApiError('No available providers found');
    }

    // Get registered provider instance
    const provider = this.providers.get(providerModel.name);

    if (!provider) {
      throw new ApiError(`Provider ${providerModel.name} not registered`);
    }

    return provider;
  }

  /**
   * Execute a verification check
   */
  async executeCheck(
    providerId: string,
    request: IProviderCheckRequest
  ): Promise<IProviderCheckResponse> {
    const startTime = Date.now();
    let success = false;
    let response: IProviderCheckResponse | undefined;
    let error: any;

    try {
      const provider = this.getProvider(providerId);
      response = await provider.createCheck(request);
      success = true;

      // Update provider statistics
      await this.updateProviderStatistics(providerId, true, Date.now() - startTime);

      return response;
    } catch (err) {
      error = err;
      success = false;

      // Update provider statistics
      await this.updateProviderStatistics(providerId, false, Date.now() - startTime);

      throw err;
    }
  }

  /**
   * Get check status from provider
   */
  async getCheckStatus(providerId: string, checkId: string): Promise<IProviderCheckStatus> {
    const provider = this.getProvider(providerId);
    return await provider.getCheckStatus(checkId);
  }

  /**
   * Get check result from provider
   */
  async getCheckResult(providerId: string, checkId: string): Promise<any> {
    const provider = this.getProvider(providerId);
    return await provider.getCheckResult(checkId);
  }

  /**
   * Download report from provider
   */
  async downloadReport(providerId: string, checkId: string): Promise<Buffer | string> {
    const provider = this.getProvider(providerId);
    return await provider.downloadReport(checkId);
  }

  /**
   * Process webhook from provider
   */
  async processWebhook(
    providerId: string,
    payload: IProviderWebhookPayload
  ): Promise<any> {
    try {
      const provider = this.getProvider(providerId);
      const result = await provider.handleWebhook(payload);

      logger.info(`Webhook processed successfully for provider ${providerId}`);

      return result;
    } catch (error) {
      logger.error(`Error processing webhook for provider ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Update provider statistics
   */
  private async updateProviderStatistics(
    providerId: string,
    success: boolean,
    responseTime: number
  ): Promise<void> {
    try {
      const provider = await KYCProvider.findOne({ name: providerId });

      if (provider) {
        provider.incrementRequests(success, responseTime);
        await provider.save();

        logger.debug(
          `Provider ${providerId} statistics updated: ` +
          `${provider.successfulRequests}/${provider.totalRequests} successful, ` +
          `avg response time: ${provider.averageResponseTime?.toFixed(0)}ms`
        );
      }
    } catch (error) {
      logger.error(`Error updating provider statistics for ${providerId}:`, error);
      // Don't throw - statistics update failure shouldn't break the main flow
    }
  }

  /**
   * Health check for all providers
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const healthChecks = Array.from(this.providers.entries()).map(async ([providerId, provider]) => {
      try {
        const isHealthy = await provider.healthCheck();
        results[providerId] = isHealthy;
      } catch (error) {
        logger.error(`Health check failed for provider ${providerId}:`, error);
        results[providerId] = false;
      }
    });

    await Promise.all(healthChecks);

    return results;
  }

  /**
   * Get provider statistics
   */
  async getProviderStatistics(): Promise<any> {
    return await KYCProvider.getStatistics();
  }

  /**
   * Reload providers from database
   */
  async reloadProviders(): Promise<void> {
    logger.info('Reloading providers from database...');

    const enabledProviders = await KYCProvider.findEnabled();

    logger.info(`Found ${enabledProviders.length} enabled provider(s) in database`);

    // Note: This would typically instantiate providers based on database config
    // For now, we just log the available providers
    // The actual provider instances should be created and registered during module initialization
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
    logger.info('All providers cleared');
  }
}

export default ProviderManager;

