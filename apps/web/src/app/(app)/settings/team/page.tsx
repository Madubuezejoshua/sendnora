'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';
import { useMyWorkspaces } from '@/hooks/use-workspaces';

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}

const ROLES = ['WORKSPACE_ADMIN', 'ACCOUNTANT', 'STAFF', 'VIEWER'] as const;

export default function TeamSettingsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const workspaceId = workspaces?.[0]?.workspace.id;
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () =>
      apiBrowserFetch<{ data: Member[] }>(`/workspaces/${workspaceId}/members`).then((r) => r.data),
    enabled: Boolean(workspaceId),
  });

  const { register, handleSubmit, setValue, reset } = useForm<{
    email: string;
    role: (typeof ROLES)[number];
  }>({
    defaultValues: { role: 'STAFF' },
  });

  const invite = useMutation({
    mutationFn: (values: { email: string; role: string }) =>
      apiBrowserFetch(`/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast.success('Invitation sent');
      reset({ email: '', role: 'STAFF' });
      void queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
    },
    onError: () => toast.error('Could not send invitation'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Team" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite a team member</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((v) => invite.mutate(v))}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <FormField label="Email" htmlFor="email" required className="flex-1">
              <Input id="email" type="email" {...register('email', { required: true })} />
            </FormField>
            <FormField label="Role" htmlFor="role">
              <Select
                defaultValue="STAFF"
                onValueChange={(v) => setValue('role', v as (typeof ROLES)[number])}
              >
                <SelectTrigger id="role" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <Button type="submit" isLoading={invite.isPending}>
              <UserPlus className="size-4" /> Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-24 w-full" />}
          <div className="divide-border divide-y">
            {members?.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={m.user.name ?? m.user.email} size="sm" />
                  <div>
                    <p className="text-sm font-medium">{m.user.name ?? m.user.email}</p>
                    <p className="text-muted-foreground text-xs">{m.user.email}</p>
                  </div>
                </div>
                <Badge variant="outline">{m.role.replace('_', ' ')}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
