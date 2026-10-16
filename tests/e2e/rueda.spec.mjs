// La Rueda: create it, see who cooks today, mark a turn done, and swap a turn between two phones.
import { test, expect } from '@playwright/test';
import { phone, uniqueEmail, signUp, createHouse, joinHouse, inviteCode } from './helpers.mjs';

test('crear la Rueda, marcar hecho y cambiar un turno', async ({ browser }, testInfo) => {
  const ana = await phone(browser, testInfo);
  const bruno = await phone(browser, testInfo);
  await signUp(ana.page, uniqueEmail(testInfo, 'ana'));
  await createHouse(ana.page, { name: 'Ana' });
  const code = await inviteCode(ana.page);
  await signUp(bruno.page, uniqueEmail(testInfo, 'bruno'));
  await joinHouse(bruno.page, { code, name: 'Bruno' });
  await expect(ana.page.getByText(/^2 en casa · /)).toBeVisible();

  await ana.page.getByRole('link', { name: 'Rueda' }).click();
  await ana.page.getByRole('link', { name: 'Crear la Rueda' }).click();
  await expect(ana.page.getByRole('heading', { name: 'Crear la Rueda' })).toBeVisible();
  // A hand-entered chart with a mistake is refused…
  const lunesCocina = ana.page.getByRole('combobox', { name: 'Lunes: cocina' });
  const lunesLimpia = ana.page.getByRole('combobox', { name: 'Lunes: limpia la cocina' });
  await lunesCocina.selectOption({ label: 'Ana' });
  await lunesLimpia.selectOption({ label: 'Ana' });
  await expect(ana.page.getByText('No puede cocinar y limpiar la misma persona.')).toHaveCount(1);
  // …and "Generar automático" fixes it.
  await ana.page.getByRole('button', { name: 'Generar automático' }).click();
  await expect(ana.page.getByText('No puede cocinar y limpiar la misma persona.')).toHaveCount(0);
  await ana.page.getByRole('button', { name: 'Crear la Rueda' }).click();
  await expect(ana.page.getByText(/Turnos de la casa · semana 1 de 2/)).toBeVisible();
  await expect(ana.page.getByText(/^Hoy · /)).toBeVisible();
  await expect(ana.page.getByText(/Cena para los 2 \+ almuerzos de mañana/)).toBeVisible();

  // Limpieza: Latin square over 2 weeks, "Ir a la compra" shows on the list.
  await ana.page.getByRole('link', { name: 'Limpieza' }).click();
  await expect(ana.page.getByText('Rotación de 2 semanas')).toBeVisible();
  await expect(ana.page.getByText('Al terminar la semana 2, la rueda vuelve a empezar.')).toBeVisible();
  await ana.page.getByRole('link', { name: 'Normas' }).click();
  await expect(ana.page.getByText('Entre todos es más fácil y más justo.')).toBeVisible();
  await expect(ana.page.getByText('Días de descanso')).toBeVisible();
  await ana.page.getByRole('link', { name: 'Lista' }).click();
  await expect(ana.page.getByText(/Esta semana va a la compra:/)).toBeVisible();

  // Mark today's cook as done.
  await ana.page.getByRole('link', { name: 'Rueda' }).click();
  await ana.page.getByRole('link', { name: 'Cocina' }).click();
  const todayRow = ana.page.locator('.week-row.today');
  await todayRow.getByRole('button').first().click();
  await ana.page.getByRole('button', { name: 'Marcar como hecho' }).click();
  await expect(todayRow.getByRole('button').first()).toHaveAccessibleName(/, hecho\. Opciones$/);

  // Ana asks Bruno to swap her next turn.
  await ana.page.getByRole('button', { name: 'Cambiar' }).click();
  await ana.page.getByRole('radio', { name: 'Bruno' }).click();
  await ana.page.getByRole('button', { name: 'Enviar petición' }).click();
  await expect(ana.page.getByText(/^Esperando a Bruno: cambiar /)).toBeVisible();

  // Bruno sees the badge and the card, and accepts.
  await bruno.page.reload();
  await expect(bruno.page.locator('.nav-badge')).toHaveText('1');
  await bruno.page.getByRole('link', { name: /Rueda/ }).click();
  await expect(bruno.page.getByText(/te pide cambiar/)).toBeVisible();
  await bruno.page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(bruno.page.getByText(/te pide cambiar/)).toHaveCount(0);
  await expect(bruno.page.locator('.nav-badge')).toHaveCount(0);
  await ana.page.reload();
  await expect(ana.page.getByText(/^Esperando a Bruno/)).toHaveCount(0);

  await ana.context.close();
  await bruno.context.close();
});
