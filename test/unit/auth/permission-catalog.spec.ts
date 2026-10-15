import { auditPermissionContracts } from '../../../scripts/audit-permission-contracts';

describe('Role and permission code contracts', () => {
  it('keeps template grants, API guards and available frontend permission references in the canonical catalog', () => {
    const result = auditPermissionContracts();
    expect(result.roles).toBe(10);
    expect(result.backendReferences).toBeGreaterThan(200);
    expect(result.issues).toEqual([]);
  });
});
