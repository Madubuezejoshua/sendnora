'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { signOut } from 'next-auth/react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  PageHeader,
  toast,
} from '@invoicetap/ui';
import { changePasswordAction, revokeOtherSessionsAction } from './actions';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
}

export default function ProfileSettingsPage() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<PasswordForm>();
  const [revoking, setRevoking] = React.useState(false);

  const onSubmit = async (values: PasswordForm) => {
    const result = await changePasswordAction(values);
    if (!result.ok) {
      toast.error('Could not change password', result.error);
      return;
    }
    toast.success('Password changed', 'You have been logged out of all devices for security.');
    reset();
    await signOut({ callbackUrl: '/login' });
  };

  const handleRevokeAll = async () => {
    setRevoking(true);
    await revokeOtherSessionsAction();
    toast.success('All sessions revoked');
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Profile" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Current password" htmlFor="currentPassword" required>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword', { required: true })}
              />
            </FormField>
            <FormField
              label="New password"
              htmlFor="newPassword"
              required
              hint="At least 12 characters"
            >
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...register('newPassword', { required: true, minLength: 12 })}
              />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Log out of every device where you&apos;re currently signed in, including this one.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            isLoading={revoking}
            onClick={handleRevokeAll}
          >
            Log out everywhere
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
