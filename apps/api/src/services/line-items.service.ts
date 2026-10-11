import {
  computeDocumentTotals,
  type DocumentLineItemInput,
  type DiscountSpec,
  type TaxMode,
} from '@sendnaro/shared';

export interface DocumentTotalsRequest {
  currency: string;
  taxMode: TaxMode;
  lineItems: DocumentLineItemInput[];
  documentDiscount?: DiscountSpec | null;
  shippingMinorUnits?: number;
  additionalFeesMinorUnits?: number;
}

/**
 * Bridges the API's validated request shape (packages/shared/validation) to
 * the pure totals calculator (packages/shared/money) and back into Prisma
 * nested-create rows. Used by quotes, invoices and recurring invoices so
 * the three document types can never compute totals differently.
 */
export function computeAndShapeLineItems(request: DocumentTotalsRequest) {
  const totals = computeDocumentTotals({
    currency: request.currency,
    taxMode: request.taxMode,
    documentDiscount: request.documentDiscount,
    shippingMinorUnits: request.shippingMinorUnits,
    additionalFeesMinorUnits: request.additionalFeesMinorUnits,
    lineItems: request.lineItems.map((li, i) => ({
      id: String(i),
      quantity: li.quantity,
      unitPriceMinorUnits: li.unitPriceMinorUnits,
      taxRatePercent: li.taxRatePercent,
      discount: li.discount,
    })),
  });

  const items = totals.lines.map((line, i) => {
    const input = request.lineItems[i]!;
    return {
      position: i,
      productId: input.productId,
      description: input.description,
      quantity: line.quantity,
      unitPriceMinorUnits: line.unitPrice.amountMinorUnits,
      taxRatePercent: line.taxRatePercent,
      discountType: input.discount?.type,
      discountValue: input.discount?.value,
      taxableBaseMinorUnits: line.taxableBase.amountMinorUnits,
      taxAmountMinorUnits: line.taxAmount.amountMinorUnits,
      lineTotalMinorUnits: line.lineTotal.amountMinorUnits,
    };
  });

  return {
    totals,
    items,
    documentTotals: {
      documentDiscountType: request.documentDiscount?.type,
      documentDiscountValue: request.documentDiscount?.value,
      shippingMinorUnits: request.shippingMinorUnits ?? 0,
      additionalFeesMinorUnits: request.additionalFeesMinorUnits ?? 0,
      subtotalMinorUnits: totals.subtotal.amountMinorUnits,
      totalDiscountMinorUnits: totals.totalDiscount.amountMinorUnits,
      totalTaxMinorUnits: totals.totalTax.amountMinorUnits,
      grandTotalMinorUnits: totals.grandTotal.amountMinorUnits,
    },
  };
}
