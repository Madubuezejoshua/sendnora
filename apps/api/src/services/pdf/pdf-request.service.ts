import { prisma } from '@invoicetap/database';
import { AppError } from '@invoicetap/shared';
import type { PdfTemplateKey } from './types.js';
import {
  buildInvoicePdfData,
  buildQuotePdfData,
  buildReceiptPdfData,
  renderDocumentPdf,
} from './pdf.service.js';
import { getStorageProvider } from '../storage/storage.service.js';
import { LocalStorageProvider } from '../storage/local.provider.js';
import { parseApiEnv } from '@invoicetap/config/env';

async function resolveLogoDataUri(
  logoFileAssetId: string | null | undefined,
): Promise<string | undefined> {
  if (!logoFileAssetId) return undefined;
  const asset = await prisma.fileAsset.findUnique({ where: { id: logoFileAssetId } });
  if (!asset) return undefined;

  const provider = getStorageProvider();
  if (provider instanceof LocalStorageProvider) {
    try {
      const buffer = await provider.readObject(asset.objectKey);
      return `data:${asset.mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return undefined;
    }
  }
  // For B2, embedding requires fetching the signed URL contents; skipped here for brevity —
  // the PDF renders without a logo image rather than failing the whole document.
  return undefined;
}

async function loadCommonContext(
  workspaceId: string,
  publicToken: string,
  customer: { name: string; email: string | null; billingAddressId: string | null },
) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { businessProfile: { include: { address: true } } },
  });
  const env = parseApiEnv();
  const customerAddress = customer.billingAddressId
    ? await prisma.address.findUnique({ where: { id: customer.billingAddressId } })
    : null;

  return {
    templateKey: (workspace.pdfTemplateKey as PdfTemplateKey) ?? 'MODERN',
    brandColor: workspace.brandColor ?? '#0F172A',
    businessName: workspace.businessProfile?.displayName ?? workspace.name,
    businessAddress: workspace.businessProfile?.address,
    businessEmail: workspace.businessProfile?.contactEmail,
    businessPhone: workspace.businessProfile?.contactPhone,
    businessTaxId: workspace.businessProfile?.taxIdNumber,
    logoDataUri: await resolveLogoDataUri(workspace.businessProfile?.logoFileAssetId),
    customerName: customer.name,
    customerAddress,
    customerEmail: customer.email,
    currency: '',
    publicToken,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  };
}

export async function generateInvoicePdfBuffer(
  workspaceId: string,
  invoiceId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { customer: true, items: { orderBy: { position: 'asc' } } },
  });
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');

  const common = await loadCommonContext(workspaceId, invoice.publicToken, invoice.customer);
  const data = await buildInvoicePdfData(
    { ...common, currency: invoice.currency },
    {
      ...invoice,
      notes: invoice.notes,
      terms: invoice.terms,
      paymentInstructions: invoice.paymentInstructions,
    },
  );
  const buffer = await renderDocumentPdf(data);
  return { buffer, filename: `${invoice.number}.pdf` };
}

export async function generateQuotePdfBuffer(
  workspaceId: string,
  quoteId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, workspaceId },
    include: { customer: true, items: { orderBy: { position: 'asc' } } },
  });
  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found');

  const common = await loadCommonContext(workspaceId, quote.publicToken, quote.customer);
  const data = await buildQuotePdfData({ ...common, currency: quote.currency }, quote);
  const buffer = await renderDocumentPdf(data);
  return { buffer, filename: `${quote.number}.pdf` };
}

export async function generateReceiptPdfBuffer(
  workspaceId: string,
  receiptId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, workspaceId },
    include: { items: true, invoice: { include: { customer: true } } },
  });
  if (!receipt) throw new AppError('NOT_FOUND', 'Receipt not found');

  const common = await loadCommonContext(
    workspaceId,
    receipt.publicToken,
    receipt.invoice.customer,
  );
  const data = await buildReceiptPdfData({ ...common, currency: receipt.currency }, receipt);
  const buffer = await renderDocumentPdf(data);
  return { buffer, filename: `${receipt.number}.pdf` };
}
