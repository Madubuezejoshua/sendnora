'use client';

import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface CurrencyInputProps {
  id?: string;
  name?: string;
  /** Current value in integer minor units (e.g. cents). */
  valueMinorUnits: number;
  onValueChange: (minorUnits: number) => void;
  /** Decimal digits for this currency's minor unit (2 for USD/NGN, 0 for XOF/JPY). */
  minorUnitDigits?: number;
  symbol?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Presents/edits money as a major-unit decimal string (e.g. "1,999.00")
 * while the underlying value stays an integer minor-unit count, so parent
 * forms never do float math themselves — see packages/shared/src/money.
 */
export function CurrencyInput({
  id,
  name,
  valueMinorUnits,
  onValueChange,
  minorUnitDigits = 2,
  symbol = '',
  placeholder,
  disabled,
  invalid,
  className,
  ...aria
}: CurrencyInputProps) {
  const toDisplay = (minor: number) => (minor / 10 ** minorUnitDigits).toFixed(minorUnitDigits);
  const [text, setText] = React.useState(() => toDisplay(valueMinorUnits));

  React.useEffect(() => {
    setText(toDisplay(valueMinorUnits));
    // Only resync from external value changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMinorUnits, minorUnitDigits]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const num = Number.parseFloat(cleaned || '0');
    const minor = Number.isFinite(num) ? Math.round(num * 10 ** minorUnitDigits) : 0;
    onValueChange(minor);
    setText(toDisplay(minor));
  };

  return (
    <div className={cn('relative', className)}>
      {symbol && (
        <span className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">
          {symbol}
        </span>
      )}
      <input
        id={id}
        name={name}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className={cn(
          'border-input bg-background shadow-subtle flex h-10 w-full rounded-md border py-2 text-right text-sm',
          symbol ? 'pl-8 pr-3' : 'px-3',
          'focus-visible:ring-ring transition-colors focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-offset-background focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        )}
        {...aria}
      />
    </div>
  );
}

export function DateInput({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      type="date"
      aria-invalid={invalid || undefined}
      className={cn(
        'border-input bg-background shadow-subtle flex h-10 w-full rounded-md border px-3 py-2 text-sm',
        'focus-visible:ring-ring transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-offset-background focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}
