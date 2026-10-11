import { prisma } from '@invoicetap/database';
import {
  AppError,
  createCustomerSchema,
  isSupportedCurrency,
  type CreateCustomerInput,
  type PaginationQuery,
} from '@invoicetap/shared';
import { assertCanAddCustomer } from '../../services/billing.service.js';
import { paginate, toSkipTake } from '../../services/pagination.js';
import { parseCsv, stringifyCsv, type ImportSummary } from '../../services/csv.service.js';

async function upsertAddress(
  existingId: string | null | undefined,
  address: CreateCustomerInput['billingAddress'],
): Promise<string | null> {
  if (!address) return existingId ?? null;
  if (existingId) {
    await prisma.address.update({ where: { id: existingId }, data: address });
    return existingId;
  }
  const created = await prisma.address.create({ data: address });
  return created.id;
}

export async function listCustomers(
  workspaceId: string,
  query: PaginationQuery & { status?: string },
) {
  const where = {
    workspaceId,
    ...(query.status && query.status !== 'ALL'
      ? { status: query.status as 'ACTIVE' | 'ARCHIVED' }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.customer.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortDirection },
    }),
    prisma.customer.count({ where }),
  ]);

  return paginate(items, totalItems, query);
}

export async function getCustomer(workspaceId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, workspaceId },
    include: { billingAddress: true, shippingAddress: true },
  });
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found');
  return customer;
}

export async function createCustomer(workspaceId: string, input: CreateCustomerInput) {
  await assertCanAddCustomer(workspaceId);

  const billingAddressId = input.billingAddress
    ? await upsertAddress(null, input.billingAddress)
    : null;
  const shippingAddressId = input.shippingAddress
    ? await upsertAddress(null, input.shippingAddress)
    : null;

  return prisma.customer.create({
    data: {
      workspaceId,
      type: input.type,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      whatsappPhone: input.whatsappPhone || null,
      taxIdNumber: input.taxIdNumber,
      currency: input.currency,
      notes: input.notes,
      billingAddressId,
      shippingAddressId,
    },
  });
}

export async function updateCustomer(
  workspaceId: string,
  customerId: string,
  input: Partial<CreateCustomerInput>,
) {
  const existing = await getCustomer(workspaceId, customerId);

  const billingAddressId = input.billingAddress
    ? await upsertAddress(existing.billingAddressId, input.billingAddress)
    : undefined;
  const shippingAddressId = input.shippingAddress
    ? await upsertAddress(existing.shippingAddressId, input.shippingAddress)
    : undefined;

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      type: input.type,
      name: input.name,
      email: input.email,
      phone: input.phone,
      whatsappPhone: input.whatsappPhone,
      taxIdNumber: input.taxIdNumber,
      currency: input.currency,
      notes: input.notes,
      billingAddressId,
      shippingAddressId,
    },
  });
}

export async function archiveCustomer(workspaceId: string, customerId: string) {
  await getCustomer(workspaceId, customerId);
  return prisma.customer.update({
    where: { id: customerId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

export async function restoreCustomer(workspaceId: string, customerId: string) {
  await getCustomer(workspaceId, customerId);
  return prisma.customer.update({
    where: { id: customerId },
    data: { status: 'ACTIVE', archivedAt: null },
  });
}

const CSV_COLUMNS = [
  'name',
  'type',
  'email',
  'phone',
  'whatsappphone',
  'taxidnumber',
  'currency',
  'notes',
];

export async function exportCustomersCsv(workspaceId: string): Promise<string> {
  const customers = await prisma.customer.findMany({
    where: { workspaceId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });
  return stringifyCsv(
    customers.map((c) => ({
      name: c.name,
      type: c.type,
      email: c.email ?? '',
      phone: c.phone ?? '',
      whatsappphone: c.whatsappPhone ?? '',
      taxidnumber: c.taxIdNumber ?? '',
      currency: c.currency ?? '',
      notes: c.notes ?? '',
    })),
    CSV_COLUMNS,
  );
}

/**
 * Imports customers from a CSV with headers matching CSV_COLUMNS (case-
 * insensitive, only `name` required). Each row is validated independently
 * — one bad row is recorded as an error and skipped rather than failing
 * the whole import — and the plan's customer quota is re-checked before
 * every single row, so an import can never silently blow past it.
 */
export async function importCustomersFromCsv(
  workspaceId: string,
  buffer: Buffer,
): Promise<ImportSummary> {
  const rows = parseCsv(buffer);
  const summary: ImportSummary = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2; // 1-indexed + header row

    try {
      await assertCanAddCustomer(workspaceId);
    } catch {
      summary.errors.push({
        row: rowNumber,
        message: 'Customer plan limit reached — remaining rows skipped',
      });
      summary.skipped += rows.length - i;
      break;
    }

    const candidate = {
      name: row.name,
      type: (row.type?.toUpperCase() === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL') as
        'INDIVIDUAL' | 'BUSINESS',
      email: row.email || undefined,
      phone: row.phone || undefined,
      whatsappPhone: row.whatsappphone || undefined,
      taxIdNumber: row.taxidnumber || undefined,
      currency:
        row.currency && isSupportedCurrency(row.currency) ? row.currency.toUpperCase() : undefined,
      notes: row.notes || undefined,
    };

    const parsed = createCustomerSchema.safeParse(candidate);
    if (!parsed.success) {
      summary.errors.push({
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? 'Invalid row',
      });
      summary.skipped += 1;
      continue;
    }

    try {
      await createCustomer(workspaceId, parsed.data);
      summary.imported += 1;
    } catch (err) {
      summary.errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Could not create customer',
      });
      summary.skipped += 1;
    }
  }

  return summary;
}

export async function getCustomerStatementSummary(workspaceId: string, customerId: string) {
  await getCustomer(workspaceId, customerId);
  const invoices = await prisma.invoice.findMany({
    where: { workspaceId, customerId },
    select: {
      id: true,
      number: true,
      status: true,
      currency: true,
      grandTotalMinorUnits: true,
      amountPaidMinorUnits: true,
      dueDate: true,
      issueDate: true,
    },
    orderBy: { issueDate: 'desc' },
  });
  return { invoices };
}
