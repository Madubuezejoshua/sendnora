import { Money } from './money.js';
import { Decimal } from './rounding.js';

export type DiscountType = 'PERCENTAGE' | 'FIXED';

export interface DiscountSpec {
  type: DiscountType;
  /** For PERCENTAGE: 0-100. For FIXED: a Money-parseable major-unit value is NOT used here — pass minor units via amount. */
  value: number | string;
}

/** Computes the discount amount to subtract from `base`, clamped so it never exceeds `base` or goes negative. */
export function computeDiscountAmount(
  base: Money,
  discount: DiscountSpec | null | undefined,
): Money {
  if (!discount) return Money.zero(base.currency);

  if (discount.type === 'PERCENTAGE') {
    const pct = new Decimal(discount.value);
    if (pct.lessThan(0) || pct.greaterThan(100)) {
      throw new Error(`Percentage discount must be between 0 and 100, got ${discount.value}`);
    }
    const amount = base.multiply(pct.dividedBy(100));
    return clamp(amount, base);
  }

  // FIXED: `value` is a minor-units integer amount in the same currency as `base`.
  const amount = Money.fromMinorUnits(Math.round(Number(discount.value)), base.currency);
  return clamp(amount, base);
}

function clamp(amount: Money, base: Money): Money {
  if (amount.isNegative()) return Money.zero(base.currency);
  if (amount.greaterThan(base)) return base;
  return amount;
}

/**
 * Distributes a document-level discount amount across line items proportionally
 * to each line's weight (its share of the total base), so the sum of the
 * per-line shares always equals the original discount amount exactly. Any
 * leftover minor unit caused by rounding is assigned to the last line.
 */
export function distributeProportionally(totalAmount: Money, weights: Money[]): Money[] {
  const currency = totalAmount.currency;
  const totalWeight = weights.reduce((acc, w) => acc + w.amountMinorUnits, 0);

  if (totalWeight === 0 || weights.length === 0) {
    return weights.map(() => Money.zero(currency));
  }

  const shares: Money[] = [];
  let allocated = 0;

  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]!;
    if (i === weights.length - 1) {
      shares.push(Money.fromMinorUnits(totalAmount.amountMinorUnits - allocated, currency));
      break;
    }
    const share = totalAmount.multiply(new Decimal(w.amountMinorUnits).dividedBy(totalWeight));
    allocated += share.amountMinorUnits;
    shares.push(share);
  }

  return shares;
}
