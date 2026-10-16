// Renders the approved mockups (docs/disenos/*.dc.html) to PNG for side-by-side comparison.
// Usage: node scripts/render-mockups.mjs <outDir> [width]
import { chromium } from '@playwright/test';
import { readdirSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const out = process.argv[2] ?? 'docs/capturas/mockups';
const width = Number(process.argv[3] ?? 390);
mkdirSync(out, { recursive: true });
const dir = new URL('../docs/disenos/', import.meta.url);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 844 } });
await page.route('**/support.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
for (const f of readdirSync(dir).filter((x) => x.endsWith('.dc.html'))) {
  await page.goto(new URL(f, dir).href);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${f.replace('.dc.html', '')}.png`, clip: { x: 0, y: 0, width, height: 844 } });
}
await browser.close();
console.log('mockups rendered to', out);
