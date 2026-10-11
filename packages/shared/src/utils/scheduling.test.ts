import { describe, expect, it } from 'vitest';
import { computeNextRunAt, computeReminderSendDate, type ReminderRule } from './scheduling.js';

describe('computeNextRunAt', () => {
  it('advances a monthly schedule by exactly one month in the workspace timezone', () => {
    const anchor = new Date('2026-01-15T09:00:00.000Z');
    const next = computeNextRunAt(anchor, { frequency: 'MONTHLY', timezone: 'UTC' });
    expect(next.toISOString()).toBe('2026-02-15T09:00:00.000Z');
  });

  it('advances a weekly schedule by 7 days', () => {
    const anchor = new Date('2026-01-01T12:00:00.000Z');
    const next = computeNextRunAt(anchor, { frequency: 'WEEKLY', timezone: 'UTC' });
    expect(next.toISOString()).toBe('2026-01-08T12:00:00.000Z');
  });

  it('advances a custom-interval schedule by the configured number of days', () => {
    const anchor = new Date('2026-01-01T00:00:00.000Z');
    const next = computeNextRunAt(anchor, {
      frequency: 'CUSTOM',
      customIntervalDays: 10,
      timezone: 'UTC',
    });
    expect(next.toISOString()).toBe('2026-01-11T00:00:00.000Z');
  });

  it('throws when CUSTOM frequency is missing an interval', () => {
    expect(() => computeNextRunAt(new Date(), { frequency: 'CUSTOM', timezone: 'UTC' })).toThrow();
  });

  it('preserves local wall-clock hour across a DST-observing timezone', () => {
    // New York DST starts 2026-03-08. An anchor before DST + 1 month lands after DST.
    const anchor = new Date('2026-02-15T14:00:00.000Z'); // 09:00 local (EST, UTC-5)
    const next = computeNextRunAt(anchor, { frequency: 'MONTHLY', timezone: 'America/New_York' });
    // After DST starts, 09:00 local is UTC-4, i.e. 13:00 UTC — local hour-of-day is preserved.
    expect(next.getUTCHours()).toBe(13);
  });
});

describe('computeReminderSendDate', () => {
  const dueDate = new Date('2026-06-15T00:00:00.000Z');

  it('computes a BEFORE_DUE reminder date', () => {
    const rule: ReminderRule = { timing: 'BEFORE_DUE', offsetDays: 3 };
    expect(computeReminderSendDate(dueDate, rule).toISOString()).toBe('2026-06-12T00:00:00.000Z');
  });

  it('computes an ON_DUE reminder date (no offset)', () => {
    const rule: ReminderRule = { timing: 'ON_DUE', offsetDays: 0 };
    expect(computeReminderSendDate(dueDate, rule).toISOString()).toBe(dueDate.toISOString());
  });

  it('computes an AFTER_DUE reminder date', () => {
    const rule: ReminderRule = { timing: 'AFTER_DUE', offsetDays: 10 };
    expect(computeReminderSendDate(dueDate, rule).toISOString()).toBe('2026-06-25T00:00:00.000Z');
  });
});
