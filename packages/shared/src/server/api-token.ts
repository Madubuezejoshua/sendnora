import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * The trust boundary between apps/web and apps/api.
 *
 * apps/web runs Auth.js and owns the user's browser session (an HTTP-only
 * cookie, validated by Auth.js). apps/web NEVER forwards that session
 * cookie to apps/api. Instead, on every server-side call to the API
 * (Server Components, Route Handlers, Server Actions), apps/web mints a
 * short-lived, signed API token from the already-validated session and
 * sends it as `Authorization: Bearer <token>`. apps/api verifies the
 * token's signature and expiry and trusts nothing else — the workspace ID
 * inside the token is the ONLY workspace context apps/api will ever use;
 * it never reads a workspace id from a query param or body for
 * authorization purposes.
 *
 * Both processes must be configured with the same API_TOKEN_SECRET. This
 * module is safe to import from both a Node server (apps/api) and Next.js
 * server runtime (apps/web) — `jose` uses WebCrypto and has no native
 * dependencies — but it must never be imported into client-side/browser
 * bundles, since minting a token requires the secret.
 */
const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 5 * 60; // short-lived: web mints a fresh one per request

export interface ApiTokenClaims extends JWTPayload {
  sub: string; // userId
  activeWorkspaceId?: string;
  isPlatformAdmin: boolean;
}

export async function signApiToken(
  claims: ApiTokenClaims,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key);
}

export class InvalidApiTokenError extends Error {
  constructor(cause?: unknown) {
    super('Invalid or expired API token');
    this.name = 'InvalidApiTokenError';
    this.cause = cause;
  }
}

export async function verifyApiToken(token: string, secret: string): Promise<ApiTokenClaims> {
  const key = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    if (typeof payload.sub !== 'string') {
      throw new Error('Missing sub claim');
    }
    return payload as ApiTokenClaims;
  } catch (err) {
    throw new InvalidApiTokenError(err);
  }
}
