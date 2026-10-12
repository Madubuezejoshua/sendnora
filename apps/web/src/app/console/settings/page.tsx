'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@sendnaro/ui';
import { BusinessTab } from '@/components/console/settings/business-tab';
import { ChannelsTab } from '@/components/console/settings/channels-tab';
import { WebhooksTab } from '@/components/console/settings/webhooks-tab';
import { PaymentsTab } from '@/components/console/settings/payments-tab';
import { SecurityTab } from '@/components/console/settings/security-tab';

const TABS = ['business', 'channels', 'webhooks', 'payments', 'security'] as const;

export default function SettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const tab = (TABS as readonly string[]).includes(requested ?? '')
    ? (requested as string)
    : 'business';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business profile, channel connections, webhooks and account security."
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/console/settings?tab=${v}`)}>
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="business" className="pt-6">
          <BusinessTab />
        </TabsContent>
        <TabsContent value="channels" className="pt-6">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="webhooks" className="pt-6">
          <WebhooksTab />
        </TabsContent>
        <TabsContent value="payments" className="pt-6">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="security" className="pt-6">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
