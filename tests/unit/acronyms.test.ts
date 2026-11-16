import { describe, it, expect } from 'vitest';
import { displayText } from '../../src/lib/text';

// Part 4.4: seeded lesson copy lower-cased its pathway name, so "ai" and "llm"
// appeared beside correctly cased "AI"/"LLM" on the same screen.
describe('displayText acronym casing', () => {
  it('restores AI and LLM as whole words', () => {
    expect(displayText('practical foundations for ai fundamentals')).toBe(
      'practical foundations for AI fundamentals',
    );
    expect(displayText('effective llm use for research')).toBe('effective LLM use for research');
  });

  it('leaves ordinary words that merely contain those letters alone', () => {
    expect(displayText('air, claim, email, trail, llms')).toBe('air, claim, email, trail, llms');
  });

  it('does not double-uppercase text that is already correct', () => {
    expect(displayText('AI fundamentals and LLM evaluation')).toBe(
      'AI fundamentals and LLM evaluation',
    );
  });
});
