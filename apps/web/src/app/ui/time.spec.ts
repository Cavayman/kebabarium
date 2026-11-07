import { reviewTime } from './time';

// Local-time dates, so the expectations hold in any time zone.
const now = new Date(2026, 10, 7, 18, 5);

describe('reviewTime', () => {
  it('shows only the clock for today', () => {
    expect(reviewTime(new Date(2026, 10, 7, 14, 32).toISOString(), 'uk', now).short).toBe('14:32');
  });

  it('says "yesterday" with the time', () => {
    expect(reviewTime(new Date(2026, 10, 6, 9, 5).toISOString(), 'uk', now).short).toBe('учора, 09:05');
    expect(reviewTime(new Date(2026, 10, 6, 9, 5).toISOString(), 'en', now).short).toBe('yesterday, 09:05');
  });

  it('shows day, month and time earlier this year', () => {
    expect(reviewTime(new Date(2026, 2, 1, 20, 0).toISOString(), 'uk', now).short).toBe('1 бер., 20:00');
  });

  it('adds the year and drops the time for older reviews', () => {
    expect(reviewTime(new Date(2024, 10, 6, 12, 0).toISOString(), 'uk', now).short).toBe('6 лист. 2024 р.');
  });

  it('gives the full date and time for the tooltip', () => {
    expect(reviewTime(new Date(2026, 10, 6, 14, 32).toISOString(), 'uk', now).full).toBe('6 листопада 2026 р. о 14:32');
  });

  it('copes with a missing or broken timestamp', () => {
    expect(reviewTime('not a date', 'uk', now)).toEqual({ short: '', full: '' });
  });
});
