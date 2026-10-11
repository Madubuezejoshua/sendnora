import { describe, expect, it } from 'vitest';
import { Money } from './money.js';
import { computeDiscountAmount, distributeProportionally } from './discount.js';

describe('computeDiscountAmount', () => {
  it('returns zero for null/undefined discount', () => {
    const base = Money.fromMinorUnits(1000, 'USD');
    expect(computeDiscountAmount(base, null).amountMinorUnits).toBe(0);
    expect(computeDiscountAmount(base, undefined).amountMinorUnits).toBe(0);
  });

  it('computes percentage discount', () => {
    const base = Money.fromMinorUnits(10000, 'USD'); // $100.00
    const discount = computeDiscountAmount(base, { type: 'PERCENTAGE', value: 10 });
    expect(discount.amountMinorUnits).toBe(1000); // $10.00
  });

  it('computes fixed discount in minor units', () => {
    const base = Money.fromMinorUnits(10000, 'USD');
    const discount = computeDiscountAmount(base, { type: 'FIXED', value: 1500 });
    expect(discount.amountMinorUnits).toBe(1500);
  });

  it('clamps a fixed discount larger than the base', () => {
    const base = Money.fromMinorUnits(1000, 'USD');
    const discount = computeDiscountAmount(base, { type: 'FIXED', value: 5000 });
    expect(discount.amountMinorUnits).toBe(1000);
  });

  it('rejects percentage discounts outside 0-100', () => {
    const base = Money.fromMinorUnits(1000, 'USD');
    expect(() => computeDiscountAmount(base, { type: 'PERCENTAGE', value: 150 })).toThrow();
  });
});

describe('distributeProportionally', () => {
  it('distributes an amount across weighted lines summing exactly to the total', () => {
    const total = Money.fromMinorUnits(100, 'USD');
    const weights = [
      Money.fromMinorUnits(333, 'USD'),
      Money.fromMinorUnits(333, 'USD'),
      Money.fromMinorUnits(334, 'USD'),
    ];
    const shares = distributeProportionally(total, weights);
    const sum = shares.reduce((acc, s) => acc + s.amountMinorUnits, 0);
    expect(sum).toBe(100);
    expect(shares).toHaveLength(3);
  });

  it('returns all-zero shares when total weight is zero', () => {
    const total = Money.fromMinorUnits(500, 'USD');
    const weights = [Money.zero('USD'), Money.zero('USD')];
    const shares = distributeProportionally(total, weights);
    expect(shares.every((s) => s.amountMinorUnits === 0)).toBe(true);
  });

  it('handles a single line by giving it the full amount', () => {
    const total = Money.fromMinorUnits(777, 'USD');
    const shares = distributeProportionally(total, [Money.fromMinorUnits(1, 'USD')]);
    expect(shares[0]!.amountMinorUnits).toBe(777);
  });
});
