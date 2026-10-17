/**
 * Regression tests for the KYC service DI contract.
 *
 * `src/services/index.ts` binds each declared `dependencies` entry onto the
 * service instance:
 *
 *   1. if `svc.set<Alias>` is a function, call it; otherwise
 *   2. assign `svc[<alias>] = resolvedDependency`.
 *
 * The KYC services declared `auditService` (and, for KYCService, the
 * `documentService` and `riskService`) as dependency aliases but exposed them
 * as getter-only properties. Step 2 therefore threw
 *
 *   TypeError: Cannot set property auditService of #<...> which has only a getter
 *
 * and the ServiceManager aborted initialisation of the whole service.
 *
 * These tests reproduce the framework's binding algorithm exactly (the real
 * binder is not exported as a unit) and would have failed with that TypeError
 * before the setters were added.
 */

import { getService, serviceRegister } from '@reactory/server-core/services';
import { KYCServiceDefinition, default as KYCService } from '../KYCService';
import { KYCAuditServiceDefinition, default as KYCAuditService } from '../KYCAuditService';
import { ReportingServiceDefinition, default as ReportingService } from '../ReportingService';
import { RiskAssessmentServiceDefinition } from '../RiskAssessmentService';
import { KYCDocumentServiceDefinition } from '../KYCDocumentService';

const CORE_AUDIT_SERVICE_ID = 'core.ReactoryAuditService@1.0.0';

interface DependencyDeclaration {
  id: string;
  alias: string;
}

function createContext(services: Record<string, any> = {}): any {
  return {
    getService: jest.fn((id: string) => services[id] ?? null),
    hasRole: jest.fn(() => true),
    user: { _id: { toString: () => 'test-user' }, email: 'test@example.com' },
    partner: { _id: 'test-partner' },
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function createAuditServiceStub(): any {
  return {
    logAuditEvent: jest.fn().mockResolvedValue({ _id: 'audit-1' }),
    generateAuditReport: jest.fn().mockResolvedValue({}),
    queryAuditLogs: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
  };
}

/**
 * Exact copy of the binding logic in src/services/index.ts (getService).
 * Keeping it in the test means a change to the framework contract that the
 * KYC services no longer satisfy will surface here.
 */
function bindDependenciesLikeServiceManager(
  instance: any,
  resolved: Record<string, any>,
): void {
  Object.keys(resolved).forEach((alias) => {
    const setterName = `set${alias.substring(0, 1).toUpperCase()}${alias.substring(1)}`;
    if (typeof instance?.[setterName] === 'function') {
      instance[setterName](resolved[alias]);
    } else {
      // The pre-fix code path: throws for accessor properties without a setter.
      instance[alias] = resolved[alias];
    }
  });
}

describe('reactory-kyc service dependency injection', () => {
  describe('auditService dependency (declared alias on every affected service)', () => {
    const cases: Array<[string, any]> = [
      ['RiskAssessmentService', RiskAssessmentServiceDefinition],
      ['KYCAuditService', KYCAuditServiceDefinition],
      ['ReportingService', ReportingServiceDefinition],
      ['KYCService', KYCServiceDefinition],
    ];

    it.each(cases)('%s binds the auditService dependency without throwing', (_name, definition) => {
      const auditService = createAuditServiceStub();
      const instance = definition.service({}, createContext());

      expect(instance).toBeDefined();
      expect(typeof instance.setAuditService).toBe('function');

      expect(() =>
        bindDependenciesLikeServiceManager(instance, { auditService }),
      ).not.toThrow();

      // The injected instance must be the one actually used by the service.
      expect((instance as any).auditService).toBe(auditService);
    });
  });

  describe('KYCService additional dependencies', () => {
    it('binds documentService and riskService as well as auditService', () => {
      const documentService = { getDocument: jest.fn() };
      const riskService = { getRiskScore: jest.fn() };
      const auditService = createAuditServiceStub();

      const instance: KYCService = KYCServiceDefinition.service({}, createContext());

      expect(() =>
        bindDependenciesLikeServiceManager(instance, {
          documentService,
          riskService,
          auditService,
        }),
      ).not.toThrow();

      expect((instance as any).documentService).toBe(documentService);
      expect((instance as any).riskService).toBe(riskService);
      expect((instance as any).auditService).toBe(auditService);
    });
  });

  describe('KYCAuditService behaviour', () => {
    it('writes KYC audit events through the injected ReactoryAuditService', async () => {
      const auditService = createAuditServiceStub();
      const context = createContext();
      const instance = KYCAuditServiceDefinition.service({}, context) as KYCAuditService;

      bindDependenciesLikeServiceManager(instance, { auditService });

      await instance.logVerificationEvent({
        action: 'approved',
        verificationId: 'verification-1',
        outcome: 'success',
        details: { reason: 'documents valid' },
      });

      expect(auditService.logAuditEvent).toHaveBeenCalledTimes(1);
      expect(auditService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'kyc.verification.approved',
          resourceType: 'kyc_verification',
          resourceId: 'verification-1',
          moduleName: 'reactory-kyc',
        }),
      );
      // Dependency injection must not be bypassed by the context fallback.
      expect(context.getService).not.toHaveBeenCalledWith(CORE_AUDIT_SERVICE_ID);
    });
  });

  describe('real ServiceManager binder (src/services getService)', () => {
    const KYC_SERVICE_IDS = [
      'reactory-kyc.KYCDocumentService@1.0.0',
      'reactory-kyc.RiskAssessmentService@1.0.0',
      'reactory-kyc.KYCAuditService@1.0.0',
      'reactory-kyc.KYCService@1.0.0',
      'reactory-kyc.ReportingService@1.0.0',
    ];

    const stubDefinitions = [
      KYCDocumentServiceDefinition,
      RiskAssessmentServiceDefinition,
      KYCAuditServiceDefinition,
      KYCServiceDefinition,
      ReportingServiceDefinition,
    ];

    const coreServiceIds = [
      CORE_AUDIT_SERVICE_ID,
      'core.ReactoryFileService@1.0.0',
    ];

    let context: any;

    beforeAll(() => {
      const register = (id: string, service: () => any) => {
        serviceRegister[id] = { id, dependencies: [], service } as any;
      };

      coreServiceIds.forEach((id) => register(id, () => ({
        logAuditEvent: jest.fn().mockResolvedValue({}),
        getFile: jest.fn(),
      })));

      stubDefinitions.forEach((definition) => {
        serviceRegister[definition.id] = definition;
      });
    });

    afterAll(() => {
      [...coreServiceIds, ...KYC_SERVICE_IDS].forEach((id) => {
        delete serviceRegister[id];
      });
    });

    beforeEach(() => {
      context = createContext();
      context.state = {};
      // Mirror ReactoryContext: resolving a service delegates to the framework.
      context.getService = jest.fn((id: string) => getService(id, {}, context));
    });

    it.each(KYC_SERVICE_IDS)('resolves %s via getService without a getter-only error', (id) => {
      let instance: any;
      expect(() => {
        instance = context.getService(id);
      }).not.toThrow();

      expect(instance).toBeDefined();
      expect(instance.nameSpace).toBe('reactory-kyc');
    });
  });

  describe('lazy context fallback', () => {
    it('resolves the audit service from the context when nothing was injected', () => {
      const auditService = createAuditServiceStub();
      const context = createContext({ [CORE_AUDIT_SERVICE_ID]: auditService });
      const instance = ReportingServiceDefinition.service({}, context) as ReportingService;

      expect((instance as any).auditService).toBe(auditService);
      expect(context.getService).toHaveBeenCalledWith(CORE_AUDIT_SERVICE_ID);
    });

    it('resolves the KYC audit service (not the core one) for KYCService', () => {
      const kycAuditService = createAuditServiceStub();
      const context = createContext({ 'reactory-kyc.KYCAuditService@1.0.0': kycAuditService });
      const instance = KYCServiceDefinition.service({}, context) as KYCService;

      expect((instance as any).auditService).toBe(kycAuditService);
      expect(context.getService).toHaveBeenCalledWith('reactory-kyc.KYCAuditService@1.0.0');
    });
  });
});
