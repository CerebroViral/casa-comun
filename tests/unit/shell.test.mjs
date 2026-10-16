// The service worker must cache every file the app needs to open without signal; nothing secret is shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const shellBlock = sw.slice(sw.indexOf('const SHELL = ['), sw.indexOf('];', sw.indexOf('const SHELL = [')));
const shell = [...shellBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p).replace(/\\/g, '/')];
  });
}

test('every app module, font and the vendored client are in the offline shell', () => {
  const needed = [
    ...walk(join(root, 'js')),
    ...walk(join(root, 'assets/fonts')).filter((f) => f.endsWith('.woff2')),
    'vendor/supabase.js', 'css/app.css', 'index.html', 'config.js', 'manifest.webmanifest',
  ];
  for (const f of needed) assert.ok(shell.includes(f), `${f} missing from sw.js`);
  for (const f of shell.filter((x) => x !== './')) assert.ok(statSync(join(root, f)).isFile(), `${f} listed in sw.js but missing`);
});

test('cache name follows cc-app-<n>', () => {
  assert.match(sw, /const CACHE = 'cc-app-\d+';/);
});

test('config.js only holds the public URL and anon key', () => {
  const cfg = readFileSync(join(root, 'config.js'), 'utf8');
  const code = cfg.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /service_role|sb_secret_|password|ANTHROPIC/i);
  const keys = [...cfg.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), ['appUrl', 'supabaseAnonKey', 'supabaseUrl']);
});

test('the footer text is exactly the SophieNexus seal', () => {
  const ui = readFileSync(join(root, 'js/ui.js'), 'utf8');
  assert.ok(ui.includes("'By SophieNexus · © 2026 Todos los derechos reservados'"));
});

test('manifest has the name, colours and icons the spec asks for', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Casa Común');
  assert.equal(m.short_name, 'Casa Común');
  assert.equal(m.theme_color, '#C2410C');
  assert.equal(m.background_color, '#F2F4F3');
  const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  for (const s of ['192x192:any', '512x512:any', '512x512:maskable']) assert.ok(sizes.includes(s), s);
});
