/**
 * KYC Workflows
 * 
 * Export all KYC workflow definitions
 */

import Reactory from '@reactory/reactory-core';
import ManualVerificationWorkflow from './ManualVerificationWorkflow';
import AutomatedVerificationWorkflow from './AutomatedVerificationWorkflow';
import HybridVerificationWorkflow from './HybridVerificationWorkflow';
import DocumentVerificationWorkflow from './DocumentVerificationWorkflow';

const workflows: Reactory.Workflow.IWorkflow[] = [
  ManualVerificationWorkflow,
  AutomatedVerificationWorkflow,
  HybridVerificationWorkflow,
  DocumentVerificationWorkflow,
];

export default workflows;

