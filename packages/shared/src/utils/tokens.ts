import { customAlphabet, nanoid } from 'nanoid';

// Unambiguous alphabet (no 0/O, 1/I/l) for tokens that might ever be read aloud or typed.
const UNAMBIGUOUS_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const nanoidUnambiguous = customAlphabet(UNAMBIGUOUS_ALPHABET, 32);

/**
 * Generates a cryptographically random, non-sequential public token used for
 * public document links (quote/invoice/receipt view pages), invitation
 * links, and password reset links. Never expose the internal database ID in
 * a public URL — always use one of these instead, and store it in a unique
 * indexed column so it can be revoked independently of the record's id.
 */
export function generatePublicToken(): string {
  return nanoidUnambiguous();
}

/** Shorter token suitable for things a human might need to type, e.g. a recovery code. */
export function generateRecoveryCode(): string {
  const raw = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10)();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

/** Generic opaque random ID (session tokens, API keys before hashing, etc). */
export function generateSecureId(size = 32): string {
  return nanoid(size);
}

export function generateApiKey(): { key: string; prefix: string } {
  const key = `itap_${nanoid(40)}`;
  return { key, prefix: key.slice(0, 12) };
}
