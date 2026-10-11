import { parseWebEnv } from '@invoicetap/config/env';

/** Server-only. Never import this from a "use client" component. */
export function getWebEnv() {
  return parseWebEnv(process.env);
}
