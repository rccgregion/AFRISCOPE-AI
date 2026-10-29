import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { readFileSync } from 'node:fs';
import { validateRows, qualityReport } from '../../server/validation';
import { answerSchema, localAnswer, validateGrounding } from '../../server/assistant';
const refs = {
  facilities: new Map([['F001', { id: 'f1', country: 'Kijani Republic' }]]),
  products: new Map([['MED001', { id: 'p1', unit: 'capsules' }]]),
  budgets: new Map([['B1', { id: 'b1', currency: 'NGN', programme_code: 'P1' }]]),
};
const base = {
  facility_id: 'F001',
  product_id: 'MED001',
  unit: 'capsules',
  reporting_date: '2026-09-30',
  opening_stock: 100,
  quantity_received: 20,
  quantity_dispensed: 30,
  adjustments: 0,
  closing_stock: 90,
  usable_stock: 80,
  reserved_stock: 5,
  expired_stock: 5,
  stockout_days: 0,
  expiry_date: '2027-01-01',
  minimum_stock: 10,
  maximum_stock: 200,
};
const fixture = Papa.parse<Record<string, unknown>>(
  readFileSync('public/demo/inventory_defects.csv', 'utf8'),
  { header: true, dynamicTyping: true },
).data.filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
describe('import validation', () => {
  it('accepts a valid mapped row', () =>
    expect(
      validateRows('inventory', [base], { closing_stock: 'closing_stock' }, refs).accepted,
    ).toHaveLength(1));
  it('retains every defect with source row and reason', () => {
    const r = validateRows('inventory', fixture, {}, refs);
    expect(r.rejections).toHaveLength(8);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejections[0].row).toBe(2);
    expect(r.rejections[0].record).toEqual(fixture[0]);
  });
  it('rejects unknown facility', () =>
    expect(
      validateRows('inventory', [{ ...base, facility_id: 'X' }], {}, refs).rejections[0].field,
    ).toBe('facility_id'));
  it('rejects incompatible units', () =>
    expect(
      validateRows('inventory', [{ ...base, unit: 'tablets' }], {}, refs).rejections[0].field,
    ).toBe('unit'));
  it('rejects duplicate business keys', () =>
    expect(validateRows('inventory', [base, base], {}, refs).rejections[0].reason).toContain(
      'Duplicate',
    ));
  it('rejects impossible calendar dates', () =>
    expect(
      validateRows('inventory', [{ ...base, reporting_date: '2026-02-30' }], {}, refs).rejections[0]
        .field,
    ).toBe('reporting_date'));
  it('does not infer accuracy from completeness', () =>
    expect(qualityReport('inventory', [base], 1, [], '2026-09-30').metrics.accuracy).toContain(
      'Not verifiable',
    ));
  const budget = {
    external_id: 'B1',
    programme_code: 'P1',
    programme_name: 'Test',
    currency: 'NGN',
    period: '2026-Q3',
    amount: '10.25',
  };
  it('converts decimal major units to exact cents', () =>
    expect(validateRows('budgets', [budget], {}, refs).accepted[0].data.amount_cents).toBe(1025));
  it('rejects sub-cent precision', () =>
    expect(
      validateRows('budgets', [{ ...budget, amount: '10.255' }], {}, refs).rejections[0].field,
    ).toBe('amount'));
  it('rejects implicit currency conversion', () =>
    expect(
      validateRows(
        'funding_releases',
        [
          {
            external_id: 'R1',
            budget_id: 'B1',
            currency: 'KES',
            amount: 10,
            due_date: '2026-09-30',
            status: 'Pending',
            period: '2026-Q3',
          },
        ],
        {},
        refs,
      ).rejections[0].field,
    ).toBe('currency'));
});
describe('grounded assistant', () => {
  const e = {
    id: '10000000-0000-4000-8000-000000000009',
    question: 'Stock risk',
    result: { critical: 3, elevated: 0, facilities: 12, redistribution_opportunities: 2 },
    limitations: [],
    source_versions: [{ version_id: 'x' }],
  };
  it('labels no-evidence refusal', () =>
    expect(localAnswer('unknown', []).classification).toBe('Insufficient evidence'));
  it('uses only computed values and source citation', () => {
    const a = localAnswer('stock', [e]);
    expect(validateGrounding(a, [e]).evidence_ids).toEqual([e.id]);
    expect(a.answer).toContain('3 critical-risk');
  });
  it('rejects fabricated citation', () =>
    expect(() =>
      validateGrounding(
        { ...localAnswer('stock', [e]), evidence_ids: ['10000000-0000-4000-8000-000000000099'] },
        [e],
      ),
    ).toThrow());
  it('rejects fabricated number', () =>
    expect(() =>
      validateGrounding({ ...localAnswer('stock', [e]), answer: 'There are 999 facilities.' }, [e]),
    ).toThrow());
  it('enforces structured output', () =>
    expect(answerSchema.safeParse({ answer: 'x' }).success).toBe(false));
});
