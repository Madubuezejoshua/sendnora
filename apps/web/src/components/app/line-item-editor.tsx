'use client';

import * as React from 'react';
import {
  useFieldArray,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import {
  computeDocumentTotals,
  getCurrency,
  type DocumentLineItemInput,
  type TaxMode,
} from '@invoicetap/shared';
import { Button, CurrencyInput, Input } from '@invoicetap/ui';

interface FormShape {
  currency: string;
  taxMode: TaxMode;
  lineItems: DocumentLineItemInput[];
  shippingMinorUnits: number;
  additionalFeesMinorUnits: number;
}

export function LineItemEditor<T extends FormShape>({
  control,
  register,
  watch,
  setValue,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' as never });
  const formValues = watch();
  const currency = (formValues as FormShape).currency;
  const taxMode = (formValues as FormShape).taxMode;
  const lineItems = (formValues as FormShape).lineItems as DocumentLineItemInput[];
  const shipping = (formValues as FormShape).shippingMinorUnits;
  const fees = (formValues as FormShape).additionalFeesMinorUnits;

  const totals = React.useMemo(() => {
    if (!currency || !lineItems?.length) return null;
    try {
      return computeDocumentTotals({
        currency,
        taxMode: taxMode ?? 'EXCLUSIVE',
        lineItems: lineItems.map((li, i) => ({
          ...li,
          id: String(i),
          description: li.description || `Item ${i + 1}`,
        })),
        shippingMinorUnits: shipping ?? 0,
        additionalFeesMinorUnits: fees ?? 0,
      });
    } catch {
      return null;
    }
  }, [currency, taxMode, lineItems, shipping, fees]);

  const minorUnitDigits = currency ? getCurrency(currency).minorUnitDigits : 2;

  return (
    <div className="space-y-4">
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs font-medium uppercase">
            <tr>
              <th className="px-3 py-2">Description</th>
              <th className="w-20 px-3 py-2">Qty</th>
              <th className="w-32 px-3 py-2">Unit price</th>
              <th className="w-20 px-3 py-2">Tax %</th>
              <th className="w-32 px-3 py-2 text-right">Total</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {fields.map((field, index) => {
              const lineTotal = totals?.lines[index]?.lineTotal.amountMinorUnits ?? 0;
              return (
                <tr key={field.id}>
                  <td className="px-3 py-2">
                    <Input
                      {...register(`lineItems.${index}.description` as never)}
                      placeholder="Item description"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      {...register(`lineItems.${index}.quantity` as never, { valueAsNumber: true })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CurrencyInput
                      aria-label="Unit price"
                      minorUnitDigits={minorUnitDigits}
                      valueMinorUnits={lineItems?.[index]?.unitPriceMinorUnits ?? 0}
                      onValueChange={(v) =>
                        setValue(`lineItems.${index}.unitPriceMinorUnits` as never, v as never)
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      max={100}
                      {...register(`lineItems.${index}.taxRatePercent` as never, {
                        valueAsNumber: true,
                      })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {(lineTotal / 10 ** minorUnitDigits).toLocaleString('en-US', {
                      minimumFractionDigits: minorUnitDigits,
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      aria-label="Remove line item"
                    >
                      <Trash2 className="text-muted-foreground size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          append({
            description: '',
            quantity: 1,
            unitPriceMinorUnits: 0,
            taxRatePercent: 0,
          } as never)
        }
      >
        <Plus className="size-4" /> Add line item
      </Button>

      {totals && (
        <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="text-muted-foreground flex justify-between">
            <span>Subtotal</span>
            <span>
              {(totals.subtotal.amountMinorUnits / 10 ** minorUnitDigits).toLocaleString()}
            </span>
          </div>
          <div className="text-muted-foreground flex justify-between">
            <span>Tax</span>
            <span>
              {(totals.totalTax.amountMinorUnits / 10 ** minorUnitDigits).toLocaleString()}
            </span>
          </div>
          <div className="border-border flex justify-between border-t pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span>
              {(totals.grandTotal.amountMinorUnits / 10 ** minorUnitDigits).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
