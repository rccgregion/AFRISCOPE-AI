import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const base = process.env.AUDIT_URL || 'http://127.0.0.1:3000';
await page.request.post(base + '/api/auth/demo', {
  data: { role: 'programme_manager' },
  headers: { 'X-AfriScope-Request': '1' },
});
const results = [];
for (const route of [
  '/welcome',
  '/',
  '/operations',
  '/data',
  '/planner',
  '/learning',
  '/governance',
]) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const violations = audit.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
  }));
  results.push({ route, violations });
}
console.log(
  JSON.stringify(
    results.map((r) => ({
      route: r.route,
      violations: r.violations.map((v) => ({ id: v.id, count: v.nodes.length })),
    })),
    null,
    2,
  ),
);
writeFileSync(
  'evaluations/accessibility.json',
  JSON.stringify(
    {
      date: new Date().toISOString(),
      tool: 'axe-core WCAG 2/2.1 A/AA automated checks',
      limitation: 'Automated checks are not a complete accessibility certification.',
      results,
    },
    null,
    2,
  ),
);
await browser.close();
