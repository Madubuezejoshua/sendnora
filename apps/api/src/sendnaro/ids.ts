/** Public resource ids are `<prefix>_<cuid>`. The prefix only helps humans and routing; it never authorizes anything. */
const PREFIX = {
  invoice: 'inv',
  delivery: 'dlv',
  otp: 'otp',
  linkToken: 'tlt',
  webhookEndpoint: 'whe',
  webhookEvent: 'evt',
} as const;

export type IdKind = keyof typeof PREFIX;

export function publicId(kind: IdKind, rawId: string): string {
  return `${PREFIX[kind]}_${rawId}`;
}

/** Returns the raw id, or null when the value is malformed / has the wrong prefix. */
export function parsePublicId(kind: IdKind, value: string): string | null {
  const prefix = `${PREFIX[kind]}_`;
  if (!value.startsWith(prefix)) return null;
  const raw = value.slice(prefix.length);
  return /^[a-z0-9]{20,32}$/.test(raw) ? raw : null;
}
