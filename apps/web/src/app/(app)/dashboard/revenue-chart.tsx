'use client';

import { RevenueLineChart } from '@invoicetap/ui';
import { getCurrency } from '@invoicetap/shared';

/** Client wrapper: functions can't cross the server→client boundary, so format here from a plain `currency` prop. */
export function RevenueChart({
  data,
  currency,
}: {
  data: { label: string; value: number }[];
  currency: string;
}) {
  const digits = getCurrency(currency).minorUnitDigits;
  const fmt = (minor: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(
      minor / 10 ** digits,
    );
  return (
    <RevenueLineChart
      data={data}
      accessibleSummary={`Monthly revenue for the last 6 months: ${data.map((m) => `${m.label} ${fmt(m.value)}`).join(', ')}`}
      valueFormatter={fmt}
    />
  );
}
