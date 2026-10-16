// SPEC §9: sign up → create house → second user joins with code → add item → mark bought offline →
// reconnect → both see it → close month → history.
import { test, expect } from '@playwright/test';
import { phone, uniqueEmail, signUp, createHouse, joinHouse, inviteCode, addItem, banner } from './helpers.mjs';

test('compra compartida de principio a fin, con un rato sin conexión', async ({ browser }, testInfo) => {
  const ana = await phone(browser, testInfo);
  const bruno = await phone(browser, testInfo);

  await signUp(ana.page, uniqueEmail(testInfo, 'ana'));
  await createHouse(ana.page, { name: 'Ana' });
  await expect(ana.page.getByText('By SophieNexus · © 2026 Todos los derechos reservados')).toBeVisible();
  const code = await inviteCode(ana.page);

  await signUp(bruno.page, uniqueEmail(testInfo, 'bruno'));
  await joinHouse(bruno.page, { code, name: 'Bruno' });
  await expect(bruno.page.getByText(/^2 en casa · /)).toBeVisible();

  // Ana adds an item; Bruno sees it by realtime.
  await addItem(ana.page, { name: 'Leche', price: '5,70' });
  await expect(bruno.page.getByRole('button', { name: 'Marcar Leche como comprado' })).toBeVisible();
  await expect(bruno.page.getByText('añadido por Ana')).toBeVisible();

  // Ana loses signal in the supermarket and marks it bought.
  await ana.context.setOffline(true);
  await ana.page.getByRole('button', { name: 'Marcar Leche como comprado' }).click();
  await ana.page.getByLabel('¿Cuánto costó?').fill('5,58');
  await expect(ana.page.getByText(/Ana adelanta 5,58\s€ y cada adulto pone 2,79\s€/)).toBeVisible();
  await ana.page.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(banner(ana.page)).toHaveText('Sin conexión · 1 cambio pendiente');
  await expect(ana.page.getByText('Comprado por Ana · Mercadona')).toBeVisible();
  await expect(ana.page.getByText('sin enviar')).toBeVisible();
  // Nothing reached the server yet.
  await bruno.page.waitForTimeout(1000);
  await expect(bruno.page.getByRole('button', { name: 'Marcar Leche como comprado' })).toBeVisible();

  // The local queue survives a reload while offline.
  await ana.page.reload().catch(() => {});

  // Signal comes back: the queue is sent and both see it.
  await ana.context.setOffline(false);
  await ana.page.goto('./#/lista');
  await expect(ana.page.getByText('Comprado por Ana · Mercadona')).toBeVisible();
  await expect(banner(ana.page)).not.toContainText('pendiente', { timeout: 20_000 });
  await expect(bruno.page.getByText('Comprado por Ana · Mercadona')).toBeVisible({ timeout: 20_000 });

  // Accounts: 5,58 € split between two adults.
  await bruno.page.getByRole('link', { name: 'Cuentas' }).click();
  await expect(bruno.page.getByText('Entre 2 adultos a partes iguales')).toBeVisible();
  await expect(bruno.page.locator('.balance').filter({ hasText: '+2,79' })).toBeVisible();
  await expect(bruno.page.locator('.balance').filter({ hasText: '−2,79' })).toBeVisible();

  // Bruno does the big shop and enters it from the closing screen.
  await bruno.page.getByRole('link', { name: /Preparar cierre de mes/ }).click();
  await expect(bruno.page.getByText('Lo que pone cada uno para la compra grande')).toBeVisible();
  await bruno.page.getByRole('button', { name: 'Añadir la compra grande' }).click();
  await bruno.page.getByLabel('¿Cuánto costó?').fill('100,00');
  await bruno.page.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(bruno.page.getByText('Pagó la compra grande: Bruno')).toBeVisible();
  // Total 105,58 → 52,79 each; Ana advanced 5,58 → Ana pays Bruno 47,21 by Bizum.
  await expect(bruno.page.getByText(/Parte de cada adulto: 105,58\s€ ÷ 2 = 52,79\s€/)).toBeVisible();
  const bizum = bruno.page.getByRole('button', { name: /Ana debe 47,21\s€ a Bruno/ });
  await expect(bizum).toBeVisible();
  await bizum.click();
  await bruno.page.getByRole('button', { name: 'Sí, pagado' }).click();
  await expect(bruno.page.getByText(/Ana → 47,21\s€ · pagado/)).toBeVisible();

  // Close the month.
  await bruno.page.getByRole('button', { name: /^Cerrar .* y empezar / }).click();
  await bruno.page.getByRole('button', { name: 'Cerrar el mes' }).click();
  await expect(bruno.page.getByText(/^Cerrado el /)).toBeVisible();

  // History, seen from Ana's phone.
  await ana.page.goto('./#/meses');
  await expect(ana.page.getByText('105,58 €')).toBeVisible();
  await expect(ana.page.getByText(/Ana → Bruno 47,21\s€ · pagado/)).toBeVisible();
  // The bought monthly item left the list; the new month starts empty.
  await ana.page.goto('./#/lista');
  await expect(ana.page.getByText('La compra del mes está vacía')).toBeVisible();
  await ana.page.goto('./#/cuentas');
  await expect(ana.page.getByText('Todavía no hay compras este mes.')).toBeVisible();

  await ana.context.close();
  await bruno.context.close();
});

test('si otra persona ya lo compró, avisa y no duplica', async ({ browser }, testInfo) => {
  const ana = await phone(browser, testInfo);
  const bruno = await phone(browser, testInfo);
  await signUp(ana.page, uniqueEmail(testInfo, 'ana'));
  await createHouse(ana.page, { name: 'Ana' });
  const code = await inviteCode(ana.page);
  await signUp(bruno.page, uniqueEmail(testInfo, 'bruno'));
  await joinHouse(bruno.page, { code, name: 'Bruno' });
  await addItem(ana.page, { name: 'Pan', price: '1,45', list: 'urgent' });
  await bruno.page.getByRole('tab', { name: /Hace falta ya/ }).click();
  await expect(bruno.page.getByRole('button', { name: 'Marcar Pan como comprado' })).toBeVisible();

  // Bruno is offline and buys it; meanwhile Ana buys it too, online.
  await bruno.context.setOffline(true);
  await bruno.page.getByRole('button', { name: 'Marcar Pan como comprado' }).click();
  await bruno.page.getByLabel('¿Cuánto costó?').fill('1,50');
  await bruno.page.getByRole('button', { name: 'Guardar compra' }).click();
  await ana.page.getByRole('tab', { name: /Hace falta ya/ }).click();
  await ana.page.getByRole('button', { name: 'Marcar Pan como comprado' }).click();
  await ana.page.getByLabel('¿Cuánto costó?').fill('1,45');
  await ana.page.getByRole('button', { name: 'Guardar compra' }).click();
  await expect(ana.page.getByText('Comprado por Ana · Mercadona')).toBeVisible();

  await bruno.context.setOffline(false);
  await bruno.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(bruno.page.locator('#toast')).toContainText('Ana ya lo compró', { timeout: 20_000 });
  await expect(bruno.page.getByText('Comprado por Ana · Mercadona')).toBeVisible({ timeout: 20_000 });
  await bruno.page.getByRole('link', { name: 'Cuentas' }).click();
  await expect(bruno.page.getByText('Adelantado este mes')).toBeVisible();
  await expect(bruno.page.locator('.stat-card')).toContainText('1,45 €');

  await ana.context.close();
  await bruno.context.close();
});

test('abre sin conexión con la lista guardada en el móvil', async ({ browser }, testInfo) => {
  const ana = await phone(browser, testInfo, { serviceWorkers: 'allow' });
  await signUp(ana.page, uniqueEmail(testInfo, 'ana'));
  await createHouse(ana.page, { name: 'Ana' });
  await addItem(ana.page, { name: 'Tomates', price: '2,10' });
  await ana.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await ana.page.reload();
  await expect(ana.page.getByRole('button', { name: 'Marcar Tomates como comprado' })).toBeVisible();

  await ana.context.setOffline(true);
  await ana.page.reload();
  await expect(ana.page.getByRole('button', { name: 'Marcar Tomates como comprado' })).toBeVisible();
  await expect(banner(ana.page)).toHaveText('Sin conexión');
  await addItem(ana.page, { name: 'Lechuga' });
  await expect(banner(ana.page)).toHaveText('Sin conexión · 1 cambio pendiente');
  await ana.context.setOffline(false);
  await ana.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(banner(ana.page)).not.toContainText('pendiente', { timeout: 20_000 });
  await ana.page.reload();
  await expect(ana.page.getByRole('button', { name: 'Marcar Lechuga como comprado' })).toBeVisible();
  await ana.context.close();
});
