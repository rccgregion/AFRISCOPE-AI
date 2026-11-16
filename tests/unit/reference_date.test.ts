import { describe, it, expect } from 'vitest';
import { deliveryLabel, dateLabel } from '../../shared/domain';

// Part 2.3: an operational reference date of 30/09/2026 must never let a past
// delivery date read as though it were still ahead of the programme.
describe('deliveryLabel', () => {
  const asOf = '2026-09-30';

  it('marks a delivery before the reference date as overdue, not upcoming', () => {
    expect(deliveryLabel('2026-09-12', asOf)).toBe('12 Sept 2026 (overdue as of 30 Sept 2026)');
    expect(deliveryLabel('2026-09-12', asOf)).not.toMatch(/^12 Sept 2026$/);
  });

  it('keeps a future delivery date plain', () => {
    expect(deliveryLabel('2026-10-14', asOf)).toBe(dateLabel('2026-10-14'));
  });

  it('names the reference-day delivery as expected today', () => {
    expect(deliveryLabel('2026-09-30', asOf)).toBe('30 Sept 2026 (expected today)');
  });

  it('says when no delivery date is recorded instead of inventing one', () => {
    expect(deliveryLabel(null, asOf)).toBe('Not recorded');
    expect(deliveryLabel(undefined, asOf)).toBe('Not recorded');
  });

  it('falls back to the plain date when no reference date is configured', () => {
    expect(deliveryLabel('2026-09-12', undefined)).toBe(dateLabel('2026-09-12'));
  });
});
