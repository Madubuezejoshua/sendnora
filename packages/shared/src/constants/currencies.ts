/**
 * Supported currencies and their minor-unit precision (decimal digits).
 * All money is stored as an integer count of minor units (e.g. cents/kobo),
 * never as a float — see ../money/money.ts.
 */
export interface CurrencyDefinition {
  code: string; // ISO 4217
  name: string;
  symbol: string;
  minorUnitDigits: number; // 0 for JPY-style, 2 for USD-style
}

export const CURRENCIES: CurrencyDefinition[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', minorUnitDigits: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', minorUnitDigits: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', minorUnitDigits: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', minorUnitDigits: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', minorUnitDigits: 2 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', minorUnitDigits: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', minorUnitDigits: 2 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', minorUnitDigits: 0 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', minorUnitDigits: 2 },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', minorUnitDigits: 0 },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', minorUnitDigits: 0 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', minorUnitDigits: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', minorUnitDigits: 2 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'RF', minorUnitDigits: 0 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', minorUnitDigits: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', minorUnitDigits: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorUnitDigits: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', minorUnitDigits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorUnitDigits: 0 },
];

export const CURRENCY_BY_CODE: Record<string, CurrencyDefinition> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

export const DEFAULT_CURRENCY = 'USD';

export function getCurrency(code: string): CurrencyDefinition {
  const currency = CURRENCY_BY_CODE[code.toUpperCase()];
  if (!currency) {
    throw new Error(`Unsupported currency code: ${code}`);
  }
  return currency;
}

export function isSupportedCurrency(code: string): boolean {
  return code.toUpperCase() in CURRENCY_BY_CODE;
}
