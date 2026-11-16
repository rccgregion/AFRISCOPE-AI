import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { EmptyState } from '../../src/components/EmptyState';

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, el));

// Part 5.1: "no records" and "your filter hides the records" are different
// situations and must not be described with the same words or the same action.
describe('EmptyState', () => {
  it('separates a filter from an empty dataset', () => {
    let cleared = 0;
    const filtered = html(
      createElement(EmptyState, {
        variant: 'filtered',
        title: 'No datasets match this origin filter',
        description: 'Nothing has been deleted.',
        filterLabel: 'Real only',
        onClearFilter: () => {
          cleared += 1;
        },
      }),
    );
    const empty = html(
      createElement(EmptyState, {
        title: 'No stock records yet',
        description: 'Recalculate once stock has been imported.',
        action: createElement('a', { href: '/data', className: 'btn btn-primary' }, 'Import data'),
      }),
    );

    expect(filtered).toContain('is-filtered');
    expect(filtered).toContain('Clear filter (Real only)');
    expect(filtered).not.toContain('Import data');
    expect(filtered).toContain('Nothing has been deleted.');

    expect(empty).toContain('is-empty');
    expect(empty).toContain('Import data');
    expect(empty).not.toContain('Clear filter');
    expect(cleared).toBe(0);
  });

  it('never claims something was lost', () => {
    const filtered = html(
      createElement(EmptyState, {
        variant: 'filtered',
        title: 't',
        description: 'd',
        onClearFilter: () => {},
      }),
    );
    expect(filtered).not.toMatch(/deleted|removed|lost/i);
  });

  it('renders a compact variant for in-panel use', () => {
    const small = html(
      createElement(EmptyState, {
        compact: true,
        title: 'Nothing to compare yet',
        description: 'd',
      }),
    );
    expect(small).toContain('compact');
  });
});
