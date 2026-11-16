/**
 * Display-level typography for the two acronyms this product uses constantly.
 * Seeded lesson copy lower-cased its pathway name, which rendered "ai" and "llm"
 * next to correctly cased "AI"/"LLM" elsewhere on the same screen (Part 4.4).
 * Only whole words are rewritten, so "air", "claim" or "email" are untouched.
 */
const ACRONYMS: [RegExp, string][] = [
  [/\bai\b/g, 'AI'],
  [/\bllm\b/g, 'LLM'],
  [/\bafriscope ai\b/gi, 'AfriScope AI'],
];

export function displayText(value: string): string {
  return ACRONYMS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  );
}

export function displayTextDeep<T>(value: T): T {
  if (typeof value === 'string') return displayText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => displayTextDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, displayTextDeep(v)]),
    ) as unknown as T;
  }
  return value;
}
