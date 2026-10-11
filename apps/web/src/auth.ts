import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { authenticator } from 'otplib';
import { randomUUID } from 'node:crypto';
import { prisma } from '@invoicetap/database';
import { verifyPassword } from '@invoicetap/database/password';
import { decryptSecret } from '@invoicetap/database/encryption';
import { loginSchema } from '@invoicetap/shared';
import { getWebEnv } from './lib/env.js';
import { authConfig } from './auth.config.js';

/**
 * Auth.js configuration. Session strategy is JWT — not because we don't
 * want tracked sessions (we do, for "log out other sessions" and login
 * history), but because Auth.js's Credentials provider bypasses the
 * database-session machinery the Prisma adapter would otherwise provide
 * automatically (that automatic flow only fires for OAuth sign-ins). So we
 * hybridize: the JWT is the transport, but on every sign-in we create our
 * OWN tracked row in the `Session` table (via the `jwt` callback below,
 * not Auth.js's adapter-driven session creation) and validate it still
 * exists on every `session` callback invocation. "Log out other sessions"
 * just deletes the other rows — their JWTs remain cryptographically valid
 * until expiry, but `session()` will find no matching row and return a
 * signed-out session, which is what actually matters for access control.
 *
 * The Prisma adapter IS still wired up (for Google OAuth account linking —
 * User/Account rows get created automatically for OAuth sign-ins, which
 * Credentials' hand-rolled authorize() has to do itself instead).
 */

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

async function recordLoginEvent(userId: string, success: boolean, reason?: string) {
  try {
    await prisma.loginEvent.create({ data: { userId, success, reason } });
  } catch {
    // Never let audit logging break the login flow.
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totpCode: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totpCode } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { twoFactorSecret: true },
        });
        if (!user?.passwordHash || user.deletedAt) {
          return null;
        }

        const validPassword = await verifyPassword(user.passwordHash, password);
        if (!validPassword) {
          await recordLoginEvent(user.id, false, 'invalid_password');
          return null;
        }

        if (user.twoFactorSecret?.enabled) {
          if (!totpCode) {
            await recordLoginEvent(user.id, false, 'totp_required');
            return null;
          }
          const env = getWebEnv();
          const secret = decryptSecret(
            user.twoFactorSecret.secretEncrypted,
            env.APP_ENCRYPTION_KEY,
          );
          const validTotp = authenticator.verify({ token: totpCode, secret });
          if (!validTotp) {
            await recordLoginEvent(user.id, false, 'invalid_totp');
            return null;
          }
        }

        await recordLoginEvent(user.id, true);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        // Fresh sign-in — mint a new tracked session row.
        const sessionToken = randomUUID();
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        await prisma.session.create({
          data: {
            sessionToken,
            userId: user.id,
            expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          },
        });
        token.sub = user.id;
        token.sessionToken = sessionToken;
        // Baked into the JWT (not just looked up in session()) so the edge-runtime
        // middleware can read it without a database call — see auth.config.ts.
        token.isPlatformAdmin = dbUser?.isPlatformAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      const sessionToken = token.sessionToken as string | undefined;
      if (!sessionToken) {
        return { ...session, user: undefined as never };
      }
      const dbSession = await prisma.session.findUnique({ where: { sessionToken } });
      if (!dbSession || dbSession.expires < new Date()) {
        return { ...session, user: undefined as never };
      }
      const dbUser = await prisma.user.findUnique({ where: { id: token.sub as string } });
      if (!dbUser || dbUser.deletedAt) {
        return { ...session, user: undefined as never };
      }
      session.user.id = dbUser.id;
      session.user.isPlatformAdmin = dbUser.isPlatformAdmin;
      return session;
    },
  },
});
