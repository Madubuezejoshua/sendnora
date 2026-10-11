'use client';

import * as React from 'react';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppClickToChatUrl, normalizePhoneNumber } from '@invoicetap/shared';
import { Button, toast } from '@invoicetap/ui';

export function WhatsAppShareButton({
  phone,
  message,
  className,
}: {
  phone: string | null | undefined;
  message: string;
  className?: string;
}) {
  const handleClick = () => {
    if (!phone) {
      toast.error('No WhatsApp number on file', 'Add a WhatsApp number to this customer first.');
      return;
    }
    try {
      const normalized = normalizePhoneNumber(phone);
      const url = buildWhatsAppClickToChatUrl(normalized.e164, message);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Invalid WhatsApp number', "Please update the customer's WhatsApp number.");
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} className={className}>
      <MessageCircle className="size-4" /> Share via WhatsApp
    </Button>
  );
}
