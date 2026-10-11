import { describe, expect, it } from 'vitest';
import { InvalidApiTokenError, signApiToken, verifyApiToken } from './api-token.js';

const SECRET = 'a'.repeat(32);

describe('signApiToken / verifyApiToken', () => {
  it('round-trips claims through sign and verify', async () => {
    const token = await signApiToken(
      { sub: 'user_1', activeWorkspaceId: 'ws_1', isPlatformAdmin: false },
      SECRET,
    );
    const claims = await verifyApiToken(token, SECRET);
    expect(claims.sub).toBe('user_1');
    expect(claims.activeWorkspaceId).toBe('ws_1');
    expect(claims.isPlatformAdmin).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signApiToken({ sub: 'user_1', isPlatformAdmin: false }, SECRET);
    await expect(verifyApiToken(token, 'b'.repeat(32))).rejects.toThrow(InvalidApiTokenError);
  });

  it('rejects an expired token', async () => {
    const token = await signApiToken({ sub: 'user_1', isPlatformAdmin: false }, SECRET, -10);
    await expect(verifyApiToken(token, SECRET)).rejects.toThrow(InvalidApiTokenError);
  });

  it('rejects a tampered token', async () => {
    const token = await signApiToken({ sub: 'user_1', isPlatformAdmin: false }, SECRET);
    const tampered = token.slice(0, -2) + 'xx';
    await expect(verifyApiToken(tampered, SECRET)).rejects.toThrow(InvalidApiTokenError);
  });

  it('carries the isPlatformAdmin claim through', async () => {
    const token = await signApiToken({ sub: 'admin_1', isPlatformAdmin: true }, SECRET);
    const claims = await verifyApiToken(token, SECRET);
    expect(claims.isPlatformAdmin).toBe(true);
  });
});
