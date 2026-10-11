import { describe, expect, it } from 'vitest';
import { Money } from './money.js';
import { computeExclusiveTax, computeInclusiveTax } from './tax.js';

describe('computeExclusiveTax', () => {
  it('computes a simple percentage on top of the base', () => {
    const base = Money.fromMinorUnits(10000, 'USD'); // $100
    const tax = computeExclusiveTax(base, 7.5);
    expect(tax.amountMinorUnits).toBe(750); // $7.50
  });

  it('rejects a negative rate', () => {
    expect(() => computeExclusiveTax(Money.fromMinorUnits(100, 'USD'), -1)).toThrow();
  });
});

describe('computeInclusiveTax', () => {
  it('extracts the tax component from a tax-inclusive amount', () => {
    // $107.50 inclusive of 7.5% tax => net = 107.50 / 1.075 = 100.00, tax = 7.50
    const inclusive = Money.fromMinorUnits(10750, 'USD');
    const tax = computeInclusiveTax(inclusive, 7.5);
    expect(tax.amountMinorUnits).toBe(750);
  });

  it('returns zero tax for a zero rate', () => {
    const inclusive = Money.fromMinorUnits(10000, 'USD');
    expect(computeInclusiveTax(inclusive, 0).amountMinorUnits).toBe(0);
  });
});
