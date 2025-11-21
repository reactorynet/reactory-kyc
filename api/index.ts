import Reactory from '@reactory/reactory-core';
import { createKYCRouter } from './routes';

/**
 * KYC API Definition
 * Exports the API router for registration with the Reactory application
 */
export const KYCApiDefinition: Reactory.Server.IReactoryApiDefinition = {
  nameSpace: 'reactory-kyc',
  name: 'KYC API',
  version: '1.0.0',
  description: 'REST API for KYC verification operations',
  path: '/api/kyc',
  router: (context: Reactory.Server.IReactoryContext) => createKYCRouter(context),
  enabled: true
};

export default KYCApiDefinition;

