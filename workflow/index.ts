/**
 * KYC Workflows
 * 
 * Export all KYC workflow definitions
 */

import Reactory from '@reactorynet/reactory-core';
import ManualVerificationWorkflow from '../workflows/ManualVerificationWorkflow';
import AutomatedVerificationWorkflow from '../workflows/AutomatedVerificationWorkflow';
import HybridVerificationWorkflow from '../workflows/HybridVerificationWorkflow';
import DocumentVerificationWorkflow from '../workflows/DocumentVerificationWorkflow';

const workflows: Reactory.Workflow.IWorkflow[] = [
  ManualVerificationWorkflow,
  AutomatedVerificationWorkflow,
  HybridVerificationWorkflow,
  DocumentVerificationWorkflow,
];

export default workflows;

