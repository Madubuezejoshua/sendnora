'use client';

import Link from 'next/link';
import { Bell, BellRing } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@invoicetap/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type AppNotification,
} from '@/hooks/use-notifications';
import { usePushSubscription } from '@/hooks/use-push-subscription';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  const markRead = useMarkNotificationRead();
  const url = (notification.data?.url as string | undefined) ?? '#';
  const unread = !notification.readAt;

  return (
    <DropdownMenuItem
      asChild
      className="flex-col items-start gap-0.5 whitespace-normal py-2"
      onSelect={() => unread && markRead.mutate(notification.id)}
    >
      <Link href={url}>
        <div className="flex w-full items-center gap-2">
          {unread && <span className="bg-primary size-1.5 shrink-0 rounded-full" />}
          <p className={unread ? 'font-medium' : 'text-muted-foreground'}>{notification.title}</p>
        </div>
        <p className="text-muted-foreground pl-3.5 text-xs">{notification.body}</p>
        <p className="text-muted-foreground pl-3.5 text-xs">{timeAgo(notification.createdAt)}</p>
      </Link>
    </DropdownMenuItem>
  );
}

export function NotificationBell() {
  const { data } = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const push = usePushSubscription();
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unreadCount > 0 && (
            <button
              className="text-primary text-xs font-normal hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {push.state === 'default' && (
          <>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void push.subscribe();
              }}
              disabled={push.busy}
            >
              <BellRing className="size-4" /> Enable browser notifications
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <div className="max-h-96 overflow-y-auto">
          {!data || data.items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-sm">
              No notifications yet
            </p>
          ) : (
            data.items.map((n) => <NotificationRow key={n.id} notification={n} />)
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
