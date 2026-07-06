/**
 * Impersonation token service tests
 */

import { describe, it, expect } from 'vitest';
import {
  createImpersonationToken,
  verifyImpersonationToken,
  isValidCompanyUuid,
} from './impersonation.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '33333333-3333-4333-8333-333333333333';

describe('impersonation.service', () => {
  it('validates UUID format', () => {
    expect(isValidCompanyUuid(COMPANY_ID)).toBe(true);
    expect(isValidCompanyUuid('00000000-0000-0000-0000-000000000003')).toBe(true);
    expect(isValidCompanyUuid('not-a-uuid')).toBe(false);
  });

  it('creates and verifies a token for the same user', () => {
    const token = createImpersonationToken(USER_ID, COMPANY_ID);
    expect(verifyImpersonationToken(token, USER_ID)).toBe(COMPANY_ID);
  });

  it('rejects token for a different user', () => {
    const token = createImpersonationToken(USER_ID, COMPANY_ID);
    expect(verifyImpersonationToken(token, OTHER_USER)).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const token = createImpersonationToken(USER_ID, COMPANY_ID);
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(verifyImpersonationToken(tampered, USER_ID)).toBeNull();
  });
});
