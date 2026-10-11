'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sets the active-workspace cookie via a full-page navigation to the route handler.
 * A server-side `redirect()` here loops forever on client-side (RSC) navigations — Next
 * doesn't persist the Set-Cookie from the redirected fetch — so we hard-navigate instead.
 */
export function SelectWorkspaceRedirect({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  React.useEffect(() => {
    const redirect = pathname && pathname !== '/' ? pathname : '/dashboard';
    window.location.replace(
      `/api/workspace/select?id=${encodeURIComponent(workspaceId)}&redirect=${encodeURIComponent(redirect)}`,
    );
  }, [pathname, workspaceId]);
  return null;
}
