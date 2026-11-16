import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Layout regressions found in the programme-manager review are all single CSS
 * declarations, and none of them fail a type check or a functional test. These
 * assertions read the stylesheet so removing a fix is caught here.
 */
const css = readFileSync(resolve('src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Body declarations of every rule whose selector list contains `selector`. */
const rule = (selector: string) => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return blocks
    .filter(([, selectors]) =>
      selectors
        .split(',')
        .map((s) => s.trim())
        .includes(selector),
    )
    .map(([, , body]) => body)
    .join('\n');
};

describe('Part 4 layout rules', () => {
  it('4.1 sizes the brand mark instead of letting the SVG fill its container', () => {
    const logo = rule('.logo svg');
    expect(logo).toMatch(/width:\s*\d+px/);
    expect(logo).toMatch(/height:\s*\d+px/);
    // and the value is small enough to be a header mark
    expect(logo).toMatch(/height:\s*(28|32|36|40|48|64)px/);
  });

  it('4.1 lays the guide header out instead of letting the logo and button collide', () => {
    expect(rule('.guide-page header')).toMatch(/display:\s*flex/);
    expect(rule('.guide-page header')).toMatch(/justify-content:\s*space-between/);
  });

  it('4.2 keeps the demo banner readable (light text on the dark band)', () => {
    expect(rule('.demo-banner')).toMatch(/color:\s*#ecfdf5/i);
    expect(rule('.demo-banner')).toMatch(/background:\s*#0f3024/i);
    expect(rule('strong')).toMatch(/color:\s*inherit/);
  });

  it('4.3 pads panel content so the 28px rounded corner cannot clip it', () => {
    expect(rule('.panel > .key-values')).toMatch(/padding-left:\s*24px/);
    expect(rule('.panel')).toMatch(/overflow:\s*hidden/);
    expect(rule('.panel-heading')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('4.4 makes the reading dialog opaque and restores list bullets', () => {
    const modal = rule('.modal');
    expect(modal).toMatch(/background:\s*#ffffff/i);
    expect(rule('.detail-list')).toMatch(/list-style:\s*disc/);
    expect(rule('.lesson-card footer')).toMatch(/display:\s*flex/);
    expect(rule('.lesson-card footer')).toMatch(/gap:\s*\d+px/);
  });

  it('4.5 keeps the redistribution card and its action on one line', () => {
    expect(rule('.transfer-route')).toMatch(/display:\s*flex/);
    expect(rule('.text-button')).toMatch(/white-space:\s*nowrap/);
    expect(rule('.transfer-list')).toMatch(/padding/);
  });

  it('4.7 lets the navigation scroll with a pinned footer instead of clipping', () => {
    expect(rule('.sidebar-nav')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.sidebar-footer')).toMatch(/flex-shrink:\s*0/);
  });
});
