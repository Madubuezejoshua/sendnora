'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, FormField, Input, Textarea, toast } from '@sendnaro/ui';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Enter a valid email'),
  subject: z.string().max(200).optional(),
  message: z.string().min(1, 'Message is required').max(5000),
});
type FormValues = z.infer<typeof schema>;

export function ContactForm() {
  const [submitted, setSubmitted] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Failed to send');
      setSubmitted(true);
      reset();
    } catch {
      toast.error('Could not send your message', 'Please try again in a moment.');
    }
  };

  if (submitted) {
    return (
      <div className="border-success/30 bg-success/5 rounded-lg border p-6 text-center">
        <p className="font-medium">Thanks for reaching out!</p>
        <p className="text-muted-foreground mt-1 text-sm">
          We&apos;ll get back to you within 1-2 business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormField label="Name" htmlFor="name" required error={errors.name?.message}>
        <Input id="name" invalid={!!errors.name} {...register('name')} />
      </FormField>
      <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" invalid={!!errors.email} {...register('email')} />
      </FormField>
      <FormField label="Subject" htmlFor="subject" hint="Optional">
        <Input id="subject" {...register('subject')} />
      </FormField>
      <FormField label="Message" htmlFor="message" required error={errors.message?.message}>
        <Textarea id="message" rows={5} invalid={!!errors.message} {...register('message')} />
      </FormField>
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Send message
      </Button>
    </form>
  );
}
