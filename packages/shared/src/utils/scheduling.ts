import { addDays, addMonths, addQuarters, addWeeks, addYears } from 'date-fns';
import { fromWorkspaceLocalTime, toWorkspaceLocalTime } from './dates.js';

export const RECURRING_FREQUENCIES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'CUSTOM',
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export interface RecurringScheduleInput {
  frequency: RecurringFrequency;
  /** Only used when frequency === 'CUSTOM': the interval in days. */
  customIntervalDays?: number;
  timezone: string;
}

/**
 * Computes the next run timestamp (UTC) from a given anchor, preserving the
 * anchor's wall-clock time-of-day in the workspace's timezone so recurring
 * invoices keep firing at the same local hour even across DST transitions.
 */
export function computeNextRunAt(anchorUtc: Date, schedule: RecurringScheduleInput): Date {
  const local = toWorkspaceLocalTime(anchorUtc, schedule.timezone);
  let nextLocal: Date;

  switch (schedule.frequency) {
    case 'DAILY':
      nextLocal = addDays(local, 1);
      break;
    case 'WEEKLY':
      nextLocal = addWeeks(local, 1);
      break;
    case 'MONTHLY':
      nextLocal = addMonths(local, 1);
      break;
    case 'QUARTERLY':
      nextLocal = addQuarters(local, 1);
      break;
    case 'ANNUAL':
      nextLocal = addYears(local, 1);
      break;
    case 'CUSTOM': {
      const days = schedule.customIntervalDays;
      if (!days || days < 1) {
        throw new Error('customIntervalDays must be a positive integer for CUSTOM frequency');
      }
      nextLocal = addDays(local, days);
      break;
    }
    default:
      throw new Error(`Unknown recurring frequency: ${schedule.frequency}`);
  }

  return fromWorkspaceLocalTime(nextLocal, schedule.timezone);
}

export type ReminderTiming = 'BEFORE_DUE' | 'ON_DUE' | 'AFTER_DUE';

export interface ReminderRule {
  timing: ReminderTiming;
  /** Days offset from the due date; always a non-negative number, direction implied by `timing`. */
  offsetDays: number;
}

export const DEFAULT_REMINDER_RULES: ReminderRule[] = [
  { timing: 'BEFORE_DUE', offsetDays: 3 },
  { timing: 'ON_DUE', offsetDays: 0 },
  { timing: 'AFTER_DUE', offsetDays: 3 },
  { timing: 'AFTER_DUE', offsetDays: 10 },
];

export function computeReminderSendDate(dueDateUtc: Date, rule: ReminderRule): Date {
  const sign = rule.timing === 'BEFORE_DUE' ? -1 : rule.timing === 'AFTER_DUE' ? 1 : 0;
  const result = new Date(dueDateUtc);
  result.setUTCDate(result.getUTCDate() + sign * rule.offsetDays);
  return result;
}

/** Maximum reminders allowed per invoice regardless of configured rules, to prevent runaway messaging. */
export const MAX_REMINDERS_PER_INVOICE = 8;
