/**
 * KYC Forms
 * 
 * Export all Reactory form definitions
 */

import Reactory from '@reactory/reactory-core';
import UserVerificationForm from './UserVerificationForm';
import DocumentUploadForm from './DocumentUploadForm';
import ManualReviewForm from './ManualReviewForm';

const forms: Reactory.Forms.IReactoryForm[] = [
  UserVerificationForm,
  DocumentUploadForm,
  ManualReviewForm,
];

export default forms;

export {
  UserVerificationForm,
  DocumentUploadForm,
  ManualReviewForm,
};

