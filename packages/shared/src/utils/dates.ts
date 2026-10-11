import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * All timestamps are stored in UTC in the database. Convert to/from a
 * workspace's configured IANA timezone only at the display/scheduling
 * boundary — never store a "local" wall-clock time as if it were UTC.
 */

export function formatInWorkspaceTimezone(date: Date, timezone: string, pattern = 'PPP'): string {
  return formatInTimeZone(date, timezone, pattern);
}

/** Converts a UTC instant to the wall-clock Date components in `timezone`. */
export function toWorkspaceLocalTime(date: Date, timezone: string): Date {
  return toZonedTime(date, timezone);
}

/** Converts wall-clock date components (interpreted in `timezone`) to a UTC instant. */
export function fromWorkspaceLocalTime(date: Date, timezone: string): Date {
  return fromZonedTime(date, timezone);
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isPastUtc(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

export function daysBetweenUtc(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / msPerDay);
}
