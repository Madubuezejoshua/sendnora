import { NextRequest, NextResponse } from 'next/server';
import { mintApiToken } from '@/lib/api-client';
import { getWebEnv } from '@/lib/env';

/**
 * Same-origin proxy from the browser to apps/api. Client Components never
 * hold `API_TOKEN_SECRET` (it must never reach the browser), so every
 * client-side mutation goes through this route instead of calling apps/api
 * directly: the browser calls `/api/proxy/customers`, this handler mints
 * the trust-boundary token server-side from the visitor's Auth.js session
 * cookie, and forwards the request to the real API. See ARCHITECTURE.md.
 */
async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const token = await mintApiToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } },
      { status: 401 },
    );
  }

  const env = getWebEnv();
  const baseUrl = env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL;
  const search = req.nextUrl.search;
  const targetUrl = `${baseUrl}/api/console/${path.join('/')}${search}`;

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const contentType = req.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');

  const res = await fetch(targetUrl, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      // Forward the original Content-Type verbatim for non-JSON bodies — this
      // is required for multipart/form-data uploads (file/logo/CSV import),
      // since it carries the multipart boundary the API's multer middleware
      // needs to parse the body. Without it, every file upload through this
      // proxy would silently fail to parse on the API side.
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body: hasBody ? (isJson ? await req.text() : req.body) : undefined,
    // @ts-expect-error -- duplex is required by undici for streaming request bodies, not yet in the DOM lib types.
    duplex: hasBody && !isJson ? 'half' : undefined,
    cache: 'no-store',
  });

  const responseContentType = res.headers.get('content-type') ?? 'application/json';
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    status: res.status,
    headers: { 'Content-Type': responseContentType },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await params).path);
}
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return forward(req, (await params).path);
}
