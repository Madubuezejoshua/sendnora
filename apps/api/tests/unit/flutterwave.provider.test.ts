import { describe, expect, it } from 'vitest';
import { FlutterwaveProvider } from '../../src/services/payments/flutterwave.provider.js';

describe('FlutterwaveProvider.verifyWebhookSignature', () => {
  const webhookHash = 'my-configured-secret-hash';
  const provider = new FlutterwaveProvider('sk_test_x', webhookHash, () => 2);

  it('accepts a matching verif-hash header', () => {
    expect(provider.verifyWebhookSignature(Buffer.from('{}'), webhookHash)).toBe(true);
  });

  it('rejects a mismatched header', () => {
    expect(provider.verifyWebhookSignature(Buffer.from('{}'), 'not-the-secret')).toBe(false);
  });

  it('rejects when no header is present', () => {
    expect(provider.verifyWebhookSignature(Buffer.from('{}'), undefined)).toBe(false);
  });

  it('extracts the event id from the payload data', () => {
    expect(provider.extractEventId({ data: { id: 987 } })).toBe('987');
  });
});
