import { expect } from '@playwright/test';

export const PASSWORD = 'secreto-de-prueba';

// A separate "phone" (browser context) with the project's screen size.
export async function phone(browser, testInfo, { serviceWorkers = 'block' } = {}) {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    viewport: use.viewport, hasTouch: use.hasTouch, isMobile: use.isMobile, locale: 'es-ES', timezoneId: 'Europe/Madrid',
    baseURL: use.baseURL ?? testInfo.config.projects[0].use.baseURL, serviceWorkers,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[${testInfo.project.name}] pageerror:`, e.message));
  return { context, page };
}

export function uniqueEmail(testInfo, who) {
  return `${who}.${testInfo.project.name}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@prueba.es`;
}

export async function signUp(page, email) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await page.getByLabel('Tu correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Crear casa' }).first()).toBeVisible();
}

export async function createHouse(page, { house = 'Casa de prueba', name }) {
  await page.getByLabel('Nombre de la casa').fill(house);
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByRole('button', { name: 'Crear casa' }).last().click();
  await expect(page.getByRole('button', { name: 'Añadir producto' })).toBeVisible();
}

export async function joinHouse(page, { code, name }) {
  await page.getByRole('button', { name: 'Unirme con código' }).click();
  await page.getByLabel('Código de la casa').fill(code);
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByRole('button', { name: 'Unirme', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Añadir producto' })).toBeVisible();
}

export async function inviteCode(page) {
  await page.getByRole('link', { name: 'Casa' }).click();
  const code = (await page.locator('.code').first().textContent()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await page.getByRole('link', { name: 'Lista' }).click();
  return code;
}

export async function addItem(page, { name, price, list }) {
  await page.getByRole('button', { name: 'Añadir producto' }).click();
  await page.getByRole('combobox', { name: 'Producto' }).fill(name);
  if (price) await page.getByLabel('Precio estimado').fill(price);
  if (list === 'urgent') await page.getByRole('radio', { name: 'Hace falta ya' }).click();
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  if (list === 'urgent') await page.getByRole('tab', { name: /Hace falta ya/ }).click();
  await expect(page.getByRole('button', { name: `Marcar ${name} como comprado` })).toBeVisible();
}

export const banner = (page) => page.locator('#banner');
