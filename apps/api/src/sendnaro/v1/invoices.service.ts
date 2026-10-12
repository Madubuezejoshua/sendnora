import { prisma, Prisma, type IssuedDocument } from '@sendnaro/database';
import {
  AppError,
  Money,
  computeDocumentTotals,
  getCurrency,
  isSupportedCurrency,
} from '@sendnaro/shared';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from '../../config/logger.js';
import { renderDocumentPdf } from '../../services/pdf/pdf.service.js';
import { getStorageProvider } from '../../services/storage/storage.service.js';
import type { PdfDocumentData } from '../../services/pdf/types.js';
import type { SnContext } from '../context.js';
import { assertCanSend } from '../entitlement.js';
import { withIdempotency } from '../idempotency.js';
import { parsePublicId, publicId } from '../ids.js';
import { enqueue, registerJob } from '../outbox.js';
import {
  assertChannelsReady,
  assertRecipientCanUse,
  assertScenarioAllowed,
  createChannelDeliveries,
  publicDelivery,
  upsertRecipient,
} from '../recipients.js';
import { emitWebhookEvent } from '../webhooks/dispatch.js';
import type { CreateInvoiceBody } from './schemas.js';

const MAX_MINOR = 10_000_000_000_000; // 1e13 keeps every intermediate value exactly representable
const DEFAULT_BRAND_COLOR = '#0F172A';

/** Frozen at issue time. Later profile edits never change an issued document. */
export interface DocumentSnapshot {
  business: {
    name: string;
    addressLines: string[];
    email?: string;
    phone?: string;
    website?: string;
    taxId?: string;
    footer?: string;
    brandColor: string;
    logoObjectKey?: string;
  };
  customer: { externalCustomerId: string; name: string; email?: string };
  taxMode: 'EXCLUSIVE' | 'INCLUSIVE';
  currency: string;
  lines: {
    description: string;
    quantity: string;
    unitAmountMinor: number;
    taxRatePercent: string;
    taxMinor: number;
    lineTotalMinor: number;
  }[];
  totals: { subtotalMinor: number; discountMinor: number; taxMinor: number; totalMinor: number };
  issueDate: string;
  dueDate?: string;
  notes?: string;
  payment: { status: 'paid' | 'unpaid'; reference?: string };
}

function computeTotals(body: CreateInvoiceBody) {
  if (!isSupportedCurrency(body.currency)) {
    throw new AppError('UNPROCESSABLE', `Unsupported currency "${body.currency}"`);
  }
  const taxMode = body.tax_mode === 'inclusive' ? 'INCLUSIVE' : 'EXCLUSIVE';
  for (const item of body.items) {
    if (Number(item.quantity) * item.unit_amount_minor > MAX_MINOR) {
      throw new AppError('UNPROCESSABLE', 'A line amount is out of the supported range');
    }
  }
  const totals = computeDocumentTotals({
    currency: body.currency,
    taxMode,
    lineItems: body.items.map((item, i) => ({
      id: String(i),
      quantity: item.quantity,
      unitPriceMinorUnits: item.unit_amount_minor,
      taxRatePercent: item.tax_rate_percent ?? 0,
    })),
    documentDiscount: body.discount_minor ? { type: 'FIXED', value: body.discount_minor } : null,
  });
  if (totals.grandTotal.amountMinorUnits > MAX_MINOR || totals.grandTotal.amountMinorUnits < 0) {
    throw new AppError('UNPROCESSABLE', 'The document total is out of the supported range');
  }
  return { totals, taxMode: taxMode as 'EXCLUSIVE' | 'INCLUSIVE' };
}

function businessSnapshot(workspace: {
  name: string;
  brandColor: string | null;
  businessProfile: {
    displayName: string;
    addressText: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    taxIdNumber: string | null;
    invoiceFooter: string | null;
    logo: { objectKey: string } | null;
  } | null;
}): DocumentSnapshot['business'] {
  const p = workspace.businessProfile;
  return {
    name: p?.displayName ?? workspace.name,
    addressLines: (p?.addressText ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    email: p?.contactEmail ?? undefined,
    phone: p?.contactPhone ?? undefined,
    website: p?.website ?? undefined,
    taxId: p?.taxIdNumber ?? undefined,
    footer: p?.invoiceFooter ?? undefined,
    brandColor: workspace.brandColor ?? DEFAULT_BRAND_COLOR,
    logoObjectKey: p?.logo?.objectKey,
  };
}

function numberFor(env: 'SANDBOX' | 'LIVE', type: 'INVOICE' | 'RECEIPT', value: number): string {
  return `${env === 'SANDBOX' ? 'SBX-' : ''}${type === 'INVOICE' ? 'INV' : 'RCT'}-${String(value).padStart(6, '0')}`;
}

export function presentInvoice(
  doc: IssuedDocument,
  deliveries: Parameters<typeof publicDelivery>[0][],
  extra: Record<string, unknown> = {},
) {
  const snap = doc.snapshot as unknown as DocumentSnapshot;
  return {
    id: publicId('invoice', doc.id),
    object: 'invoice',
    status: 'accepted',
    environment: doc.environment.toLowerCase(),
    number: doc.number,
    document_type: doc.documentType.toLowerCase(),
    external_order_id: doc.externalOrderId,
    currency: doc.currency,
    amounts: {
      subtotal_minor: Number(doc.subtotalMinor),
      discount_minor: Number(doc.discountMinor),
      tax_minor: Number(doc.taxMinor),
      total_minor: Number(doc.totalMinor),
    },
    payment: { status: doc.paymentStatus, reference: doc.paymentReference ?? undefined },
    pdf: { status: doc.pdfStorageKey ? 'ready' : 'pending' },
    deliveries: deliveries.map(publicDelivery),
    created_at: doc.createdAt.toISOString(),
    items: snap.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit_amount_minor: l.unitAmountMinor,
      line_total_minor: l.lineTotalMinor,
    })),
    ...extra,
  };
}

export async function createInvoice(
  ctx: SnContext,
  body: CreateInvoiceBody,
  idempotencyKey: string | undefined,
) {
  // Authorization and readiness are decided BEFORE any record, number or job exists.
  await assertCanSend(ctx.workspaceId, ctx.environment);
  const scenario = assertScenarioAllowed(ctx, body.scenario);
  await assertChannelsReady(ctx, body.channels);
  if (body.document_type === 'receipt') {
    if (body.payment.status !== 'paid' || !body.payment.reference) {
      throw new AppError(
        'UNPROCESSABLE',
        'A receipt requires payment.status "paid" and a payment.reference',
      );
    }
  }
  const { totals, taxMode } = computeTotals(body);
  const bodyForHash = { ...body };

  const result = await withIdempotency(
    { workspaceId: ctx.workspaceId, environment: ctx.environment, operation: 'invoices.create' },
    idempotencyKey,
    bodyForHash,
    async (tx) => {
      const workspace = await tx.workspace.findUniqueOrThrow({
        where: { id: ctx.workspaceId },
        include: { businessProfile: { include: { logo: true } } },
      });
      const recipient = await upsertRecipient(
        tx,
        ctx,
        body.customer,
        body.consent?.whatsapp_transactional,
        workspace.countryCode,
      );
      assertRecipientCanUse(recipient, body.channels);

      const type = body.document_type === 'receipt' ? 'RECEIPT' : 'INVOICE';
      const counter = await tx.documentCounter.upsert({
        where: {
          workspaceId_environment_documentType: {
            workspaceId: ctx.workspaceId,
            environment: ctx.environment,
            documentType: type,
          },
        },
        create: {
          workspaceId: ctx.workspaceId,
          environment: ctx.environment,
          documentType: type,
          value: 1,
        },
        update: { value: { increment: 1 } },
      });

      const def = getCurrency(body.currency);
      const snapshot: DocumentSnapshot = {
        business: businessSnapshot(workspace),
        customer: {
          externalCustomerId: body.customer.external_customer_id,
          name: body.customer.name,
          email: body.customer.email,
        },
        taxMode,
        currency: body.currency,
        lines: totals.lines.map((l, i) => ({
          description: body.items[i]!.description,
          quantity: l.quantity,
          unitAmountMinor: l.unitPrice.amountMinorUnits,
          taxRatePercent: l.taxRatePercent,
          taxMinor: l.taxAmount.amountMinorUnits,
          lineTotalMinor: l.lineTotal.amountMinorUnits,
        })),
        totals: {
          subtotalMinor: totals.subtotal.amountMinorUnits,
          discountMinor: totals.totalDiscount.amountMinorUnits,
          taxMinor: totals.totalTax.amountMinorUnits,
          totalMinor: totals.grandTotal.amountMinorUnits,
        },
        issueDate: new Date().toISOString(),
        dueDate: body.due_date,
        notes: body.notes,
        payment: { status: body.payment.status, reference: body.payment.reference },
      };
      void def;

      const doc = await tx.issuedDocument.create({
        data: {
          workspaceId: ctx.workspaceId,
          environment: ctx.environment,
          recipientId: recipient.id,
          documentType: type,
          number: numberFor(ctx.environment, type, counter.value),
          externalOrderId: body.external_order_id,
          paymentStatus: body.payment.status,
          paymentReference: body.payment.reference,
          currency: body.currency,
          subtotalMinor: BigInt(snapshot.totals.subtotalMinor),
          discountMinor: BigInt(snapshot.totals.discountMinor),
          taxMinor: BigInt(snapshot.totals.taxMinor),
          totalMinor: BigInt(snapshot.totals.totalMinor),
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });

      const caption = `${type === 'RECEIPT' ? 'Receipt' : 'Invoice'} ${doc.number} from ${snapshot.business.name}`;
      const deliveries = await createChannelDeliveries(tx, ctx, {
        recipient,
        channels: body.channels,
        kind: 'INVOICE',
        templateKey: type === 'RECEIPT' ? 'receipt' : 'invoice',
        invoiceId: doc.id,
        payload: { caption },
        scenario,
        enqueueNow: false, // released once the PDF exists
      });
      await enqueue(tx, {
        type: 'invoice.render',
        payload: { invoiceId: doc.id },
        workspaceId: ctx.workspaceId,
        environment: ctx.environment,
        dedupeKey: `invoice.render:${doc.id}`,
      });

      return {
        status: 202,
        body: { ...presentInvoice(doc, deliveries), request_id: ctx.requestId },
      };
    },
  );
  return result;
}

export async function getInvoice(ctx: SnContext, publicInvoiceId: string) {
  const id = parsePublicId('invoice', publicInvoiceId);
  // Tenant AND environment scoped: an id from another business or environment is simply "not found".
  const doc = id
    ? await prisma.issuedDocument.findFirst({
        where: { id, workspaceId: ctx.workspaceId, environment: ctx.environment },
      })
    : null;
  if (!doc) throw new AppError('NOT_FOUND', 'Invoice not found');
  const deliveries = await prisma.delivery.findMany({
    where: { invoiceId: doc.id },
    orderBy: { createdAt: 'asc' },
  });
  let pdfUrl: string | undefined;
  if (doc.pdfStorageKey) {
    pdfUrl = await getStorageProvider().getSignedDownloadUrl(doc.pdfStorageKey, 600);
  }
  return {
    ...presentInvoice(
      doc,
      deliveries,
      pdfUrl ? { pdf: { status: 'ready', url: pdfUrl, url_expires_in_seconds: 600 } } : {},
    ),
    request_id: ctx.requestId,
  };
}

// ---------------------------------------------------------------------------------------------
// PDF rendering (background). Generation failure is tracked separately from delivery failure.
// ---------------------------------------------------------------------------------------------

function label(minor: number, currency: string): string {
  const def = getCurrency(currency);
  return `${currency} ${(minor / 10 ** def.minorUnitDigits).toLocaleString('en-US', {
    minimumFractionDigits: def.minorUnitDigits,
    maximumFractionDigits: def.minorUnitDigits,
  })}`;
}

export function snapshotToPdfData(doc: IssuedDocument): PdfDocumentData {
  const s = doc.snapshot as unknown as DocumentSnapshot;
  const sandbox = doc.environment === 'SANDBOX';
  const paid = s.payment.status === 'paid';
  return {
    kind: doc.documentType === 'RECEIPT' ? 'RECEIPT' : 'INVOICE',
    templateKey: 'MODERN',
    brandColor: s.business.brandColor,
    businessName: s.business.name,
    businessAddressLines: s.business.addressLines,
    businessEmail: s.business.email,
    businessPhone: s.business.phone,
    businessTaxId: s.business.taxId,
    customerName: s.customer.name,
    customerAddressLines: [],
    customerEmail: s.customer.email,
    documentNumber: doc.number,
    issueDateLabel: new Date(s.issueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    dueDateLabel: s.dueDate
      ? new Date(s.dueDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : undefined,
    statusLabel: paid ? 'PAID' : 'UNPAID',
    currencyCode: s.currency,
    items: s.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceLabel: label(l.unitAmountMinor, s.currency),
      taxLabel: l.taxMinor ? label(l.taxMinor, s.currency) : undefined,
      lineTotalLabel: label(l.lineTotalMinor, s.currency),
    })),
    subtotalLabel: label(s.totals.subtotalMinor, s.currency),
    discountLabel: s.totals.discountMinor ? label(s.totals.discountMinor, s.currency) : undefined,
    taxLabel: label(s.totals.taxMinor, s.currency),
    grandTotalLabel: label(s.totals.totalMinor, s.currency),
    amountPaidLabel: paid ? label(s.totals.totalMinor, s.currency) : undefined,
    balanceDueLabel: paid ? undefined : label(s.totals.totalMinor, s.currency),
    notes: s.notes,
    paymentInstructions:
      paid && s.payment.reference ? `Payment reference: ${s.payment.reference}` : undefined,
    footerText: s.business.footer,
    poweredByText: 'Delivered with Sendnaro',
    watermarkText: sandbox ? 'SANDBOX - NOT A REAL TRANSACTION' : undefined,
    watermarkColor: sandbox ? '#fecaca' : undefined,
  };
}

/** Reads the issue-time logo from PRIVATE storage via a short-lived link. PNG/JPEG only (what the PDF renderer supports). */
async function loadLogoDataUri(objectKey: string | undefined): Promise<string | undefined> {
  if (!objectKey) return undefined;
  try {
    const url = await getStorageProvider().getSignedDownloadUrl(objectKey, 120);
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) return undefined;
    const type = await fileTypeFromBuffer(buf);
    if (!type || !['image/png', 'image/jpeg'].includes(type.mime)) return undefined;
    return `data:${type.mime};base64,${buf.toString('base64')}`;
  } catch {
    return undefined; // a missing logo must never block a document
  }
}

export async function renderInvoiceJob(invoiceId: string, attempt: number): Promise<void> {
  const doc = await prisma.issuedDocument.findUnique({ where: { id: invoiceId } });
  if (!doc || doc.pdfStorageKey) return; // already rendered: idempotent under redelivery

  try {
    const data = snapshotToPdfData(doc);
    data.logoDataUri = await loadLogoDataUri(
      (doc.snapshot as unknown as DocumentSnapshot).business.logoObjectKey,
    );
    const pdf = await renderDocumentPdf(data);
    const key = `sendnaro/${doc.workspaceId}/${doc.environment.toLowerCase()}/invoices/${doc.id}.pdf`;
    await getStorageProvider().putObject({ key, body: pdf, contentType: 'application/pdf' });

    await prisma.$transaction(async (tx) => {
      await tx.issuedDocument.update({
        where: { id: doc.id },
        data: { pdfStorageKey: key, pdfGeneratedAt: new Date() },
      });
      const queued = await tx.delivery.findMany({ where: { invoiceId: doc.id, status: 'QUEUED' } });
      for (const d of queued) {
        await enqueue(tx, {
          type: 'delivery.send',
          payload: { deliveryId: d.id },
          workspaceId: doc.workspaceId,
          environment: doc.environment,
          dedupeKey: `delivery:${d.id}:1`,
        });
      }
      await emitWebhookEvent(tx, {
        workspaceId: doc.workspaceId,
        environment: doc.environment,
        type: 'invoice.generated',
        data: {
          invoice_id: publicId('invoice', doc.id),
          number: doc.number,
          external_order_id: doc.externalOrderId,
        },
      });
    });
  } catch (err) {
    logger.error({ err, invoiceId }, 'Invoice PDF generation failed');
    if (attempt < 4) throw err; // let the outbox retry with backoff
    // Final failure: generation failed, so the deliveries (which never started) are marked as such.
    await prisma.$transaction(async (tx) => {
      await tx.delivery.updateMany({
        where: { invoiceId: doc.id, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          lastErrorCode: 'pdf_generation_failed',
          lastErrorMessage: 'The document could not be generated',
          failedAt: new Date(),
        },
      });
      await emitWebhookEvent(tx, {
        workspaceId: doc.workspaceId,
        environment: doc.environment,
        type: 'invoice.failed',
        data: { invoice_id: publicId('invoice', doc.id), error_code: 'pdf_generation_failed' },
      });
    });
  }
}

registerJob('invoice.render', async (payload, job) => {
  await renderInvoiceJob(String(payload.invoiceId), job.attempts);
});

export { Money };
