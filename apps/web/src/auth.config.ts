import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js config, used ONLY by middleware.ts. Next.js Middleware
 * always runs on the Edge runtime, which cannot run Prisma's query engine
 * or the native argon2 binary — so this config has no providers (sign-in
 * itself is handled by the Node.js-runtime route handler at
 * /api/auth/[...nextauth], never by middleware) and no database calls in
 * its callbacks.
 *
 * The full config (auth.ts, Node.js runtime — Server Components, Route
 * Handlers, Server Actions) extends this with the Credentials provider,
 * the Prisma adapter, and a session() callback that re-validates against
 * the tracked Session table. This file's session() callback is a lighter,
 * JWT-only version: enough for middleware's route-protection decisions,
 * but NOT authoritative for anything security-sensitive that needs
 * up-to-the-second revocation — that's what the full config's session()
 * is for.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  trustHost: true, // self-hosted (non-Vercel) deployments sit behind a proxy; Auth.js otherwise rejects the host
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/verify-email',
  },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      return session;
    },
  },
} satisfies NextAuthConfig;
