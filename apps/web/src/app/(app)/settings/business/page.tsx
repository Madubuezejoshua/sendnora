'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PageHeader,
  Skeleton,
  toast,
} from '@invoicetap/ui';
import { apiBrowserFetch } from '@/lib/api-browser';
import { useMyWorkspaces } from '@/hooks/use-workspaces';

interface BusinessProfileForm {
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  taxIdNumber: string;
}

export default function BusinessSettingsPage() {
  const { data: workspaces } = useMyWorkspaces();
  const workspaceId = workspaces?.[0]?.workspace.id;
  const queryClient = useQueryClient();

  const { data: workspace, isLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () =>
      apiBrowserFetch<{
        data: {
          name: string;
          businessProfile: {
            displayName: string;
            contactEmail: string | null;
            contactPhone: string | null;
            website: string | null;
            taxIdNumber: string | null;
          } | null;
        };
      }>(`/workspaces/${workspaceId}`).then((r) => r.data),
    enabled: Boolean(workspaceId),
  });

  const { register, handleSubmit, reset } = useForm<BusinessProfileForm>();

  React.useEffect(() => {
    if (workspace?.businessProfile) {
      reset({
        businessName: workspace.businessProfile.displayName,
        contactEmail: workspace.businessProfile.contactEmail ?? '',
        contactPhone: workspace.businessProfile.contactPhone ?? '',
        website: workspace.businessProfile.website ?? '',
        taxIdNumber: workspace.businessProfile.taxIdNumber ?? '',
      });
    }
  }, [workspace, reset]);

  const save = useMutation({
    mutationFn: (values: BusinessProfileForm) =>
      apiBrowserFetch(`/workspaces/${workspaceId}/business-profile`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      toast.success('Business profile updated');
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: () => toast.error('Could not save changes'),
  });

  if (isLoading || !workspaceId) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Business settings" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <FormField label="Business name" htmlFor="businessName" required>
              <Input id="businessName" {...register('businessName')} />
            </FormField>
            <FormField label="Contact email" htmlFor="contactEmail">
              <Input id="contactEmail" type="email" {...register('contactEmail')} />
            </FormField>
            <FormField label="Contact phone" htmlFor="contactPhone">
              <Input id="contactPhone" {...register('contactPhone')} />
            </FormField>
            <FormField label="Website" htmlFor="website">
              <Input id="website" {...register('website')} />
            </FormField>
            <FormField label="Tax ID" htmlFor="taxIdNumber">
              <Input id="taxIdNumber" {...register('taxIdNumber')} />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" isLoading={save.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
