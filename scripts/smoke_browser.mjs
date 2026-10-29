import { chromium as playwright } from 'playwright';
import chromium from '@sparticuz/chromium';
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text());
});
await page.goto('http://localhost:3000/welcome', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/afriscope-landing.png', fullPage: true });
console.log('LANDING', await page.locator('h1').textContent());
await page.getByRole('button', { name: 'Explore the live workspace' }).click();
await page.waitForURL('http://localhost:3000/');
await page.waitForTimeout(2500);
console.log('DASH', await page.locator('h1').textContent());
await page.screenshot({ path: '/tmp/afriscope-dashboard.png', fullPage: true });
for (const [path] of [
  ['/operations', 'Programme operations'],
  ['/data', 'Data & decision intelligence'],
  ['/planner', 'Intervention planning'],
  ['/problem-scoping', 'Problem Scoping Studio'],
  ['/experiments', 'AI Experiment Lab'],
  ['/learning', 'AI Learning Academy'],
  ['/governance', 'Responsible AI & governance'],
  ['/reports', 'Reports & documents'],
  ['/administration', 'Organisation administration'],
  ['/settings', 'Workspace settings'],
  ['/projects', 'Projects & workspaces'],
]) {
  await page.goto('http://localhost:3000' + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  console.log(path, await page.locator('h1').allTextContents());
}
await browser.close();
