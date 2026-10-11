import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getWebEnv } from '@/lib/env';

/**
 * Sandbox playground relay. The console page holds a SANDBOX key in memory only and sends it in
 * `X-Sandbox-Key`; this route forwards the call to the real /api/v1 with a normal Authorization header.
 *
 * Safety rails: a signed-in session is required (this is not an open relay), only `sn_test_` keys are
 * accepted (a live key can never be used from the browser), and only product endpoints are reachable.
 */
const ALLOWED = /^(ping|invoices|otp|notifications|deliveries|telegram|sandbox)(\/|$)/;

async function relay(req: NextRequest, path: string[]): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'unauthenticated', message: 'Sign in to use the playground' } }, { status: 401 });
  }
  const key = req.headers.get('x-sandbox-key') ?? '';
  if (!/^sn_test_[A-Za-z0-9_-]{43}$/.test(key)) {
    return NextResponse.json(
      { error: { code: 'sandbox_only', message: 'The playground only accepts sandbox keys (sn_test_...)' } },
      { status: 403 },
    );
  }
  const joined = path.join('/');
  if (!ALLOWED.test(joined)) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Unknown endpoint' } }, { status: 404 });
  }

  const env = getWebEnv();
  const base = env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL;
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
  const idem = req.headers.get('idempotency-key');
  const res = await fetch(`${base}/api/v1/${joined}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(idem ? { 'Idempotency-Key': idem } : {}),
    },
    body: hasBody ? await req.text() : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, { params }: Ctx) {
  return relay(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return relay(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return relay(req, (await params).path);
}
