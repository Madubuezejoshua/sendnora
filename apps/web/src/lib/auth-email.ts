import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resend } from 'resend';
import { BRAND } from '@sendnaro/shared';

/**
 * Lightweight, self-contained email sender for the handful of auth-flow
 * emails apps/web triggers before a session exists (verify email,
 * password reset, welcome) — these can't go through apps/api's richer
 * React-templated email service (apps/api/src/services/email) because
 * that lives in a different deployable app and this flow runs before the
 * caller is authenticated. Uses the same EMAIL_PROVIDER/RESEND_API_KEY/
 * EMAIL_FROM env vars documented in ENVIRONMENT.md. Falls back to logging
 * the email to the server console when Resend isn't configured, exactly
 * like apps/api's dev email adapter.
 */
export async function sendAuthEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const provider =
    process.env.EMAIL_PROVIDER ?? (process.env.NODE_ENV === 'production' ? '' : 'dev');

  if (provider === 'resend' && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    if (result.error) {
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
    return;
  }

  // Never print verification/reset links into production logs, and never pretend an email was sent.
  // The file sink below is opt-in: EMAIL_PROVIDER=dev (local development, tests).
  if (process.env.NODE_ENV === 'production' && provider !== 'dev') {
    throw new Error(
      'EMAIL_PROVIDER=resend with RESEND_API_KEY and EMAIL_FROM is required to send email in production',
    );
  }

  // Development / test email sink: capture the message as a file (apps/web/.dev-emails, gitignored)
  // so tests and developers can read the real content and link.
  const dir = path.resolve(process.cwd(), '.dev-emails');
  await mkdir(dir, { recursive: true });
  const safe = to.replace(/[^a-zA-Z0-9@._-]/g, '_');
  await writeFile(
    path.join(dir, `${Date.now()}-${safe}.txt`),
    `To: ${to}\nSubject: ${subject}\n\n${text}\n`,
    'utf8',
  );
}

function wrap(bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f1f5f9;padding:32px"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:${BRAND.colors.primary};padding:24px 32px"><p style="color:#fff;font-size:18px;font-weight:700;margin:0">${BRAND.productName}</p></div><div style="padding:32px">${bodyHtml}</div></div></body></html>`;
}

export function verifyEmailContent(name: string, verifyUrl: string) {
  return {
    subject: `Verify your ${BRAND.productName} email address`,
    html: wrap(
      `<h1 style="font-size:20px;margin:0 0 16px">Verify your email</h1><p style="color:#334155;font-size:14px">Hi ${name}, click below to verify your email address.</p><a href="${verifyUrl}" style="display:inline-block;background:${BRAND.colors.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Verify email</a><p style="color:#334155;font-size:14px;margin-top:16px">This link expires in 24 hours.</p>`,
    ),
    text: `Verify your email: ${verifyUrl}`,
  };
}

export function resetPasswordContent(name: string, resetUrl: string) {
  return {
    subject: 'Reset your password',
    html: wrap(
      `<h1 style="font-size:20px;margin:0 0 16px">Reset your password</h1><p style="color:#334155;font-size:14px">Hi ${name}, click below to choose a new password. This link expires in 1 hour.</p><a href="${resetUrl}" style="display:inline-block;background:${BRAND.colors.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Reset password</a>`,
    ),
    text: `Reset your password: ${resetUrl}`,
  };
}

export function welcomeContent(name: string, appUrl: string) {
  return {
    subject: `Welcome to ${BRAND.productName}`,
    html: wrap(
      `<h1 style="font-size:20px;margin:0 0 16px">Welcome, ${name}!</h1><p style="color:#334155;font-size:14px">${BRAND.tagline}</p><a href="${appUrl}" style="display:inline-block;background:${BRAND.colors.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Open the console</a>`,
    ),
    text: `Welcome to ${BRAND.productName}. Get started: ${appUrl}`,
  };
}
