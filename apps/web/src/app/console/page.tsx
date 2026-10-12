'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Skeleton,
  cn,
} from '@sendnaro/ui';
import { apiBrowserFetch } from '@/lib/api-browser';
import { Playground } from '@/components/console/playground';

interface Overview {
  business: { name: string; role: string };
  checklist: { id: string; label: string; done: boolean }[];
  channels: {
    whatsapp: { status: string };
    telegram: { botConfigured: boolean; botUsername: string | null };
  };
  billing: {
    billingRequired: boolean;
    entitled: boolean;
    state: 'free_access' | 'active' | 'activation_required';
    price: { amountMinor: number; currency: string } | null;
  };
  apiBaseUrl: string;
}

const STEP_LINKS: Record<string, string> = {
  profile: '/console/settings',
  sandbox_key: '/console/keys',
  whatsapp: '/console/settings?tab=channels',
  live_key: '/console/keys',
  first_request: '#example',
  live_request: '#example',
};

const WHATSAPP_LABEL: Record<
  string,
  { text: string; variant: 'success' | 'warning' | 'destructive' | 'default' }
> = {
  CONNECTED: { text: 'connected', variant: 'success' },
  PENDING_SETUP: { text: 'setup pending', variant: 'warning' },
  ERROR: { text: 'credentials rejected', variant: 'destructive' },
  NOT_CONNECTED: { text: 'not connected', variant: 'default' },
  REVOKED: { text: 'revoked', variant: 'destructive' },
};

export default function IntegrationPage() {
  const [env, setEnv] = React.useState<'sandbox' | 'live'>('sandbox');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['overview'],
    queryFn: () => apiBrowserFetch<{ data: Overview }>('/overview'),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data)
    return <ErrorState title="Could not load the console" onRetry={() => refetch()} />;
  const o = data.data;
  const wa = WHATSAPP_LABEL[o.channels.whatsapp.status] ?? WHATSAPP_LABEL.NOT_CONNECTED!;
  const base = `${o.apiBaseUrl}/api/v1`;
  const keyVar = env === 'sandbox' ? 'sn_test_...' : 'sn_live_...';
  const example = `# Run on your server. Keep the key in an environment variable.
export SENDNARO_API_KEY=${keyVar}

curl -X POST "${base}/otp/challenges" \\
  -H "Authorization: Bearer $SENDNARO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "+2348012345678", "purpose": "phone_verification"}'`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integration"
        description="Set up once, send from your backend, track every delivery."
      />

      <div
        role="radiogroup"
        aria-label="Environment"
        className="bg-muted inline-flex rounded-lg p-1"
      >
        {(['sandbox', 'live'] as const).map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={env === e}
            onClick={() => setEnv(e)}
            className={cn(
              'focus-visible:ring-ring rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2',
              env === e ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Setup checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {o.checklist.map((s) => (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  {s.done ? (
                    <CheckCircle2 className="text-success size-5 shrink-0" aria-label="Done" />
                  ) : (
                    <Circle
                      className="text-muted-foreground size-5 shrink-0"
                      aria-label="Not done"
                    />
                  )}
                  <span className={s.done ? 'text-muted-foreground line-through' : ''}>
                    {s.label}
                  </span>
                  {!s.done && (
                    <Link
                      href={STEP_LINKS[s.id] ?? '/console'}
                      className="text-primary ml-auto text-xs underline underline-offset-2"
                    >
                      Go
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {env === 'sandbox' ? (
              <p className="text-muted-foreground">
                Sandbox uses simulated WhatsApp and Telegram. No setup, no cost, nothing reaches a
                real customer.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span>WhatsApp sender</span>
                  <Badge variant={wa.variant}>{wa.text}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Telegram bot</span>
                  <Badge variant={o.channels.telegram.botConfigured ? 'success' : 'default'}>
                    {o.channels.telegram.botConfigured ? 'available' : 'not configured'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Sendnaro access</span>
                  <Badge
                    variant={o.billing.state === 'activation_required' ? 'warning' : 'success'}
                  >
                    {o.billing.state === 'free_access'
                      ? 'free access'
                      : o.billing.state === 'active'
                        ? 'activated'
                        : 'activation required'}
                  </Badge>
                </div>
                {o.billing.state === 'activation_required' && (
                  <p className="text-muted-foreground">
                    Live requests are blocked until you{' '}
                    <Link className="underline" href="/console/activation">
                      activate
                    </Link>
                    .
                  </p>
                )}
                {wa.text !== 'connected' && (
                  <p className="text-muted-foreground">
                    Live WhatsApp needs your own sender.{' '}
                    <Link className="underline" href="/console/settings?tab=channels">
                      Connect it
                    </Link>
                    ; until then live requests return <code>setup_required</code>.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="example">
        <CardHeader>
          <CardTitle className="text-base">Your first request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Create a {env} key under{' '}
            <Link className="underline" href="/console/keys">
              API keys
            </Link>
            , put it in your server&apos;s environment (never in browser code), then run this. The
            full docs are at{' '}
            <Link className="underline" href="/docs">
              /docs
            </Link>
            .
          </p>
          <pre
            tabIndex={0}
            className="overflow-x-auto rounded-lg bg-[hsl(222_47%_8%)] p-4 text-[13px] leading-relaxed text-slate-100"
          >
            <code>{example}</code>
          </pre>
          {env === 'live' && (
            <p className="text-muted-foreground text-xs">
              Live requests send to real recipients. Use real, consenting numbers only.
            </p>
          )}
        </CardContent>
      </Card>

      {env === 'sandbox' && <Playground />}
    </div>
  );
}
