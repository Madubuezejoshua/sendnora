import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const MAX_IMPORT_ROWS = 5000;

export class CsvParseError extends Error {}

/** Parses a CSV buffer into an array of row objects keyed by header column name. */
export function parseCsv(buffer: Buffer): Record<string, string>[] {
  let rows: Record<string, string>[];
  try {
    rows = parse(buffer, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (err) {
    throw new CsvParseError(err instanceof Error ? err.message : 'Could not parse CSV file');
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new CsvParseError(`CSV files are limited to ${MAX_IMPORT_ROWS} rows per import`);
  }

  return rows;
}

export function stringifyCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return stringify(rows, { header: true, columns });
}

export interface RowImportError {
  row: number;
  message: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: RowImportError[];
}
