import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/lib/constants';
import { SelectWorkspaceRedirect } from '@/components/app/select-workspace-redirect';
import { AppShell } from '@/components/app/app-shell';
import type { MyWorkspaceEntry } from '@/hooks/use-workspaces';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;

  // The very first API call of the session has no workspace claim yet — that's fine,
  // /workspaces/mine doesn't require one.
  const { data: memberships } = await apiFetch<{ data: MyWorkspaceEntry[] }>('/workspaces/mine');

  if (memberships.length === 0) {
    redirect('/onboarding');
  }

  const stillValid = memberships.some((m) => m.workspace.id === activeWorkspaceId);
  if (!activeWorkspaceId || !stillValid) {
    // Server Components can't set cookies directly — hand off to a route handler that can.
    return <SelectWorkspaceRedirect workspaceId={memberships[0]!.workspace.id} />;
  }

  return (
    <AppShell
      activeWorkspaceId={activeWorkspaceId}
      userName={session.user.name ?? ''}
      userEmail={session.user.email ?? ''}
    >
      {children}
    </AppShell>
  );
}
