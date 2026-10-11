import { describe, expect, it } from 'vitest';
import { Money } from './money.js';
import { computeDocumentTotals, computeOutstandingBalance } from './totals.js';

describe('computeDocumentTotals', () => {
  it('returns all-zero totals for an empty line item list', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [],
    });
    expect(totals.grandTotal.amountMinorUnits).toBe(0);
    expect(totals.lines).toHaveLength(0);
  });

  it('computes a simple single-line exclusive-tax invoice', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        { id: 'l1', quantity: 2, unitPriceMinorUnits: 5000, taxRatePercent: 10 }, // 2 x $50 = $100, +10% tax
      ],
    });
    expect(totals.subtotal.amountMinorUnits).toBe(10000);
    expect(totals.totalTax.amountMinorUnits).toBe(1000);
    expect(totals.grandTotal.amountMinorUnits).toBe(11000);
    expect(totals.lines[0]!.lineTotal.amountMinorUnits).toBe(11000);
  });

  it('computes a simple single-line inclusive-tax invoice', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'INCLUSIVE',
      lineItems: [
        { id: 'l1', quantity: 1, unitPriceMinorUnits: 10750, taxRatePercent: 7.5 }, // $107.50 incl. 7.5% tax
      ],
    });
    expect(totals.totalTax.amountMinorUnits).toBe(750);
    expect(totals.grandTotal.amountMinorUnits).toBe(10750); // tax already included, not added again
    expect(totals.netSubtotal.amountMinorUnits).toBe(10000);
  });

  it('applies a line-level percentage discount before tax', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        {
          id: 'l1',
          quantity: 1,
          unitPriceMinorUnits: 10000,
          taxRatePercent: 10,
          discount: { type: 'PERCENTAGE', value: 20 },
        },
      ],
    });
    // 100 - 20% = 80 taxable base, +10% tax = 8 => total 88
    expect(totals.lines[0]!.taxableBase.amountMinorUnits).toBe(8000);
    expect(totals.totalTax.amountMinorUnits).toBe(800);
    expect(totals.grandTotal.amountMinorUnits).toBe(8800);
  });

  it('distributes a document-level discount proportionally across multiple lines and taxes the remainder', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        { id: 'l1', quantity: 1, unitPriceMinorUnits: 6000, taxRatePercent: 10 },
        { id: 'l2', quantity: 1, unitPriceMinorUnits: 4000, taxRatePercent: 10 },
      ],
      documentDiscount: { type: 'PERCENTAGE', value: 10 }, // 10% off the $100 subtotal = $10
    });

    expect(totals.totalDocumentDiscount.amountMinorUnits).toBe(1000);
    // Lines proportionally discounted: l1 gets 60%, l2 gets 40% of the $10 discount
    expect(totals.lines[0]!.documentDiscountShare.amountMinorUnits).toBe(600);
    expect(totals.lines[1]!.documentDiscountShare.amountMinorUnits).toBe(400);
    // Taxable bases: l1 = 6000-600=5400, l2=4000-400=3600 => tax 540+360=900
    expect(totals.totalTax.amountMinorUnits).toBe(900);
    // Grand total: subtotal 10000 - discount 1000 + tax 900 = 9900
    expect(totals.grandTotal.amountMinorUnits).toBe(9900);
  });

  it('includes shipping and additional fees in the grand total but not in taxable base', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [{ id: 'l1', quantity: 1, unitPriceMinorUnits: 10000, taxRatePercent: 0 }],
      shippingMinorUnits: 500,
      additionalFeesMinorUnits: 200,
    });
    expect(totals.shipping.amountMinorUnits).toBe(500);
    expect(totals.additionalFees.amountMinorUnits).toBe(200);
    expect(totals.grandTotal.amountMinorUnits).toBe(10700);
  });

  it('supports fractional quantities (e.g. hours billed)', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [{ id: 'l1', quantity: 2.5, unitPriceMinorUnits: 10000, taxRatePercent: 0 }], // 2.5 hrs @ $100/hr
    });
    expect(totals.grandTotal.amountMinorUnits).toBe(25000);
  });

  it('handles multiple different tax rates per line correctly', () => {
    const totals = computeDocumentTotals({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        { id: 'l1', quantity: 1, unitPriceMinorUnits: 10000, taxRatePercent: 5 },
        { id: 'l2', quantity: 1, unitPriceMinorUnits: 10000, taxRatePercent: 15 },
      ],
    });
    expect(totals.lines[0]!.taxAmount.amountMinorUnits).toBe(500);
    expect(totals.lines[1]!.taxAmount.amountMinorUnits).toBe(1500);
    expect(totals.totalTax.amountMinorUnits).toBe(2000);
  });
});

describe('computeOutstandingBalance', () => {
  it('subtracts total paid from grand total', () => {
    const grandTotal = Money.fromMinorUnits(10000, 'USD');
    const paid = Money.fromMinorUnits(4000, 'USD');
    expect(computeOutstandingBalance(grandTotal, paid).amountMinorUnits).toBe(6000);
  });

  it('floors at zero when overpaid', () => {
    const grandTotal = Money.fromMinorUnits(10000, 'USD');
    const paid = Money.fromMinorUnits(15000, 'USD');
    expect(computeOutstandingBalance(grandTotal, paid).amountMinorUnits).toBe(0);
  });
});
