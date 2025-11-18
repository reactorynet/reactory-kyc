/**
 * KYC Models
 * 
 * Export all KYC data models (MongoDB/Mongoose)
 */

import Reactory from '@reactory/reactory-core';
import KYCVerification from './KYCVerification';
import KYCDocument from './KYCDocument';
import KYCRiskScore from './KYCRiskScore';
import KYCProvider from './KYCProvider';

// Export individual models
export { KYCVerification, KYCDocument, KYCRiskScore, KYCProvider };

// Export types
export type {
  IKYCVerification,
  IKYCVerificationDocument
} from './KYCVerification';

export type {
  IKYCDocument,
  IKYCDocumentDocument
} from './KYCDocument';

export type {
  IKYCRiskScore,
  IKYCRiskScoreDocument,
  IRiskFactor
} from './KYCRiskScore';

export type {
  IKYCProvider,
  IKYCProviderDocument,
  IRateLimit,
  IProviderCapability
} from './KYCProvider';

/**
 * Model definitions for Reactory module registration
 */
export const ModelDefinitions: Reactory.IReactoryComponentDefinition<any>[] = [
  {
    nameSpace: 'reactory-kyc',
    name: 'KYCVerification',
    version: '1.0.0',
    description: 'KYC Verification Model',
    stem: 'kyc-verification',
    tags: ['kyc', 'verification', 'compliance'],
    component: KYCVerification,
    domain: Reactory.ComponentDomain.model,
    overwrite: false,
    roles: [],
  },
  {
    nameSpace: 'reactory-kyc',
    name: 'KYCDocument',
    version: '1.0.0',
    description: 'KYC Document Model',
    stem: 'kyc-document',
    tags: ['kyc', 'document', 'verification'],
    component: KYCDocument,
    domain: Reactory.ComponentDomain.model,
    overwrite: false,
    roles: [],
  },
  {
    nameSpace: 'reactory-kyc',
    name: 'KYCRiskScore',
    version: '1.0.0',
    description: 'KYC Risk Score Model',
    stem: 'kyc-risk-score',
    tags: ['kyc', 'risk', 'assessment'],
    component: KYCRiskScore,
    domain: Reactory.ComponentDomain.model,
    overwrite: false,
    roles: [],
  },
  {
    nameSpace: 'reactory-kyc',
    name: 'KYCProvider',
    version: '1.0.0',
    description: 'KYC Provider Configuration Model',
    stem: 'kyc-provider',
    tags: ['kyc', 'provider', 'integration'],
    component: KYCProvider,
    domain: Reactory.ComponentDomain.model,
    overwrite: false,
    roles: [],
  }
];

export default ModelDefinitions;

