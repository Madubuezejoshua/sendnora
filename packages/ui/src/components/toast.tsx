'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/cn.js';

type ToastVariant = 'default' | 'success' | 'destructive' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

/** Minimal pub/sub store so `toast()` can be called from anywhere without React context plumbing. */
class ToastStore {
  private toasts: ToastItem[] = [];
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l([...this.toasts]);
  }

  add(item: Omit<ToastItem, 'id'>): void {
    const id = crypto.randomUUID();
    this.toasts.push({ ...item, id });
    this.emit();
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }
}

const store = new ToastStore();

export const toast = {
  success: (title: string, description?: string) =>
    store.add({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    store.add({ title, description, variant: 'destructive' }),
  warning: (title: string, description?: string) =>
    store.add({ title, description, variant: 'warning' }),
  info: (title: string, description?: string) =>
    store.add({ title, description, variant: 'default' }),
};

const VARIANT_ICON: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="text-foreground size-5" />,
  success: <CheckCircle2 className="text-success size-5" />,
  destructive: <AlertCircle className="text-destructive size-5" />,
  warning: <AlertCircle className="text-warning size-5" />,
};

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => store.subscribe(setToasts), []);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {toasts.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          className={cn(
            'border-border bg-card shadow-popover grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border p-4',
            'data-[state=open]:animate-fade-in data-[swipe=end]:animate-fade-in',
          )}
          onOpenChange={(open) => {
            if (!open) store.dismiss(t.id);
          }}
        >
          {VARIANT_ICON[t.variant]}
          <div>
            <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="text-muted-foreground mt-1 text-sm">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] m-0 flex w-full max-w-sm flex-col gap-2 p-4 outline-none sm:bottom-4 sm:right-4" />
    </ToastPrimitive.Provider>
  );
}
