import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { apiFetch } from '@/lib/api-client';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/lib/constants';
import { ConsoleShell } from '@/components/console/console-shell';
import { SelectWorkspaceRedirect } from '@/components/app/select-workspace-redirect';

interface MyWorkspace {
  role: string;
  workspace: { id: string; name: string };
}

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;

  // The first call of a session has no workspace claim; /workspaces/mine does not need one.
  const { data: memberships } = await apiFetch<{ data: MyWorkspace[] }>('/workspaces/mine');
  if (memberships.length === 0) redirect('/onboarding');

  const active = memberships.find((m) => m.workspace.id === activeWorkspaceId);
  if (!active) {
    // Cookies can only be set by a route handler; hand off with a hard navigation (see the component).
    return <SelectWorkspaceRedirect workspaceId={memberships[0]!.workspace.id} />;
  }

  return (
    <ConsoleShell
      businessName={active.workspace.name}
      role={active.role}
      userName={session.user.name ?? ''}
      userEmail={session.user.email ?? ''}
      isPlatformAdmin={Boolean(session.user.isPlatformAdmin)}
    >
      {children}
    </ConsoleShell>
  );
}
