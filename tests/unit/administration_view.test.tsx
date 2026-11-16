import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { RestrictedAdministration } from '../../src/components/Restricted';
import { accessScopeLabel, isOrganisationWide } from '../../src/lib/access';
import { Guide } from '../../src/features/Public';

const html = (el: React.ReactElement) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, el));

// Part 3.1: a role that cannot use Administration must see the reason instead of
// the page, never the reason stacked above real administrator content.
describe('Restricted Administration view', () => {
  const markup = html(createElement(RestrictedAdministration, { role: 'programme_manager' }));

  it('explains the block and names the current role', () => {
    expect(markup).toContain('Administrator access required');
    expect(markup).toContain('Programme manager');
  });

  it('renders no administrator content behind the notice', () => {
    expect(markup).not.toContain('Project membership');
    expect(markup).not.toContain('Invite member');
    expect(markup).not.toContain('Reset demonstration');
    expect(markup).not.toContain('Organisation profile');
  });

  it('offers a way back', () => {
    expect(markup).toContain('Return to overview');
  });
});

// Part 3.1: an organisation administrator reaches the whole organisation.
describe('access scope wording', () => {
  it('describes organisation administrators as organisation-wide', () => {
    expect(accessScopeLabel('organisation_admin')).toBe('Organisation-wide');
    expect(accessScopeLabel('platform_admin')).toBe('Organisation-wide');
    expect(isOrganisationWide('organisation_admin')).toBe(true);
  });

  it('keeps every other role project scoped', () => {
    for (const role of ['programme_manager', 'data_analyst', 'operator', 'reviewer', 'executive']) {
      expect(accessScopeLabel(role)).toBe('Project scoped');
      expect(isOrganisationWide(role)).toBe(false);
    }
    expect(accessScopeLabel(null)).toBe('Project scoped');
  });
});

// Part 3.3: the overview guide must describe the controls that actually exist.
describe('Overview guide', () => {
  const markup = html(createElement(Guide));

  it('has eight steps', () => {
    const titles = markup.match(/<h2>\d\. /g) || [];
    expect(titles.length).toBe(8);
  });

  it('documents origin filtering, clearing sample data, importing and labels', () => {
    expect(markup).toMatch(/origin filter/i);
    expect(markup).toMatch(/Preview what would be removed/i);
    expect(markup).toMatch(/Import dataset/i);
    expect(markup).toMatch(/data_origin/);
    expect(markup).toMatch(/Data as of/);
  });

  it('drops stale instructions', () => {
    expect(markup).not.toContain('Defect fixture');
    expect(markup).not.toContain('defect fixture');
    expect(markup).not.toMatch(/persona selector in the top bar/i);
    expect(markup).not.toContain('Fixed seed');
  });

  it('points documentation at the main branch, not an expired working branch', () => {
    expect(markup).toContain('github.com/rccgregion/AFRISCOPE-AI/tree/main/docs');
    expect(markup).not.toContain('arena/bb428b97');
  });
});
