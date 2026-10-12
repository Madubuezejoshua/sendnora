import { createRequire } from 'node:module';
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { PdfDocumentData } from './types.js';

/**
 * NOTE on fonts: registers Noto Sans (vendored via the @fontsource/noto-sans
 * npm package, so no network fetch happens at render time) instead of
 * @react-pdf/renderer's built-in Helvetica/Times-Roman. This gives reliable
 * Latin-1 / Latin-Extended coverage — accented names and addresses
 * ("José", "François", "Ọláwálé") render correctly, which the standard PDF
 * fonts don't guarantee.
 *
 * Money amounts still render as an ISO code ("NGN 1,000.00") rather than a
 * currency symbol: Noto Sans's "latin" subset (the specific file this
 * package vendors) reliably covers common symbols like $ € £ ¥, but its
 * coverage of less-common ones actually used by this app's supported
 * currencies (₦ Naira, ₵ Cedi, ₹ Rupee) has NOT been visually verified in
 * a rendered PDF — this repo's build environment had no way to render and
 * inspect a PDF's visual output. Switching pdf.service.ts's
 * formatMoneyLabel() to symbols is a small, easy change once someone can
 * confirm those specific glyphs render correctly rather than as tofu boxes.
 */
const requireFont = createRequire(import.meta.url);

let fontsRegistered = false;
function ensureFontsRegistered(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'Noto Sans',
    fonts: [
      {
        src: requireFont.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: requireFont.resolve('@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff'),
        fontWeight: 700,
      },
    ],
  });
  // Latin Extended (e.g. ń, ǹ, ş). react-pdf has no per-glyph fallback, so <Mixed> switches font per run.
  Font.register({
    family: 'Noto Sans Ext',
    fonts: [
      {
        src: requireFont.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: requireFont.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff'),
        fontWeight: 700,
      },
    ],
  });
  // Vietnamese block (U+1EA0-1EF9): includes Yoruba/Igbo dotted letters such as Ọ, Ẹ, Ị, Ụ.
  Font.register({
    family: 'Noto Sans Vi',
    fonts: [
      {
        src: requireFont.resolve(
          '@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff',
        ),
        fontWeight: 400,
      },
      {
        src: requireFont.resolve(
          '@fontsource/noto-sans/files/noto-sans-vietnamese-700-normal.woff',
        ),
        fontWeight: 700,
      },
    ],
  });
  fontsRegistered = true;
}

/**
 * Letters outside the bundled Latin subset render in the matching Noto Sans subset: the Vietnamese block
 * holds the Yoruba/Igbo dotted vowels (Ọ, Ẹ, Ị, Ụ), Latin Extended holds the rest. Runs are split per script.
 */
const EXT_RUN = /([Ā-ʯḀ-ỿ]+)/;
function fontForRun(run: string): string {
  const code = run.codePointAt(0) ?? 0;
  return code >= 0x1ea0 && code <= 0x1ef9 ? 'Noto Sans Vi' : 'Noto Sans Ext';
}
function Mixed({ children }: { children: string | undefined }) {
  const parts = String(children ?? '')
    .split(EXT_RUN)
    .flatMap((part, i) =>
      i % 2 === 1 ? part.split(/(?<=[Ạ-ỹ])(?=[^Ạ-ỹ])|(?<=[^Ạ-ỹ])(?=[Ạ-ỹ])/) : [part],
    );
  return (
    <>
      {parts.map((part, i) =>
        EXT_RUN.test(part) ? (
          <Text key={i} style={{ fontFamily: fontForRun(part) }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </>
  );
}

const PAGE_PADDING = 40;

function baseStyles(brandColor: string, fontFamily: string) {
  return StyleSheet.create({
    page: { padding: PAGE_PADDING, fontFamily, fontSize: 9, color: '#0f172a' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    headerBand: {
      backgroundColor: brandColor,
      padding: 20,
      marginBottom: 20,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    logo: { width: 90, height: 36, objectFit: 'contain', marginBottom: 8 },
    businessName: { fontSize: 14, fontWeight: 700 },
    muted: { color: '#64748b' },
    title: { fontSize: 20, fontWeight: 700, textAlign: 'right' },
    section: { marginBottom: 16 },
    label: { fontSize: 8, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 },
    table: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    tableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: '#f1f5f9',
      paddingVertical: 6,
      paddingHorizontal: 6,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderBottomWidth: 1,
      borderBottomColor: '#e2e8f0',
    },
    colDescription: { flex: 2.4, paddingRight: 6 },
    colQty: { flex: 0.7, textAlign: 'right' },
    colPrice: { flex: 1.8, textAlign: 'right' },
    colTax: { flex: 1.6, textAlign: 'right' },
    colTotal: { flex: 1.8, textAlign: 'right' },
    totalsBlock: { marginTop: 12, alignSelf: 'flex-end', width: 220 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    totalsGrand: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: '#0f172a',
      marginTop: 4,
      fontWeight: 700,
      fontSize: 11,
    },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: PAGE_PADDING,
      right: PAGE_PADDING,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pageNumber: { fontSize: 8, color: '#94a3b8' },
    watermark: {
      position: 'absolute',
      top: '42%',
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 64,
      color: '#f1f5f9',
      transform: 'rotate(-30deg)',
      fontWeight: 700,
    },
    qr: { width: 64, height: 64 },
    statusBadge: {
      fontSize: 9,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 3,
      alignSelf: 'flex-end',
      marginTop: 4,
    },
  });
}

export function DocumentPdf({ data }: { data: PdfDocumentData }) {
  ensureFontsRegistered();
  const styles = baseStyles(data.brandColor, 'Noto Sans');
  const isModern = data.templateKey === 'MODERN';

  const HeaderBlock = isModern ? (
    <View style={styles.headerBand}>
      <View>
        {data.logoDataUri && <Image src={data.logoDataUri} style={styles.logo} />}
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: 700 }}>
          <Mixed>{data.businessName}</Mixed>
        </Text>
      </View>
      <View>
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, textAlign: 'right' }}>
          {titleFor(data.kind)}
        </Text>
        <Text style={{ color: '#e2e8f0', fontSize: 9, textAlign: 'right', marginTop: 4 }}>
          {data.documentNumber}
        </Text>
      </View>
    </View>
  ) : (
    <View style={[styles.row, styles.section]}>
      <View>
        {data.logoDataUri && <Image src={data.logoDataUri} style={styles.logo} />}
        <Text style={styles.businessName}>
          <Mixed>{data.businessName}</Mixed>
        </Text>
        {data.businessAddressLines.map((line, i) => (
          <Text key={i} style={styles.muted}>
            <Mixed>{line}</Mixed>
          </Text>
        ))}
      </View>
      <View>
        <Text style={styles.title}>{titleFor(data.kind)}</Text>
        <Text style={{ textAlign: 'right', marginTop: 4 }}>{data.documentNumber}</Text>
      </View>
    </View>
  );

  return (
    <Document title={`${titleFor(data.kind)} ${data.documentNumber}`}>
      <Page size="A4" style={styles.page}>
        {data.watermarkText && (
          <Text
            style={[
              styles.watermark,
              data.watermarkColor ? { color: data.watermarkColor, fontSize: 30 } : {},
            ]}
          >
            {data.watermarkText}
          </Text>
        )}

        {HeaderBlock}

        {isModern && (
          <View style={[styles.row, styles.section]}>
            <View>
              {[data.businessEmail, data.businessPhone].filter(Boolean).map((line, i) => (
                <Text key={`c${i}`} style={styles.muted}>
                  {line}
                </Text>
              ))}
              {data.businessAddressLines.map((line, i) => (
                <Text key={i} style={styles.muted}>
                  <Mixed>{line}</Mixed>
                </Text>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.row, styles.section]}>
          <View>
            <Text style={styles.label}>Bill to</Text>
            <Text style={{ fontWeight: 700, marginBottom: 2 }}>
              <Mixed>{data.customerName}</Mixed>
            </Text>
            {data.customerAddressLines.map((line, i) => (
              <Text key={i} style={styles.muted}>
                <Mixed>{line}</Mixed>
              </Text>
            ))}
            {data.customerEmail && <Text style={styles.muted}>{data.customerEmail}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>Issue date</Text>
            <Text style={{ marginBottom: 6 }}>{data.issueDateLabel}</Text>
            {data.dueDateLabel && (
              <>
                <Text style={styles.label}>Due date</Text>
                <Text style={{ marginBottom: 6 }}>{data.dueDateLabel}</Text>
              </>
            )}
            <Text style={styles.statusBadge}>{data.statusLabel}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, { fontWeight: 700 }]}>Description</Text>
            <Text style={[styles.colQty, { fontWeight: 700 }]}>Qty</Text>
            <Text style={[styles.colPrice, { fontWeight: 700 }]}>Unit price</Text>
            <Text style={[styles.colTax, { fontWeight: 700 }]}>Tax</Text>
            <Text style={[styles.colTotal, { fontWeight: 700 }]}>Total</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDescription}>
                <Mixed>{item.description}</Mixed>
              </Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{item.unitPriceLabel}</Text>
              <Text style={styles.colTax}>{item.taxLabel ?? '—'}</Text>
              <Text style={styles.colTotal}>{item.lineTotalLabel}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Subtotal</Text>
            <Text>{data.subtotalLabel}</Text>
          </View>
          {data.discountLabel && (
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Discount</Text>
              <Text>-{data.discountLabel}</Text>
            </View>
          )}
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Tax</Text>
            <Text>{data.taxLabel}</Text>
          </View>
          {data.shippingLabel && (
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Shipping</Text>
              <Text>{data.shippingLabel}</Text>
            </View>
          )}
          <View style={styles.totalsGrand}>
            <Text>Total</Text>
            <Text>{data.grandTotalLabel}</Text>
          </View>
          {data.amountPaidLabel && (
            <View style={styles.totalsRow}>
              <Text style={styles.muted}>Amount paid</Text>
              <Text>{data.amountPaidLabel}</Text>
            </View>
          )}
          {data.balanceDueLabel && (
            <View style={styles.totalsRow}>
              <Text style={{ fontWeight: 700 }}>Balance due</Text>
              <Text style={{ fontWeight: 700 }}>{data.balanceDueLabel}</Text>
            </View>
          )}
        </View>

        {(data.notes || data.terms || data.paymentInstructions) && (
          <View style={[styles.section, { marginTop: 20 }]}>
            {data.notes && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Notes</Text>
                <Text>
                  <Mixed>{data.notes}</Mixed>
                </Text>
              </View>
            )}
            {data.paymentInstructions && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Payment instructions</Text>
                <Text>
                  <Mixed>{data.paymentInstructions}</Mixed>
                </Text>
              </View>
            )}
            {data.terms && (
              <View>
                <Text style={styles.label}>Terms</Text>
                <Text style={styles.muted}>{data.terms}</Text>
              </View>
            )}
          </View>
        )}

        {data.footerText && (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.muted}>
              <Mixed>{data.footerText}</Mixed>
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.pageNumber}>
            {[data.businessTaxId ? `Tax ID: ${data.businessTaxId}` : '', data.poweredByText ?? '']
              .filter(Boolean)
              .join('  |  ')}
          </Text>
          {data.qrCodeDataUri && <Image src={data.qrCodeDataUri} style={styles.qr} />}
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

function titleFor(kind: PdfDocumentData['kind']): string {
  if (kind === 'QUOTE') return 'QUOTE';
  if (kind === 'RECEIPT') return 'RECEIPT';
  return 'INVOICE';
}
