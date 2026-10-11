'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CURRENCIES } from '@sendnaro/shared';
import { Button, Card, CardContent, ErrorState, FormField, Input, Skeleton, Textarea, toast } from '@sendnaro/ui';
import { apiBrowserFetch, ApiClientError } from '@/lib/api-browser';

interface Business {
  displayName: string; legalName: string | null; contactEmail: string | null; contactPhone: string | null; website: string | null;
  addressText: string | null; invoiceFooter: string | null; taxIdNumber: string | null; brandColor: string | null;
  defaultCurrency: string; timezone: string; allowedLinkOrigins: string[]; hasLogo: boolean;
}

export function BusinessTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['business'], queryFn: () => apiBrowserFetch<{ data: Business }>('/business') });
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [origins, setOrigins] = React.useState('');

  React.useEffect(() => {
    const b = data?.data;
    if (!b) return;
    setForm({
      displayName: b.displayName, legalName: b.legalName ?? '', contactEmail: b.contactEmail ?? '', contactPhone: b.contactPhone ?? '',
      website: b.website ?? '', addressText: b.addressText ?? '', invoiceFooter: b.invoiceFooter ?? '', taxIdNumber: b.taxIdNumber ?? '',
      brandColor: b.brandColor ?? '', defaultCurrency: b.defaultCurrency, timezone: b.timezone,
    });
    setOrigins(b.allowedLinkOrigins.join(', '));
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const empty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
      return apiBrowserFetch('/business', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: form.displayName, legalName: empty(form.legalName), contactEmail: empty(form.contactEmail), contactPhone: empty(form.contactPhone),
          website: empty(form.website), addressText: empty(form.addressText), invoiceFooter: empty(form.invoiceFooter), taxIdNumber: empty(form.taxIdNumber),
          brandColor: empty(form.brandColor), defaultCurrency: form.defaultCurrency, timezone: form.timezone,
          allowedLinkOrigins: origins.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean),
        }),
      });
    },
    onSuccess: () => { toast.success('Saved', 'New documents use these details. Issued documents keep the ones they were created with.'); void qc.invalidateQueries({ queryKey: ['business'] }); void qc.invalidateQueries({ queryKey: ['overview'] }); },
    onError: (e) => toast.error('Could not save', e instanceof ApiClientError ? (e.fieldErrors ? Object.values(e.fieldErrors).flat().join(' ') : e.message) : 'Please try again.'),
  });

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiBrowserFetch('/business/logo', { method: 'POST', body: fd });
      toast.success('Logo saved', 'PNG or JPEG logos appear on new documents.');
      void qc.invalidateQueries({ queryKey: ['business'] });
    } catch (e) {
      toast.error('Could not upload the logo', e instanceof ApiClientError ? e.message : 'Please try again.');
    }
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) return <ErrorState title="Could not load the profile" onRetry={() => refetch()} />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <FormField label="Business name" htmlFor="b-name" required><Input id="b-name" value={form.displayName ?? ''} onChange={set('displayName')} /></FormField>
          <FormField label="Legal name" htmlFor="b-legal"><Input id="b-legal" value={form.legalName ?? ''} onChange={set('legalName')} /></FormField>
          <FormField label="Contact email" htmlFor="b-email"><Input id="b-email" type="email" value={form.contactEmail ?? ''} onChange={set('contactEmail')} /></FormField>
          <FormField label="Phone" htmlFor="b-phone"><Input id="b-phone" value={form.contactPhone ?? ''} onChange={set('contactPhone')} /></FormField>
          <FormField label="Website" htmlFor="b-web"><Input id="b-web" type="url" placeholder="https://" value={form.website ?? ''} onChange={set('website')} /></FormField>
          <FormField label="Tax ID" htmlFor="b-tax"><Input id="b-tax" value={form.taxIdNumber ?? ''} onChange={set('taxIdNumber')} /></FormField>
          <FormField label="Address" htmlFor="b-addr" className="sm:col-span-2" hint="One line per row; printed on documents"><Textarea id="b-addr" rows={3} value={form.addressText ?? ''} onChange={set('addressText')} /></FormField>
          <FormField label="Invoice footer" htmlFor="b-foot" className="sm:col-span-2"><Textarea id="b-foot" rows={2} value={form.invoiceFooter ?? ''} onChange={set('invoiceFooter')} /></FormField>
          <FormField label="Brand colour" htmlFor="b-color" hint="Hex, e.g. #0B1B33"><Input id="b-color" value={form.brandColor ?? ''} onChange={set('brandColor')} placeholder="#0B1B33" /></FormField>
          <FormField label="Preferred currency" htmlFor="b-cur">
            <select id="b-cur" value={form.defaultCurrency ?? 'NGN'} onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))} className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Time zone" htmlFor="b-tz"><Input id="b-tz" value={form.timezone ?? ''} onChange={set('timezone')} placeholder="Africa/Lagos" /></FormField>
          <FormField label="Logo" htmlFor="b-logo" hint={data.data.hasLogo ? 'A logo is set. Upload to replace it (PNG or JPEG, max 2 MB).' : 'PNG or JPEG, max 2 MB'}>
            <input id="b-logo" type="file" accept="image/png,image/jpeg" className="text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FormField label="Allowed link origins for notifications" htmlFor="b-origins" hint="Comma-separated hostnames, e.g. shop.example.com. Notification messages may only contain links to these hosts.">
            <Input id="b-origins" value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="shop.example.com" />
          </FormField>
        </CardContent>
      </Card>

      <Button type="submit" disabled={save.isPending || !form.displayName}>Save changes</Button>
    </form>
  );
}
