import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import {
  OriginBadge,
  OriginFilter,
  MixedOriginWarning,
  NoDataYet,
  matchesScope,
  autoMap,
  applyMapping,
  FACILITY_TARGETS,
  STOCK_TARGETS,
  SAMPLE_BADGE_TEXT,
} from '../../src/components/origin';

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, el));

describe('sample-data labelling', () => {
  it('renders the sample label on sample rows only', () => {
    const sample = html(createElement(OriginBadge, { origin: 'sample' }));
    expect(sample).toContain(SAMPLE_BADGE_TEXT);
    expect(sample).toContain('Sample data - not reported by any facility');
    // Real rows must never carry the label.
    expect(html(createElement(OriginBadge, { origin: 'real' }))).toBe('');
    expect(html(createElement(OriginBadge, { origin: null }))).toBe('');
    expect(html(createElement(OriginBadge, { origin: undefined }))).toBe('');
  });

  it('defaults the origin filter to "All data" and exposes both subtotals', () => {
    const markup = html(
      createElement(OriginFilter, {
        value: 'all',
        onChange: () => {},
        counts: { sample: 12, real: 1 },
      }),
    );
    expect(markup).toContain('All data');
    expect(markup).toContain('Sample only');
    expect(markup).toContain('Real only');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>All data/);
    expect(markup).toContain('>12<');
    expect(markup).toContain('>1<');
  });

  it('warns when a view mixes sample and real rows', () => {
    const mixed = html(createElement(MixedOriginWarning, { counts: { sample: 3, real: 2 } }));
    expect(mixed).toMatch(/mixes/i);
    expect(mixed).toContain('never reported by a facility');
    expect(html(createElement(MixedOriginWarning, { counts: { sample: 0, real: 5 } }))).toBe('');
    expect(html(createElement(MixedOriginWarning, { counts: { sample: 5, real: 0 } }))).toBe('');
  });

  it('scopes rows without silently dropping real data', () => {
    expect(matchesScope('sample', 'all')).toBe(true);
    expect(matchesScope('real', 'all')).toBe(true);
    expect(matchesScope('sample', 'sample')).toBe(true);
    expect(matchesScope('sample', 'real')).toBe(false);
    expect(matchesScope(undefined, 'real')).toBe(true);
  });

  it('renders a clean empty state with an import CTA and templates', () => {
    const empty = html(createElement(NoDataYet, { what: 'facility records' }));
    expect(empty).toContain('No facility records yet');
    expect(empty).toContain('Import your real data');
    expect(empty).toContain('/api/import-templates/facilities');
    expect(empty).toContain('/api/import-templates/stock');
    // Nothing implies the data was deleted or hidden.
    expect(empty).toMatch(/Nothing has been cleared or hidden/);
  });
});

describe('column mapping', () => {
  it('auto-matches messy headers to canonical fields', () => {
    const map = autoMap(['Facility ID', 'Facility Name', 'Latitude', 'Source', 'Extra'], FACILITY_TARGETS);
    expect(map.facility_id).toBe('Facility ID');
    expect(map.facility_name).toBe('Facility Name');
    expect(map.source).toBe('Source');
    // No fuzzy invention: an unknown canonical field stays unmapped.
    expect(map.lat).toBe('');
    expect(map.district_or_lga).toBe('');
  });

  it('rewrites a mapped file to canonical headers, including quoted values', () => {
    const csv = 'ID,Name,Units\nNG-1,"Post, One",120\n';
    const map = autoMap(['ID', 'Name', 'Units'], STOCK_TARGETS);
    const out = applyMapping(csv, ['facility_id', 'medicine', 'usable_stock_units'], {
      ...map,
      facility_id: 'ID',
      medicine: 'Name',
      usable_stock_units: 'Units',
    });
    const [header, row] = out.split(/\r?\n/);
    expect(header).toBe('facility_id,medicine,usable_stock_units');
    expect(row).toContain('"Post, One"');
  });
});
