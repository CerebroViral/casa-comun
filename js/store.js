// App state. The screen shows view = (last server snapshot) + (pending local changes replayed on top).
// Changes go to an IndexedDB queue first and are sent in order; an entry is removed only after the server
// confirms it (or refuses it for good, which the person is told about). Never lose an entry.
import { kvGet, kvSet, kvDelete, queueAdd, queueDelete, queueAll } from './idb.js';
import { applyMutation, applyQueue } from './replay.js';
import { fetchSnapshot, runMutation } from './data.js';
import { sb, isNetworkError, isAuthError, friendlyError } from './supabase-client.js';
import { toast, uuid } from './ui.js';

const state = {
  userId: null,
  email: null,
  server: null,
  queue: [],
  view: null,
  online: navigator.onLine,
  syncing: false,
  justSynced: false,
  needsLogin: false,
  realtime: 'off',
  loading: false,
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  state.view = state.server ? applyQueue(state.server, state.queue) : null;
  for (const fn of listeners) fn(state);
}

export const getState = () => state;

const snapKey = (userId) => `snap:${userId}`;

export function rememberUser(user) {
  try { localStorage.setItem('cc-last-user', JSON.stringify({ id: user.id, email: user.email })); } catch { /* private mode */ }
}

export function lastUser() {
  try { return JSON.parse(localStorage.getItem('cc-last-user') ?? 'null'); } catch { return null; }
}

export async function hasCachedSnapshot(userId) {
  return Boolean(await kvGet(snapKey(userId)));
}

export async function start(user) {
  if (state.userId === user.id && state.server) return;
  state.userId = user.id;
  state.email = user.email ?? null;
  state.needsLogin = false;
  rememberUser(user);
  state.queue = (await queueAll()).filter((m) => m.user_id === user.id).sort((a, b) => a.seq - b.seq);
  state.server = (await kvGet(snapKey(user.id))) ?? null;
  emit();
  await refresh();
  flush();
}

export async function stop({ discardQueue = false } = {}) {
  if (channel) { sb.removeChannel(channel); channel = null; channelHousehold = null; }
  if (state.userId) {
    await kvDelete(snapKey(state.userId));
    if (discardQueue) for (const m of state.queue) await queueDelete(m.seq);
  }
  try { localStorage.removeItem('cc-last-user'); } catch { /* ignore */ }
  Object.assign(state, { userId: null, email: null, server: null, queue: [], view: null, realtime: 'off' });
  emit();
}

let refreshing = null;
export async function refresh() {
  if (!state.userId) return null;
  if (refreshing) return refreshing;
  state.loading = !state.server;
  refreshing = (async () => {
    try {
      const snap = await fetchSnapshot(state.userId);
      state.server = snap;
      state.online = true;
      await kvSet(snapKey(state.userId), snap);
      ensureRealtime();
    } catch (e) {
      const err = e.supabase ?? e;
      if (isNetworkError(err, e.status)) state.online = false;
      else if (isAuthError(err, e.status)) state.needsLogin = true;
      else console.warn('refresh failed', e);
    } finally {
      state.loading = false;
      refreshing = null;
      emit();
    }
    return state.server;
  })();
  return refreshing;
}

let refreshTimer = null;
export function scheduleRefresh(ms = 450) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (!flushing) refresh(); else scheduleRefresh(ms); }, ms);
}

// Queue a change. It shows on screen at once and is sent as soon as there is signal.
export async function mutate(type, payload) {
  const entry = { id: uuid(), user_id: state.userId, type, payload, created_at: new Date().toISOString() };
  entry.seq = await queueAdd(entry);
  state.queue.push(entry);
  emit();
  flush();
  return entry;
}

let flushing = false;
export async function flush() {
  if (flushing || !state.queue.length || !state.userId) return;
  flushing = true;
  state.syncing = true;
  emit();
  let progressed = false;
  let authRetries = 0;
  try {
    while (state.queue.length) {
      const m = state.queue[0];
      let outcome;
      try {
        outcome = { ok: true, result: await runMutation(m, state.server) };
      } catch (e) {
        const err = e.supabase ?? e;
        if (isNetworkError(err, e.status)) { state.online = false; break; }
        if (isAuthError(err, e.status) && authRetries < 1) {
          authRetries += 1;
          const { error } = await sb.auth.refreshSession();
          if (!error) continue;
          state.needsLogin = true;
          break;
        }
        outcome = { ok: false, error: e };
      }
      await queueDelete(m.seq);
      state.queue.shift();
      progressed = true;
      state.online = true;
      if (outcome.ok) onConfirmed(m, outcome.result);
      else onRefused(m, outcome.error);
    }
  } finally {
    flushing = false;
    state.syncing = false;
    if (progressed && !state.queue.length) {
      state.justSynced = true;
      setTimeout(() => { state.justSynced = false; emit(); }, 2500);
      scheduleRefresh(150);
    }
    emit();
  }
}

function describe(m) {
  const p = m.payload;
  const item = state.server?.items?.find((i) => i.id === (p.item_id ?? p.id));
  return p.item?.name ?? item?.name ?? p.description ?? '';
}

function onConfirmed(m, result) {
  if (m.type === 'item.buy' && result?.status === 'already_bought') {
    toast(`${result.by} ya lo compró. Tu compra de «${describe(m)}» no se ha guardado.`, { kind: 'warn', ms: 8000 });
    return;
  }
  state.server = applyMutation(state.server, m);
}

function onRefused(m, error) {
  const what = describe(m);
  toast(`No se ha podido guardar${what ? ` «${what}»` : ''}: ${friendlyError(error)}`, { kind: 'error', ms: 8000 });
}

// ---- Realtime: any change in the house → refetch (debounced). Deletes can't be filtered, so check ids.
let channel = null;
let channelHousehold = null;
const FILTERED = ['shopping_items', 'purchases', 'members', 'transfers', 'periods', 'chore_overrides', 'chore_swaps',
  'chore_done', 'chore_settings', 'kitchen_template', 'chore_tasks', 'cleaning_grid', 'house_rules'];

function knownId(table, id) {
  const s = state.server;
  if (!s || !id) return false;
  const lists = {
    shopping_items: s.items, chore_done: s.rueda?.done, house_rules: s.rueda?.rules, chore_tasks: s.rueda?.tasks,
    chore_overrides: s.rueda?.overrides,
  };
  return (lists[table] ?? []).some((r) => r.id === id);
}

function ensureRealtime() {
  const hid = state.server?.household?.id;
  if (!hid || channelHousehold === hid) return;
  if (channel) sb.removeChannel(channel);
  channelHousehold = hid;
  channel = sb.channel(`casa-${hid}`);
  for (const table of FILTERED) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${hid}` }, () => scheduleRefresh());
  }
  channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${hid}` }, () => scheduleRefresh());
  for (const table of ['shopping_items', 'chore_done', 'house_rules', 'chore_tasks', 'cleaning_grid']) {
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
      if (table === 'cleaning_grid' ? payload.old?.household_id === hid : knownId(table, payload.old?.id)) scheduleRefresh();
    });
  }
  channel.subscribe((status) => {
    state.realtime = status;
    if (status === 'SUBSCRIBED') scheduleRefresh(50);
  });
}

// ---- Connectivity: retry when signal comes back, when the app comes to the front, and every 15 s.
window.addEventListener('online', () => { state.online = true; emit(); flush(); scheduleRefresh(200); });
window.addEventListener('offline', () => { state.online = false; emit(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.userId) { flush(); scheduleRefresh(100); }
});
setInterval(() => {
  if (!state.userId || document.visibilityState !== 'visible') return;
  if (state.queue.length) flush();
  if (state.realtime !== 'SUBSCRIBED') refresh();
}, 15000);
