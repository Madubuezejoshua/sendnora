import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PaystackProvider } from '../../src/services/payments/paystack.provider.js';

describe('PaystackProvider.verifyWebhookSignature', () => {
  const secret = 'sk_test_abc123';
  const provider = new PaystackProvider(secret);

  it('accepts a correctly-signed body', () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 1 } }));
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
  });

  it('rejects a body signed with the wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    const wrongSignature = createHmac('sha512', 'wrong_secret').update(body).digest('hex');
    expect(provider.verifyWebhookSignature(body, wrongSignature)).toBe(false);
  });

  it('rejects a tampered body even with a signature computed for the original', () => {
    const original = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { amount: 1000 } }),
    );
    const signature = createHmac('sha512', secret).update(original).digest('hex');
    const tampered = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { amount: 9999999 } }),
    );
    expect(provider.verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects when no signature header is present', () => {
    const body = Buffer.from('{}');
    expect(provider.verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('extracts the event id from the payload data', () => {
    expect(provider.extractEventId({ data: { id: 12345 } })).toBe('12345');
    expect(provider.extractEventId({ data: {} })).toBeUndefined();
  });
});
