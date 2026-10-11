import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppClickToChatUrl,
  InvalidPhoneNumberError,
  isValidPhone,
  normalizePhoneNumber,
} from './phone.js';

describe('normalizePhoneNumber', () => {
  it('normalizes a full international number to E.164', () => {
    const result = normalizePhoneNumber('+234 801 234 5678');
    expect(result.e164).toBe('+2348012345678');
    expect(result.countryCode).toBe('NG');
    expect(result.whatsappDigits).toBe('2348012345678');
  });

  it('normalizes a local number given a default country', () => {
    const result = normalizePhoneNumber('0801 234 5678', 'NG');
    expect(result.e164).toBe('+2348012345678');
  });

  it('throws InvalidPhoneNumberError for garbage input', () => {
    expect(() => normalizePhoneNumber('not a phone number')).toThrow(InvalidPhoneNumberError);
  });

  it('throws for a number missing a country and country code', () => {
    expect(() => normalizePhoneNumber('12345')).toThrow(InvalidPhoneNumberError);
  });
});

describe('isValidPhone', () => {
  it('returns true for a valid number', () => {
    expect(isValidPhone('+14155552671')).toBe(true);
  });

  it('returns false for an invalid number instead of throwing', () => {
    expect(isValidPhone('abc')).toBe(false);
  });
});

describe('buildWhatsAppClickToChatUrl', () => {
  it('builds a wa.me URL with a URL-encoded message', () => {
    const url = buildWhatsAppClickToChatUrl('+2348012345678', 'Hello & welcome!');
    expect(url).toContain('https://wa.me/2348012345678');
    expect(url).toContain('text=Hello');
    expect(url).not.toContain(' ');
  });
});
