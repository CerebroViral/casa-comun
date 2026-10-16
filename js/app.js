// Boot, auth state, hash router, bottom navigation and the sync banner.
import { sb, configured } from './supabase-client.js';
import * as store from './store.js';
import { h, icon } from './ui.js';
import { makeContext } from './context.js';
import * as authView from './views/auth.js';
import * as onboarding from './views/onboarding.js';
import * as lista from './views/lista.js';
import * as cuentas from './views/cuentas.js';
import * as compras from './views/compras.js';
import * as cierre from './views/cierre.js';
import * as meses from './views/meses.js';
import * as rueda from './views/rueda.js';
import * as ruedaSetup from './views/rueda-setup.js';
import * as recetas from './views/recetas.js';
import * as casa from './views/casa.js';
import * as instalar from './views/instalar.js';

const TABS = [
  { key: 'lista', label: 'Lista', icon: 'cart', href: '#/lista' },
  { key: 'cuentas', label: 'Cuentas', icon: 'wallet', href: '#/cuentas' },
  { key: 'rueda', label: 'Rueda', icon: 'wheel', href: '#/rueda' },
  { key: 'recetas', label: 'Recetas', icon: 'pot', href: '#/recetas' },
  { key: 'casa', label: 'Casa', icon: 'house', href: '#/casa' },
];

const ROUTES = [
  { re: /^#\/lista$/, view: lista, tab: 'lista' },
  { re: /^#\/cuentas$/, view: cuentas, tab: 'cuentas' },
  { re: /^#\/compras(?:\/(\d{4}-\d{2}))?$/, view: compras, tab: 'cuentas' },
  { re: /^#\/cierre(?:\/(\d{4}-\d{2}))?$/, view: cierre, tab: 'cuentas' },
  { re: /^#\/meses$/, view: meses, tab: 'cuentas' },
  { re: /^#\/rueda(?:\/(cocina|limpieza|normas))?$/, view: rueda, tab: 'rueda' },
  { re: /^#\/rueda\/ajustes$/, view: ruedaSetup, tab: 'rueda' },
  { re: /^#\/recetas$/, view: recetas, tab: 'recetas' },
  { re: /^#\/casa$/, view: casa, tab: 'casa' },
  { re: /^#\/instalar$/, view: instalar, tab: 'casa' },
];

const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const bannerEl = document.getElementById('banner');

const session = { user: null, recovery: false, ready: false };
const ui = {}; // per-session screen state (selected tabs, week offsets…)
let lastKey = '';
let pendingRender = false;

function resolveRoute() {
  const hash = location.hash;
  for (const r of ROUTES) {
    const m = hash.match(r.re);
    if (m) return { ...r, params: m.slice(1), hash };
  }
  return null;
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function inputFocused() {
  const a = document.activeElement;
  return a && viewEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}

function show(node, key) {
  const keep = key === lastKey ? viewEl.scrollTop : 0;
  viewEl.replaceChildren(node);
  viewEl.scrollTop = keep;
  if (key !== lastKey) viewEl.focus({ preventScroll: true });
  lastKey = key;
}

export function render() {
  if (inputFocused() && lastKey === location.hash) {
    // Don't yank the field from under someone typing; render again when they leave it.
    if (!pendingRender) {
      pendingRender = true;
      viewEl.addEventListener('focusout', () => { pendingRender = false; setTimeout(render, 0); }, { once: true });
    }
    renderBanner(store.getState());
    return;
  }
  const s = store.getState();
  renderBanner(s);
  if (!configured) {
    navEl.hidden = true;
    show(authView.renderNotConfigured(), 'not-configured');
    return;
  }
  if (!session.ready) return;
  if (session.recovery) {
    navEl.hidden = true;
    show(authView.renderNewPassword({ done: () => { session.recovery = false; go('#/lista'); } }), 'recovery');
    return;
  }
  if (!session.user) {
    navEl.hidden = true;
    show(authView.render({ ui }), 'auth');
    return;
  }
  if (!s.view) {
    navEl.hidden = true;
    show(h('div', { class: 'empty', style: { paddingTop: '40vh' } },
      s.online ? 'Cargando…' : 'Sin conexión. Abre la app con cobertura la primera vez.'), 'loading');
    return;
  }
  if (!s.view.household) {
    navEl.hidden = true;
    show(onboarding.render({ ui, email: s.email, done: async () => { await store.refresh(); go('#/lista'); } }), 'onboarding');
    return;
  }
  const route = resolveRoute();
  if (!route) { location.replace('#/lista'); return; }
  const ctx = makeContext(s, { params: route.params, ui, go, rerender: render, mutate: store.mutate, refresh: store.refresh, hash: route.hash });
  show(route.view.render(ctx), route.hash);
  renderNav(route.tab, ctx);
}

function renderNav(active, ctx) {
  navEl.hidden = false;
  const swapsForMe = (ctx.rueda.swaps ?? []).filter((x) => x.status === 'pending' && x.to_member === ctx.me?.id && x.date >= ctx.today).length;
  navEl.replaceChildren(...TABS.map((t) => h('a', {
    href: t.href,
    class: 'nav-link',
    'aria-current': t.key === active ? 'page' : null,
    'aria-label': t.key === 'rueda' && swapsForMe ? `Rueda, ${swapsForMe} ${swapsForMe === 1 ? 'petición' : 'peticiones'} de cambio` : null,
  }, icon(t.icon, { size: 24 }), t.label,
  t.key === 'rueda' && swapsForMe ? h('span', { class: 'nav-badge', 'aria-hidden': 'true' }, String(swapsForMe)) : null)));
}

function renderBanner(s) {
  const n = s.queue.length;
  const pending = `${n} ${n === 1 ? 'cambio pendiente' : 'cambios pendientes'}`;
  let text = '';
  let cls = 'show';
  if (s.needsLogin && session.user) {
    text = 'Tu sesión ha caducado. Sal y vuelve a entrar desde Casa.';
    cls = 'show warn';
  } else if (!s.online && s.userId) {
    text = n ? `Sin conexión · ${pending}` : 'Sin conexión';
  } else if (n && s.userId) {
    text = `Enviando ${pending}…`;
  } else if (s.justSynced) {
    text = 'Sincronizado';
    cls = 'show ok';
  }
  bannerEl.className = text ? cls : '';
  bannerEl.textContent = text;
}

async function boot() {
  registerServiceWorker();
  store.subscribe(() => render());
  window.addEventListener('hashchange', render);
  if (!configured) { render(); return; }

  sb.auth.onAuthStateChange((event, sess) => {
    // Supabase advises not to await other Supabase calls inside this callback.
    setTimeout(() => onAuth(event, sess), 0);
  });
}

async function onAuth(event, sess) {
  if (event === 'PASSWORD_RECOVERY') session.recovery = true;
  if (event === 'SIGNED_OUT') {
    session.user = null;
    await store.stop();
  } else if (sess?.user) {
    if (session.user?.id !== sess.user.id) {
      session.user = sess.user;
      session.ready = true;
      if (!location.hash || location.hash === '#/' || location.hash.startsWith('#/entrar')) location.replace('#/lista');
      render();
      await store.start(sess.user);
    }
  } else if (event === 'INITIAL_SESSION') {
    // No usable session. Offline with an expired token: keep working from the cached house; the token is
    // refreshed (and the queue sent) as soon as there is signal again.
    const last = store.lastUser();
    if (last && !navigator.onLine && await store.hasCachedSnapshot(last.id)) {
      session.user = last;
      session.ready = true;
      render();
      await store.start(last);
      return;
    }
  }
  session.ready = true;
  render();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  if (new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
}

export async function signOut({ discardQueue = false } = {}) {
  await store.stop({ discardQueue });
  session.user = null;
  try { await sb.auth.signOut({ scope: 'local' }); } catch { /* offline: local session is cleared anyway */ }
  location.hash = '#/entrar';
  render();
}

boot();
