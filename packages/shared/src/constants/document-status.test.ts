import { describe, expect, it } from 'vitest';
import {
  assertInvoiceTransition,
  assertQuoteTransition,
  canTransitionInvoice,
  canTransitionQuote,
  InvalidStatusTransitionError,
  isInvoiceEditable,
} from './document-status.js';

describe('quote state machine', () => {
  it('allows DRAFT -> SENT', () => {
    expect(canTransitionQuote('DRAFT', 'SENT')).toBe(true);
  });

  it('allows SENT -> ACCEPTED and ACCEPTED -> CONVERTED', () => {
    expect(canTransitionQuote('SENT', 'ACCEPTED')).toBe(true);
    expect(canTransitionQuote('ACCEPTED', 'CONVERTED')).toBe(true);
  });

  it('disallows skipping straight from DRAFT to ACCEPTED', () => {
    expect(canTransitionQuote('DRAFT', 'ACCEPTED')).toBe(false);
  });

  it('disallows any transition out of a terminal CONVERTED state', () => {
    expect(canTransitionQuote('CONVERTED', 'DRAFT')).toBe(false);
    expect(canTransitionQuote('CONVERTED', 'CANCELLED')).toBe(false);
  });

  it('throws InvalidStatusTransitionError via the assert helper', () => {
    expect(() => assertQuoteTransition('REJECTED', 'ACCEPTED')).toThrow(
      InvalidStatusTransitionError,
    );
  });
});

describe('invoice state machine', () => {
  it('allows DRAFT -> ISSUED -> SENT -> PARTIALLY_PAID -> PAID', () => {
    expect(canTransitionInvoice('DRAFT', 'ISSUED')).toBe(true);
    expect(canTransitionInvoice('ISSUED', 'SENT')).toBe(true);
    expect(canTransitionInvoice('SENT', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransitionInvoice('PARTIALLY_PAID', 'PAID')).toBe(true);
  });

  it('disallows editing/transitioning a VOID invoice', () => {
    expect(canTransitionInvoice('VOID', 'PAID')).toBe(false);
    expect(canTransitionInvoice('VOID', 'ISSUED')).toBe(false);
  });

  it('disallows going backwards from PAID to SENT', () => {
    expect(canTransitionInvoice('PAID', 'SENT')).toBe(false);
  });

  it('allows PAID -> VOID for the credit-note/void safeguard flow', () => {
    expect(canTransitionInvoice('PAID', 'VOID')).toBe(true);
  });

  it('throws via assertInvoiceTransition on an illegal transition', () => {
    expect(() => assertInvoiceTransition('DRAFT', 'PAID')).toThrow(InvalidStatusTransitionError);
  });

  it('only DRAFT invoices are editable in place', () => {
    expect(isInvoiceEditable('DRAFT')).toBe(true);
    expect(isInvoiceEditable('ISSUED')).toBe(false);
    expect(isInvoiceEditable('PAID')).toBe(false);
  });
});
