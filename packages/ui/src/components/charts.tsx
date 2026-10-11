'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '../lib/cn.js';

export interface ChartDataPoint {
  label: string;
  value: number;
}

interface BaseChartProps {
  data: ChartDataPoint[];
  /** Plain-language summary read by screen readers instead of the SVG. */
  accessibleSummary: string;
  height?: number;
  className?: string;
  valueFormatter?: (value: number) => string;
}

const CHART_COLOR = 'hsl(var(--primary))';

function ChartTooltip({ valueFormatter }: { valueFormatter?: (value: number) => string }) {
  return (
    <Tooltip
      cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
      contentStyle={{
        borderRadius: 8,
        border: '1px solid hsl(var(--border))',
        background: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        fontSize: 12,
      }}
      formatter={(value: number) => (valueFormatter ? valueFormatter(value) : value)}
    />
  );
}

export function RevenueLineChart({
  data,
  accessibleSummary,
  height = 240,
  className,
  valueFormatter,
}: BaseChartProps) {
  return (
    <div className={cn('w-full', className)} role="img" aria-label={accessibleSummary}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <ChartTooltip valueFormatter={valueFormatter} />
          <Line type="monotone" dataKey="value" stroke={CHART_COLOR} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <span className="sr-only">{accessibleSummary}</span>
    </div>
  );
}

export function SimpleBarChart({
  data,
  accessibleSummary,
  height = 240,
  className,
  valueFormatter,
}: BaseChartProps) {
  return (
    <div className={cn('w-full', className)} role="img" aria-label={accessibleSummary}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <ChartTooltip valueFormatter={valueFormatter} />
          <Bar dataKey="value" fill={CHART_COLOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <span className="sr-only">{accessibleSummary}</span>
    </div>
  );
}
