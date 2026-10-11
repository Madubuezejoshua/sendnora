import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { getCurrency } from '@invoicetap/shared';
import { DocumentPdf } from './document.js';
import type { PdfDocumentData, PdfLineItem, PdfTemplateKey } from './types.js';

function formatMoneyLabel(minorUnits: number, currencyCode: string): string {
  const def = getCurrency(currencyCode);
  const major = minorUnits / 10 ** def.minorUnitDigits;
  return `${currencyCode} ${major.toLocaleString('en-US', { minimumFractionDigits: def.minorUnitDigits, maximumFractionDigits: def.minorUnitDigits })}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function addressLines(
  address:
    | {
        line1: string;
        line2?: string | null;
        city: string;
        state?: string | null;
        postalCode?: string | null;
        countryCode: string;
      }
    | null
    | undefined,
): string[] {
  if (!address) return [];
  return [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
    address.countryCode,
  ].filter((v): v is string => Boolean(v));
}

async function buildQrCodeDataUri(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 200 });
}

interface CommonBuildParams {
  templateKey: PdfTemplateKey;
  brandColor: string;
  businessName: string;
  businessAddress?: {
    line1: string;
    line2?: string | null;
    city: string;
    state?: string | null;
    postalCode?: string | null;
    countryCode: string;
  } | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  businessTaxId?: string | null;
  logoDataUri?: string;
  customerName: string;
  customerAddress?: {
    line1: string;
    line2?: string | null;
    city: string;
    state?: string | null;
    postalCode?: string | null;
    countryCode: string;
  } | null;
  customerEmail?: string | null;
  currency: string;
  publicToken: string;
  appUrl: string;
}

interface DocumentItemLike {
  description: string;
  /** Accepts a plain number/string or a Prisma.Decimal (anything with toString()), so callers can pass DB rows directly. */
  quantity: { toString(): string };
  unitPriceMinorUnits: number;
  taxAmountMinorUnits?: number;
  lineTotalMinorUnits: number;
}

function toPdfLineItems(items: DocumentItemLike[], currency: string): PdfLineItem[] {
  return items.map((i) => ({
    description: i.description,
    quantity: String(i.quantity),
    unitPriceLabel: formatMoneyLabel(i.unitPriceMinorUnits, currency),
    taxLabel:
      i.taxAmountMinorUnits !== undefined
        ? formatMoneyLabel(i.taxAmountMinorUnits, currency)
        : undefined,
    lineTotalLabel: formatMoneyLabel(i.lineTotalMinorUnits, currency),
  }));
}

export async function buildInvoicePdfData(
  common: CommonBuildParams,
  invoice: {
    number: string;
    status: string;
    issueDate: Date;
    dueDate: Date;
    items: DocumentItemLike[];
    subtotalMinorUnits: number;
    totalDiscountMinorUnits: number;
    totalTaxMinorUnits: number;
    shippingMinorUnits: number;
    grandTotalMinorUnits: number;
    amountPaidMinorUnits: number;
    notes?: string | null;
    terms?: string | null;
    paymentInstructions?: string | null;
  },
): Promise<PdfDocumentData> {
  const verificationUrl = `${common.appUrl}/i/${common.publicToken}`;
  const balanceDue = invoice.grandTotalMinorUnits - invoice.amountPaidMinorUnits;

  return {
    kind: 'INVOICE',
    templateKey: common.templateKey,
    brandColor: common.brandColor,
    businessName: common.businessName,
    businessAddressLines: addressLines(common.businessAddress),
    businessEmail: common.businessEmail ?? undefined,
    businessPhone: common.businessPhone ?? undefined,
    businessTaxId: common.businessTaxId ?? undefined,
    logoDataUri: common.logoDataUri,
    customerName: common.customerName,
    customerAddressLines: addressLines(common.customerAddress),
    customerEmail: common.customerEmail ?? undefined,
    documentNumber: invoice.number,
    issueDateLabel: formatDateLabel(invoice.issueDate),
    dueDateLabel: formatDateLabel(invoice.dueDate),
    statusLabel: invoice.status.replace('_', ' '),
    currencyCode: common.currency,
    items: toPdfLineItems(invoice.items, common.currency),
    subtotalLabel: formatMoneyLabel(invoice.subtotalMinorUnits, common.currency),
    discountLabel:
      invoice.totalDiscountMinorUnits > 0
        ? formatMoneyLabel(invoice.totalDiscountMinorUnits, common.currency)
        : undefined,
    taxLabel: formatMoneyLabel(invoice.totalTaxMinorUnits, common.currency),
    shippingLabel:
      invoice.shippingMinorUnits > 0
        ? formatMoneyLabel(invoice.shippingMinorUnits, common.currency)
        : undefined,
    grandTotalLabel: formatMoneyLabel(invoice.grandTotalMinorUnits, common.currency),
    amountPaidLabel:
      invoice.amountPaidMinorUnits > 0
        ? formatMoneyLabel(invoice.amountPaidMinorUnits, common.currency)
        : undefined,
    balanceDueLabel: balanceDue > 0 ? formatMoneyLabel(balanceDue, common.currency) : undefined,
    notes: invoice.notes ?? undefined,
    terms: invoice.terms ?? undefined,
    paymentInstructions: invoice.paymentInstructions ?? undefined,
    qrCodeDataUri: await buildQrCodeDataUri(verificationUrl),
    verificationUrl,
    watermarkText:
      invoice.status === 'DRAFT'
        ? 'DRAFT'
        : invoice.status === 'VOID'
          ? 'VOID'
          : invoice.status === 'PAID'
            ? 'PAID'
            : undefined,
  };
}

export async function buildQuotePdfData(
  common: CommonBuildParams,
  quote: {
    number: string;
    status: string;
    issueDate: Date;
    expiryDate?: Date | null;
    items: DocumentItemLike[];
    subtotalMinorUnits: number;
    totalDiscountMinorUnits: number;
    totalTaxMinorUnits: number;
    shippingMinorUnits: number;
    grandTotalMinorUnits: number;
    notes?: string | null;
    terms?: string | null;
  },
): Promise<PdfDocumentData> {
  const verificationUrl = `${common.appUrl}/q/${common.publicToken}`;
  return {
    kind: 'QUOTE',
    templateKey: common.templateKey,
    brandColor: common.brandColor,
    businessName: common.businessName,
    businessAddressLines: addressLines(common.businessAddress),
    businessEmail: common.businessEmail ?? undefined,
    businessPhone: common.businessPhone ?? undefined,
    businessTaxId: common.businessTaxId ?? undefined,
    logoDataUri: common.logoDataUri,
    customerName: common.customerName,
    customerAddressLines: addressLines(common.customerAddress),
    customerEmail: common.customerEmail ?? undefined,
    documentNumber: quote.number,
    issueDateLabel: formatDateLabel(quote.issueDate),
    dueDateLabel: quote.expiryDate ? formatDateLabel(quote.expiryDate) : undefined,
    statusLabel: quote.status,
    currencyCode: common.currency,
    items: toPdfLineItems(quote.items, common.currency),
    subtotalLabel: formatMoneyLabel(quote.subtotalMinorUnits, common.currency),
    discountLabel:
      quote.totalDiscountMinorUnits > 0
        ? formatMoneyLabel(quote.totalDiscountMinorUnits, common.currency)
        : undefined,
    taxLabel: formatMoneyLabel(quote.totalTaxMinorUnits, common.currency),
    shippingLabel:
      quote.shippingMinorUnits > 0
        ? formatMoneyLabel(quote.shippingMinorUnits, common.currency)
        : undefined,
    grandTotalLabel: formatMoneyLabel(quote.grandTotalMinorUnits, common.currency),
    notes: quote.notes ?? undefined,
    terms: quote.terms ?? undefined,
    qrCodeDataUri: await buildQrCodeDataUri(verificationUrl),
    verificationUrl,
    watermarkText:
      quote.status === 'EXPIRED' ? 'EXPIRED' : quote.status === 'REJECTED' ? 'DECLINED' : undefined,
  };
}

export async function buildReceiptPdfData(
  common: CommonBuildParams,
  receipt: {
    number: string;
    paidAt: Date;
    paymentMethod: string;
    amountMinorUnits: number;
    items: DocumentItemLike[];
    status: string;
  },
): Promise<PdfDocumentData> {
  const verificationUrl = `${common.appUrl}/r/${common.publicToken}`;
  return {
    kind: 'RECEIPT',
    templateKey: common.templateKey,
    brandColor: common.brandColor,
    businessName: common.businessName,
    businessAddressLines: addressLines(common.businessAddress),
    businessEmail: common.businessEmail ?? undefined,
    businessPhone: common.businessPhone ?? undefined,
    businessTaxId: common.businessTaxId ?? undefined,
    logoDataUri: common.logoDataUri,
    customerName: common.customerName,
    customerAddressLines: addressLines(common.customerAddress),
    customerEmail: common.customerEmail ?? undefined,
    documentNumber: receipt.number,
    issueDateLabel: formatDateLabel(receipt.paidAt),
    statusLabel: `Paid via ${receipt.paymentMethod.replace('_', ' ')}`,
    currencyCode: common.currency,
    items: toPdfLineItems(receipt.items, common.currency),
    subtotalLabel: formatMoneyLabel(receipt.amountMinorUnits, common.currency),
    taxLabel: formatMoneyLabel(0, common.currency),
    grandTotalLabel: formatMoneyLabel(receipt.amountMinorUnits, common.currency),
    qrCodeDataUri: await buildQrCodeDataUri(verificationUrl),
    verificationUrl,
    watermarkText: receipt.status === 'VOID' ? 'VOID' : 'PAID',
  };
}

export async function renderDocumentPdf(data: PdfDocumentData): Promise<Buffer> {
  // @react-pdf/renderer's types require the root element to literally be a <Document>;
  // DocumentPdf wraps one internally, so this is safe at runtime despite the type mismatch.
  return renderToBuffer(
    React.createElement(DocumentPdf, { data }) as Parameters<typeof renderToBuffer>[0],
  );
}
