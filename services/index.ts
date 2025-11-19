/**
 * KYC Services
 * 
 * Export all KYC services
 */

import Reactory from '@reactory/reactory-core';
import { KYCDocumentServiceDefinition } from './KYCDocumentService';
import { RiskAssessmentServiceDefinition } from './RiskAssessmentService';
import { KYCAuditServiceDefinition } from './KYCAuditService';
import { KYCServiceDefinition } from './KYCService';

// Services will be imported here as they are implemented
// import { ReportingServiceDefinition } from './ReportingService';

const services: Reactory.Service.IReactoryServiceDefinition<any>[] = [
  KYCDocumentServiceDefinition,
  RiskAssessmentServiceDefinition,
  KYCAuditServiceDefinition,
  KYCServiceDefinition,
  // Additional service definitions will be added here
];

export default services;

