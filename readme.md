# Reactory KYC Module

## Overview

The Reactory KYC (Know Your Customer) module is a comprehensive identity verification and compliance system designed to extend the Reactory framework with robust customer verification capabilities. It provides a flexible, scalable solution for organizations to verify customer identities, maintain regulatory compliance, and manage verification workflows efficiently.

## Purpose

The KYC module enables organizations to:

- ✅ **Verify Customer Identities** through multiple channels and methods
- 📋 **Comply with Regulations** including AML, CFT, GDPR, and KYC standards
- 📊 **Maintain Audit Trails** for comprehensive compliance reporting
- 🔌 **Integrate Third-Party Services** (Trulio, Onfido, and custom providers)
- 🔄 **Manage Workflows** using Reactory's powerful workflow engine
- 📈 **Track Verification Status** in real-time with detailed reporting
- 🔒 **Secure Document Management** with encryption and access control
- 🎯 **Assess Risk** with configurable risk scoring algorithms

## Key Features

### Verification Workflows

The module supports three types of verification workflows:

1. **Manual Verification** - Human-in-the-loop review process for sensitive cases
2. **Automated Verification** - Fully automated checks using third-party providers
3. **Hybrid Verification** - Intelligent routing between automated and manual processes based on complexity and risk assessment

### Multi-Provider Support

Integrate with multiple KYC service providers:

- **Trulio** - Identity verification and document authentication
- **Onfido** - AI-powered identity verification
- **Custom Providers** - Extensible architecture for additional integrations

### Queue-Based Processing

- Scalable, asynchronous verification processing using BullMQ
- Automatic retry logic for failed operations
- Priority-based job scheduling
- Background document processing and validation

### Document Management

Built on top of Reactory's existing file management infrastructure:

- Leverages `core.ReactoryFileService` for file storage and retrieval
- Secure document upload with encryption at rest
- Support for multiple document types (Passport, National ID, Driver's License, etc.)
- Automated document validation and OCR data extraction
- Client-side integration with `UserHomeFolder` component

### Risk Assessment

- Configurable risk scoring algorithms
- Multi-factor risk evaluation (document quality, provider confidence, geographic risk, etc.)
- Automatic approval for low-risk cases
- Flagging and escalation for high-risk scenarios
- Real-time risk score calculation

### Audit & Compliance

Built on Reactory's core audit infrastructure:

- Comprehensive audit logging using `core.ReactoryAuditService`
- Immutable audit trails for all verification activities
- Compliance reporting for regulatory bodies
- GDPR-compliant data retention and erasure
- PII redaction in logs

## Architecture Highlights

### Integrated with Reactory Core Services

- **File Management**: Uses existing `ReactoryFileService` for document handling
- **Audit Logging**: Extends `ReactoryAuditService` for KYC-specific compliance tracking
- **Workflow Engine**: Integrates with Reactory's WorkflowRunner for complex flows
- **Queue System**: Built on `reactory-queue` module (BullMQ)

### Scalable Design

- Horizontal scaling support
- Separate worker pools for different job types
- Database replication for read-heavy operations
- Redis caching for performance optimization
- CDN integration for document delivery

### Security First

- Document encryption at rest and in transit
- Role-based access control (RBAC)
- Multi-factor authentication support
- Webhook signature verification
- Rate limiting and IP whitelisting
- Secure API key management

## Verification Levels

The module supports four verification levels to meet different compliance requirements:

1. **BASIC** - Minimal verification for low-risk operations
2. **INTERMEDIATE** - Standard verification for most use cases
3. **ADVANCED** - Enhanced verification for regulated industries
4. **ENHANCED** - Maximum verification for high-risk scenarios

## Document Types Supported

- 🛂 Passport
- 🆔 National ID Card
- 🚗 Driver's License
- 🏠 Proof of Address
- 🏦 Bank Statement
- 💡 Utility Bill
- 🤳 Selfie / Liveness Photo
- 🎥 Liveness Video

## Verification Status Flow

```
INITIATED → PENDING_DOCUMENTS → SUBMITTED → VALIDATING → PROCESSING
    ↓                                                          ↓
ADDITIONAL_INFO_REQUIRED                    UNDER_REVIEW / AUTO_APPROVED
    ↓                                                          ↓
RETRY_PENDING / FAILED                        COMPLETED / REJECTED
```

## API Endpoints

### GraphQL API

- Query verifications by user, status, or date range
- Real-time subscriptions for status changes
- Comprehensive verification details with nested documents and audit logs

### REST API

- Verification lifecycle management (`/api/kyc/verification/*`)
- Document upload and retrieval (`/api/kyc/document/*`)
- Provider management (`/api/kyc/provider/*`)
- Webhook endpoints (`/api/kyc/webhook/*`)
- Reporting and analytics (`/api/kyc/report/*`)

## Client-Side Integration

The module seamlessly integrates with existing Reactory client components:

- **UserHomeFolder**: File browser and upload interface
- **Custom Hooks**: `useUserHomeFiles`, `useFileOperations`, `useFolderState`
- **Document Upload**: Drag-and-drop support with progress tracking
- **Real-time Updates**: WebSocket integration for status changes

## Performance Targets

- ⚡ Verification initiation: < 500ms
- 📤 Document upload: < 2s (up to 10MB)
- 🔄 Queue processing: 100+ jobs/second
- 📊 Report generation: < 10s
- 🎯 Uptime: 99.9%

## Compliance & Regulations

The module is designed to support compliance with:

- **GDPR** - Right to access, right to erasure, data portability
- **AML** - Anti-Money Laundering transaction monitoring
- **KYC** - Customer due diligence and identity verification standards
- **CFT** - Counter-Financing of Terrorism
- **SOC 2** - Security controls and audit trails

## Getting Started

### Prerequisites

- Reactory Core v1.0.0+
- Reactory Queue module
- Redis (for queue backend)
- MongoDB or PostgreSQL (for data storage)
- AWS S3 or Azure Blob Storage (for document storage)

### Configuration

Configure providers in your environment:

```typescript
{
  kyc: {
    providers: {
      trulio: {
        enabled: true,
        apiKey: process.env.TRULIO_API_KEY,
        webhookSecret: process.env.TRULIO_WEBHOOK_SECRET
      },
      onfido: {
        enabled: true,
        apiKey: process.env.ONFIDO_API_KEY,
        webhookSecret: process.env.ONFIDO_WEBHOOK_SECRET
      }
    },
    workflows: {
      default: 'hybrid'
    },
    riskAssessment: {
      autoApproveThreshold: 0.7,
      manualReviewThreshold: 0.4
    }
  }
}
```

## Development Status

This module is currently in **specification phase**. See [specification.md](./specification.md) for the complete technical specification including:

- Detailed architecture diagrams
- Data models and relationships
- Complete API specifications
- Security and compliance framework
- Testing strategy
- Deployment guidelines
- Future roadmap

## Documentation

- [Specification](./specification.md) - Complete technical specification
- [Progress Tracker](./PROGRESS.md) - Implementation progress and task tracking

## Support & Contributing

For questions, issues, or contributions related to the KYC module, please refer to the main Reactory project guidelines.

## License

This module is part of the Reactory framework and follows the same licensing terms.