'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { BRAND } from '@invoicetap/shared';
import { Dialog, DrawerContent } from '@invoicetap/ui';
import { SidebarNav } from './sidebar-nav';
import { WorkspaceSwitcher } from './workspace-switcher';
import { UserMenu } from './user-menu';
import { NotificationBell } from './notification-bell';

export function AppShell({
  activeWorkspaceId,
  userName,
  userEmail,
  children,
}: {
  activeWorkspaceId: string;
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen">
      <aside className="border-border bg-card fixed inset-y-0 left-0 hidden w-60 flex-col border-r md:flex">
        <Link
          href="/dashboard"
          className="border-border flex h-16 items-center gap-2 border-b px-4 font-semibold"
        >
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-bold">
            {BRAND.shortName[0]}
          </span>
          {BRAND.productName}
        </Link>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="p-2 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="size-5" />
            </button>
            <WorkspaceSwitcher activeWorkspaceId={activeWorkspaceId} />
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserMenu name={userName} email={userEmail} />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent side="left" className="max-w-[280px] gap-0 p-0">
          <div className="border-border flex h-16 items-center justify-between border-b px-4 font-semibold">
            {BRAND.productName}
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </DrawerContent>
      </Dialog>
    </div>
  );
}
