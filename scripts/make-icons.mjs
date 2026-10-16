// Draws the app icon (house + shopping basket, palette colours) and renders the PNG sizes the PWA,
// iPhone and the Android APK need. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const CONTENT = `
  <path d="M100 250 L256 120 L412 250" fill="none" stroke="#FFFFFF" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M146 236 H366 V388 a26 26 0 0 1 -26 26 H172 a26 26 0 0 1 -26 -26 Z" fill="#FFFFFF"/>
  <path d="M212 300 a44 44 0 0 1 88 0" fill="none" stroke="#C2410C" stroke-width="16" stroke-linecap="round"/>
  <path d="M184 296 H328 L312 374 a10 10 0 0 1 -10 8 H210 a10 10 0 0 1 -10 -8 Z" fill="#C2410C"/>
  <path d="M231 318 V360 M256 318 V360 M281 318 V360" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>`;

const svg = (maskable) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${maskable ? '<rect width="512" height="512" fill="#C2410C"/>' : '<rect width="512" height="512" rx="112" fill="#C2410C"/>'}
  ${maskable ? `<g transform="translate(51.2 51.2) scale(0.8)">${CONTENT}</g>` : CONTENT}
</svg>`;

writeFileSync(new URL('../assets/icons/icon.svg', import.meta.url), svg(false));
const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true], ['favicon-32.png', 32, false],
];
for (const [file, size, maskable] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.locator('svg').screenshot({ path: new URL(`../assets/icons/${file}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), omitBackground: true });
}
await browser.close();
console.log('icons written');
