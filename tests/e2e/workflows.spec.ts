import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
const med = '10000000-0000-4000-8000-000000000001',
  fin = '10000000-0000-4000-8000-000000000002',
  plan = '10000000-0000-4000-8000-000000000003';
async function login(page: Page, role = 'programme_manager', project = med) {
  await page.request.post('/api/auth/demo', {
    data: { role },
    headers: { 'X-AfriScope-Request': '1' },
  });
  await page.addInitScript((id) => localStorage.setItem('afriscope-project', id), project);
}
test('public entry opens a real synthetic workspace', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clearer evidence.');
  await page.getByRole('button', { name: 'Explore the live workspace' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'See the risks. Shape the next move.',
  );
  await expect(page.getByText('Synthetic demonstration', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Facilities monitored/ })).toBeVisible();
});
test('all module routes render without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  for (const [route, title] of [
    ['/problem-scoping', 'Start with the right problem.'],
    ['/experiments', 'Test the method. Keep the receipts.'],
    ['/data', 'Good decisions need trustworthy inputs.'],
    ['/operations', 'Keep delivery moving.'],
    ['/planner', 'Make the trade-offs visible.'],
    ['/learning', 'Build capability, not just confidence.'],
    ['/governance', 'Accountability, by design.'],
    ['/reports', 'Evidence that travels with the decision.'],
    ['/projects', 'Organise around the decision.'],
    ['/administration', 'The right access. Clear accountability.'],
    ['/settings', 'A workspace you can trust.'],
  ]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }
  expect(errors).toEqual([]);
});
test('stock filters, source detail, and CSV export work', async ({ page }) => {
  await login(page);
  await page.goto('/operations');
  await page.getByRole('combobox', { name: 'Risk level', exact: true }).selectOption('Critical');
  await expect(page.getByRole('table', { name: 'Facility stock records' })).toContainText(
    'Baraka Clinic',
  );
  await expect(page.getByRole('table', { name: 'Facility stock records' })).not.toContainText(
    'Stable',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export coverage' }).click();
  expect((await download).suggestedFilename()).toBe('medicine-coverage.csv');
  await page
    .getByRole('table', { name: 'Facility stock records' })
    .getByText('Baraka Clinic')
    .click();
  await expect(page.getByRole('dialog')).toContainText('Usable stock');
});
test('finance remains currency-separated', async ({ page }) => {
  await login(page, 'executive', fin);
  await page.goto('/operations?tab=Finance');
  await expect(page.getByText('Allocated', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Currency', exact: true }).selectOption('KES');
  await expect(page.getByText('KES · current source versions').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reconciliation gaps' })).toBeVisible();
});
test('CSV mapping and rejected-row workflow persists', async ({ page }) => {
  await login(page, 'data_analyst', fin);
  await page.goto('/data');
  await page.getByRole('button', { name: 'Import dataset', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data schema').selectOption('inventory');
  await dialog.locator('input[type=file]').setInputFiles('public/demo/inventory_defects.csv');
  await dialog.getByRole('button', { name: 'Preview & map' }).click();
  await expect(dialog.getByText('Map every required field', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Review import' }).click();
  await dialog.getByLabel('Dataset name').fill('E2E defect fixture');
  await dialog.getByRole('button', { name: 'Validate & import', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Import rejected — no source version created' }),
  ).toBeVisible();
  await expect(dialog.getByText('0 accepted · 8 rejected and retained')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Rejection CSV' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('tab', { name: 'Import history', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('inventory_defects.csv');
});
test('exact scenario creates a reviewable recommendation', async ({ page }) => {
  const scenarioName = 'E2E constrained allocation ' + Date.now();
  await login(page, 'programme_manager', plan);
  await page.goto('/planner');
  await page.getByRole('button', { name: 'New scenario' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Scenario name *').fill(scenarioName);
  await dialog.getByLabel('Budget ceiling (USD) *').fill('90000');
  await dialog.getByRole('button', { name: 'Save & optimise' }).click();
  await expect(page.getByText(scenarioName, { exact: true }).first()).toBeVisible();
  await page
    .locator('.scenario-card')
    .filter({ hasText: scenarioName })
    .getByRole('button', { name: 'Inspect allocation' })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Assumed');
});
test('independent reviewer can approve a manager draft', async ({ page }) => {
  await login(page);
  const workspace = await (await page.request.get('/api/projects/' + med)).json();
  const created = await page.request.post('/api/projects/' + med + '/recommendations', {
    headers: { 'X-AfriScope-Request': '1' },
    data: {
      title: 'E2E independent review ' + Date.now(),
      problem: 'Synthetic workflow test',
      action: 'Verify source records',
      benefit: 'Test only',
      evidence_id: workspace.evidence_records[0].id,
    },
  });
  const rec = await created.json();
  await page.request.post('/api/recommendations/' + rec.id + '/transition', {
    headers: { 'X-AfriScope-Request': '1' },
    data: { state: 'Under Review', reason: 'Ready' },
  });
  await login(page, 'reviewer');
  await page.goto('/operations?tab=Approvals');
  await page.getByRole('table').getByText(rec.title, { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Decision').selectOption('Approved');
  await dialog
    .getByLabel('Reason / verification / outcome notes *')
    .fill('Evidence and limitations inspected in browser test.');
  await dialog.getByRole('button', { name: 'Record approved' }).click();
  await expect(
    page.getByRole('table').getByText('Approved', { exact: true }).first(),
  ).toBeVisible();
});
test('learning quiz records server-graded progress', async ({ page }) => {
  await login(page, 'operator');
  await page.goto('/learning');
  await page
    .locator('.lesson-card')
    .filter({ hasText: 'From data quality to trustworthy decisions' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Structural completeness, not real-world accuracy').check();
  await dialog
    .getByLabel('Evidence references, assumptions, limitations, and human review')
    .check();
  await dialog.getByRole('button', { name: 'Submit assessment' }).click();
  await expect(dialog.getByRole('heading', { name: '100%' })).toBeVisible();
  await expect(dialog.getByText('Completed', { exact: true })).toBeVisible();
});
test('assistant labels local mode and returns cited evidence', async ({ page }) => {
  await login(page, 'executive');
  await page.goto('/');
  await page
    .getByPlaceholder('Ask a question about this project…')
    .fill('Which medicine stock risks need attention?');
  await page.getByRole('button', { name: 'Ask evidence assistant' }).click();
  await expect(
    page.getByText('Local deterministic assistant', { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/not authorised transfers/)).toBeVisible();
});
test('executive cannot see enabled write actions', async ({ page }) => {
  await login(page, 'executive');
  await page.goto('/data');
  await expect(page.getByRole('button', { name: 'Import dataset', exact: true })).toBeDisabled();
  await page.goto('/administration');
  await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible();
});
test('mobile workspace has no page-level horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Data Intelligence', exact: true })).toBeVisible();
});

test('key workspace views pass automated WCAG A/AA checks', async ({ page }) => {
  await login(page);
  for (const route of ['/', '/operations', '/data']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
