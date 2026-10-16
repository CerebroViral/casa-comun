// Screenshots of every screen at 360 and 390 px, next to the approved mockups, from a local run of the app
// against the local Supabase double with a seeded test household. Output: docs/capturas/.
// Run: node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { startDevServer } from '../tests/support/dev-server.mjs';
import { seedHousehold, PASSWORD } from '../tests/support/seed.mjs';

const OUT = new URL('../docs/capturas/', import.meta.url);
const outPath = (rel) => decodeURIComponent(new URL(rel, OUT).pathname).replace(/^\/(\w:)/, '$1');
const SIZES = [{ w: 390, h: 844 }, { w: 360, h: 780 }];
for (const s of SIZES) mkdirSync(outPath(`${s.w}/`), { recursive: true });

const server = await startDevServer({ port: 4180, fake: true, fakePort: 54330 });
const seed = await seedHousehold({ url: server.fake.url, anonKey: server.fake.anonKey, tag: 'capturas' });
const [jorge, elena] = seed.users;
const browser = await chromium.launch();

async function phone(size) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${size.w}] pageerror`, e.message));
  return { ctx, page };
}

async function login(page, user) {
  await page.goto(`${server.url}#/lista`);
  await page.getByLabel('Tu correo').fill(user.email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Añadir producto' }).waitFor();
}

async function settle(page, ms = 500) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.fonts.ready);
}

function shooter(page, size) {
  return async (name, { scrolled = false } = {}) => {
    await settle(page, 350);
    if (scrolled) await page.evaluate(() => { const v = document.getElementById('view'); v.scrollTop = v.scrollHeight; });
    await page.screenshot({ path: outPath(`${size.w}/${name}.png`), animations: 'disabled' });
  };
}

async function closeSheet(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

for (const size of SIZES) {
  const { ctx, page } = await phone(size);
  const shot = shooter(page, size);
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Entrar' }).waitFor();
  await shot('01-entrar');
  await page.getByRole('button', { name: 'Crear una cuenta' }).click();
  await page.getByLabel('Tu correo').fill(`nuevo.${size.w}@prueba.es`);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre de la casa').waitFor();
  await shot('02-crear-casa');
  await page.getByRole('button', { name: 'Unirme con código' }).click();
  await shot('03-unirme-con-codigo');
  await ctx.close();

  const p = await phone(size);
  const pg = p.page;
  const s = shooter(pg, size);
  await login(pg, jorge);
  await s('04-lista');
  await pg.getByRole('tab', { name: /Hace falta ya/ }).click();
  await s('05-lista-hace-falta-ya');
  await pg.getByRole('tab', { name: /Compra del mes/ }).click();
  await pg.getByRole('button', { name: 'Añadir producto' }).click();
  await s('06-anadir-producto');
  await closeSheet(pg);
  await pg.getByRole('button', { name: 'Marcar Leche semidesnatada como comprado' }).click();
  await pg.getByLabel('¿Cuánto costó?').fill('5,58');
  await s('07-marcar-comprado');
  await closeSheet(pg);
  await pg.getByRole('button', { name: /Aceite de oliva\. Editar/ }).click();
  await s('08-opciones-producto');
  await closeSheet(pg);

  await pg.getByRole('link', { name: 'Cuentas' }).click();
  await s('09-cuentas');
  await pg.getByRole('button', { name: '+ Añadir gasto' }).click();
  await s('10-anadir-gasto');
  await closeSheet(pg);
  await pg.goto(`${server.url}#/compras`);
  await s('11-todas-las-compras');
  await pg.goto(`${server.url}#/cierre`);
  await s('12-cierre-antes-de-la-compra-grande');

  await pg.getByRole('link', { name: 'Casa' }).click();
  await s('13-casa');
  await s('14-casa-abajo', { scrolled: true });
  await pg.getByRole('button', { name: 'Añadir niño o niña' }).click();
  await s('15-anadir-nino');
  await closeSheet(pg);
  await pg.goto(`${server.url}#/instalar`);
  await s('16-como-instalar');

  await pg.getByRole('link', { name: 'Rueda' }).click();
  await s('17-rueda-cocina');
  await pg.getByRole('link', { name: 'Limpieza' }).click();
  await s('18-rueda-limpieza');
  await pg.getByRole('link', { name: 'Normas' }).click();
  await s('19-rueda-normas');
  await pg.getByRole('link', { name: 'Cocina' }).click();
  await pg.getByRole('button', { name: 'Cambiar' }).click();
  await pg.getByRole('radio', { name: 'Elena' }).click();
  await s('20-cambiar-turno');
  await closeSheet(pg);
  await pg.goto(`${server.url}#/rueda/ajustes`);
  await s('21-rueda-ajustes');
  await pg.evaluate(() => { const v = document.getElementById('view'); v.scrollTop = 900; });
  await s('22-rueda-ajustes-cocina');
  pg.once('dialog', () => {});
  await pg.goto(`${server.url}#/recetas`);
  await s('23-recetas');
  await p.ctx.close();
}

// A swap request from Elena → Jorge sees the card and the badge on the Rueda tab.
{
  const ec = createClient(server.fake.url, server.fake.anonKey, { auth: { persistSession: false } });
  await ec.auth.signInWithPassword({ email: elena.email, password: PASSWORD });
  const today = new Date();
  const inTwo = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const { error } = await ec.rpc('request_swap', { p_household: seed.householdId, p_date: inTwo, p_role: 'cook', p_task_id: null, p_to_member: jorge.memberId });
  if (error) console.log('swap', error.message);
}
for (const size of SIZES) {
  const { ctx, page } = await phone(size);
  await login(page, jorge);
  await page.goto(`${server.url}#/rueda/cocina`);
  await shooter(page, size)('24-rueda-peticion-de-cambio');
  // No signal: add something → the banner says it is waiting.
  await ctx.setOffline(true);
  await page.goto(`${server.url}#/lista`).catch(() => {});
  await page.evaluate(() => { location.hash = '#/lista'; });
  await page.getByRole('button', { name: 'Añadir producto' }).click();
  await page.getByRole('combobox', { name: 'Producto' }).fill(`Yogures ${size.w}`);
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  await shooter(page, size)('25-sin-conexion');
  await ctx.setOffline(false);
  await page.waitForTimeout(1500);
  await ctx.close();
}

// The big shop is entered → exact closing.
{
  const jc = jorge.c;
  await jc.rpc('add_purchase', {
    p_household: seed.householdId, p_description: 'Compra grande', p_amount_cents: 45500, p_paid_by: jorge.memberId,
    p_store: 'Mercadona', p_scope: 'common', p_client_id: crypto.randomUUID(), p_is_big_shop: true,
  });
}
const pages = [];
for (const size of SIZES) {
  const { ctx, page } = await phone(size);
  await login(page, jorge);
  await page.goto(`${server.url}#/cierre`);
  await page.getByText('Pagó la compra grande').waitFor();
  await shooter(page, size)('26-cierre-despues-de-la-compra-grande');
  pages.push({ ctx, page, size });
}
let closedMonth = null;
for (const [i, { page, size }] of pages.entries()) {
  await page.getByRole('button', { name: /debe .* Marcar pagado/ }).first().click();
  await shooter(page, size)('27-marcar-bizum-pagado');
  await page.getByRole('button', { name: i === 0 ? 'Sí, pagado' : 'Cancelar' }).click();
}
for (const [i, { page, size }] of pages.entries()) {
  await page.reload();
  await page.getByText(/· pagado/).first().waitFor();
  await page.getByRole('button', { name: /^Cerrar .* y empezar/ }).click();
  await shooter(page, size)('28-confirmar-cierre');
  if (i < pages.length - 1) {
    await page.getByRole('button', { name: 'Cancelar' }).click();
  } else {
    await page.getByRole('button', { name: 'Cerrar el mes' }).click();
    await page.getByText(/^Cerrado el/).waitFor();
    closedMonth = page.url().split('#/cierre/')[1];
  }
}
for (const { ctx } of pages) await ctx.close();
if (!closedMonth) throw new Error('month was not closed');
for (const size of SIZES) {
  const { ctx, page } = await phone(size);
  const s = shooter(page, size);
  await login(page, jorge);
  await page.goto(`${server.url}#/cierre/${closedMonth}`);
  await page.getByText(/^Cerrado el/).waitFor();
  await s('29-mes-cerrado');
  await page.goto(`${server.url}#/meses`);
  await page.getByText('Parte de cada adulto').first().waitFor();
  await s('30-meses-anteriores');
  await page.goto(`${server.url}#/cuentas`);
  await s('31-cuentas-mes-nuevo');
  await ctx.close();
}

await browser.close();
await server.close();

// Mockups rendered at 390 for the side-by-side page.
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [new URL('./render-mockups.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), outPath('mockups')], { stdio: 'inherit' });
writeComparisonPage();
console.log('Screenshots in docs/capturas/');

function writeComparisonPage() {
  const pairs = {
    Main: ['04-lista'], Comprado: ['07-marcar-comprado'], Cuentas: ['09-cuentas'],
    Cierre: ['12-cierre-antes-de-la-compra-grande', '26-cierre-despues-de-la-compra-grande'], Casa: ['13-casa'],
    Rueda: ['17-rueda-cocina'], Tareas: ['18-rueda-limpieza'],
  };
  const all = readdirSync(outPath('390/')).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', '')).sort();
  const img = (src, cap) => `<figure><img src="${src}" alt="${cap}" loading="lazy"><figcaption>${cap}</figcaption></figure>`;
  const rows = Object.entries(pairs).map(([mock, shots]) => `<section><h2>${mock}</h2><div class="row">${img(`mockups/${mock}.png`, 'Diseño aprobado')}${shots.map((s) => img(`390/${s}.png`, `App 390 px · ${s}`) + img(`360/${s}.png`, `App 360 px · ${s}`)).join('')}</div></section>`).join('\n');
  const rest = all.map((s) => `<section><h2>${s}</h2><div class="row">${img(`390/${s}.png`, '390 px')}${img(`360/${s}.png`, '360 px')}</div></section>`).join('\n');
  writeFileSync(outPath('index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Casa Común · capturas</title>
<style>body{margin:0;padding:16px;background:#F2F4F3;color:#1B2420;font-family:system-ui,sans-serif}h1{margin:0 0 8px}h2{font-size:16px;margin:24px 0 8px}.row{display:flex;gap:16px;overflow-x:auto;padding-bottom:8px}figure{margin:0;flex:none}img{width:300px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.12);background:#fff}figcaption{font-size:12px;color:#5B6660;margin-top:4px}</style></head>
<body><h1>Casa Común · Fase 1 · capturas</h1><p>Datos de prueba. Diseño aprobado a la izquierda; la app a 390 px y 360 px.</p>${rows}<h1 style="margin-top:32px">Todas las pantallas</h1>${rest}</body></html>`);
}
