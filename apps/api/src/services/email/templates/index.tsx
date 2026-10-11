import React from 'react';
import { BRAND } from '@sendnaro/shared';
import { EmailButton, EmailLayout, emailStyles as s } from './layout.js';

export interface EmailTemplateResult {
  subject: string;
  react: React.ReactElement;
  text: string;
}

export function verifyEmailTemplate(params: {
  name: string;
  verifyUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Verify your ${BRAND.productName} email address`,
    react: (
      <EmailLayout previewText="Confirm your email address to get started">
        <h1 style={s.heading}>Verify your email</h1>
        <p style={s.paragraph}>
          Hi {params.name}, please confirm your email address to activate your account.
        </p>
        <EmailButton href={params.verifyUrl}>Verify email</EmailButton>
        <p style={s.paragraph}>
          This link expires in 24 hours. If you didn't create an account, you can ignore this email.
        </p>
      </EmailLayout>
    ),
    text: `Verify your email: ${params.verifyUrl}`,
  };
}

export function welcomeTemplate(params: { name: string; appUrl: string }): EmailTemplateResult {
  return {
    subject: `Welcome to ${BRAND.productName}`,
    react: (
      <EmailLayout previewText="Your account is ready">
        <h1 style={s.heading}>Welcome, {params.name}!</h1>
        <p style={s.paragraph}>{BRAND.tagline}</p>
        <EmailButton href={params.appUrl}>Go to your dashboard</EmailButton>
      </EmailLayout>
    ),
    text: `Welcome to ${BRAND.productName}. Get started: ${params.appUrl}`,
  };
}

export function passwordResetTemplate(params: {
  name: string;
  resetUrl: string;
}): EmailTemplateResult {
  return {
    subject: 'Reset your password',
    react: (
      <EmailLayout previewText="Reset your password">
        <h1 style={s.heading}>Reset your password</h1>
        <p style={s.paragraph}>
          Hi {params.name}, click below to choose a new password. This link expires in 1 hour and
          can only be used once.
        </p>
        <EmailButton href={params.resetUrl}>Reset password</EmailButton>
        <p style={s.paragraph}>
          If you didn't request this, you can safely ignore this email — your password will not
          change.
        </p>
      </EmailLayout>
    ),
    text: `Reset your password: ${params.resetUrl}`,
  };
}

export function workspaceInvitationTemplate(params: {
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
}): EmailTemplateResult {
  return {
    subject: `${params.inviterName} invited you to join ${params.workspaceName} on ${BRAND.productName}`,
    react: (
      <EmailLayout previewText={`Join ${params.workspaceName}`}>
        <h1 style={s.heading}>You've been invited</h1>
        <p style={s.paragraph}>
          {params.inviterName} invited you to join <strong>{params.workspaceName}</strong> on{' '}
          {BRAND.productName}.
        </p>
        <EmailButton href={params.acceptUrl}>Accept invitation</EmailButton>
        <p style={s.paragraph}>This invitation expires in 7 days.</p>
      </EmailLayout>
    ),
    text: `Accept your invitation to ${params.workspaceName}: ${params.acceptUrl}`,
  };
}

export function invoiceIssuedTemplate(params: {
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  viewUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Invoice ${params.invoiceNumber} from ${params.businessName}`,
    react: (
      <EmailLayout previewText={`New invoice from ${params.businessName}`}>
        <h1 style={s.heading}>New invoice: {params.invoiceNumber}</h1>
        <p style={s.paragraph}>
          Hi {params.customerName}, {params.businessName} sent you an invoice for {params.amount},
          due {params.dueDate}.
        </p>
        <EmailButton href={params.viewUrl}>View & pay invoice</EmailButton>
      </EmailLayout>
    ),
    text: `Invoice ${params.invoiceNumber} for ${params.amount}, due ${params.dueDate}. View: ${params.viewUrl}`,
  };
}

export function invoiceReminderTemplate(params: {
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  viewUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Reminder: Invoice ${params.invoiceNumber} due ${params.dueDate}`,
    react: (
      <EmailLayout previewText="Payment reminder">
        <h1 style={s.heading}>Payment reminder</h1>
        <p style={s.paragraph}>
          Hi {params.customerName}, this is a friendly reminder that invoice {params.invoiceNumber}{' '}
          for {params.amount} from {params.businessName} is due {params.dueDate}.
        </p>
        <EmailButton href={params.viewUrl}>View & pay invoice</EmailButton>
      </EmailLayout>
    ),
    text: `Reminder: Invoice ${params.invoiceNumber} for ${params.amount} is due ${params.dueDate}. Pay: ${params.viewUrl}`,
  };
}

export function invoiceOverdueTemplate(params: {
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  amount: string;
  dueDate: string;
  viewUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Overdue: Invoice ${params.invoiceNumber}`,
    react: (
      <EmailLayout previewText="Invoice overdue">
        <h1 style={s.heading}>Invoice overdue</h1>
        <p style={s.paragraph}>
          Hi {params.customerName}, invoice {params.invoiceNumber} for {params.amount} from{' '}
          {params.businessName} was due {params.dueDate} and is now overdue. Please arrange payment
          as soon as possible.
        </p>
        <EmailButton href={params.viewUrl}>Pay now</EmailButton>
      </EmailLayout>
    ),
    text: `Invoice ${params.invoiceNumber} for ${params.amount} is overdue (was due ${params.dueDate}). Pay: ${params.viewUrl}`,
  };
}

export function paymentConfirmationTemplate(params: {
  customerName: string;
  businessName: string;
  amount: string;
  invoiceNumber: string;
  receiptUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Payment received — ${params.amount}`,
    react: (
      <EmailLayout previewText="Payment received">
        <h1 style={s.heading}>Payment received</h1>
        <p style={s.paragraph}>
          Hi {params.customerName}, we've received your payment of {params.amount} for invoice{' '}
          {params.invoiceNumber} to {params.businessName}. Thank you!
        </p>
        <EmailButton href={params.receiptUrl}>View receipt</EmailButton>
      </EmailLayout>
    ),
    text: `Payment of ${params.amount} received for invoice ${params.invoiceNumber}. Receipt: ${params.receiptUrl}`,
  };
}

export function receiptTemplate(params: {
  customerName: string;
  businessName: string;
  receiptNumber: string;
  amount: string;
  receiptUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Receipt ${params.receiptNumber} from ${params.businessName}`,
    react: (
      <EmailLayout previewText="Your receipt">
        <h1 style={s.heading}>Receipt {params.receiptNumber}</h1>
        <p style={s.paragraph}>
          Hi {params.customerName}, here's your receipt for {params.amount} paid to{' '}
          {params.businessName}.
        </p>
        <EmailButton href={params.receiptUrl}>View & download receipt</EmailButton>
      </EmailLayout>
    ),
    text: `Receipt ${params.receiptNumber} for ${params.amount}: ${params.receiptUrl}`,
  };
}

export function quoteSentTemplate(params: {
  customerName: string;
  businessName: string;
  quoteNumber: string;
  amount: string;
  viewUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Quote ${params.quoteNumber} from ${params.businessName}`,
    react: (
      <EmailLayout previewText={`New quote from ${params.businessName}`}>
        <h1 style={s.heading}>New quote: {params.quoteNumber}</h1>
        <p style={s.paragraph}>
          Hi {params.customerName}, {params.businessName} sent you a quote for {params.amount}.
        </p>
        <EmailButton href={params.viewUrl}>Review quote</EmailButton>
      </EmailLayout>
    ),
    text: `Quote ${params.quoteNumber} for ${params.amount}. Review: ${params.viewUrl}`,
  };
}

export function quoteRespondedTemplate(params: {
  businessOwnerName: string;
  customerName: string;
  quoteNumber: string;
  decision: 'ACCEPTED' | 'REJECTED';
  viewUrl: string;
}): EmailTemplateResult {
  const verb = params.decision === 'ACCEPTED' ? 'accepted' : 'declined';
  return {
    subject: `Quote ${params.quoteNumber} was ${verb}`,
    react: (
      <EmailLayout previewText={`Quote ${verb}`}>
        <h1 style={s.heading}>Quote {verb}</h1>
        <p style={s.paragraph}>
          Hi {params.businessOwnerName}, {params.customerName} has {verb} quote {params.quoteNumber}
          .
        </p>
        <EmailButton href={params.viewUrl}>View quote</EmailButton>
      </EmailLayout>
    ),
    text: `${params.customerName} has ${verb} quote ${params.quoteNumber}. View: ${params.viewUrl}`,
  };
}

export function securityAlertTemplate(params: {
  name: string;
  description: string;
  appUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Security alert for your ${BRAND.productName} account`,
    react: (
      <EmailLayout previewText="Security alert">
        <h1 style={s.heading}>Security alert</h1>
        <p style={s.paragraph}>
          Hi {params.name}, {params.description}
        </p>
        <p style={s.paragraph}>
          If this wasn't you, change your password immediately and review your active sessions.
        </p>
        <EmailButton href={params.appUrl}>Review account security</EmailButton>
      </EmailLayout>
    ),
    text: `Security alert: ${params.description}. Review: ${params.appUrl}`,
  };
}

export function contactAcknowledgementTemplate(params: { name: string }): EmailTemplateResult {
  return {
    subject: `We received your message`,
    react: (
      <EmailLayout previewText="We received your message">
        <h1 style={s.heading}>Thanks for reaching out</h1>
        <p style={s.paragraph}>
          Hi {params.name}, we've received your message and will get back to you within 1-2 business
          days.
        </p>
      </EmailLayout>
    ),
    text: `Hi ${params.name}, we've received your message and will get back to you soon.`,
  };
}

export function subscriptionNotificationTemplate(params: {
  name: string;
  message: string;
  appUrl: string;
}): EmailTemplateResult {
  return {
    subject: `Your ${BRAND.productName} subscription`,
    react: (
      <EmailLayout previewText="Subscription update">
        <h1 style={s.heading}>Subscription update</h1>
        <p style={s.paragraph}>
          Hi {params.name}, {params.message}
        </p>
        <EmailButton href={params.appUrl}>Manage billing</EmailButton>
      </EmailLayout>
    ),
    text: `${params.message} Manage billing: ${params.appUrl}`,
  };
}
