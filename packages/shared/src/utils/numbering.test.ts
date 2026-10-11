import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NUMBERING_FORMATS,
  formatDocumentNumber,
  validateNumberingFormat,
} from './numbering.js';

describe('formatDocumentNumber', () => {
  it('formats an invoice number with year and zero-padding', () => {
    const result = formatDocumentNumber(DEFAULT_NUMBERING_FORMATS.INVOICE, 7, 2026);
    expect(result).toBe('INV-2026-0007');
  });

  it('formats without year when disabled', () => {
    const result = formatDocumentNumber(
      { prefix: 'INV', padding: 3, includeYear: false, separator: '-' },
      42,
      2026,
    );
    expect(result).toBe('INV-042');
  });

  it('does not truncate sequence numbers wider than the padding', () => {
    const result = formatDocumentNumber(
      { prefix: 'INV', padding: 4, includeYear: false, separator: '-' },
      123456,
      2026,
    );
    expect(result).toBe('INV-123456');
  });
});

describe('validateNumberingFormat', () => {
  it('normalizes and uppercases the prefix', () => {
    const format = validateNumberingFormat({ prefix: ' inv-' });
    expect(format.prefix).toBe('INV');
  });

  it('rejects an empty prefix', () => {
    expect(() => validateNumberingFormat({ prefix: '' })).toThrow();
  });

  it('rejects padding out of range', () => {
    expect(() => validateNumberingFormat({ prefix: 'INV', padding: 0 })).toThrow();
    expect(() => validateNumberingFormat({ prefix: 'INV', padding: 20 })).toThrow();
  });
});
