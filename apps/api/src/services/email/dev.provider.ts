import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../config/logger.js';
import type { EmailProvider, SendEmailParams, SendEmailResult } from './provider.interface.js';

/**
 * Development email adapter: never sends anything externally. Writes each
 * email as an .html file under .dev-emails/ (gitignored) and logs a
 * summary, so the full flow (verification, invites, invoice delivery,
 * reminders) can be exercised end-to-end without a Resend account.
 */
export class DevEmailProvider implements EmailProvider {
  private readonly outDir = path.resolve(process.cwd(), '.dev-emails');

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    await mkdir(this.outDir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = path.join(this.outDir, `${id}.html`);
    await writeFile(filePath, params.html, 'utf8');

    logger.info(
      { to: params.to, subject: params.subject, previewFile: filePath },
      '[dev email] would have sent',
    );
    return { providerMessageId: `dev_${id}` };
  }
}
