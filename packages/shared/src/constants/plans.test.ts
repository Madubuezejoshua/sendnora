import { describe, expect, it } from 'vitest';
import { isWithinCustomerQuota, isWithinInvoiceQuota, isWithinTeamMemberQuota } from './plans.js';

describe('isWithinInvoiceQuota', () => {
  it('enforces the FREE plan 5-invoice ceiling', () => {
    expect(isWithinInvoiceQuota('FREE', 4)).toBe(true);
    expect(isWithinInvoiceQuota('FREE', 5)).toBe(false);
  });

  it('enforces the STARTER plan 100-invoice ceiling', () => {
    expect(isWithinInvoiceQuota('STARTER', 99)).toBe(true);
    expect(isWithinInvoiceQuota('STARTER', 100)).toBe(false);
  });

  it('applies the fair-use ceiling to BUSINESS/AGENCY "unlimited" plans', () => {
    expect(isWithinInvoiceQuota('BUSINESS', 1999)).toBe(true);
    expect(isWithinInvoiceQuota('BUSINESS', 2000)).toBe(false);
  });
});

describe('isWithinCustomerQuota', () => {
  it('enforces the FREE plan 3-customer ceiling', () => {
    expect(isWithinCustomerQuota('FREE', 2)).toBe(true);
    expect(isWithinCustomerQuota('FREE', 3)).toBe(false);
  });

  it('allows unlimited customers on STARTER and above', () => {
    expect(isWithinCustomerQuota('STARTER', 10_000)).toBe(true);
  });
});

describe('isWithinTeamMemberQuota', () => {
  it('enforces a single member on FREE and STARTER', () => {
    expect(isWithinTeamMemberQuota('FREE', 1)).toBe(false);
    expect(isWithinTeamMemberQuota('STARTER', 1)).toBe(false);
  });

  it('allows up to 5 members on BUSINESS', () => {
    expect(isWithinTeamMemberQuota('BUSINESS', 4)).toBe(true);
    expect(isWithinTeamMemberQuota('BUSINESS', 5)).toBe(false);
  });

  it('allows unlimited members on AGENCY', () => {
    expect(isWithinTeamMemberQuota('AGENCY', 500)).toBe(true);
  });
});
