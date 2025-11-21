/**
 * Document Upload Form
 * 
 * Form for uploading KYC verification documents
 */

import Reactory from '@reactory/reactory-core';

const DocumentUploadForm: Reactory.Forms.IReactoryForm = {
  id: 'reactory-kyc.DocumentUploadForm@1.0.0',
  name: 'DocumentUploadForm',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  title: 'Upload Verification Documents',
  description: 'Upload your identity and address verification documents',
  uiFramework: 'material',
  uiSchema: {
    'ui:order': [
      'verificationId',
      'documentType',
      'file',
      'metadata',
      'notes',
    ],
    verificationId: {
      'ui:widget': 'hidden',
    },
    documentType: {
      'ui:widget': 'select',
      'ui:help': 'Select the type of document you are uploading',
    },
    file: {
      'ui:widget': 'file',
      'ui:options': {
        accept: 'image/jpeg,image/png,image/jpg,application/pdf',
        multiple: false,
        maxSize: 10485760, // 10MB in bytes
        showPreview: true,
        dropzone: true,
        dragDropText: 'Drag and drop your document here, or click to select',
      },
      'ui:help': 'Accepted formats: JPEG, PNG, PDF. Maximum size: 10MB',
    },
    metadata: {
      'ui:title': 'Document Details',
      documentNumber: {
        'ui:widget': 'text',
        'ui:placeholder': 'Document number (if applicable)',
      },
      issuingCountry: {
        'ui:widget': 'select',
        'ui:help': 'Country that issued this document',
      },
      issueDate: {
        'ui:widget': 'date',
        'ui:help': 'When was this document issued?',
      },
      expiryDate: {
        'ui:widget': 'date',
        'ui:help': 'When does this document expire?',
      },
    },
    notes: {
      'ui:widget': 'textarea',
      'ui:placeholder': 'Any additional information about this document (optional)',
      'ui:options': {
        rows: 3,
      },
    },
  },
  schema: {
    type: 'object',
    required: ['verificationId', 'documentType', 'file'],
    properties: {
      verificationId: {
        type: 'string',
        title: 'Verification ID',
      },
      documentType: {
        type: 'string',
        title: 'Document Type',
        enum: [
          'PASSPORT',
          'DRIVERS_LICENSE',
          'NATIONAL_ID',
          'RESIDENCE_PERMIT',
          'BIRTH_CERTIFICATE',
          'UTILITY_BILL',
          'BANK_STATEMENT',
          'OTHER',
        ],
        enumNames: [
          'Passport',
          'Driver\'s License',
          'National ID Card',
          'Residence Permit',
          'Birth Certificate',
          'Utility Bill (Proof of Address)',
          'Bank Statement (Proof of Address)',
          'Other Document',
        ],
      },
      file: {
        type: 'string',
        title: 'Document File',
        format: 'data-url',
      },
      metadata: {
        type: 'object',
        title: 'Document Details',
        properties: {
          documentNumber: {
            type: 'string',
            title: 'Document Number',
            maxLength: 100,
          },
          issuingCountry: {
            type: 'string',
            title: 'Issuing Country',
            enum: [
              'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE',
              'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'AT', 'CH', 'NZ', 'JP',
              'SG', 'HK', 'AE', 'ZA', 'BR', 'MX', 'AR', 'CL', 'IN', 'Other',
            ],
            enumNames: [
              'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
              'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Sweden',
              'Norway', 'Denmark', 'Finland', 'Ireland', 'Portugal', 'Austria',
              'Switzerland', 'New Zealand', 'Japan', 'Singapore', 'Hong Kong',
              'United Arab Emirates', 'South Africa', 'Brazil', 'Mexico',
              'Argentina', 'Chile', 'India', 'Other',
            ],
          },
          issueDate: {
            type: 'string',
            title: 'Issue Date',
            format: 'date',
          },
          expiryDate: {
            type: 'string',
            title: 'Expiry Date',
            format: 'date',
          },
        },
      },
      notes: {
        type: 'string',
        title: 'Additional Notes',
        maxLength: 500,
      },
    },
  },
  registerAsComponent: true,
  graphql: {
    mutation: {
      name: 'uploadKYCDocument',
      text: `
        mutation UploadKYCDocument($input: UploadDocumentInput!) {
          uploadKYCDocument(input: $input) {
            success
            message
            document {
              id
              type
              fileName
              status
              createdAt
            }
            errors
          }
        }
      `,
    },
  },
};

export default DocumentUploadForm;

