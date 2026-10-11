import { Money } from './money.js';
import { Decimal } from './rounding.js';

export type TaxMode = 'EXCLUSIVE' | 'INCLUSIVE';

/** Tax on a tax-exclusive base: simple percentage of the base. */
export function computeExclusiveTax(base: Money, taxRatePercent: number | string): Money {
  const rate = new Decimal(taxRatePercent);
  assertValidRate(rate);
  return base.multiply(rate.dividedBy(100));
}

/**
 * Extracts the tax component from a tax-INCLUSIVE amount, i.e. `amount` already
 * contains the tax. tax = amount - amount / (1 + rate/100).
 */
export function computeInclusiveTax(
  amountIncludingTax: Money,
  taxRatePercent: number | string,
): Money {
  const rate = new Decimal(taxRatePercent);
  assertValidRate(rate);
  const divisor = new Decimal(1).plus(rate.dividedBy(100));
  const net = amountIncludingTax.multiply(new Decimal(1).dividedBy(divisor));
  return amountIncludingTax.subtract(net);
}

function assertValidRate(rate: Decimal): void {
  if (rate.lessThan(0)) {
    throw new Error(`Tax rate cannot be negative, got ${rate.toString()}`);
  }
}
