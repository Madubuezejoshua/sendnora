export type PdfTemplateKey = 'MODERN' | 'CLASSIC' | 'MINIMAL';
export type PdfDocumentKind = 'QUOTE' | 'INVOICE' | 'RECEIPT';

export interface PdfLineItem {
  description: string;
  quantity: string;
  unitPriceLabel: string;
  taxLabel?: string;
  lineTotalLabel: string;
}

export interface PdfDocumentData {
  kind: PdfDocumentKind;
  templateKey: PdfTemplateKey;
  brandColor: string;

  businessName: string;
  businessAddressLines: string[];
  businessEmail?: string;
  businessPhone?: string;
  businessTaxId?: string;
  logoDataUri?: string;

  customerName: string;
  customerAddressLines: string[];
  customerEmail?: string;

  documentNumber: string;
  issueDateLabel: string;
  dueDateLabel?: string;
  statusLabel: string;
  currencyCode: string;

  items: PdfLineItem[];

  subtotalLabel: string;
  discountLabel?: string;
  taxLabel: string;
  shippingLabel?: string;
  grandTotalLabel: string;
  amountPaidLabel?: string;
  balanceDueLabel?: string;

  notes?: string;
  terms?: string;
  paymentInstructions?: string;

  qrCodeDataUri?: string;
  verificationUrl?: string;

  watermarkText?: string;
  /** Overrides the faint default so sandbox documents are unmistakable. */
  watermarkColor?: string;
  /** Free-text business footer (kept from the issue-time snapshot). */
  footerText?: string;
  /** Small attribution line, e.g. 'Delivered with Sendnaro'. */
  poweredByText?: string;
}
