'use client';

import { useQuery } from '@tanstack/react-query';
import type { WorkspaceRole } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  onboardingCompletedAt: string | null;
}

export interface MyWorkspaceEntry {
  role: WorkspaceRole;
  workspace: WorkspaceSummary;
}

export function useMyWorkspaces() {
  return useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: () =>
      apiBrowserFetch<{ data: MyWorkspaceEntry[] }>('/workspaces/mine').then((r) => r.data),
  });
}
