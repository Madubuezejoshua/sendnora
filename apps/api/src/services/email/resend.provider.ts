import { Resend } from 'resend';
import type { EmailProvider, SendEmailParams, SendEmailResult } from './provider.interface.js';

export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly fromAddress: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
    });

    if (result.error) {
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
    return { providerMessageId: result.data?.id ?? 'unknown' };
  }
}
