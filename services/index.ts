/**
 * KYC Services
 * 
 * Export all KYC services
 */

import Reactory from '@reactorynet/reactory-core';
import { KYCDocumentServiceDefinition } from './KYCDocumentService';
import { RiskAssessmentServiceDefinition } from './RiskAssessmentService';
import { KYCAuditServiceDefinition } from './KYCAuditService';
import { KYCServiceDefinition } from './KYCService';
import { ReportingServiceDefinition } from './ReportingService';

const services: Reactory.Service.IReactoryServiceDefinition<any>[] = [
  KYCDocumentServiceDefinition,
  RiskAssessmentServiceDefinition,
  KYCAuditServiceDefinition,
  KYCServiceDefinition,
  ReportingServiceDefinition,
];

export default services;

