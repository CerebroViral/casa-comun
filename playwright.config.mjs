// E2E tests: Chromium at 360×780 and 390×844, against the app served locally with the Supabase double
// (real Postgres + the real schema, RLS and RPCs). Run: npx playwright test
import { defineConfig } from '@playwright/test';

const PORT = 4190;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'movil-360', use: { viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true } },
    { name: 'movil-390', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  globalSetup: './tests/e2e/global-setup.mjs',
});
