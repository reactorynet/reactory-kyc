# Reactory KYC Module Specification

## 1. Overview

The Reactory KYC (Know Your Customer) module is a comprehensive identity verification and compliance system designed to extend the Reactory framework with robust customer verification capabilities. The module supports both manual verification workflows and automated verification through third-party providers, ensuring flexible implementation for various regulatory requirements.

### 1.1 Purpose

The KYC module enables organizations to:
- Verify customer identities through multiple channels
- Comply with regulatory requirements (AML, CFT, etc.)
- Maintain audit trails for compliance reporting
- Integrate with third-party verification services
- Manage verification workflows efficiently
- Track and report verification statuses

### 1.2 Key Features

- **Multi-Provider Support**: Integrate with multiple KYC service providers (Trulio, Onfido, etc.)
- **Manual Verification**: Support for human-in-the-loop verification processes
- **Automated Verification**: Streamlined automated verification workflows
- **Queue-Based Processing**: Scalable, asynchronous verification processing
- **Workflow Engine Integration**: Leverage Reactory's workflow engine for complex verification flows
- **Audit Trail**: Comprehensive logging and audit capabilities
- **Multi-Tenant Support**: Organization-specific verification configurations
- **Document Management**: Secure storage and management of verification documents
- **Risk Scoring**: Configurable risk assessment and scoring
- **Compliance Reporting**: Generate compliance reports for regulatory bodies

## 2. Architecture

### 2.1 High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Client]
        MOBILE[Mobile Client]
        API[External API]
    end
    
    subgraph "API Gateway"
        GRAPH[GraphQL API]
        REST[REST API]
    end
    
    subgraph "KYC Core Services"
        KYC_SVC[KYC Service]
        RISK_SVC[Risk Assessment Service]
    end
    
    subgraph "Reactory Core Services (Existing)"
        FILE_SVC[Reactory File Service]
        AUDIT_SVC[Reactory Audit Service]
    end
    
    subgraph "Workflow Engine"
        WF_RUNNER[Workflow Runner]
        WF_MANUAL[Manual Verification Workflow]
        WF_AUTO[Automated Verification Workflow]
        WF_HYBRID[Hybrid Verification Workflow]
    end
    
    subgraph "Queue System"
        QUEUE[BullMQ Queue]
        JOB_PROC[Job Processor]
        SCHEDULER[Job Scheduler]
    end
    
    subgraph "Provider Integration"
        TRULIO[Trulio Provider]
        ONFIDO[Onfido Provider]
        CUSTOM[Custom Provider]
        PROVIDER_MGR[Provider Manager]
    end
    
    subgraph "Storage Layer"
        DB[(Database)]
        DOCS[(Document Storage)]
        CACHE[(Redis Cache)]
    end
    
    WEB --> GRAPH
    MOBILE --> GRAPH
    API --> REST
    
    GRAPH --> KYC_SVC
    REST --> KYC_SVC
    
    KYC_SVC --> FILE_SVC
    KYC_SVC --> RISK_SVC
    KYC_SVC --> AUDIT_SVC
    KYC_SVC --> WF_RUNNER
    
    WF_RUNNER --> WF_MANUAL
    WF_RUNNER --> WF_AUTO
    WF_RUNNER --> WF_HYBRID
    
    WF_AUTO --> QUEUE
    WF_MANUAL --> QUEUE
    WF_HYBRID --> QUEUE
    
    QUEUE --> JOB_PROC
    SCHEDULER --> QUEUE
    
    JOB_PROC --> PROVIDER_MGR
    PROVIDER_MGR --> TRULIO
    PROVIDER_MGR --> ONFIDO
    PROVIDER_MGR --> CUSTOM
    
    KYC_SVC --> DB
    FILE_SVC --> DOCS
    KYC_SVC --> CACHE
    AUDIT_SVC --> DB
    FILE_SVC --> DB
```

### 2.2 Module Structure

```
reactory-kyc/
├── index.ts                    # Module definition and exports
├── readme.md                   # Module overview
├── specification.md            # This document
├── package.json               # Module dependencies
│
├── cli/                       # CLI commands
│   ├── index.ts
│   ├── verify-user.ts         # Manual verification command
│   ├── check-status.ts        # Check verification status
│   └── generate-report.ts     # Generate compliance reports
│
├── services/                  # Core business logic
│   ├── index.ts
│   ├── KYCService.ts          # Main KYC orchestration service
│   ├── KYCDocumentService.ts  # KYC-specific document wrapper (uses core.ReactoryFileService)
│   ├── RiskAssessmentService.ts # Risk scoring and assessment
│   ├── KYCAuditService.ts     # KYC-specific audit wrapper (uses core.ReactoryAuditService)
│   ├── ProviderService.ts     # Third-party provider integration
│   └── ReportingService.ts    # Compliance reporting
│
├── providers/                 # Third-party provider integrations
│   ├── index.ts
│   ├── BaseProvider.ts        # Abstract base provider class
│   ├── TrulioProvider.ts      # Trulio integration
│   ├── OnfidoProvider.ts      # Onfido integration
│   └── types.ts               # Provider-specific types
│
├── workflows/                 # Workflow definitions
│   ├── index.ts
│   ├── ManualVerificationWorkflow.ts
│   ├── AutomatedVerificationWorkflow.ts
│   ├── HybridVerificationWorkflow.ts
│   └── DocumentVerificationWorkflow.ts
│
├── queues/                    # Queue job definitions
│   ├── index.ts
│   ├── VerificationQueue.ts   # Verification job queue
│   ├── DocumentProcessingQueue.ts # Document processing queue
│   └── NotificationQueue.ts   # Notification job queue
│
├── models/                    # Data models
│   ├── index.ts
│   ├── KYCVerification.ts     # Main verification model
│   ├── KYCDocument.ts         # Document model
│   ├── KYCRiskScore.ts        # Risk score model
│   ├── KYCAuditLog.ts         # Audit log model
│   └── KYCProvider.ts         # Provider configuration model
│
├── graphql/                   # GraphQL definitions
│   ├── index.ts
│   ├── schema/
│   │   ├── kyc.graphql        # KYC type definitions
│   │   ├── verification.graphql
│   │   └── document.graphql
│   └── resolvers/
│       ├── index.ts
│       ├── KYCResolver.ts
│       └── DocumentResolver.ts
│
├── forms/                     # Reactory form definitions
│   ├── index.ts
│   ├── UserVerificationForm.ts
│   ├── DocumentUploadForm.ts
│   └── ManualReviewForm.ts
│
├── routes/                    # REST API routes
│   ├── index.ts
│   ├── kyc.ts                 # KYC endpoints
│   ├── webhooks.ts            # Provider webhooks
│   └── documents.ts           # Document endpoints
│
├── middleware/                # Express middleware
│   ├── index.ts
│   ├── verification-check.ts  # Verification status check
│   └── compliance-logger.ts   # Compliance logging
│
├── types/                     # TypeScript type definitions
│   ├── index.ts
│   ├── kyc.types.ts
│   ├── provider.types.ts
│   └── workflow.types.ts
│
├── utils/                     # Utility functions
│   ├── index.ts
│   ├── validators.ts          # Input validation
│   ├── encryption.ts          # Document encryption
│   └── risk-calculator.ts     # Risk score calculation
│
├── data/                      # Static data and configurations
│   ├── risk-rules.json        # Risk assessment rules
│   ├── country-requirements.json # Country-specific KYC requirements
│   └── document-types.json    # Supported document types
│
└── i18n/                      # Internationalization
    ├── en.json
    ├── es.json
    └── fr.json
```

## 3. Core Components

### 3.1 KYC Service

The main orchestration service that coordinates all KYC operations.

```mermaid
classDiagram
    class KYCService {
        +initiateVerification(userId, level, options)
        +getVerificationStatus(verificationId)
        +updateVerification(verificationId, data)
        +approveVerification(verificationId, reviewerId)
        +rejectVerification(verificationId, reviewerId, reason)
        +requestAdditionalInfo(verificationId, requirements)
        +getVerificationHistory(userId)
        -determineVerificationLevel(user, context)
        -selectVerificationWorkflow(level, options)
        -validateVerificationRequirements(level, documents)
    }
    
    class KYCDocumentService {
        +uploadKYCDocument(verificationId, document, metadata)
        +getKYCDocument(documentId)
        +validateKYCDocument(documentId)
        +extractDocumentData(documentId)
        +deleteKYCDocument(documentId)
        +linkDocumentToVerification(fileId, verificationId)
        -useReactoryFileService()
    }
    
    class ReactoryFileService {
        <<existing>>
        +uploadFile(args)
        +getUserFiles(userId, path, options)
        +getServerFiles(serverPath, options)
        +deleteFile(fileModel)
        +catalogFile(filename, mimetype, ...)
        +downloadFile(url, options, outputPath)
    }
    
    class RiskAssessmentService {
        +calculateRiskScore(userId, verificationData)
        +updateRiskScore(userId, factors)
        +getRiskScore(userId)
        +evaluateRiskFactors(user, context)
        +applyRiskRules(data, rules)
    }
    
    class KYCAuditService {
        +logVerificationEvent(event)
        +logDocumentAccess(documentId, userId, action)
        +logProviderRequest(provider, request, response)
        +generateAuditReport(filter, dateRange)
        +exportAuditLog(format)
        -useReactoryAuditService()
    }
    
    class ReactoryAuditService {
        <<existing>>
        +logAuditEvent(action, source, user, before, after)
        +queryAuditLogs(filter, pagination)
        +generateComplianceReport(params)
    }
    
    class ProviderService {
        +getProvider(providerId)
        +initiateProviderVerification(providerId, data)
        +checkProviderStatus(providerId, checkId)
        +processProviderWebhook(providerId, payload)
        +configureProvider(providerId, config)
    }
    
    KYCService --> KYCDocumentService
    KYCService --> RiskAssessmentService
    KYCService --> KYCAuditService
    KYCService --> ProviderService
    KYCDocumentService --> ReactoryFileService
    KYCAuditService --> ReactoryAuditService
```

### 3.2 Provider Integration

```mermaid
classDiagram
    class BaseProvider {
        <<abstract>>
        #providerId: string
        #config: ProviderConfig
        +initialize(config)
        +createCheck(applicant, documents)*
        +getCheckStatus(checkId)*
        +getCheckResult(checkId)*
        +downloadReport(checkId)*
        +handleWebhook(payload)*
        #validateConfig(config)
        #buildRequest(data)
        #parseResponse(response)
    }
    
    class TrulioProvider {
        +createCheck(applicant, documents)
        +getCheckStatus(checkId)
        +getCheckResult(checkId)
        +downloadReport(checkId)
        +handleWebhook(payload)
        -buildTrulioRequest(data)
        -parseTrulioResponse(response)
    }
    
    class OnfidoProvider {
        +createCheck(applicant, documents)
        +getCheckStatus(checkId)
        +getCheckResult(checkId)
        +downloadReport(checkId)
        +handleWebhook(payload)
        +createApplicant(userData)
        +uploadDocument(applicantId, document)
        -buildOnfidoRequest(data)
        -parseOnfidoResponse(response)
    }
    
    class CustomProvider {
        +createCheck(applicant, documents)
        +getCheckStatus(checkId)
        +getCheckResult(checkId)
        +downloadReport(checkId)
        +handleWebhook(payload)
        -customIntegrationLogic()
    }
    
    class ProviderManager {
        -providers: Map~string, BaseProvider~
        +registerProvider(provider)
        +getProvider(providerId)
        +executeCheck(providerId, data)
        +processWebhook(providerId, payload)
    }
    
    BaseProvider <|-- TrulioProvider
    BaseProvider <|-- OnfidoProvider
    BaseProvider <|-- CustomProvider
    ProviderManager o-- BaseProvider
```

## 4. Verification Workflows

### 4.1 Manual Verification Workflow

Manual verification workflow where human reviewers assess submitted documents and information.

```mermaid
stateDiagram-v2
    [*] --> Initiated: User Submits Verification
    
    Initiated --> DocumentUpload: Request Documents
    DocumentUpload --> DocumentValidation: Documents Submitted
    
    DocumentValidation --> InsufficientDocuments: Validation Failed
    DocumentValidation --> QueuedForReview: Validation Passed
    
    InsufficientDocuments --> DocumentUpload: Request Additional Documents
    
    QueuedForReview --> UnderReview: Assigned to Reviewer
    
    UnderReview --> AdditionalInfoRequired: Reviewer Requests More Info
    UnderReview --> Approved: Reviewer Approves
    UnderReview --> Rejected: Reviewer Rejects
    
    AdditionalInfoRequired --> DocumentUpload: User Provides Info
    
    Approved --> [*]: Verification Complete
    Rejected --> [*]: Verification Failed
    
    note right of UnderReview
        Manual review includes:
        - Document authenticity check
        - Information verification
        - Cross-reference checks
        - Risk assessment
    end note
```

### 4.2 Automated Verification Workflow

Fully automated verification using third-party providers.

```mermaid
stateDiagram-v2
    [*] --> Initiated: User Submits Verification
    
    Initiated --> DataCollection: Collect User Data
    DataCollection --> ProviderSelection: Select Provider
    
    ProviderSelection --> ProviderSubmission: Submit to Provider
    ProviderSubmission --> Processing: Provider Processing
    
    Processing --> ProviderComplete: Processing Complete
    Processing --> ProviderFailed: Processing Failed
    
    ProviderComplete --> RiskAssessment: Assess Risk
    
    RiskAssessment --> LowRisk: Low Risk Score
    RiskAssessment --> HighRisk: High Risk Score
    
    LowRisk --> Approved: Auto-Approve
    HighRisk --> ManualReview: Flag for Review
    
    ManualReview --> Approved: Reviewer Approves
    ManualReview --> Rejected: Reviewer Rejects
    
    ProviderFailed --> Retry: Retry Available
    ProviderFailed --> ManualReview: Manual Review Required
    
    Retry --> ProviderSubmission: Resubmit
    
    Approved --> [*]: Verification Complete
    Rejected --> [*]: Verification Failed
    
    note right of RiskAssessment
        Risk factors:
        - Provider confidence score
        - Document quality
        - Match accuracy
        - Historical patterns
        - Geographic risk
    end note
```

### 4.3 Hybrid Verification Workflow

Combination of automated and manual verification with intelligent routing.

```mermaid
stateDiagram-v2
    [*] --> Initiated: User Submits Verification
    
    Initiated --> ComplexityAssessment: Assess Complexity
    
    ComplexityAssessment --> SimpleCase: Simple Case
    ComplexityAssessment --> ComplexCase: Complex Case
    
    SimpleCase --> AutomatedPath: Route to Automation
    ComplexCase --> ManualPath: Route to Manual Review
    
    AutomatedPath --> ProviderCheck: Provider Verification
    
    ProviderCheck --> ProviderSuccess: Success
    ProviderCheck --> ProviderUncertain: Uncertain Result
    ProviderCheck --> ProviderFailed: Failed
    
    ProviderSuccess --> RiskCheck: Risk Assessment
    ProviderUncertain --> ManualPath: Escalate to Manual
    ProviderFailed --> ManualPath: Escalate to Manual
    
    RiskCheck --> LowRisk: Low Risk
    RiskCheck --> MediumRisk: Medium Risk
    RiskCheck --> HighRisk: High Risk
    
    LowRisk --> Approved: Auto-Approve
    MediumRisk --> SpotCheck: Spot Check Sample
    HighRisk --> ManualPath: Manual Review Required
    
    SpotCheck --> Approved: Passes Spot Check
    SpotCheck --> ManualPath: Fails Spot Check
    
    ManualPath --> HumanReview: Reviewer Assignment
    
    HumanReview --> Approved: Approved
    HumanReview --> Rejected: Rejected
    HumanReview --> MoreInfo: Request More Info
    
    MoreInfo --> Initiated: User Provides Info
    
    Approved --> [*]: Verification Complete
    Rejected --> [*]: Verification Failed
    
    note right of ComplexityAssessment
        Complexity factors:
        - Document types
        - User jurisdiction
        - Risk indicators
        - Previous history
        - Verification level
    end note
```

## 5. Queue-Based Processing

### 5.1 Queue Architecture

```mermaid
graph TB
    subgraph "Job Submission"
        API[API Request]
        WF[Workflow Trigger]
        SCHED[Scheduled Task]
    end
    
    subgraph "Queue Manager"
        ROUTER[Job Router]
        PRIORITY[Priority Manager]
    end
    
    subgraph "Queues"
        VER_QUEUE[Verification Queue]
        DOC_QUEUE[Document Processing Queue]
        NOTIF_QUEUE[Notification Queue]
        WEBHOOK_QUEUE[Webhook Queue]
    end
    
    subgraph "Job Processors"
        VER_PROC[Verification Processor]
        DOC_PROC[Document Processor]
        NOTIF_PROC[Notification Processor]
        WEBHOOK_PROC[Webhook Processor]
    end
    
    subgraph "Job Outcomes"
        SUCCESS[Success Handler]
        FAILURE[Failure Handler]
        RETRY[Retry Handler]
    end
    
    API --> ROUTER
    WF --> ROUTER
    SCHED --> ROUTER
    
    ROUTER --> PRIORITY
    
    PRIORITY --> VER_QUEUE
    PRIORITY --> DOC_QUEUE
    PRIORITY --> NOTIF_QUEUE
    PRIORITY --> WEBHOOK_QUEUE
    
    VER_QUEUE --> VER_PROC
    DOC_QUEUE --> DOC_PROC
    NOTIF_QUEUE --> NOTIF_PROC
    WEBHOOK_QUEUE --> WEBHOOK_PROC
    
    VER_PROC --> SUCCESS
    VER_PROC --> FAILURE
    VER_PROC --> RETRY
    
    DOC_PROC --> SUCCESS
    DOC_PROC --> FAILURE
    DOC_PROC --> RETRY
    
    NOTIF_PROC --> SUCCESS
    NOTIF_PROC --> FAILURE
    
    WEBHOOK_PROC --> SUCCESS
    WEBHOOK_PROC --> FAILURE
    
    RETRY --> VER_QUEUE
    RETRY --> DOC_QUEUE
```

### 5.2 Queue Job Types

```mermaid
classDiagram
    class BaseJob {
        <<abstract>>
        +jobId: string
        +type: JobType
        +priority: Priority
        +attempts: number
        +maxAttempts: number
        +createdAt: Date
        +process()*
        +onComplete()*
        +onFailed()*
    }
    
    class VerificationJob {
        +verificationId: string
        +userId: string
        +level: VerificationLevel
        +provider: string
        +process()
        +onComplete()
        +onFailed()
        -initiateProviderCheck()
        -updateVerificationStatus()
    }
    
    class DocumentProcessingJob {
        +documentId: string
        +verificationId: string
        +operations: string[]
        +process()
        +onComplete()
        +onFailed()
        -validateDocument()
        -extractData()
        -performOCR()
        -checkQuality()
    }
    
    class NotificationJob {
        +userId: string
        +type: NotificationType
        +channel: string[]
        +template: string
        +data: object
        +process()
        +onComplete()
        +onFailed()
        -sendEmail()
        -sendSMS()
        -sendPush()
    }
    
    class WebhookJob {
        +provider: string
        +payload: object
        +signature: string
        +process()
        +onComplete()
        +onFailed()
        -validateWebhook()
        -processWebhookData()
        -updateVerification()
    }
    
    class RetryJob {
        +originalJobId: string
        +originalJobType: string
        +reason: string
        +process()
        -recreateOriginalJob()
    }
    
    BaseJob <|-- VerificationJob
    BaseJob <|-- DocumentProcessingJob
    BaseJob <|-- NotificationJob
    BaseJob <|-- WebhookJob
    BaseJob <|-- RetryJob
```

## 6. Data Models

### 6.1 Core Data Model

```mermaid
erDiagram
    USER ||--o{ KYC_VERIFICATION : has
    KYC_VERIFICATION ||--o{ KYC_DOCUMENT : contains
    KYC_VERIFICATION ||--|| KYC_RISK_SCORE : has
    KYC_VERIFICATION ||--o{ KYC_AUDIT_LOG : tracks
    KYC_VERIFICATION }o--|| KYC_PROVIDER : uses
    ORGANIZATION ||--o{ KYC_VERIFICATION : manages
    REVIEWER ||--o{ KYC_VERIFICATION : reviews
    
    USER {
        string id PK
        string email
        string firstName
        string lastName
        date dateOfBirth
        string nationality
        string address
        date createdAt
        date updatedAt
    }
    
    KYC_VERIFICATION {
        string id PK
        string userId FK
        string organizationId FK
        string reviewerId FK
        string level
        string status
        string workflowType
        string providerId FK
        string providerCheckId
        object providerResponse
        date initiatedAt
        date completedAt
        string completedBy
        string rejectionReason
        object metadata
    }
    
    KYC_DOCUMENT {
        string id PK
        string verificationId FK
        string documentType
        string documentNumber
        string issuingCountry
        date issueDate
        date expiryDate
        string fileUrl
        string encryptedFileUrl
        string fileHash
        string extractedData
        string validationStatus
        date uploadedAt
        date validatedAt
    }
    
    KYC_RISK_SCORE {
        string id PK
        string verificationId FK
        number totalScore
        object scoreBreakdown
        string riskLevel
        object riskFactors
        string assessmentMethod
        date calculatedAt
        date updatedAt
    }
    
    KYC_AUDIT_LOG {
        string id PK
        string verificationId FK
        string userId FK
        string action
        string actor
        string actorType
        object changes
        object metadata
        string ipAddress
        string userAgent
        date timestamp
    }
    
    KYC_PROVIDER {
        string id PK
        string name
        string type
        object config
        boolean enabled
        object capabilities
        object rateLimits
        date createdAt
        date updatedAt
    }
    
    ORGANIZATION {
        string id PK
        string name
        object kycConfig
        object complianceSettings
        date createdAt
    }
    
    REVIEWER {
        string id PK
        string userId FK
        string[] permissions
        number reviewCount
        number approvalCount
        number rejectionCount
        date lastReviewAt
    }
```

### 6.2 Verification Status States

```mermaid
graph LR
    INIT[INITIATED] --> PEND[PENDING_DOCUMENTS]
    PEND --> SUB[SUBMITTED]
    SUB --> VAL[VALIDATING]
    VAL --> PROC[PROCESSING]
    PROC --> REV[UNDER_REVIEW]
    PROC --> AUTO_APP[AUTO_APPROVED]
    REV --> MAN_APP[MANUALLY_APPROVED]
    REV --> REJ[REJECTED]
    PROC --> FAIL[FAILED]
    VAL --> INFO[ADDITIONAL_INFO_REQUIRED]
    INFO --> PEND
    FAIL --> RETRY[RETRY_PENDING]
    RETRY --> SUB
    AUTO_APP --> COMP[COMPLETED]
    MAN_APP --> COMP
    REJ --> TERM[TERMINATED]
    
    style COMP fill:#90EE90
    style TERM fill:#FFB6C1
    style FAIL fill:#FF6347
    style AUTO_APP fill:#87CEEB
    style MAN_APP fill:#87CEEB
```

## 7. API Specifications

### 7.1 GraphQL Schema (Key Types)

```graphql
# KYC Verification Level
enum VerificationLevel {
  BASIC
  INTERMEDIATE
  ADVANCED
  ENHANCED
}

# Verification Status
enum VerificationStatus {
  INITIATED
  PENDING_DOCUMENTS
  SUBMITTED
  VALIDATING
  PROCESSING
  UNDER_REVIEW
  AUTO_APPROVED
  MANUALLY_APPROVED
  REJECTED
  FAILED
  ADDITIONAL_INFO_REQUIRED
  RETRY_PENDING
  COMPLETED
  TERMINATED
}

# Document Types
enum DocumentType {
  PASSPORT
  NATIONAL_ID
  DRIVERS_LICENSE
  PROOF_OF_ADDRESS
  BANK_STATEMENT
  UTILITY_BILL
  SELFIE
  LIVENESS_VIDEO
}

# Risk Level
enum RiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

# Main KYC Verification Type
type KYCVerification {
  id: ID!
  user: User!
  organization: Organization!
  level: VerificationLevel!
  status: VerificationStatus!
  workflowType: String!
  provider: KYCProvider
  providerCheckId: String
  documents: [KYCDocument!]!
  riskScore: KYCRiskScore
  auditLogs: [KYCAuditLog!]!
  reviewer: Reviewer
  initiatedAt: DateTime!
  completedAt: DateTime
  rejectionReason: String
  metadata: JSON
}

# Document Type
type KYCDocument {
  id: ID!
  verification: KYCVerification!
  documentType: DocumentType!
  documentNumber: String
  issuingCountry: String
  issueDate: Date
  expiryDate: Date
  fileUrl: String
  validationStatus: String!
  extractedData: JSON
  uploadedAt: DateTime!
  validatedAt: DateTime
}

# Risk Score Type
type KYCRiskScore {
  id: ID!
  verification: KYCVerification!
  totalScore: Float!
  scoreBreakdown: JSON!
  riskLevel: RiskLevel!
  riskFactors: [RiskFactor!]!
  assessmentMethod: String!
  calculatedAt: DateTime!
}

# Risk Factor Type
type RiskFactor {
  factor: String!
  score: Float!
  weight: Float!
  description: String
}

# Provider Type
type KYCProvider {
  id: ID!
  name: String!
  type: String!
  enabled: Boolean!
  capabilities: [String!]!
}

# Audit Log Type
type KYCAuditLog {
  id: ID!
  verification: KYCVerification!
  action: String!
  actor: String!
  actorType: String!
  changes: JSON
  timestamp: DateTime!
  ipAddress: String
}

# Queries
type Query {
  # Get verification by ID
  kycVerification(id: ID!): KYCVerification
  
  # Get user's verification history
  userVerifications(userId: ID!, status: VerificationStatus): [KYCVerification!]!
  
  # Get verifications for review (admin/reviewer)
  verificationsForReview(
    level: VerificationLevel
    status: VerificationStatus
    limit: Int
    offset: Int
  ): KYCVerificationConnection!
  
  # Get verification statistics
  verificationStats(
    organizationId: ID
    startDate: DateTime
    endDate: DateTime
  ): KYCStatistics!
  
  # Get document by ID
  kycDocument(id: ID!): KYCDocument
  
  # Get available providers
  kycProviders(enabled: Boolean): [KYCProvider!]!
}

# Mutations
type Mutation {
  # Initiate verification
  initiateKYCVerification(
    userId: ID!
    level: VerificationLevel!
    workflowType: String
    providerId: ID
  ): KYCVerification!
  
  # Upload document
  uploadKYCDocument(
    verificationId: ID!
    documentType: DocumentType!
    file: Upload!
    metadata: JSON
  ): KYCDocument!
  
  # Submit verification for processing
  submitKYCVerification(verificationId: ID!): KYCVerification!
  
  # Manual review actions
  approveKYCVerification(
    verificationId: ID!
    reviewerNotes: String
  ): KYCVerification!
  
  rejectKYCVerification(
    verificationId: ID!
    reason: String!
    reviewerNotes: String
  ): KYCVerification!
  
  requestAdditionalInfo(
    verificationId: ID!
    requirements: [String!]!
    message: String
  ): KYCVerification!
  
  # Provider operations
  retryProviderCheck(verificationId: ID!): KYCVerification!
}

# Subscriptions
type Subscription {
  # Subscribe to verification status changes
  verificationStatusChanged(verificationId: ID!): KYCVerification!
  
  # Subscribe to new verifications for review
  newVerificationForReview(level: VerificationLevel): KYCVerification!
}
```

### 7.2 REST API Endpoints

```
# Verification Endpoints
POST   /api/kyc/verification/initiate          # Initiate new verification
GET    /api/kyc/verification/:id                # Get verification details
PUT    /api/kyc/verification/:id/submit         # Submit verification
POST   /api/kyc/verification/:id/approve        # Approve verification
POST   /api/kyc/verification/:id/reject         # Reject verification
POST   /api/kyc/verification/:id/request-info   # Request additional info
GET    /api/kyc/verification/user/:userId       # Get user's verifications
GET    /api/kyc/verification/review             # Get verifications for review

# Document Endpoints
POST   /api/kyc/document/upload                 # Upload document
GET    /api/kyc/document/:id                    # Get document
DELETE /api/kyc/document/:id                    # Delete document
POST   /api/kyc/document/:id/validate           # Validate document
GET    /api/kyc/document/:id/download           # Download document

# Provider Endpoints
GET    /api/kyc/provider                        # List providers
GET    /api/kyc/provider/:id                    # Get provider details
POST   /api/kyc/provider/:id/check              # Initiate provider check
GET    /api/kyc/provider/:id/status/:checkId    # Check status

# Webhook Endpoints
POST   /api/kyc/webhook/trulio                  # Trulio webhook
POST   /api/kyc/webhook/onfido                  # Onfido webhook
POST   /api/kyc/webhook/:provider               # Generic provider webhook

# Reporting Endpoints
GET    /api/kyc/report/statistics               # Get verification statistics
GET    /api/kyc/report/audit                    # Get audit report
GET    /api/kyc/report/compliance               # Get compliance report
POST   /api/kyc/report/export                   # Export report
```

## 8. Workflow Execution Flows

### 8.1 Complete Verification Flow

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant API
    participant KYCService
    participant WorkflowRunner
    participant Queue
    participant Provider
    participant Reviewer
    participant Notification
    
    User->>Client: Initiate Verification
    Client->>API: POST /kyc/verification/initiate
    API->>KYCService: initiateVerification()
    KYCService->>KYCService: createVerificationRecord()
    KYCService->>WorkflowRunner: startWorkflow(hybrid)
    
    WorkflowRunner->>KYCService: assessComplexity()
    KYCService-->>WorkflowRunner: complexity: SIMPLE
    
    WorkflowRunner->>Queue: enqueue(VerificationJob)
    Queue-->>WorkflowRunner: jobId
    WorkflowRunner-->>API: verification created
    API-->>Client: verification details
    Client-->>User: Upload documents prompt
    
    User->>Client: Upload documents
    Client->>API: POST /kyc/document/upload
    API->>KYCService: uploadDocument()
    KYCService->>Queue: enqueue(DocumentProcessingJob)
    
    Queue->>Queue: process document
    Queue->>KYCService: document processed
    KYCService->>Notification: send notification
    Notification-->>User: documents received
    
    User->>Client: Submit verification
    Client->>API: PUT /kyc/verification/:id/submit
    API->>KYCService: submitVerification()
    KYCService->>WorkflowRunner: continueWorkflow()
    
    WorkflowRunner->>Provider: createCheck()
    Provider-->>WorkflowRunner: checkId
    Provider->>Provider: process check
    Provider->>API: webhook callback
    
    API->>Queue: enqueue(WebhookJob)
    Queue->>KYCService: processProviderResult()
    KYCService->>KYCService: calculateRiskScore()
    
    alt Low Risk
        KYCService->>KYCService: autoApprove()
        KYCService->>Notification: send approval notification
        Notification-->>User: Verification approved
    else High Risk
        KYCService->>Queue: enqueue(ManualReviewJob)
        Queue->>Reviewer: assign for review
        Reviewer->>API: POST /kyc/verification/:id/approve
        API->>KYCService: approveVerification()
        KYCService->>Notification: send approval notification
        Notification-->>User: Verification approved
    end
    
    KYCService->>WorkflowRunner: completeWorkflow()
    WorkflowRunner-->>KYCService: workflow completed
```

### 8.2 Manual Review Process

```mermaid
sequenceDiagram
    participant Queue
    participant ReviewSystem
    participant Reviewer
    participant KYCService
    participant AuditService
    participant User
    
    Queue->>ReviewSystem: ManualReviewJob
    ReviewSystem->>ReviewSystem: assignReviewer()
    ReviewSystem->>Reviewer: Notification: New review assigned
    
    Reviewer->>ReviewSystem: Open verification
    ReviewSystem->>KYCService: getVerificationDetails()
    KYCService-->>ReviewSystem: verification + documents
    ReviewSystem-->>Reviewer: Display details
    
    Reviewer->>Reviewer: Review documents
    Reviewer->>Reviewer: Verify information
    Reviewer->>Reviewer: Check authenticity
    
    alt Approve
        Reviewer->>ReviewSystem: Approve verification
        ReviewSystem->>KYCService: approveVerification(reviewerId, notes)
        KYCService->>AuditService: log approval
        KYCService->>User: Notification: Approved
    else Reject
        Reviewer->>ReviewSystem: Reject verification
        ReviewSystem->>KYCService: rejectVerification(reviewerId, reason)
        KYCService->>AuditService: log rejection
        KYCService->>User: Notification: Rejected with reason
    else Request More Info
        Reviewer->>ReviewSystem: Request additional info
        ReviewSystem->>KYCService: requestAdditionalInfo(requirements)
        KYCService->>AuditService: log request
        KYCService->>User: Notification: Additional info needed
        User->>KYCService: Provide additional info
        KYCService->>Queue: Re-enqueue for review
    end
```

## 9. Security & Compliance

### 9.1 Security Measures

```mermaid
graph TB
    subgraph "Data Protection"
        ENCRYPT[Document Encryption at Rest]
        TLS[TLS Encryption in Transit]
        REDACT[PII Redaction in Logs]
        ACCESS[Access Control]
    end
    
    subgraph "Authentication & Authorization"
        AUTH[Multi-Factor Authentication]
        RBAC[Role-Based Access Control]
        OAUTH[OAuth 2.0 Integration]
        JWT[JWT Token Validation]
    end
    
    subgraph "Audit & Monitoring"
        AUDIT[Comprehensive Audit Logging]
        MONITOR[Real-time Monitoring]
        ALERT[Security Alerts]
        REPORT[Compliance Reporting]
    end
    
    subgraph "Provider Security"
        API_KEY[API Key Management]
        WEBHOOK_SIG[Webhook Signature Verification]
        RATE_LIMIT[Rate Limiting]
        IP_WHITE[IP Whitelisting]
    end
    
    subgraph "Data Retention"
        RETENTION[Retention Policies]
        PURGE[Automated Data Purging]
        ARCHIVE[Secure Archiving]
        GDPR[GDPR Compliance]
    end
```

### 9.2 Compliance Framework

- **GDPR**: Right to access, right to erasure, data portability
- **AML (Anti-Money Laundering)**: Transaction monitoring, suspicious activity reporting
- **KYC Regulations**: Identity verification standards, customer due diligence
- **PCI DSS**: (if handling payment information)
- **SOC 2**: Security controls and audit trails

## 10. Performance & Scalability

### 10.1 Performance Targets

- **Verification Initiation**: < 500ms response time
- **Document Upload**: < 2s for documents up to 10MB
- **Provider API Calls**: < 5s timeout with retry logic
- **Manual Review Assignment**: < 1s
- **Queue Processing**: Min 100 jobs/second throughput
- **Report Generation**: < 10s for standard reports

### 10.2 Scalability Strategy

```mermaid
graph TB
    subgraph "Horizontal Scaling"
        API1[API Instance 1]
        API2[API Instance 2]
        APIn[API Instance N]
        LB[Load Balancer]
    end
    
    subgraph "Queue Scaling"
        WORKER1[Worker 1]
        WORKER2[Worker 2]
        WORKERn[Worker N]
        Q_MANAGER[Queue Manager]
    end
    
    subgraph "Data Layer Scaling"
        DB_PRIMARY[(Primary DB)]
        DB_REPLICA1[(Replica 1)]
        DB_REPLICAn[(Replica N)]
        CACHE[Redis Cache Cluster]
    end
    
    subgraph "Storage Scaling"
        S3[S3/Object Storage]
        CDN[CDN for Document Delivery]
    end
    
    LB --> API1
    LB --> API2
    LB --> APIn
    
    Q_MANAGER --> WORKER1
    Q_MANAGER --> WORKER2
    Q_MANAGER --> WORKERn
    
    API1 --> DB_PRIMARY
    API2 --> DB_REPLICA1
    APIn --> DB_REPLICAn
    
    API1 --> CACHE
    API2 --> CACHE
    APIn --> CACHE
    
    WORKER1 --> S3
    WORKER2 --> S3
    WORKERn --> S3
    
    S3 --> CDN
```

## 11. Configuration

### 11.1 Module Configuration

```typescript
interface KYCModuleConfig {
  providers: {
    trulio: {
      enabled: boolean;
      apiKey: string;
      apiUrl: string;
      webhookSecret: string;
      timeout: number;
    };
    onfido: {
      enabled: boolean;
      apiKey: string;
      apiUrl: string;
      webhookSecret: string;
      timeout: number;
    };
  };
  workflows: {
    default: 'manual' | 'automated' | 'hybrid';
    complexityThresholds: {
      simple: number;
      complex: number;
    };
  };
  verification: {
    levels: {
      basic: VerificationLevelConfig;
      intermediate: VerificationLevelConfig;
      advanced: VerificationLevelConfig;
      enhanced: VerificationLevelConfig;
    };
    documentRetention: {
      days: number;
      archiveAfterDays: number;
    };
  };
  riskAssessment: {
    enabled: boolean;
    autoApproveThreshold: number;
    manualReviewThreshold: number;
    rejectThreshold: number;
  };
  queues: {
    verification: QueueConfig;
    documentProcessing: QueueConfig;
    notification: QueueConfig;
  };
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  compliance: {
    auditLogRetention: number;
    reportingSchedule: string;
    dataProtection: {
      encryptDocuments: boolean;
      encryptionAlgorithm: string;
    };
  };
}
```

## 12. Testing Strategy

### 12.1 Test Coverage

- **Unit Tests**: All services, utilities, and providers (>85% coverage)
- **Integration Tests**: Workflow execution, queue processing, API endpoints
- **E2E Tests**: Complete verification flows from initiation to completion
- **Provider Tests**: Mock provider integrations and webhook handling
- **Security Tests**: Vulnerability scanning, penetration testing
- **Load Tests**: Performance under high load, queue throughput
- **Compliance Tests**: GDPR, AML, and regulatory requirement validation

### 12.2 Test Scenarios

```mermaid
mindmap
  root((KYC Testing))
    Functional
      Manual Verification
      Automated Verification
      Hybrid Verification
      Document Upload
      Provider Integration
    Security
      Authentication
      Authorization
      Encryption
      Audit Logging
      Webhook Validation
    Performance
      Load Testing
      Stress Testing
      Queue Throughput
      API Response Times
      Database Queries
    Compliance
      GDPR Compliance
      AML Requirements
      Data Retention
      Audit Trails
      Reporting
    Integration
      Provider APIs
      Webhook Handling
      Queue Processing
      Workflow Execution
      Notification System
```

## 13. Monitoring & Observability

### 13.1 Metrics

- **Verification Metrics**
  - Total verifications initiated
  - Verification completion rate
  - Average time to complete
  - Approval/rejection rates
  - Provider success rates

- **System Metrics**
  - API response times
  - Queue processing rates
  - Queue depths
  - Worker utilization
  - Database query performance

- **Business Metrics**
  - Cost per verification
  - Provider costs
  - Manual review workload
  - Compliance report generation

### 13.2 Logging

- **Structured Logging**: JSON format for all log entries
- **Log Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- **Log Aggregation**: Centralized logging with ELK/Splunk
- **Audit Logs**: Separate audit log stream for compliance

## 14. Deployment

### 14.1 Environment Configuration

- **Development**: Local development with mock providers
- **Staging**: Full integration with sandbox provider APIs
- **Production**: Production provider APIs, full monitoring

### 14.2 Deployment Strategy

```mermaid
graph LR
    DEV[Development] -->|CI/CD| TEST[Testing]
    TEST -->|Automated Tests Pass| STAGE[Staging]
    STAGE -->|Manual QA| PROD[Production]
    PROD -->|Monitoring| HEALTH[Health Checks]
    HEALTH -->|Issues| ROLLBACK[Rollback]
    ROLLBACK -->|Fix| DEV
```

## 15. Future Enhancements

### 15.1 Roadmap

**Phase 1** (Current Specification)
- Manual verification workflows
- Automated verification with Trulio and Onfido
- Hybrid verification workflows
- Document management
- Risk assessment
- Audit logging

**Phase 2**
- Additional provider integrations
- Machine learning for risk assessment
- Biometric verification (facial recognition, fingerprint)
- Video verification (liveness checks)
- Blockchain-based document verification
- Advanced fraud detection

**Phase 3**
- AI-powered document forgery detection
- Continuous monitoring and re-verification
- Real-time compliance dashboards
- Multi-jurisdiction compliance automation
- Customer risk scoring evolution
- Predictive analytics for verification outcomes

**Phase 4**
- Decentralized identity verification
- Self-sovereign identity integration
- Cross-border verification orchestration
- Regulatory technology (RegTech) automation
- Zero-knowledge proof verification

## 16. Dependencies

### 16.1 Internal Reactory Dependencies

- `reactory-core`: Core type definitions and shared components
  - `core.ReactoryFileService@1.0.0`: File upload, storage, and management
  - `core.ReactoryAuditService@1.0.0`: Audit logging and compliance tracking (to be created)
  - `Audit` model: TypeORM entity for audit records
- `reactory-queue`: Queue management and job processing (BullMQ integration)
- `reactory-workflow`: Workflow orchestration engine (WorkflowRunner)

### 16.2 Client-Side Integration (Existing Components)

The KYC module will leverage existing client-side components for document management:

- **UserHomeFolder Component**: React component (`UserHomeFolder.tsx`) that provides:
  - File browser with folder navigation
  - Document upload with drag-and-drop
  - File selection and multi-selection
  - Integration with `core.ReactoryFileService` via GraphQL
  - Custom hooks: `useUserHomeFiles`, `useFileOperations`, `useFolderState`
  
- **File Upload Pattern**: The existing implementation demonstrates:
  ```typescript
  // Upload using GraphQL mutation
  const uploadResult = await reactory.graphqlMutation(
    UPLOAD_FILE_MUTATION,
    { file, uploadContext, virtualPath }
  );
  ```

The KYC module will extend this pattern with:
- KYC-specific document types and validation
- Verification context linking
- Enhanced metadata for compliance tracking

### 16.3 External Dependencies

- **BullMQ**: Queue management
- **Redis**: Caching and queue backend
- **MongoDB/PostgreSQL**: Primary database
- **AWS S3/Azure Blob**: Document storage
- **Sharp**: Image processing
- **PDF-Parse**: PDF document parsing
- **Tesseract.js**: OCR for document data extraction
- **Node-jose**: JWT and encryption
- **Axios**: HTTP client for provider APIs
- **Joi**: Input validation
- **Winston**: Logging framework

## 17. Success Criteria

The KYC module will be considered successful when:

1. **Functional Requirements Met**
   - Manual verification workflows operational
   - Automated verification with at least 2 providers
   - Hybrid workflows with intelligent routing
   - Document upload and validation working
   - Risk assessment functioning

2. **Performance Requirements Met**
   - API response times < 500ms
   - Queue throughput > 100 jobs/second
   - 99.9% uptime

3. **Security Requirements Met**
   - All documents encrypted at rest
   - All API communications over TLS
   - Audit logging for all actions
   - GDPR compliance verified

4. **Business Requirements Met**
   - Reduces manual review workload by 60%
   - Verification completion time reduced by 50%
   - Provider integration working with 95%+ success rate
   - Compliance reports generated successfully

## 18. Conclusion

The Reactory KYC module provides a comprehensive, scalable, and compliant solution for customer identity verification. By leveraging the Reactory framework's workflow engine, queue system, and modular architecture, the module offers flexibility in verification approaches while maintaining security, auditability, and performance.

The specification emphasizes:
- **Flexibility**: Support for manual, automated, and hybrid workflows
- **Scalability**: Queue-based processing and horizontal scaling
- **Security**: Encryption, audit logging, and access control
- **Compliance**: Built-in support for GDPR, AML, and other regulations
- **Extensibility**: Plugin-based provider integration
- **Observability**: Comprehensive monitoring and reporting

This foundation enables organizations to implement robust KYC processes that adapt to their specific requirements and scale with their growth.
