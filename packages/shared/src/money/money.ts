import { getCurrency } from '../constants/currencies.js';
import { Decimal, roundToMinorUnit } from './rounding.js';

/**
 * An immutable monetary value stored as an integer count of minor units
 * (e.g. cents for USD, kobo for NGN) plus an ISO 4217 currency code.
 *
 * Never do arithmetic on `amountMinorUnits` with native JS `number` math
 * beyond integer add/subtract of the SAME currency — for anything
 * involving a rate (tax, discount, exchange), go through Decimal via the
 * `multiply` helper so rounding only happens once, at the end, via
 * ./rounding.ts.
 */
export class Money {
  private constructor(
    public readonly amountMinorUnits: number,
    public readonly currency: string,
  ) {
    if (!Number.isInteger(amountMinorUnits)) {
      throw new Error(`Money amount must be an integer minor-unit value, got ${amountMinorUnits}`);
    }
  }

  static fromMinorUnits(amountMinorUnits: number, currency: string): Money {
    return new Money(Math.trunc(amountMinorUnits), currency.toUpperCase());
  }

  /** Parses a decimal major-unit string/number (e.g. "19.99") into minor units. */
  static fromMajorUnits(amountMajorUnits: number | string, currency: string): Money {
    const def = getCurrency(currency);
    const minor = new Decimal(amountMajorUnits).times(new Decimal(10).pow(def.minorUnitDigits));
    return new Money(roundToMinorUnit(minor), currency.toUpperCase());
  }

  static zero(currency: string): Money {
    return new Money(0, currency.toUpperCase());
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinorUnits + other.amountMinorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinorUnits - other.amountMinorUnits, this.currency);
  }

  negate(): Money {
    return new Money(-this.amountMinorUnits, this.currency);
  }

  /** Multiplies by an arbitrary-precision rate (e.g. a tax or discount rate) and rounds once. */
  multiply(rate: Decimal | number | string): Money {
    const result = new Decimal(this.amountMinorUnits).times(new Decimal(rate));
    return new Money(roundToMinorUnit(result), this.currency);
  }

  isZero(): boolean {
    return this.amountMinorUnits === 0;
  }

  isNegative(): boolean {
    return this.amountMinorUnits < 0;
  }

  isPositive(): boolean {
    return this.amountMinorUnits > 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinorUnits === other.amountMinorUnits;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinorUnits > other.amountMinorUnits;
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinorUnits < other.amountMinorUnits;
  }

  /** Returns the amount as a major-unit decimal number (e.g. 1999 cents -> 19.99). Display only. */
  toMajorUnits(): number {
    const def = getCurrency(this.currency);
    return new Decimal(this.amountMinorUnits)
      .dividedBy(new Decimal(10).pow(def.minorUnitDigits))
      .toNumber();
  }

  toJSON(): { amountMinorUnits: number; currency: string } {
    return { amountMinorUnits: this.amountMinorUnits, currency: this.currency };
  }

  /** Locale-aware display string, e.g. "$19.99" or "₦1,000". Falls back gracefully if Intl lacks the currency. */
  format(locale = 'en-US'): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency,
        currencyDisplay: 'symbol',
      }).format(this.toMajorUnits());
    } catch {
      const def = getCurrency(this.currency);
      return `${def.symbol}${this.toMajorUnits().toFixed(def.minorUnitDigits)}`;
    }
  }
}

export function sumMoney(amounts: Money[], currency: string): Money {
  return amounts.reduce((acc, m) => acc.add(m), Money.zero(currency));
}
