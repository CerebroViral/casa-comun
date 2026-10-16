// Local static server for the app (no build step). With --fake it also starts the local Supabase double
// and serves a config.js that points at it, so the whole app runs on this machine.
//   node tests/support/dev-server.mjs            → http://127.0.0.1:4173 (uses the real config.js)
//   node tests/support/dev-server.mjs --fake     → plus fake Supabase on :54321
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

export async function startDevServer({ port = 4173, fake = false, fakePort = 54321, log = false } = {}) {
  let fakeServer = null;
  let fakeConfig = null;
  if (fake) {
    const { startFakeSupabase } = await import('./fake-supabase.mjs');
    fakeServer = await startFakeSupabase({ port: fakePort, log });
    fakeConfig = `window.CC_CONFIG = ${JSON.stringify({ supabaseUrl: fakeServer.url, supabaseAnonKey: fakeServer.anonKey, appUrl: `http://127.0.0.1:${port}/` })};\n`;
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (fakeServer && url.pathname === '/__fake/offline') {
      // Cuts the "server" off for every phone at once (E2E: no signal at all).
      fakeServer.setOffline(url.searchParams.get('v') === '1');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (fakeServer && url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      res.end(fakeConfig);
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path === '' || path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || /node_modules|\.git|supabase[/\\]tests/.test(path)) { res.writeHead(404); res.end(); return; }
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}/`,
    fake: fakeServer,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await fakeServer?.close();
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const fake = process.argv.includes('--fake');
  const s = await startDevServer({ port: Number(process.env.PORT ?? 4173), fake, fakePort: Number(process.env.FAKE_PORT ?? 54321), log: !!process.env.LOG });
  console.log(`Casa Común on ${s.url}${fake ? ` (fake Supabase on ${s.fake.url})` : ''}`);
}
