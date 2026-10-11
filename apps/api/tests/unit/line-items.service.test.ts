import { describe, expect, it } from 'vitest';
import { computeAndShapeLineItems } from '../../src/services/line-items.service.js';

describe('computeAndShapeLineItems', () => {
  it('shapes totals and per-line Prisma create rows consistently', () => {
    const result = computeAndShapeLineItems({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        {
          description: 'Design work',
          quantity: 2,
          unitPriceMinorUnits: 5000,
          taxRatePercent: 10,
          discount: null,
        },
        {
          description: 'Consulting',
          quantity: 1,
          unitPriceMinorUnits: 20000,
          taxRatePercent: 10,
          discount: null,
        },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.description).toBe('Design work');
    expect(result.items[0]?.position).toBe(0);
    expect(result.items[1]?.position).toBe(1);

    // 2*5000 + 1*20000 = 30000 subtotal, 10% tax = 3000, grand total 33000
    expect(result.documentTotals.subtotalMinorUnits).toBe(30000);
    expect(result.documentTotals.totalTaxMinorUnits).toBe(3000);
    expect(result.documentTotals.grandTotalMinorUnits).toBe(33000);

    // The per-line shaped rows must sum to the same grand total the totals object reports.
    const sumOfLineTotals = result.totals.lines.reduce(
      (acc, l) => acc + l.lineTotal.amountMinorUnits,
      0,
    );
    expect(
      sumOfLineTotals +
        result.documentTotals.shippingMinorUnits +
        result.documentTotals.additionalFeesMinorUnits,
    ).toBe(result.documentTotals.grandTotalMinorUnits);
  });

  it('carries a document-level discount and shipping/fees through to the shaped output', () => {
    const result = computeAndShapeLineItems({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        {
          description: 'Item',
          quantity: 1,
          unitPriceMinorUnits: 10000,
          taxRatePercent: 0,
          discount: null,
        },
      ],
      documentDiscount: { type: 'FIXED', value: 1000 },
      shippingMinorUnits: 500,
      additionalFeesMinorUnits: 200,
    });

    expect(result.documentTotals.totalDiscountMinorUnits).toBe(1000);
    expect(result.documentTotals.shippingMinorUnits).toBe(500);
    expect(result.documentTotals.additionalFeesMinorUnits).toBe(200);
    // (10000 - 1000) + 500 + 200 = 9700
    expect(result.documentTotals.grandTotalMinorUnits).toBe(9700);
  });

  it('preserves the caller-supplied productId on each shaped line', () => {
    const result = computeAndShapeLineItems({
      currency: 'USD',
      taxMode: 'EXCLUSIVE',
      lineItems: [
        {
          description: 'Item',
          quantity: 1,
          unitPriceMinorUnits: 1000,
          taxRatePercent: 0,
          productId: 'prod_123',
        },
      ],
    });
    expect(result.items[0]?.productId).toBe('prod_123');
  });
});
