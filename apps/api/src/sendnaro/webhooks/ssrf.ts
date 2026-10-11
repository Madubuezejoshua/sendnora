import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { AppError } from '@sendnaro/shared';

/**
 * SSRF defence for merchant webhook targets.
 *  - Only http(s) URLs; https is mandatory unless local targets are explicitly allowed (dev/test sandbox).
 *  - Every resolved address is checked against private/loopback/link-local/metadata ranges, and the
 *    connection is made through a `lookup` hook that re-validates at connect time, which defeats DNS rebinding.
 *  - Redirects are never followed.
 *  - Response bodies are capped.
 */
const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net6, prefix, 'ipv6');
}

function isLoopback(address: string): boolean {
  return address === '::1' || address.startsWith('127.');
}

export function isBlockedAddress(address: string, allowLocal: boolean): boolean {
  let ip = address;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) ip = mapped[1]!; // IPv4-mapped IPv6
  const family = net.isIP(ip);
  if (family === 0) return true;
  if (allowLocal && isLoopback(ip)) return false;
  return blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export function assertWebhookUrlShape(raw: string, allowLocal: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('UNPROCESSABLE', 'Webhook URL is not a valid URL');
  }
  if (url.username || url.password) {
    throw new AppError('UNPROCESSABLE', 'Webhook URL must not contain credentials');
  }
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new AppError('UNPROCESSABLE', 'Webhook URL must use https');
  }
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && isBlockedAddress(url.hostname.replace(/^\[|\]$/g, ''), allowLocal)) {
    throw new AppError('UNPROCESSABLE', 'Webhook URL points to a private or reserved address');
  }
  return url;
}

/** Resolves and validates the hostname now (used when an endpoint is registered). */
export async function assertWebhookUrl(raw: string, allowLocal: boolean): Promise<URL> {
  const url = assertWebhookUrlShape(raw, allowLocal);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) === 0 && !(allowLocal && host === 'localhost')) {
    const records = await dns.promises.lookup(host, { all: true }).catch(() => []);
    if (records.length === 0) throw new AppError('UNPROCESSABLE', 'Webhook host does not resolve');
    if (records.some((r) => isBlockedAddress(r.address, allowLocal))) {
      throw new AppError('UNPROCESSABLE', 'Webhook URL resolves to a private or reserved address');
    }
  }
  return url;
}

export interface SafeResponse {
  status: number;
  bodyPreview: string;
}

export function safeRequest(
  raw: string,
  opts: {
    method: string;
    headers: Record<string, string>;
    body: string;
    timeoutMs: number;
    allowLocal: boolean;
  },
): Promise<SafeResponse> {
  const url = assertWebhookUrlShape(raw, opts.allowLocal);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: opts.method,
        headers: { ...opts.headers, 'Content-Length': Buffer.byteLength(opts.body) },
        timeout: opts.timeoutMs,
        // Re-validated at connect time; pins the connection to the vetted address.
        lookup: (hostname, options, callback) => {
          dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
            if (err) return (callback as (e: Error) => void)(err);
            const list = addresses as dns.LookupAddress[];
            const safe = list.filter((a) => !isBlockedAddress(a.address, opts.allowLocal));
            if (safe.length === 0 || safe.length !== list.length) {
              return (callback as (e: Error) => void)(
                new Error('blocked_address: target resolves to a private or reserved address'),
              );
            }
            if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, safe);
            return callback(null, safe[0]!.address, safe[0]!.family);
          });
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size <= 2048) chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, bodyPreview: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(opts.body);
  });
}
