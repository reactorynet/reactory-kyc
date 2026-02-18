/**
 * User Verification Form
 * 
 * Form for users to initiate KYC verification and provide personal information
 */

import Reactory from '@reactorynet/reactory-core';

const UserVerificationForm: Reactory.Forms.IReactoryForm = {
  id: 'reactory-kyc.UserVerificationForm@1.0.0',
  name: 'UserVerificationForm',
  nameSpace: 'reactory-kyc',
  version: '1.0.0',
  title: 'KYC Verification',
  description: 'Complete your identity verification',
  uiFramework: 'material',
  uiSchema: {
    'ui:order': [
      'level',
      'workflow',
      'personalInfo',
      'address',
      'documents',
      'consent',
    ],
    level: {
      'ui:widget': 'select',
      'ui:help': 'Select the level of verification required',
    },
    workflow: {
      'ui:widget': 'radio',
      'ui:help': 'Choose how you would like to be verified',
    },
    personalInfo: {
      'ui:title': 'Personal Information',
      firstName: {
        'ui:widget': 'text',
        'ui:placeholder': 'Enter your first name',
        'ui:autofocus': true,
      },
      lastName: {
        'ui:widget': 'text',
        'ui:placeholder': 'Enter your last name',
      },
      middleName: {
        'ui:widget': 'text',
        'ui:placeholder': 'Enter your middle name (optional)',
      },
      dateOfBirth: {
        'ui:widget': 'date',
        'ui:help': 'You must be 18 years or older',
      },
      nationality: {
        'ui:widget': 'select',
      },
      placeOfBirth: {
        'ui:widget': 'text',
        'ui:placeholder': 'City, Country',
      },
      idNumber: {
        'ui:widget': 'text',
        'ui:placeholder': 'National ID or Passport Number',
      },
      phoneNumber: {
        'ui:widget': 'tel',
        'ui:placeholder': '+1234567890',
      },
      email: {
        'ui:widget': 'email',
        'ui:placeholder': 'your.email@example.com',
      },
    },
    address: {
      'ui:title': 'Residential Address',
      street: {
        'ui:widget': 'text',
        'ui:placeholder': 'Street address',
      },
      city: {
        'ui:widget': 'text',
        'ui:placeholder': 'City',
      },
      state: {
        'ui:widget': 'text',
        'ui:placeholder': 'State/Province',
      },
      postalCode: {
        'ui:widget': 'text',
        'ui:placeholder': 'Postal/ZIP code',
      },
      country: {
        'ui:widget': 'select',
      },
    },
    documents: {
      'ui:title': 'Required Documents',
      'ui:description': 'You will upload documents in the next step',
      primaryIdType: {
        'ui:widget': 'select',
        'ui:help': 'Choose your primary identification document',
      },
      proofOfAddressType: {
        'ui:widget': 'select',
        'ui:help': 'Document to verify your residential address',
      },
    },
    consent: {
      'ui:title': 'Consent & Agreement',
      termsAccepted: {
        'ui:widget': 'checkbox',
      },
      dataProcessingConsent: {
        'ui:widget': 'checkbox',
      },
      thirdPartyVerification: {
        'ui:widget': 'checkbox',
      },
    },
  },
  schema: {
    type: 'object',
    required: [
      'level',
      'workflow',
      'personalInfo',
      'address',
      'documents',
      'consent',
    ],
    properties: {
      level: {
        type: 'string',
        title: 'Verification Level',
        enum: ['BASIC', 'STANDARD', 'ENHANCED', 'FULL'],
        enumNames: [
          'Basic - Quick verification',
          'Standard - Standard identity check',
          'Enhanced - Thorough verification',
          'Full - Complete due diligence',
        ],
        default: 'STANDARD',
      },
      workflow: {
        type: 'string',
        title: 'Verification Method',
        enum: ['AUTOMATED', 'MANUAL', 'HYBRID'],
        enumNames: [
          'Automated - Fast automatic verification',
          'Manual - Human review (2-5 business days)',
          'Hybrid - Combination of automated and manual',
        ],
        default: 'HYBRID',
      },
      personalInfo: {
        type: 'object',
        title: 'Personal Information',
        required: ['firstName', 'lastName', 'dateOfBirth', 'nationality', 'idNumber', 'email'],
        properties: {
          firstName: {
            type: 'string',
            title: 'First Name',
            minLength: 1,
            maxLength: 100,
          },
          lastName: {
            type: 'string',
            title: 'Last Name',
            minLength: 1,
            maxLength: 100,
          },
          middleName: {
            type: 'string',
            title: 'Middle Name',
            maxLength: 100,
          },
          dateOfBirth: {
            type: 'string',
            title: 'Date of Birth',
            format: 'date',
          },
          nationality: {
            type: 'string',
            title: 'Nationality',
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
          placeOfBirth: {
            type: 'string',
            title: 'Place of Birth',
            maxLength: 200,
          },
          idNumber: {
            type: 'string',
            title: 'ID Number',
            minLength: 5,
            maxLength: 50,
          },
          phoneNumber: {
            type: 'string',
            title: 'Phone Number',
            pattern: '^\\+?[1-9]\\d{1,14}$',
          },
          email: {
            type: 'string',
            title: 'Email Address',
            format: 'email',
          },
        },
      },
      address: {
        type: 'object',
        title: 'Residential Address',
        required: ['street', 'city', 'postalCode', 'country'],
        properties: {
          street: {
            type: 'string',
            title: 'Street Address',
            minLength: 1,
            maxLength: 200,
          },
          city: {
            type: 'string',
            title: 'City',
            minLength: 1,
            maxLength: 100,
          },
          state: {
            type: 'string',
            title: 'State/Province',
            maxLength: 100,
          },
          postalCode: {
            type: 'string',
            title: 'Postal Code',
            minLength: 3,
            maxLength: 20,
          },
          country: {
            type: 'string',
            title: 'Country',
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
        },
      },
      documents: {
        type: 'object',
        title: 'Required Documents',
        required: ['primaryIdType', 'proofOfAddressType'],
        properties: {
          primaryIdType: {
            type: 'string',
            title: 'Primary ID Type',
            enum: ['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID'],
            enumNames: ['Passport', 'Driver\'s License', 'National ID Card'],
          },
          proofOfAddressType: {
            type: 'string',
            title: 'Proof of Address Type',
            enum: ['UTILITY_BILL', 'BANK_STATEMENT', 'RESIDENCE_PERMIT'],
            enumNames: ['Utility Bill', 'Bank Statement', 'Residence Permit'],
          },
        },
      },
      consent: {
        type: 'object',
        title: 'Consent & Agreement',
        required: ['termsAccepted', 'dataProcessingConsent', 'thirdPartyVerification'],
        properties: {
          termsAccepted: {
            type: 'boolean',
            title: 'I accept the Terms and Conditions',
            const: true,
          },
          dataProcessingConsent: {
            type: 'boolean',
            title: 'I consent to the processing of my personal data for identity verification purposes',
            const: true,
          },
          thirdPartyVerification: {
            type: 'boolean',
            title: 'I consent to verification through third-party service providers',
            const: true,
          },
        },
      },
    },
  },
  registerAsComponent: true,
  defaultFormValue: {
    level: 'STANDARD',
    workflow: 'HYBRID',
  },
};

export default UserVerificationForm;

