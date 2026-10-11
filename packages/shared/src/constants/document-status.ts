/**
 * Quote and Invoice state machines.
 *
 * These functions are the single source of truth for which status
 * transitions are legal. Both the API service layer and unit tests import
 * from here so the rules can never drift between "what the code enforces"
 * and "what the tests assert".
 */

export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
  'CANCELLED',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  VIEWED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['CONVERTED', 'CANCELLED'],
  REJECTED: [],
  EXPIRED: ['SENT'], // reissuing an expired quote re-sends it
  CONVERTED: [],
  CANCELLED: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransitionQuote(from, to)) {
    throw new InvalidStatusTransitionError('Quote', from, to);
  }
}

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
  'CANCELLED',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  SENT: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  VIEWED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PAID: ['VOID'], // void-after-paid must be paired with a CreditNote in the service layer
  VOID: [],
  CANCELLED: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransitionInvoice(from, to)) {
    throw new InvalidStatusTransitionError('Invoice', from, to);
  }
}

/** Invoice statuses considered "open" for the purposes of ageing/overdue reports. */
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = [
  'ISSUED',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'OVERDUE',
];

/** An invoice may only be edited in place while it is still a draft. */
export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return status === 'DRAFT';
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly entity: 'Quote' | 'Invoice',
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot transition ${entity} from ${from} to ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export const RECEIPT_STATUSES = ['ISSUED', 'VOID'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'PAYSTACK',
  'FLUTTERWAVE',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
