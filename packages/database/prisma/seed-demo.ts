/**
 * Demo data seed — creates a fully-populated demo workspace so the product
 * can be explored before any real provider credentials exist. Refuses to
 * run when NODE_ENV=production. Every workspace it creates is flagged
 * `isDemo: true` so the UI can label it and admins can find/purge it.
 */
import {
  computeDocumentTotals,
  DEFAULT_NUMBERING_FORMATS,
  formatDocumentNumber,
  generatePublicToken,
} from '@sendnaro/shared';
import { PrismaClient, type DocumentType } from '../generated/client/index.js';
import { hashPassword } from '../src/password.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run the demo seed with NODE_ENV=production.');
  process.exit(1);
}

const prisma = new PrismaClient();

const DEMO_USER_EMAIL = 'demo@sendnaro.com';
const DEMO_USER_PASSWORD = 'DemoPassword123!';
const DEMO_WORKSPACE_SLUG = 'acme-demo-studio';

async function nextNumber(workspaceId: string, documentType: DocumentType): Promise<string> {
  const year = new Date().getUTCFullYear();
  const seq = await prisma.documentSequence.upsert({
    where: { workspaceId_documentType_year: { workspaceId, documentType, year } },
    create: { workspaceId, documentType, year, currentValue: 1 },
    update: { currentValue: { increment: 1 } },
  });
  const formatKey = documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : documentType;
  return formatDocumentNumber(DEFAULT_NUMBERING_FORMATS[formatKey], seq.currentValue, year);
}

async function main() {
  console.log('Seeding demo data...');

  const passwordHash = await hashPassword(DEMO_USER_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    create: { email: DEMO_USER_EMAIL, name: 'Demo Owner', passwordHash, emailVerified: new Date() },
    update: {},
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: DEMO_WORKSPACE_SLUG },
    create: {
      slug: DEMO_WORKSPACE_SLUG,
      name: 'Acme Demo Studio',
      ownerId: user.id,
      businessType: 'LIMITED_COMPANY',
      countryCode: 'NG',
      timezone: 'Africa/Lagos',
      locale: 'en',
      defaultCurrency: 'NGN',
      isDemo: true,
      onboardingCompletedAt: new Date(),
      members: {
        create: { userId: user.id, role: 'WORKSPACE_OWNER', joinedAt: new Date() },
      },
      businessProfile: {
        create: {
          displayName: 'Acme Demo Studio',
          contactEmail: DEMO_USER_EMAIL,
          contactPhone: '+2348012345678',
          website: 'https://example.com',
          taxIdNumber: 'TIN-00000000',
          address: {
            create: {
              line1: '12 Adeola Odeku Street',
              city: 'Lagos',
              state: 'Lagos',
              postalCode: '106104',
              countryCode: 'NG',
            },
          },
        },
      },
    },
    update: {},
  });

  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    create: {
      workspaceId: workspace.id,
      planCode: 'STARTER',
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      provider: 'MANUAL',
    },
    update: {},
  });

  const taxRate = await prisma.taxRate.upsert({
    where: { id: `${workspace.id}-vat` },
    create: {
      id: `${workspace.id}-vat`,
      workspaceId: workspace.id,
      name: 'VAT',
      ratePercent: 7.5,
      isDefault: true,
    },
    update: {},
  });

  const category = await prisma.category.upsert({
    where: { workspaceId_name: { workspaceId: workspace.id, name: 'Design Services' } },
    create: { workspaceId: workspace.id, name: 'Design Services' },
    update: {},
  });

  const products = await Promise.all(
    [
      { name: 'Brand Identity Package', unitPriceMinorUnits: 45000000, unit: 'package' }, // ₦450,000
      { name: 'Website Design (per page)', unitPriceMinorUnits: 8000000, unit: 'page' }, // ₦80,000
      { name: 'Consulting Hour', unitPriceMinorUnits: 2500000, unit: 'hour' }, // ₦25,000
    ].map((p) =>
      prisma.product.upsert({
        where: { id: `${workspace.id}-${p.name}` },
        create: {
          id: `${workspace.id}-${p.name}`,
          workspaceId: workspace.id,
          kind: 'SERVICE',
          name: p.name,
          unit: p.unit,
          unitPriceMinorUnits: p.unitPriceMinorUnits,
          currency: 'NGN',
          taxRateId: taxRate.id,
          categoryId: category.id,
        },
        update: {},
      }),
    ),
  );

  const customers = await Promise.all(
    [
      { name: 'Chidinma Okafor', email: 'chidinma@example.com', whatsappPhone: '+2348023456789' },
      {
        name: 'Kwame Boateng Ventures',
        email: 'kwame@example.com',
        whatsappPhone: '+233244123456',
      },
      {
        name: 'Nairobi Fresh Foods Ltd',
        email: 'accounts@example.com',
        whatsappPhone: '+254712345678',
      },
    ].map((c) =>
      prisma.customer.upsert({
        where: { id: `${workspace.id}-${c.email}` },
        create: {
          id: `${workspace.id}-${c.email}`,
          workspaceId: workspace.id,
          type: 'BUSINESS',
          name: c.name,
          email: c.email,
          whatsappPhone: c.whatsappPhone,
          currency: 'NGN',
        },
        update: {},
      }),
    ),
  );

  // --- Sample quote (SENT) ---
  const quoteLineItems = [
    {
      id: 'l1',
      quantity: 1,
      unitPriceMinorUnits: products[0]!.unitPriceMinorUnits,
      taxRatePercent: 7.5,
    },
  ];
  const quoteTotals = computeDocumentTotals({
    currency: 'NGN',
    taxMode: 'EXCLUSIVE',
    lineItems: quoteLineItems,
  });
  const quoteNumber = await nextNumber(workspace.id, 'QUOTE');
  await prisma.quote.create({
    data: {
      workspaceId: workspace.id,
      customerId: customers[0]!.id,
      number: quoteNumber,
      publicToken: generatePublicToken(),
      status: 'SENT',
      currency: 'NGN',
      taxMode: 'EXCLUSIVE',
      issueDate: new Date(),
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      subtotalMinorUnits: quoteTotals.subtotal.amountMinorUnits,
      totalTaxMinorUnits: quoteTotals.totalTax.amountMinorUnits,
      grandTotalMinorUnits: quoteTotals.grandTotal.amountMinorUnits,
      sentAt: new Date(),
      items: {
        create: quoteTotals.lines.map((l, i) => ({
          position: i,
          productId: products[0]!.id,
          description: products[0]!.name,
          quantity: l.quantity,
          unitPriceMinorUnits: l.unitPrice.amountMinorUnits,
          taxRatePercent: l.taxRatePercent,
          taxableBaseMinorUnits: l.taxableBase.amountMinorUnits,
          taxAmountMinorUnits: l.taxAmount.amountMinorUnits,
          lineTotalMinorUnits: l.lineTotal.amountMinorUnits,
        })),
      },
    },
  });

  // --- Sample PAID invoice ---
  const paidLineItems = [
    {
      id: 'l1',
      quantity: 3,
      unitPriceMinorUnits: products[1]!.unitPriceMinorUnits,
      taxRatePercent: 7.5,
    },
  ];
  const paidTotals = computeDocumentTotals({
    currency: 'NGN',
    taxMode: 'EXCLUSIVE',
    lineItems: paidLineItems,
  });
  const paidInvoiceNumber = await nextNumber(workspace.id, 'INVOICE');
  const issueDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const dueDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const paidInvoice = await prisma.invoice.create({
    data: {
      workspaceId: workspace.id,
      customerId: customers[1]!.id,
      number: paidInvoiceNumber,
      publicToken: generatePublicToken(),
      status: 'PAID',
      currency: 'NGN',
      taxMode: 'EXCLUSIVE',
      issueDate,
      dueDate,
      subtotalMinorUnits: paidTotals.subtotal.amountMinorUnits,
      totalTaxMinorUnits: paidTotals.totalTax.amountMinorUnits,
      grandTotalMinorUnits: paidTotals.grandTotal.amountMinorUnits,
      amountPaidMinorUnits: paidTotals.grandTotal.amountMinorUnits,
      issuedAt: issueDate,
      sentAt: issueDate,
      paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      items: {
        create: paidTotals.lines.map((l, i) => ({
          position: i,
          productId: products[1]!.id,
          description: products[1]!.name,
          quantity: l.quantity,
          unitPriceMinorUnits: l.unitPrice.amountMinorUnits,
          taxRatePercent: l.taxRatePercent,
          taxableBaseMinorUnits: l.taxableBase.amountMinorUnits,
          taxAmountMinorUnits: l.taxAmount.amountMinorUnits,
          lineTotalMinorUnits: l.lineTotal.amountMinorUnits,
        })),
      },
    },
  });

  const payment = await prisma.payment.create({
    data: {
      workspaceId: workspace.id,
      amountMinorUnits: paidTotals.grandTotal.amountMinorUnits,
      currency: 'NGN',
      method: 'BANK_TRANSFER',
      status: 'SUCCESSFUL',
      reference: 'DEMO-TXN-0001',
      paidAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      allocations: {
        create: {
          invoiceId: paidInvoice.id,
          amountMinorUnits: paidTotals.grandTotal.amountMinorUnits,
        },
      },
    },
  });

  const receiptNumber = await nextNumber(workspace.id, 'RECEIPT');
  await prisma.receipt.create({
    data: {
      workspaceId: workspace.id,
      invoiceId: paidInvoice.id,
      paymentId: payment.id,
      number: receiptNumber,
      publicToken: generatePublicToken(),
      status: 'ISSUED',
      amountMinorUnits: paidTotals.grandTotal.amountMinorUnits,
      currency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      paidAt: payment.paidAt,
      snapshotJson: {
        businessName: 'Acme Demo Studio',
        customerName: customers[1]!.name,
        invoiceNumber: paidInvoiceNumber,
        lineItems: paidTotals.lines.map((l) => ({
          description: products[1]!.name,
          quantity: l.quantity,
          unitPriceMinorUnits: l.unitPrice.amountMinorUnits,
          lineTotalMinorUnits: l.lineTotal.amountMinorUnits,
        })),
        grandTotalMinorUnits: paidTotals.grandTotal.amountMinorUnits,
        currency: 'NGN',
      },
      items: {
        create: paidTotals.lines.map((l) => ({
          description: products[1]!.name,
          quantity: l.quantity,
          unitPriceMinorUnits: l.unitPrice.amountMinorUnits,
          lineTotalMinorUnits: l.lineTotal.amountMinorUnits,
        })),
      },
    },
  });

  // --- Sample OVERDUE invoice ---
  const overdueLineItems = [
    {
      id: 'l1',
      quantity: 10,
      unitPriceMinorUnits: products[2]!.unitPriceMinorUnits,
      taxRatePercent: 7.5,
    },
  ];
  const overdueTotals = computeDocumentTotals({
    currency: 'NGN',
    taxMode: 'EXCLUSIVE',
    lineItems: overdueLineItems,
  });
  const overdueInvoiceNumber = await nextNumber(workspace.id, 'INVOICE');
  const overdueIssueDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const overdueDueDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  await prisma.invoice.create({
    data: {
      workspaceId: workspace.id,
      customerId: customers[2]!.id,
      number: overdueInvoiceNumber,
      publicToken: generatePublicToken(),
      status: 'OVERDUE',
      currency: 'NGN',
      taxMode: 'EXCLUSIVE',
      issueDate: overdueIssueDate,
      dueDate: overdueDueDate,
      subtotalMinorUnits: overdueTotals.subtotal.amountMinorUnits,
      totalTaxMinorUnits: overdueTotals.totalTax.amountMinorUnits,
      grandTotalMinorUnits: overdueTotals.grandTotal.amountMinorUnits,
      issuedAt: overdueIssueDate,
      sentAt: overdueIssueDate,
      items: {
        create: overdueTotals.lines.map((l, i) => ({
          position: i,
          productId: products[2]!.id,
          description: products[2]!.name,
          quantity: l.quantity,
          unitPriceMinorUnits: l.unitPrice.amountMinorUnits,
          taxRatePercent: l.taxRatePercent,
          taxableBaseMinorUnits: l.taxableBase.amountMinorUnits,
          taxAmountMinorUnits: l.taxAmount.amountMinorUnits,
          lineTotalMinorUnits: l.lineTotal.amountMinorUnits,
        })),
      },
    },
  });

  console.log('Demo seed complete.');
  console.log(`  Workspace: ${workspace.name} (${workspace.slug})`);
  console.log(`  Login: ${DEMO_USER_EMAIL} / ${DEMO_USER_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
