'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@invoicetap/ui';
import { useMyWorkspaces } from '@/hooks/use-workspaces';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/lib/constants';

export function WorkspaceSwitcher({ activeWorkspaceId }: { activeWorkspaceId: string }) {
  const router = useRouter();
  const { data: workspaces, isLoading } = useMyWorkspaces();

  const active = workspaces?.find((w) => w.workspace.id === activeWorkspaceId);

  const selectWorkspace = (workspaceId: string) => {
    document.cookie = `${ACTIVE_WORKSPACE_COOKIE_NAME}=${workspaceId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    router.refresh();
  };

  if (isLoading) {
    return <div className="bg-muted h-9 w-40 animate-pulse rounded-md" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="border-input bg-background hover:bg-accent flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
        <span className="max-w-[140px] truncate">
          {active?.workspace.name ?? 'Select workspace'}
        </span>
        <ChevronsUpDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaces?.map((w) => (
          <DropdownMenuItem key={w.workspace.id} onSelect={() => selectWorkspace(w.workspace.id)}>
            <span className="flex-1 truncate">{w.workspace.name}</span>
            {w.workspace.id === activeWorkspaceId && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/onboarding')}>
          <Plus className="size-4" /> New workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
