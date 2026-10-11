import { prisma } from '@invoicetap/database';
import {
  AppError,
  createProductSchema,
  isSupportedCurrency,
  type CreateProductInput,
  type PaginationQuery,
} from '@invoicetap/shared';
import { paginate, toSkipTake } from '../../services/pagination.js';
import { parseCsv, stringifyCsv, type ImportSummary } from '../../services/csv.service.js';

export async function listProducts(
  workspaceId: string,
  query: PaginationQuery & { status?: string },
) {
  const where = {
    workspaceId,
    ...(query.status && query.status !== 'ALL'
      ? { status: query.status as 'ACTIVE' | 'ARCHIVED' }
      : { status: 'ACTIVE' as const }),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.product.findMany({
      where,
      ...toSkipTake(query),
      orderBy: { [query.sortBy ?? 'createdAt']: query.sortDirection },
      include: { taxRate: true, category: true },
    }),
    prisma.product.count({ where }),
  ]);

  return paginate(items, totalItems, query);
}

export async function getProduct(workspaceId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
    include: { taxRate: true, category: true },
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  return product;
}

export async function createProduct(workspaceId: string, input: CreateProductInput) {
  return prisma.product.create({
    data: {
      workspaceId,
      kind: input.kind,
      name: input.name,
      description: input.description,
      sku: input.sku,
      unit: input.unit,
      unitPriceMinorUnits: input.unitPriceMinorUnits,
      currency: input.currency,
      taxRateId: input.taxRateId,
      categoryId: input.categoryId,
    },
  });
}

export async function updateProduct(
  workspaceId: string,
  productId: string,
  input: Partial<CreateProductInput>,
) {
  await getProduct(workspaceId, productId);
  return prisma.product.update({ where: { id: productId }, data: input });
}

export async function archiveProduct(workspaceId: string, productId: string) {
  await getProduct(workspaceId, productId);
  return prisma.product.update({
    where: { id: productId },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

const CSV_COLUMNS = [
  'name',
  'kind',
  'sku',
  'unit',
  'unitpriceminorunits',
  'currency',
  'description',
];

export async function exportProductsCsv(workspaceId: string): Promise<string> {
  const products = await prisma.product.findMany({
    where: { workspaceId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });
  return stringifyCsv(
    products.map((p) => ({
      name: p.name,
      kind: p.kind,
      sku: p.sku ?? '',
      unit: p.unit,
      unitpriceminorunits: p.unitPriceMinorUnits,
      currency: p.currency,
      description: p.description ?? '',
    })),
    CSV_COLUMNS,
  );
}

/** Same row-by-row, never-fail-the-whole-batch approach as customer import — see customers.service.ts. */
export async function importProductsFromCsv(
  workspaceId: string,
  buffer: Buffer,
): Promise<ImportSummary> {
  const rows = parseCsv(buffer);
  const summary: ImportSummary = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2;

    const currency =
      row.currency && isSupportedCurrency(row.currency) ? row.currency.toUpperCase() : undefined;
    const candidate = {
      name: row.name,
      kind: (row.kind?.toUpperCase() === 'PRODUCT' ? 'PRODUCT' : 'SERVICE') as
        'PRODUCT' | 'SERVICE',
      sku: row.sku || undefined,
      unit: row.unit || 'unit',
      unitPriceMinorUnits: Number(row.unitpriceminorunits ?? row['unit price minor units'] ?? 0),
      currency,
      description: row.description || undefined,
    };

    const parsed = createProductSchema.safeParse(candidate);
    if (!parsed.success) {
      summary.errors.push({
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? 'Invalid row',
      });
      summary.skipped += 1;
      continue;
    }

    try {
      await createProduct(workspaceId, parsed.data);
      summary.imported += 1;
    } catch (err) {
      summary.errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : 'Could not create product',
      });
      summary.skipped += 1;
    }
  }

  return summary;
}

export async function listCategories(workspaceId: string) {
  return prisma.category.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } });
}

export async function createCategory(workspaceId: string, name: string) {
  return prisma.category.create({ data: { workspaceId, name } });
}

export async function listTaxRates(workspaceId: string) {
  return prisma.taxRate.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function createTaxRate(
  workspaceId: string,
  input: { name: string; ratePercent: number; isDefault: boolean },
) {
  if (input.isDefault) {
    await prisma.taxRate.updateMany({ where: { workspaceId }, data: { isDefault: false } });
  }
  return prisma.taxRate.create({
    data: {
      workspaceId,
      name: input.name,
      ratePercent: input.ratePercent,
      isDefault: input.isDefault,
    },
  });
}
