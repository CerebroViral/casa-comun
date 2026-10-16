// A small, local stand-in for Supabase used by the E2E tests and for screenshots: real Postgres (PGlite) with
// the real schema, RLS and RPCs, behind the subset of GoTrue (auth), PostgREST (REST + RPC) and Realtime
// (postgres_changes) that the app uses. Requests run as the signed-in user with role `authenticated`, so
// row level security is enforced exactly like in production. Not for production use.
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createDb } from '../../supabase/tests/support/pg.mjs';

const SECRET = 'casa-comun-local-test-secret';
const IDENT = /^[a-z_][a-z0-9_]*$/;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
export function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  if (!token) return null;
  const [head, body, sig] = token.split('.');
  if (!sig) return null;
  const good = b64url(crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest());
  if (good !== sig) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) return { expired: true };
  return payload;
}
export const ANON_KEY = signJwt({ role: 'anon', iss: 'casa-comun-local', iat: 1700000000, exp: 4102444800 });

const hash = (pw) => crypto.createHash('sha256').update(`cc:${pw}`).digest('hex');

export async function startFakeSupabase({ port = 54321, log = false } = {}) {
  const db = await createDb();
  await installChangeCapture(db);
  const refreshTokens = new Map(); // token → user id
  let chain = Promise.resolve();
  const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
  const sockets = new Set();
  let nextBindingId = 1000;
  let offline = false; // tests can switch the whole backend "off"

  function userJson(u) {
    return {
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, phone: '',
      email_confirmed_at: u.created_at, confirmed_at: u.created_at, last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
      created_at: u.created_at, updated_at: u.created_at,
    };
  }
  function session(u) {
    const now = Math.floor(Date.now() / 1000);
    const access = signJwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600, session_id: crypto.randomUUID() });
    const refresh = crypto.randomBytes(16).toString('hex');
    refreshTokens.set(refresh, u.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(u) };
  }
  const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

  async function handleAuth(req, res, url, body) {
    const path = url.pathname.replace('/auth/v1', '');
    if (path === '/signup' && req.method === 'POST') {
      const email = String(body.email ?? '').toLowerCase().trim();
      if (!email.includes('@')) return authError(res, 400, 'validation_failed', 'Unable to validate email address: invalid format');
      if (String(body.password ?? '').length < 6) return authError(res, 422, 'weak_password', 'Password should be at least 6 characters.');
      const exists = await db.query('select 1 from auth.users where email = $1', [email]);
      if (exists.rows.length) return authError(res, 422, 'user_already_exists', 'User already registered');
      const { rows } = await db.query('insert into auth.users (email, encrypted_password) values ($1, $2) returning *', [email, hash(body.password)]);
      return send(res, 200, session(rows[0]));
    }
    if (path === '/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const { rows } = await db.query('select * from auth.users where email = $1', [String(body.email ?? '').toLowerCase().trim()]);
        if (!rows.length || rows[0].encrypted_password !== hash(body.password)) return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
        return send(res, 200, session(rows[0]));
      }
      if (grant === 'refresh_token') {
        const id = refreshTokens.get(body.refresh_token);
        if (!id) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        refreshTokens.delete(body.refresh_token);
        const { rows } = await db.query('select * from auth.users where id = $1', [id]);
        return send(res, 200, session(rows[0]));
      }
    }
    const claims = verifyJwt(bearer(req));
    if (path === '/user' && (req.method === 'GET' || req.method === 'PUT')) {
      if (!claims?.sub) return authError(res, 401, 'bad_jwt', 'invalid JWT');
      if (req.method === 'PUT' && body.password) await db.query('update auth.users set encrypted_password = $1 where id = $2', [hash(body.password), claims.sub]);
      const { rows } = await db.query('select * from auth.users where id = $1', [claims.sub]);
      return send(res, 200, userJson(rows[0]));
    }
    if (path === '/logout') return send(res, 204, null);
    if (path === '/recover') return send(res, 200, {});
    if (path === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
    return authError(res, 404, 'not_found', 'Not found');
  }

  async function handleRest(req, res, url, body) {
    const claims = verifyJwt(bearer(req) ?? req.headers.apikey);
    if (!claims) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid', details: null, hint: null });
    if (claims.expired) return send(res, 401, { code: 'PGRST301', message: 'JWT expired', details: null, hint: null });
    const userId = claims.role === 'authenticated' ? claims.sub : null;
    const path = url.pathname.replace('/rest/v1/', '');
    const prefer = String(req.headers.prefer ?? '');
    const wantsObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object+json');
    try {
      let rows;
      let status = 200;
      if (path.startsWith('rpc/')) {
        const fn = path.slice(4);
        if (!IDENT.test(fn)) return send(res, 404, { code: 'PGRST202', message: 'Not found' });
        const keys = Object.keys(body ?? {});
        keys.forEach((k) => { if (!IDENT.test(k)) throw Object.assign(new Error('bad arg'), { code: 'PGRST100' }); });
        const types = await argTypes(fn);
        const sql = `select to_jsonb(public.${fn}(${keys.map((k, i) => `${k} => ($${i + 1}::text)::${types[k] ?? 'text'}`).join(', ')})) as r`;
        rows = await runAs(userId, claims, sql, keys.map((k) => toParam(body[k])));
        return send(res, 200, rows[0]?.r ?? null);
      }
      const table = path;
      if (!IDENT.test(table)) return send(res, 404, { code: 'PGRST205', message: 'Not found' });
      const { where, params } = filters(url.searchParams, await columnTypes(table));
      if (req.method === 'GET') {
        const cols = selectCols(url.searchParams.get('select'));
        const order = orderBy(url.searchParams.get('order'));
        const limit = url.searchParams.get('limit');
        const offset = url.searchParams.get('offset');
        const sql = `select ${cols} from public.${table}${where}${order}${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}`;
        rows = await runAs(userId, claims, sql, params);
      } else if (req.method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        const cols = url.searchParams.get('columns')?.split(',').map((c) => c.replace(/"/g, '')) ?? Object.keys(list[0] ?? {});
        cols.forEach((c) => { if (!IDENT.test(c)) throw Object.assign(new Error(`bad column ${c}`), { code: 'PGRST100' }); });
        const values = [];
        const ctypes = await columnTypes(table);
        const tuples = list.map((row) => `(${cols.map((c) => { values.push(toParam(row[c])); return `($${values.length}::text)::${ctypes[c] ?? 'text'}`; }).join(', ')})`);
        let conflict = '';
        const onConflict = url.searchParams.get('on_conflict');
        if (prefer.includes('resolution=ignore-duplicates')) conflict = ` on conflict${onConflict ? ` (${onConflict.split(',').filter((c) => IDENT.test(c)).join(', ')})` : ''} do nothing`;
        else if (prefer.includes('resolution=merge-duplicates')) {
          const target = (onConflict ?? (await primaryKey(table)).join(',')).split(',').filter((c) => IDENT.test(c));
          conflict = ` on conflict (${target.join(', ')}) do update set ${cols.filter((c) => !target.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ') || `${target[0]} = excluded.${target[0]}`}`;
        }
        rows = await runAs(userId, claims, `insert into public.${table} (${cols.join(', ')}) values ${tuples.join(', ')}${conflict} returning *`, values);
        status = 201;
      } else if (req.method === 'PATCH') {
        const keys = Object.keys(body ?? {});
        keys.forEach((c) => { if (!IDENT.test(c)) throw Object.assign(new Error(`bad column ${c}`), { code: 'PGRST100' }); });
        const ctypes = await columnTypes(table);
        const sets = keys.map((k, i) => `${k} = ($${params.length + i + 1}::text)::${ctypes[k] ?? 'text'}`);
        rows = await runAs(userId, claims, `update public.${table} set ${sets.join(', ')}${where} returning *`, [...params, ...keys.map((k) => toParam(body[k]))]);
      } else if (req.method === 'DELETE') {
        rows = await runAs(userId, claims, `delete from public.${table}${where} returning *`, params);
      } else {
        return send(res, 405, { message: 'Method not allowed' });
      }
      if (wantsObject) {
        if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
        return send(res, status, rows[0]);
      }
      if (prefer.includes('return=representation') || req.method === 'GET') return send(res, status, rows, { 'Content-Range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      return send(res, status === 201 ? 201 : 204, null);
    } catch (e) {
      const code = e.code ?? 'XX000';
      const status = code === '42501' ? (userId ? 403 : 401) : code === '23505' || code === '23503' ? 409 : code.startsWith('PGRST') ? 400 : 400;
      if (log) console.log('[fake-supabase] error', code, e.message);
      return send(res, status, { code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
    }
  }

  function runAs(userId, claims, sql, params) {
    return serial(async () => {
      const rows = await db.transaction(async (tx) => {
        const role = userId ? 'authenticated' : 'anon';
        await tx.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [JSON.stringify(claims), userId ?? '']);
        await tx.exec(`set local role ${role}`);
        const r = await tx.query(sql, params);
        return r.rows;
      });
      await broadcastChanges();
      return rows.map(normaliseRow);
    });
  }

  const typeCache = new Map();
  async function columnTypes(table) {
    if (!typeCache.has(table)) {
      const { rows } = await db.query(`select a.attname as name, format_type(a.atttypid, a.atttypmod) as type
        from pg_attribute a where a.attrelid = ('public.' || $1)::regclass and a.attnum > 0 and not a.attisdropped`, [table]);
      typeCache.set(table, Object.fromEntries(rows.map((r) => [r.name, r.type])));
    }
    return typeCache.get(table);
  }
  async function argTypes(fn) {
    const key = `fn:${fn}`;
    if (!typeCache.has(key)) {
      const { rows } = await db.query(`select unnest(proargnames) as name, format_type(unnest(proargtypes::oid[]), null) as type
        from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]);
      typeCache.set(key, Object.fromEntries(rows.map((r) => [r.name, r.type])));
    }
    return typeCache.get(key);
  }

  async function primaryKey(table) {
    const { rows } = await db.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || $1)::regclass and i.indisprimary`, [table]);
    return rows.map((r) => r.attname);
  }

  // ---- Realtime (Phoenix v2 JSON-array protocol, postgres_changes only)
  async function broadcastChanges() {
    const { rows } = await db.query('delete from _rt.changes returning *');
    if (!rows.length || !sockets.size) return;
    const memberships = new Map();
    const houses = async (uid) => {
      if (!memberships.has(uid)) {
        const r = await db.query('select household_id from public.members where user_id = $1 and active', [uid]);
        memberships.set(uid, new Set(r.rows.map((x) => x.household_id)));
      }
      return memberships.get(uid);
    };
    for (const change of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
      const record = change.rec ?? {};
      const old = change.old ?? {};
      const row = change.op === 'DELETE' ? old : record;
      for (const ws of sockets) {
        if (!ws.userId) continue;
        const mine = await houses(ws.userId);
        const hid = row.household_id ?? (change.tbl === 'households' ? row.id : null);
        const visible = change.op === 'DELETE' || (hid && mine.has(hid));
        for (const [topic, bindings] of ws.channels) {
          const ids = bindings.filter((b) => {
            if (b.table !== change.tbl && b.table !== '*') return false;
            if (b.event !== '*' && b.event !== change.op) return false;
            if (b.filter) {
              if (change.op === 'DELETE') return false; // like Supabase: DELETE can't be filtered
              const m = b.filter.match(/^(\w+)=eq\.(.+)$/);
              if (!m || String(row[m[1]]) !== m[2]) return false;
            }
            return visible;
          }).map((b) => b.id);
          if (!ids.length) continue;
          const columns = Object.keys(change.op === 'DELETE' ? old : record).map((name) => ({ name, type: 'text' }));
          const deleteOld = change.op === 'DELETE' ? { id: old.id, household_id: old.household_id } : old;
          ws.send(JSON.stringify([null, null, topic, 'postgres_changes', {
            ids,
            data: { schema: 'public', table: change.tbl, commit_timestamp: new Date().toISOString(), type: change.op, columns, record: change.op === 'DELETE' ? {} : record, old_record: change.op === 'INSERT' ? {} : deleteOld, errors: null },
          }]));
        }
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Supabase-Api-Version');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (offline) { req.socket.destroy(); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = null;
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    if (log) console.log('[fake-supabase]', req.method, url.pathname + url.search);
    try {
      if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url, body);
      if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url, body);
      if (url.pathname === '/health') return send(res, 200, { ok: true });
      send(res, 404, { message: 'Not found' });
    } catch (e) {
      console.error('[fake-supabase] crash', e);
      send(res, 500, { message: String(e.message) });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (offline || !req.url.startsWith('/realtime/v1/websocket')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    ws.channels = new Map();
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const [joinRef, ref, topic, event, payload] = msg;
      const reply = (response = {}, status = 'ok') => ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status, response }]));
      if (topic === 'phoenix' && event === 'heartbeat') return reply();
      if (event === 'phx_join') {
        const claims = verifyJwt(payload?.access_token);
        if (claims?.sub) ws.userId = claims.sub;
        const bindings = (payload?.config?.postgres_changes ?? []).map((b) => ({ ...b, id: nextBindingId++ }));
        ws.channels.set(topic, bindings);
        return reply({ postgres_changes: bindings.map(({ id, event: e, schema, table, filter }) => ({ id, event: e, schema, table, filter })) });
      }
      if (event === 'access_token') {
        const claims = verifyJwt(payload?.access_token);
        if (claims?.sub) ws.userId = claims.sub;
        return undefined;
      }
      if (event === 'phx_leave') { ws.channels.delete(topic); return reply(); }
      return reply();
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${port}`,
    anonKey: ANON_KEY,
    db,
    setOffline(v) {
      offline = v;
      if (v) for (const ws of sockets) ws.terminate();
    },
    async close() {
      for (const ws of sockets) ws.terminate();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}

function bearer(req) {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body === null || status === 204 ? '' : JSON.stringify(body));
}

function toParam(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function normaliseRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === 'bigint') out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

function selectCols(select) {
  if (!select || select === '*') return '*';
  const cols = select.split(',').map((c) => c.trim());
  cols.forEach((c) => { if (!IDENT.test(c)) throw Object.assign(new Error(`select not supported: ${c}`), { code: 'PGRST100' }); });
  return cols.join(', ');
}

function orderBy(order) {
  if (!order) return '';
  const parts = order.split(',').map((p) => {
    const [col, dir, nulls] = p.split('.');
    if (!IDENT.test(col)) throw Object.assign(new Error(`bad order ${col}`), { code: 'PGRST100' });
    return `${col} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`;
  });
  return ` order by ${parts.join(', ')}`;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function filters(sp, types) {
  const conds = [];
  const params = [];
  for (const [col, expr] of sp) {
    if (RESERVED.has(col)) continue;
    if (!IDENT.test(col)) throw Object.assign(new Error(`bad filter ${col}`), { code: 'PGRST100' });
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot);
    const val = expr.slice(dot + 1);
    const ops = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
    if (ops[op]) {
      params.push(val);
      conds.push(`${col} ${ops[op]} ($${params.length}::text)::${types[col] ?? 'text'}`);
    } else if (op === 'in') {
      const list = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
      params.push(list);
      conds.push(`${col}::text = any($${params.length}::text[])`);
    } else if (op === 'is') {
      conds.push(`${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    } else {
      throw Object.assign(new Error(`filter not supported: ${op}`), { code: 'PGRST100' });
    }
  }
  return { where: conds.length ? ` where ${conds.join(' and ')}` : '', params };
}

async function installChangeCapture(db) {
  await db.exec(`
    create schema if not exists _rt;
    create table if not exists _rt.changes (id bigserial primary key, tbl text, op text, rec jsonb, old jsonb);
    create or replace function _rt.capture() returns trigger language plpgsql security definer as $$
    begin
      insert into _rt.changes (tbl, op, rec, old)
      values (TG_TABLE_NAME, TG_OP, case when TG_OP <> 'DELETE' then to_jsonb(NEW) end, case when TG_OP <> 'INSERT' then to_jsonb(OLD) end);
      return null;
    end $$;`);
  const { rows } = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`);
  for (const { tablename } of rows) {
    await db.exec(`create trigger _rt_capture after insert or update or delete on public.${tablename} for each row execute function _rt.capture();`);
  }
}

// Run directly: node tests/support/fake-supabase.mjs → serves on :54321
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') ?? '')) {
  const s = await startFakeSupabase({ port: Number(process.env.PORT ?? 54321), log: !!process.env.LOG });
  console.log(`Fake Supabase on ${s.url}\nanon key: ${s.anonKey}`);
}
