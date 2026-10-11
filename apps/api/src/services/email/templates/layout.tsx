import React from 'react';
import { BRAND } from '@invoicetap/shared';

const styles = {
  body: {
    margin: 0,
    padding: '32px 16px',
    backgroundColor: '#f1f5f9',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  container: {
    maxWidth: 480,
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: { backgroundColor: BRAND.colors.primary, padding: '24px 32px' },
  brand: { color: '#ffffff', fontSize: 18, fontWeight: 700, margin: 0 },
  content: { padding: '32px' },
  heading: { fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' },
  paragraph: { fontSize: 14, lineHeight: 1.6, color: '#334155', margin: '0 0 16px' },
  button: {
    display: 'inline-block',
    backgroundColor: BRAND.colors.primary,
    color: '#ffffff',
    textDecoration: 'none',
    padding: '12px 24px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  footer: { padding: '24px 32px', fontSize: 12, color: '#94a3b8', borderTop: '1px solid #e2e8f0' },
} as const;

export function EmailLayout({
  previewText,
  children,
  footerNote,
}: {
  previewText: string;
  children: React.ReactNode;
  footerNote?: React.ReactNode;
}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style={styles.body}>
        <span style={{ display: 'none', maxHeight: 0, overflow: 'hidden' }}>{previewText}</span>
        <div style={styles.container}>
          <div style={styles.header}>
            <p style={styles.brand}>{BRAND.productName}</p>
          </div>
          <div style={styles.content}>{children}</div>
          <div style={styles.footer}>
            {footerNote ?? (
              <p style={{ margin: 0 }}>
                {BRAND.productName} · Need help? Contact us at {BRAND.supportEmail}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}

export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} style={styles.button}>
      {children}
    </a>
  );
}

export const emailStyles = styles;
