import { parsePhoneNumberWithError, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

export interface NormalizedPhone {
  /** E.164 format, e.g. "+2348012345678" — always store and dial this form. */
  e164: string;
  countryCode: string;
  nationalNumber: string;
  /** Digits only, no "+", suitable for wa.me links, e.g. "2348012345678". */
  whatsappDigits: string;
}

export class InvalidPhoneNumberError extends Error {
  constructor(raw: string) {
    super(`"${raw}" is not a valid phone number`);
    this.name = 'InvalidPhoneNumberError';
  }
}

/**
 * Normalizes a user-entered phone number to E.164. `defaultCountry` should
 * come from the workspace's configured country so a locally-formatted
 * number (e.g. "0801 234 5678") resolves correctly without a country code.
 */
export function normalizePhoneNumber(raw: string, defaultCountry?: CountryCode): NormalizedPhone {
  try {
    const parsed = parsePhoneNumberWithError(raw, defaultCountry);
    if (!parsed.isValid()) {
      throw new InvalidPhoneNumberError(raw);
    }
    const e164 = parsed.number;
    return {
      e164,
      countryCode: parsed.country ?? '',
      nationalNumber: parsed.nationalNumber,
      whatsappDigits: e164.replace(/^\+/, ''),
    };
  } catch {
    throw new InvalidPhoneNumberError(raw);
  }
}

export function isValidPhone(raw: string, defaultCountry?: CountryCode): boolean {
  try {
    return isValidPhoneNumber(raw, defaultCountry);
  } catch {
    return false;
  }
}

/** Builds a wa.me click-to-chat URL with a pre-filled, URL-encoded message. */
export function buildWhatsAppClickToChatUrl(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/^\+/, '');
  const params = new URLSearchParams({ text: message });
  return `https://wa.me/${digits}?${params.toString()}`;
}
