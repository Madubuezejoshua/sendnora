'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { signOut } from 'next-auth/react';
import { Button, Card, CardContent, CardHeader, CardTitle, FormField, Input, toast } from '@sendnaro/ui';
import { changePasswordAction, revokeOtherSessionsAction } from '@/app/console/settings/actions';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
}

export function SecurityTab() {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<PasswordForm>();
  const [revoking, setRevoking] = React.useState(false);

  const onSubmit = async (values: PasswordForm) => {
    const result = await changePasswordAction(values);
    if (!result.ok) {
      toast.error('Could not change password', result.error);
      return;
    }
    toast.success('Password changed', 'You were signed out of all devices for security.');
    reset();
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Current password" htmlFor="currentPassword" required>
              <Input id="currentPassword" type="password" autoComplete="current-password" {...register('currentPassword', { required: true })} />
            </FormField>
            <FormField label="New password" htmlFor="newPassword" required hint="At least 12 characters">
              <Input id="newPassword" type="password" autoComplete="new-password" {...register('newPassword', { required: true, minLength: 12 })} />
            </FormField>
            <Button type="submit" disabled={isSubmitting}>Change password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Sessions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">Sign out of every device, including this one.</p>
          <Button variant="outline" disabled={revoking} onClick={async () => { setRevoking(true); await revokeOtherSessionsAction(); await signOut({ callbackUrl: '/login' }); }}>
            Sign out everywhere
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
