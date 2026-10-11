import Decimal from 'decimal.js';

/**
 * Centralized rounding policy for all monetary calculations.
 *
 * Sendnaro uses round-half-up (a.k.a. "commercial rounding") at the
 * minor-unit boundary, which is the convention most small businesses and
 * tax authorities expect on an invoice line. This is the ONLY place that
 * should call Decimal's rounding — every other module must delegate here
 * so the policy can be changed in one place if requirements change.
 */
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/** Rounds a Decimal amount (in minor units) to the nearest integer minor unit. */
export function roundToMinorUnit(amount: Decimal | number | string): number {
  return new Decimal(amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export { Decimal };
