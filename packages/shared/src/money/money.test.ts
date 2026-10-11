import { describe, expect, it } from 'vitest';
import { Money, sumMoney } from './money.js';

describe('Money', () => {
  it('constructs from minor units', () => {
    const m = Money.fromMinorUnits(1999, 'USD');
    expect(m.amountMinorUnits).toBe(1999);
    expect(m.currency).toBe('USD');
  });

  it('parses major units into minor units correctly', () => {
    expect(Money.fromMajorUnits('19.99', 'USD').amountMinorUnits).toBe(1999);
    expect(Money.fromMajorUnits(19.9, 'USD').amountMinorUnits).toBe(1990);
    expect(Money.fromMajorUnits('1000', 'XOF').amountMinorUnits).toBe(1000); // 0 decimal currency
  });

  it('rejects non-integer minor units', () => {
    expect(() => Money.fromMinorUnits(19.5, 'USD')).not.toThrow(); // truncated via Math.trunc
    expect(Money.fromMinorUnits(19.5, 'USD').amountMinorUnits).toBe(19);
  });

  it('adds and subtracts same-currency amounts', () => {
    const a = Money.fromMinorUnits(1000, 'USD');
    const b = Money.fromMinorUnits(250, 'USD');
    expect(a.add(b).amountMinorUnits).toBe(1250);
    expect(a.subtract(b).amountMinorUnits).toBe(750);
  });

  it('throws on cross-currency arithmetic', () => {
    const usd = Money.fromMinorUnits(1000, 'USD');
    const ngn = Money.fromMinorUnits(1000, 'NGN');
    expect(() => usd.add(ngn)).toThrow(/Currency mismatch/);
  });

  it('multiplies by a decimal rate with round-half-up rounding', () => {
    // 333 * 0.15 = 49.95 -> rounds to 50
    const base = Money.fromMinorUnits(333, 'USD');
    expect(base.multiply(0.15).amountMinorUnits).toBe(50);

    // 100 * 0.125 = 12.5 -> rounds up to 13 (round-half-up)
    expect(Money.fromMinorUnits(100, 'USD').multiply(0.125).amountMinorUnits).toBe(13);
  });

  it('never loses precision to floating point on repeated addition', () => {
    let total = Money.zero('USD');
    for (let i = 0; i < 10; i++) {
      total = total.add(Money.fromMajorUnits('0.1', 'USD'));
    }
    // 10 * 0.10 must be exactly 1.00 (100 minor units) — classic float bug would give 99 or 101
    expect(total.amountMinorUnits).toBe(100);
  });

  it('formats using Intl with currency symbol', () => {
    const m = Money.fromMinorUnits(199900, 'USD');
    expect(m.format('en-US')).toMatch(/\$1,999(\.00)?/);
  });

  it('sums a list of money values', () => {
    const list = [
      Money.fromMinorUnits(100, 'USD'),
      Money.fromMinorUnits(200, 'USD'),
      Money.fromMinorUnits(300, 'USD'),
    ];
    expect(sumMoney(list, 'USD').amountMinorUnits).toBe(600);
  });

  it('compares amounts correctly', () => {
    const a = Money.fromMinorUnits(500, 'USD');
    const b = Money.fromMinorUnits(700, 'USD');
    expect(b.greaterThan(a)).toBe(true);
    expect(a.lessThan(b)).toBe(true);
    expect(a.equals(Money.fromMinorUnits(500, 'USD'))).toBe(true);
  });
});
