import { describe, it, expect } from 'vitest';
import {
  inventoryBalance,
  daysOfStock,
  stockRisk,
  transferQuantity,
  metrics,
  movingAverage,
  exponentialSmooth,
  evaluateSeries,
  aggregateFinance,
  optimise,
  transition,
  type Option,
} from '../../shared/analytics';
import { can, ROLES } from '../../shared/domain';
const balance = {
  opening_stock: 100,
  quantity_received: 30,
  quantity_dispensed: 50,
  adjustments: -5,
  closing_stock: 75,
  usable_stock: 60,
  reserved_stock: 10,
  expired_stock: 5,
};
describe('inventory integrity', () => {
  it('accepts an exact integer balance', () => expect(inventoryBalance(balance)).toEqual([]));
  it('rejects inconsistent closing stock', () =>
    expect(inventoryBalance({ ...balance, closing_stock: 76 }).length).toBeGreaterThan(0));
  it('rejects overallocated stock', () =>
    expect(inventoryBalance({ ...balance, usable_stock: 70 })).toHaveLength(1));
  it('rejects negative usable quantities', () =>
    expect(inventoryBalance({ ...balance, usable_stock: -1 })).toHaveLength(1));
  it('rejects fractional units', () =>
    expect(inventoryBalance({ ...balance, opening_stock: 1.5 })).toHaveLength(2));
  it.each([0, -1, null, NaN])('does not estimate coverage for %s demand', (d) =>
    expect(daysOfStock(100, d as number | null)).toBeNull(),
  );
  it('does not estimate unreliable coverage', () => expect(daysOfStock(100, 10, false)).toBeNull());
  it('computes usable-stock coverage', () => expect(daysOfStock(75, 5)).toBe(15));
  it('flags zero usable stock critical with known demand', () =>
    expect(stockRisk(0, 10, 21, 0)).toBe('Critical'));
  it('flags coverage below lead time', () => expect(stockRisk(9, 10, 21, 90)).toBe('Critical'));
  it('distinguishes no demand from unknown', () =>
    expect(stockRisk(null, null, 21, 10)).toBe('No demand'));
  it('blocks transfers expiring in transit', () =>
    expect(transferQuantity(1000, 10, 28, 500, 2, 10)).toBe(0));
  it('preserves donor reserve and transit demand', () =>
    expect(transferQuantity(1000, 10, 28, 500, 2, 30, 50)).toBe(500));
  it('caps transfer at recipient need', () =>
    expect(transferQuantity(1000, 10, 28, 100, 2, 30)).toBe(100));
});
describe('time-aware evaluation', () => {
  it('computes MAE, WAPE and signed bias', () =>
    expect(metrics([10, 20], [12, 18])).toMatchObject({ mae: 2, wape: 4 / 30, bias: 0, n: 2 }));
  it('returns null WAPE for zero actual demand', () =>
    expect(metrics([0, 0], [2, 3]).wape).toBeNull());
  it('rejects mismatched pairs', () => expect(() => metrics([1], [1, 2])).toThrow());
  it('rejects negative predictions', () => expect(() => metrics([1], [-1])).toThrow());
  it('uses trailing observations only', () => expect(movingAverage([100, 2, 4, 6, 8])).toBe(5));
  it('uses deterministic exponential smoothing', () =>
    expect(exponentialSmooth([10, 20], 0.3)).toBe(13));
  it('requires sufficient history', () =>
    expect(() =>
      evaluateSeries(
        Array.from({ length: 23 }, (_, i) => ({ date: String(i), value: i })),
        'x',
        'x',
      ),
    ).toThrow());
  it('selects on validation and preserves chronological test alignment', () => {
    const values = Array.from({ length: 52 }, (_, i) => ({
      date: new Date(Date.UTC(2025, 0, 1 + 7 * i)).toISOString().slice(0, 10),
      value: 100 + i,
    }));
    const a = evaluateSeries(values, 'x', 'x'),
      b = evaluateSeries(values, 'x', 'x');
    expect(a).toEqual(b);
    expect(a.test[0].n).toBe(9);
    expect(a.validation[0].n).toBe(7);
    expect(a.points.filter((p) => p.predicted !== null)).toHaveLength(13);
    expect(a.points[51].predicted).toBeGreaterThan(140);
  });
});
describe('finance and permissions', () => {
  it('sums integer minor units', () =>
    expect(
      aggregateFinance(
        [
          { currency: 'NGN', amount_cents: 1001 },
          { currency: 'NGN', amount_cents: 299 },
        ],
        'NGN',
      ).total_cents,
    ).toBe(1300));
  it('rejects mixed currencies', () =>
    expect(() =>
      aggregateFinance([
        { currency: 'NGN', amount_cents: 100 },
        { currency: 'KES', amount_cents: 100 },
      ]),
    ).toThrow());
  it('executive is read only', () => expect(can('executive', 'data')).toBe(false));
  it('analyst cannot approve', () => expect(can('data_analyst', 'approve')).toBe(false));
  it('reviewer cannot change data', () => expect(can('reviewer', 'data')).toBe(false));
  it('operator cannot approve', () => expect(can('operator', 'approve')).toBe(false));
  it('manager cannot approve', () => expect(can('programme_manager', 'approve')).toBe(false));
  it('unknown roles fail closed', () => expect(can(undefined, 'read')).toBe(false));
  it('all seven roles can read', () => expect(ROLES.every((r) => can(r, 'read'))).toBe(true));
  it('requires valid recommendation transitions', () => {
    expect(() => transition('Draft', 'Under Review')).not.toThrow();
    expect(() => transition('Draft', 'Approved')).toThrow();
    expect(() => transition('Outcome Reviewed', 'Draft')).toThrow();
  });
});
const option = (
  id: string,
  cost: number,
  outcome: number,
  extra: Partial<Option> = {},
): Option => ({
  id,
  name: id,
  cost_cents: cost,
  currency: 'USD',
  expected_outcome: outcome,
  capacity: outcome,
  geography: 'North',
  equity_group: 'Urban',
  implementation_months: 6,
  dependencies: [],
  ...extra,
});
const constraints = { required_geographies: [], equity_minimum: 0, max_months: 12 };
describe('exact allocation', () => {
  it('finds exact optimum rather than cost-effectiveness order', () => {
    const r = optimise(
      [option('a', 6, 9), option('b', 5, 7), option('c', 5, 7)],
      10,
      'USD',
      constraints,
    );
    expect(r.selected).toEqual(['b', 'c']);
    expect(r.expected_outcome).toBe(14);
  });
  it('enforces dependencies', () => {
    const r = optimise(
      [option('a', 5, 100, { dependencies: ['b'] }), option('b', 6, 1)],
      10,
      'USD',
      { ...constraints, required_options: ['a'] },
    );
    expect(r.feasible).toBe(false);
  });
  it('detects cycles', () =>
    expect(() =>
      optimise(
        [option('a', 5, 10, { dependencies: ['b'] }), option('b', 5, 10, { dependencies: ['a'] })],
        10,
        'USD',
        constraints,
      ),
    ).toThrow('Circular'));
  it('rejects cross-project/missing dependencies', () =>
    expect(() =>
      optimise([option('a', 5, 10, { dependencies: ['foreign'] })], 10, 'USD', constraints),
    ).toThrow());
  it('rejects mixed currencies', () =>
    expect(() =>
      optimise([option('a', 5, 10, { currency: 'KES' })], 10, 'USD', constraints),
    ).toThrow());
  it('honours geography, rural equity and duration together', () => {
    const r = optimise(
      [
        option('a', 5, 10, { equity_group: 'Rural' }),
        option('b', 5, 20, { geography: 'South', implementation_months: 13 }),
      ],
      10,
      'USD',
      { ...constraints, required_geographies: ['South'], equity_minimum: 1 },
    );
    expect(r.feasible).toBe(false);
    expect(r.reasons.join(' ')).toContain('South');
  });
  it('returns an empty feasible portfolio at zero budget', () =>
    expect(optimise([], 0, 'USD', constraints)).toMatchObject({
      feasible: true,
      selected: [],
      total_cost_cents: 0,
    }));
  it('breaks outcome ties by lower cost', () =>
    expect(
      optimise([option('a', 5, 10), option('b', 4, 10)], 4, 'USD', constraints).selected,
    ).toEqual(['b']));
  it('rejects more than 16 options instead of silently truncating', () =>
    expect(() =>
      optimise(
        Array.from({ length: 17 }, (_, i) => option(String(i), 1, 1)),
        10,
        'USD',
        constraints,
      ),
    ).toThrow());
});
