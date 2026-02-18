/**
 * Manual Review Form
 * 
 * Form for KYC reviewers to assess and make decisions on verification requests
 */

import Reactory from '@reactorynet/reactory-core';

const ManualReviewForm: Reactory.Forms.IReactoryForm = {
  id: 'reactory-kyc.ManualReviewForm@1.0.0',
  name: 'ManualReviewForm',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  title: 'KYC Manual Review',
  description: 'Review and approve or reject KYC verification requests',
  uiFramework: 'material',
  uiSchema: {
    'ui:order': [
      'verificationId',
      'applicantInfo',
      'documentsReview',
      'riskAssessment',
      'decision',
      'reviewNotes',
    ],
    verificationId: {
      'ui:widget': 'hidden',
    },
    applicantInfo: {
      'ui:widget': 'readonly',
      'ui:title': 'Applicant Information',
      'ui:description': 'Review the applicant\'s submitted information',
      'ui:options': {
        readonly: true,
        expandable: true,
        defaultExpanded: true,
      },
    },
    documentsReview: {
      'ui:title': 'Document Review',
      documents: {
        'ui:widget': 'document-viewer',
        'ui:options': {
          showThumbnails: true,
          allowZoom: true,
          allowRotate: true,
          showDownload: true,
        },
      },
      documentChecks: {
        'ui:title': 'Document Verification Checklist',
        qualityCheck: {
          'ui:widget': 'select',
        },
        authenticityCheck: {
          'ui:widget': 'select',
        },
        expiryCheck: {
          'ui:widget': 'select',
        },
        dataMatchCheck: {
          'ui:widget': 'select',
        },
      },
    },
    riskAssessment: {
      'ui:title': 'Risk Assessment',
      overallRisk: {
        'ui:widget': 'select',
        'ui:help': 'Assess the overall risk level',
      },
      riskFactors: {
        'ui:widget': 'checkboxes',
        'ui:help': 'Select all applicable risk factors',
      },
      riskNotes: {
        'ui:widget': 'textarea',
        'ui:placeholder': 'Explain your risk assessment...',
        'ui:options': {
          rows: 4,
        },
      },
    },
    decision: {
      'ui:title': 'Review Decision',
      action: {
        'ui:widget': 'radio',
        'ui:options': {
          inline: false,
        },
      },
      reason: {
        'ui:widget': 'select',
        'ui:help': 'Select the primary reason for your decision',
      },
      requestedDocuments: {
        'ui:widget': 'checkboxes',
        'ui:help': 'Select additional documents to request (if applicable)',
      },
      additionalMessage: {
        'ui:widget': 'textarea',
        'ui:placeholder': 'Message to be sent to the applicant...',
        'ui:options': {
          rows: 3,
        },
      },
    },
    reviewNotes: {
      'ui:widget': 'textarea',
      'ui:placeholder': 'Internal notes for this review (not visible to applicant)...',
      'ui:options': {
        rows: 5,
      },
    },
  },
  schema: {
    type: 'object',
    required: ['verificationId', 'decision'],
    properties: {
      verificationId: {
        type: 'string',
        title: 'Verification ID',
      },
      applicantInfo: {
        type: 'object',
        title: 'Applicant Information',
        properties: {
          name: {
            type: 'string',
            title: 'Full Name',
          },
          dateOfBirth: {
            type: 'string',
            title: 'Date of Birth',
          },
          nationality: {
            type: 'string',
            title: 'Nationality',
          },
          address: {
            type: 'string',
            title: 'Address',
          },
          email: {
            type: 'string',
            title: 'Email',
          },
        },
      },
      documentsReview: {
        type: 'object',
        title: 'Document Review',
        properties: {
          documents: {
            type: 'array',
            title: 'Uploaded Documents',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
          documentChecks: {
            type: 'object',
            title: 'Document Verification Checklist',
            properties: {
              qualityCheck: {
                type: 'string',
                title: 'Image Quality',
                enum: ['PASS', 'FAIL', 'UNCERTAIN'],
                enumNames: ['Pass - Clear and legible', 'Fail - Poor quality', 'Uncertain - Needs clarification'],
              },
              authenticityCheck: {
                type: 'string',
                title: 'Document Authenticity',
                enum: ['PASS', 'FAIL', 'UNCERTAIN'],
                enumNames: ['Pass - Appears genuine', 'Fail - Suspected forgery', 'Uncertain - Requires expert review'],
              },
              expiryCheck: {
                type: 'string',
                title: 'Expiry Status',
                enum: ['PASS', 'FAIL', 'NOT_APPLICABLE'],
                enumNames: ['Pass - Valid', 'Fail - Expired', 'N/A - No expiry'],
              },
              dataMatchCheck: {
                type: 'string',
                title: 'Data Consistency',
                enum: ['PASS', 'FAIL', 'PARTIAL'],
                enumNames: ['Pass - All data matches', 'Fail - Significant discrepancies', 'Partial - Minor inconsistencies'],
              },
            },
          },
        },
      },
      riskAssessment: {
        type: 'object',
        title: 'Risk Assessment',
        properties: {
          overallRisk: {
            type: 'string',
            title: 'Overall Risk Level',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
            enumNames: ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'],
          },
          riskFactors: {
            type: 'array',
            title: 'Risk Factors',
            items: {
              type: 'string',
              enum: [
                'INCOMPLETE_DOCUMENTS',
                'POOR_DOCUMENT_QUALITY',
                'DATA_INCONSISTENCY',
                'SUSPICIOUS_ACTIVITY',
                'HIGH_RISK_COUNTRY',
                'POLITICALLY_EXPOSED_PERSON',
                'SANCTIONS_LIST_MATCH',
                'ADVERSE_MEDIA',
                'MULTIPLE_APPLICATIONS',
                'EXPIRED_DOCUMENTS',
              ],
            },
            uniqueItems: true,
          },
          riskNotes: {
            type: 'string',
            title: 'Risk Assessment Notes',
            maxLength: 1000,
          },
        },
      },
      decision: {
        type: 'object',
        title: 'Review Decision',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            title: 'Action',
            enum: ['APPROVE', 'REJECT', 'REQUEST_MORE_INFO', 'ESCALATE'],
            enumNames: [
              'Approve - Verification complete',
              'Reject - Verification failed',
              'Request More Information - Need additional documents/data',
              'Escalate - Requires senior review',
            ],
          },
          reason: {
            type: 'string',
            title: 'Reason',
            enum: [
              'ALL_CHECKS_PASSED',
              'DOCUMENTS_VERIFIED',
              'INSUFFICIENT_DOCUMENTS',
              'POOR_DOCUMENT_QUALITY',
              'EXPIRED_DOCUMENTS',
              'DATA_MISMATCH',
              'SUSPECTED_FRAUD',
              'SANCTIONS_MATCH',
              'HIGH_RISK_PROFILE',
              'TECHNICAL_ISSUE',
              'COMPLEX_CASE',
              'POLICY_VIOLATION',
              'OTHER',
            ],
            enumNames: [
              'All checks passed successfully',
              'Documents verified and authentic',
              'Insufficient or missing documents',
              'Document quality too poor for verification',
              'Documents are expired',
              'Data inconsistencies found',
              'Suspected fraudulent activity',
              'Match on sanctions or watchlist',
              'High-risk profile requiring escalation',
              'Technical issue preventing verification',
              'Case too complex for standard review',
              'Policy or regulatory violation',
              'Other (explain in notes)',
            ],
          },
          requestedDocuments: {
            type: 'array',
            title: 'Requested Documents',
            items: {
              type: 'string',
              enum: [
                'PASSPORT',
                'DRIVERS_LICENSE',
                'NATIONAL_ID',
                'RESIDENCE_PERMIT',
                'UTILITY_BILL',
                'BANK_STATEMENT',
                'SELFIE',
                'OTHER',
              ],
            },
            uniqueItems: true,
          },
          additionalMessage: {
            type: 'string',
            title: 'Message to Applicant',
            maxLength: 500,
          },
        },
      },
      reviewNotes: {
        type: 'string',
        title: 'Internal Review Notes',
        maxLength: 2000,
      },
    },
  },
  registerAsComponent: true,
  graphql: {
    query: {
      name: 'kycVerification',
      text: `
        query GetKYCVerification($id: ID!) {
          kycVerification(id: $id) {
            id
            userId
            status
            level
            workflow
            documents {
              id
              type
              fileName
              status
            }
            riskScore {
              score
              level
              factors {
                name
                value
              }
            }
            metadata
          }
        }
      `,
    },
    mutation: {
      review: {
       name: 'reviewKYCVerification',
       text: `
         mutation ReviewKYCVerification($verificationId: String!, $action: String!, $notes: String, $reason: String) {
           updateKYCVerification(input: {
             verificationId: $verificationId
             notes: $notes
           }) {
             success
             message
             verification {
               id
               status
             }
             errors
           }
         }
       `,
      }      
    },
  },
};

export default ManualReviewForm;

