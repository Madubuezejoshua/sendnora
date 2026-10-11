import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing (Argon2id). Lives in @sendnaro/database — a
 * server-only package — rather than @sendnaro/shared, so it can never be
 * accidentally pulled into a client-side bundle. Both apps/web (Auth.js
 * Credentials provider) and apps/api (registration/password-change) import
 * this module directly.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // ~19 MiB, OWASP-recommended minimum for Argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainText: string): Promise<string> {
  return hash(plainText, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, plainText: string): Promise<boolean> {
  try {
    return await verify(hashValue, plainText);
  } catch {
    return false;
  }
}
