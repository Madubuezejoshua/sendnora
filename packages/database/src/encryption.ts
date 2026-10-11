import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Application-level encryption for secrets stored at rest (workspace
 * payment-provider secret keys, 2FA TOTP secrets). Uses AES-256-GCM keyed
 * by APP_ENCRYPTION_KEY. This is intentionally separate from password
 * hashing (./password.ts): these values must be *recoverable* (the API
 * needs the plaintext Paystack secret key to call Paystack), whereas
 * passwords must never be recoverable.
 *
 * Ciphertext format: base64(iv):base64(authTag):base64(encrypted)
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(appEncryptionKey: string): Buffer {
  // SHA-256 the configured secret down to exactly 32 bytes regardless of its raw length.
  return createHash('sha256').update(appEncryptionKey).digest();
}

export function encryptSecret(plainText: string, appEncryptionKey: string): string {
  const key = deriveKey(appEncryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
    ':',
  );
}

export function decryptSecret(ciphertext: string, appEncryptionKey: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed ciphertext');
  }
  const key = deriveKey(appEncryptionKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** One-way hash for values we only ever need to compare, never recover (reset tokens, recovery codes, API keys). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
