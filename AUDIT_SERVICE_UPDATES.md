# ReactoryAuditService Module Tracking Enhancement

## Overview
Enhanced the ReactoryAuditService to support module-level tracking of audit events. This enables the KYC module (and all other modules) to track which module and version generated each audit event.

## Changes Summary

### 1. Audit Model (`Audit.ts`)
**New Fields:**
- `moduleName` (varchar 255) - Tracks which module generated the audit event
  - Examples: 'reactory-core', 'reactory-kyc', 'reactory-auth', etc.
- `moduleVersion` (varchar 255) - Tracks the module version
  - Examples: '1.0.0', '1.1.0', '1.2.0'

**New Index:**
- `@Index(['moduleName', 'moduleVersion'])` - Composite index for efficient filtering

**Additional Improvements:**
- All column types now explicitly declared (better TypeORM compatibility)
- Consistent naming with snake_case for database columns

### 2. ReactoryAuditService (`ReactoryAuditService.ts`)

#### Interface Updates
**IAuditLogParams:**
```typescript
{
  // ... existing fields ...
  moduleName?: string;      // NEW
  moduleVersion?: string;   // NEW
}
```

**IAuditQueryFilter:**
```typescript
{
  // ... existing fields ...
  moduleName?: string | string[];      // NEW - supports single or multiple
  moduleVersion?: string | string[];   // NEW - supports single or multiple
}
```

#### Method Enhancements

**`logAuditEvent()`:**
- Captures `moduleName` and `moduleVersion` from parameters
- Includes module info in signature generation
- Stores module fields in database
- Enhanced logging to show module context: `[moduleName@moduleVersion]`

**`queryAuditLogs()`:**
- Added `moduleName` filter (supports array of strings or single string)
- Added `moduleVersion` filter (supports array of strings or single string)
- Efficient SQL queries with proper parameter binding

**`generateComplianceReport()`:**
- Added `byModule` grouping in statistics
- Added `byModuleVersion` grouping in statistics
- Enables module-specific compliance reporting

**`formatLogForExport()`:**
- Includes `moduleName` in export data
- Includes `moduleVersion` in export data

**`convertToCsv()`:**
- Added 'Module Name' column
- Added 'Module Version' column
- Updated CSV header and row mapping

### 3. GraphQL Schema (`Audit.graphql`)

**AuditLog Type:**
```graphql
type AuditLog {
  # ... existing fields ...
  moduleName: String        # NEW
  moduleVersion: String     # NEW
}
```

**AuditQueryFilter Input:**
```graphql
input AuditQueryFilter {
  # ... existing fields ...
  moduleName: [String!]      # NEW - array filter
  moduleVersion: [String!]   # NEW - array filter
}
```

### 4. Resolver (`AuditResolver.ts`)
- Fixed import path for resolver decorator
- Compatible with new schema fields

## Usage Examples

### Example 1: Logging KYC Event with Module Info
```typescript
await auditService.logAuditEvent({
  action: 'verify_user',
  source: 'reactory-kyc',
  resourceType: 'kyc_verification',
  resourceId: verificationId,
  eventType: 'create',
  moduleName: 'reactory-kyc',      // Track which module
  moduleVersion: '1.0.0',          // Track version
  success: true
});
```

### Example 2: Query Audit Logs for KYC Module
```typescript
// Get all KYC module events
const { logs } = await auditService.queryAuditLogs({
  moduleName: 'reactory-kyc',
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31')
});

// Get events from multiple modules
const { logs } = await auditService.queryAuditLogs({
  moduleName: ['reactory-kyc', 'reactory-auth', 'reactory-user'],
  eventType: ['create', 'update']
});

// Get events from specific module version
const { logs } = await auditService.queryAuditLogs({
  moduleName: 'reactory-kyc',
  moduleVersion: '1.0.0'
});
```

### Example 3: GraphQL Query
```graphql
query GetKYCModuleAudit {
  auditLogs(filter: {
    moduleName: ["reactory-kyc"],
    moduleVersion: ["1.0.0", "1.1.0"],
    eventType: ["create", "approve", "reject"],
    startDate: "2025-11-01T00:00:00Z",
    limit: 100
  }) {
    logs {
      id
      action
      moduleName
      moduleVersion
      resourceType
      resourceId
      success
      createdAt
    }
    total
  }
}
```

### Example 4: Compliance Report by Module
```typescript
const report = await auditService.generateComplianceReport({
  startDate: new Date('2025-11-01'),
  endDate: new Date('2025-11-30'),
  organizationId: 'org123',
  format: 'json'
});

// Report includes:
// - statistics.byModule: { 'reactory-kyc': 150, 'reactory-auth': 75, ... }
// - statistics.byModuleVersion: { '1.0.0': 200, '1.1.0': 25 }
```

## Benefits

1. **Module Attribution**: Every audit event can be traced to its originating module
2. **Version Tracking**: Track which version of a module performed actions
3. **Debugging**: Easier to debug issues by filtering logs by module
4. **Compliance**: Module-specific compliance reports
5. **Performance Monitoring**: Track performance across module versions
6. **Rollback Intelligence**: Identify issues introduced in specific versions

## Database Migration Notes

When deploying this update, the database will need to add two new columns:
- `module_name` (varchar 255, nullable, indexed)
- `module_version` (varchar 255, nullable, indexed)

The composite index `[module_name, module_version]` should be created for optimal query performance.

## Backward Compatibility

✅ Fully backward compatible:
- New fields are optional (nullable)
- Existing audit logs will have NULL values for these fields
- Old code can continue to work without providing module information
- Queries without module filters will continue to work as before

## Git Commit

**Branch**: `feature/kyc-module`  
**Commit**: `e9e29c5d`  
**Date**: November 18, 2025

---

**Updated By**: Reactory KYC Implementation Team  
**Date**: November 18, 2025

