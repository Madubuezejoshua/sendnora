import { Money } from './money.js';
import { Decimal } from './rounding.js';
import { computeDiscountAmount, distributeProportionally, type DiscountSpec } from './discount.js';
import { computeExclusiveTax, computeInclusiveTax, type TaxMode } from './tax.js';

export type { TaxMode, DiscountSpec };

export interface LineItemInput {
  /** Caller-supplied identifier (e.g. the InvoiceItem id) echoed back on the output line. */
  id: string;
  quantity: number | string;
  unitPriceMinorUnits: number;
  taxRatePercent?: number | string;
  discount?: DiscountSpec | null;
}

export interface DocumentTotalsInput {
  currency: string;
  taxMode: TaxMode;
  lineItems: LineItemInput[];
  documentDiscount?: DiscountSpec | null;
  shippingMinorUnits?: number;
  additionalFeesMinorUnits?: number;
}

export interface LineItemTotal {
  id: string;
  quantity: string;
  unitPrice: Money;
  grossAmount: Money;
  lineDiscountAmount: Money;
  documentDiscountShare: Money;
  taxableBase: Money;
  taxRatePercent: string;
  taxAmount: Money;
  lineTotal: Money;
}

export interface DocumentTotals {
  currency: string;
  taxMode: TaxMode;
  lines: LineItemTotal[];
  /** Sum of gross line amounts, before any discount. */
  subtotal: Money;
  totalLineDiscount: Money;
  totalDocumentDiscount: Money;
  totalDiscount: Money;
  /** Tax-exclusive net amount after all discounts, across all lines. */
  netSubtotal: Money;
  totalTax: Money;
  shipping: Money;
  additionalFees: Money;
  grandTotal: Money;
}

/**
 * Computes the full total breakdown for a quote or invoice. This is the ONLY
 * function that should be used to derive totals — the PDF renderer, the API
 * responses, and the paid/outstanding balance calculations must all call
 * this with the same input so numbers can never diverge between surfaces.
 */
export function computeDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  const { currency, taxMode } = input;

  if (input.lineItems.length === 0) {
    const zero = Money.zero(currency);
    return {
      currency,
      taxMode,
      lines: [],
      subtotal: zero,
      totalLineDiscount: zero,
      totalDocumentDiscount: zero,
      totalDiscount: zero,
      netSubtotal: zero,
      totalTax: zero,
      shipping: Money.fromMinorUnits(input.shippingMinorUnits ?? 0, currency),
      additionalFees: Money.fromMinorUnits(input.additionalFeesMinorUnits ?? 0, currency),
      grandTotal: Money.fromMinorUnits(
        (input.shippingMinorUnits ?? 0) + (input.additionalFeesMinorUnits ?? 0),
        currency,
      ),
    };
  }

  const gross = input.lineItems.map((li) => {
    const unitPrice = Money.fromMinorUnits(li.unitPriceMinorUnits, currency);
    const grossAmount = unitPrice.multiply(new Decimal(li.quantity));
    const lineDiscountAmount = computeDiscountAmount(grossAmount, li.discount);
    const afterLineDiscount = grossAmount.subtract(lineDiscountAmount);
    return { input: li, unitPrice, grossAmount, lineDiscountAmount, afterLineDiscount };
  });

  const preDocDiscountSubtotal = gross.reduce(
    (acc, g) => acc.add(g.afterLineDiscount),
    Money.zero(currency),
  );

  const documentDiscountAmount = computeDiscountAmount(
    preDocDiscountSubtotal,
    input.documentDiscount,
  );
  const documentDiscountShares = distributeProportionally(
    documentDiscountAmount,
    gross.map((g) => g.afterLineDiscount),
  );

  const lines: LineItemTotal[] = gross.map((g, i) => {
    const documentDiscountShare = documentDiscountShares[i]!;
    const taxableBase = g.afterLineDiscount.subtract(documentDiscountShare);
    const rate = g.input.taxRatePercent ?? 0;
    const taxAmount =
      taxMode === 'EXCLUSIVE'
        ? computeExclusiveTax(taxableBase, rate)
        : computeInclusiveTax(taxableBase, rate);
    const lineTotal = taxMode === 'EXCLUSIVE' ? taxableBase.add(taxAmount) : taxableBase;

    return {
      id: g.input.id,
      quantity: new Decimal(g.input.quantity).toString(),
      unitPrice: g.unitPrice,
      grossAmount: g.grossAmount,
      lineDiscountAmount: g.lineDiscountAmount,
      documentDiscountShare,
      taxableBase,
      taxRatePercent: new Decimal(rate).toString(),
      taxAmount,
      lineTotal,
    };
  });

  const subtotal = gross.reduce((acc, g) => acc.add(g.grossAmount), Money.zero(currency));
  const totalLineDiscount = gross.reduce(
    (acc, g) => acc.add(g.lineDiscountAmount),
    Money.zero(currency),
  );
  const totalTax = lines.reduce((acc, l) => acc.add(l.taxAmount), Money.zero(currency));
  const sumLineTotal = lines.reduce((acc, l) => acc.add(l.lineTotal), Money.zero(currency));
  const shipping = Money.fromMinorUnits(input.shippingMinorUnits ?? 0, currency);
  const additionalFees = Money.fromMinorUnits(input.additionalFeesMinorUnits ?? 0, currency);

  return {
    currency,
    taxMode,
    lines,
    subtotal,
    totalLineDiscount,
    totalDocumentDiscount: documentDiscountAmount,
    totalDiscount: totalLineDiscount.add(documentDiscountAmount),
    netSubtotal: sumLineTotal.subtract(totalTax),
    totalTax,
    shipping,
    additionalFees,
    grandTotal: sumLineTotal.add(shipping).add(additionalFees),
  };
}

/** Outstanding balance = grand total minus all successful payment allocations, floored at zero. */
export function computeOutstandingBalance(grandTotal: Money, totalPaid: Money): Money {
  const balance = grandTotal.subtract(totalPaid);
  return balance.isNegative() ? Money.zero(grandTotal.currency) : balance;
}
