/**
 * KYC Workflow Types and Interfaces
 */

import { VerificationStatus, WorkflowType, IKYCVerification } from './kyc.types';
import Reactory from '@reactorynet/reactory-core';

/**
 * Workflow Context
 */
export interface IWorkflowContext {
  verification: IKYCVerification;
  user: any;
  organization: any;
  documents: any[];
  config: any;
  reactoryContext: Reactory.Server.IReactoryContext;
}

/**
 * Workflow Step Result
 */
export interface IWorkflowStepResult {
  success: boolean;
  nextStep?: string;
  nextStatus?: VerificationStatus;
  error?: string;
  data?: Record<string, any>;
}

/**
 * Workflow Execution Result
 */
export interface IWorkflowExecutionResult {
  success: boolean;
  verificationId: string;
  status: VerificationStatus;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Base Workflow Interface
 */
export interface IKYCWorkflow {
  readonly workflowType: WorkflowType;
  readonly workflowName: string;
  readonly workflowVersion: string;

  /**
   * Execute the workflow
   */
  execute(context: IWorkflowContext): Promise<IWorkflowExecutionResult>;

  /**
   * Get workflow steps
   */
  getSteps(): string[];

  /**
   * Validate workflow prerequisites
   */
  validatePrerequisites(context: IWorkflowContext): Promise<boolean>;

  /**
   * Handle workflow error
   */
  handleError(error: Error, context: IWorkflowContext): Promise<void>;
}

/**
 * Workflow Step Interface
 */
export interface IWorkflowStep {
  name: string;
  description: string;
  execute(context: IWorkflowContext): Promise<IWorkflowStepResult>;
  canExecute(context: IWorkflowContext): Promise<boolean>;
  onSuccess?(context: IWorkflowContext, result: IWorkflowStepResult): Promise<void>;
  onFailure?(context: IWorkflowContext, error: Error): Promise<void>;
}

