'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';

interface ImportSummary {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export function CsvImportExport({
  resource,
  invalidateQueryKey,
}: {
  /** e.g. "customers" or "products" — matches the API's /<resource>/export and /<resource>/import routes. */
  resource: string;
  invalidateQueryKey: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importing, setImporting] = React.useState(false);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiBrowserFetch<{ data: ImportSummary }>(`/${resource}/import`, {
        method: 'POST',
        body: formData,
      });
      setSummary(result.data);
      void queryClient.invalidateQueries({ queryKey: [invalidateQueryKey] });
      if (result.data.imported > 0)
        toast.success(
          `Imported ${result.data.imported} row${result.data.imported === 1 ? '' : 's'}`,
        );
    } catch {
      toast.error('Import failed', 'Check that your file is a valid CSV and try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleFileChange}
      />
      <Button variant="outline" isLoading={importing} onClick={() => fileInputRef.current?.click()}>
        <Upload className="size-4" /> Import CSV
      </Button>
      <Button variant="outline" asChild>
        <a href={`/api/proxy/${resource}/export`}>
          <Download className="size-4" /> Export CSV
        </a>
      </Button>

      <Dialog open={summary !== null} onOpenChange={(open) => !open && setSummary(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import results</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-4">
                <span className="text-success">{summary.imported} imported</span>
                <span className="text-muted-foreground">{summary.skipped} skipped</span>
              </div>
              {summary.errors.length > 0 && (
                <div className="border-border max-h-48 space-y-1 overflow-y-auto rounded-md border p-3">
                  {summary.errors.map((e, i) => (
                    <p key={i} className="text-destructive text-xs">
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSummary(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
