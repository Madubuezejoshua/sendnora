'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@invoicetap/shared';
import { apiBrowserFetch } from '@/lib/api-browser';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiBrowserFetch<PaginatedResult<AppNotification> & { unreadCount: number }>(
        '/notifications?pageSize=20&sortBy=createdAt&sortDirection=desc',
      ),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiBrowserFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiBrowserFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
