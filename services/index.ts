/**
 * KYC Services
 * 
 * Export all KYC services
 */

import Reactory from '@reactory/reactory-core';
import { KYCDocumentServiceDefinition } from './KYCDocumentService';
import { RiskAssessmentServiceDefinition } from './RiskAssessmentService';

// Services will be imported here as they are implemented
// import { KYCServiceDefinition } from './KYCService';
// import { KYCAuditServiceDefinition } from './KYCAuditService';
// import { ProviderServiceDefinition } from './ProviderService';
// import { ReportingServiceDefinition } from './ReportingService';

const services: Reactory.Service.IReactoryServiceDefinition<any>[] = [
  KYCDocumentServiceDefinition,
  RiskAssessmentServiceDefinition,
  // Additional service definitions will be added here
];

export default services;

