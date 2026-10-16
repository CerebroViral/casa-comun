// Meses anteriores: closed months with total, each person's share, the Bizums and whether they were paid.
import { h, icon } from '../ui.js';
import { formatEuros } from '../money.js';
import { monthName, capitalise } from '../periods.js';
import { closedPeriods, periodTransfers } from '../data.js';

const cache = new Map();

function load(ctx) {
  const key = ctx.v.fetched_at;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, { loading: true });
  (async () => {
    const periods = await closedPeriods(ctx.v.household.id);
    const transfers = await periodTransfers(periods.map((p) => p.id));
    return { periods, transfers };
  })().then((data) => cache.set(key, { data })).catch((error) => cache.set(key, { error })).finally(() => ctx.rerender());
  return cache.get(key);
}

export function render(ctx) {
  const res = load(ctx);
  const main = h('div', { class: 'screen-main' });
  if (!res.data) {
    main.append(h('div', { class: 'empty' }, res.error || !ctx.online ? 'Sin conexión. Los meses anteriores se ven con cobertura.' : 'Cargando…'));
  } else if (!res.data.periods.length) {
    main.append(h('div', { class: 'card empty' }, h('strong', null, 'Todavía no hay meses cerrados'), 'Cuando cerréis el primer mes, aparecerá aquí.'));
  } else {
    for (const p of res.data.periods) {
      const snap = p.snapshot ?? {};
      const n = snap.sharers_count || 1;
      const transfers = res.data.transfers.filter((t) => t.period_id === p.id);
      const nameOf = (id) => ctx.member(id)?.display_name ?? (snap.people ?? []).find((x) => x.member_id === id)?.display_name ?? '—';
      const pending = transfers.filter((t) => !t.paid).length;
      main.append(h('a', { href: `#/cierre/${p.month}`, class: 'card pad stack', style: { textDecoration: 'none', color: 'inherit' } },
        h('div', { class: 'between', style: { alignItems: 'center' } },
          h('div', { style: { fontSize: '17px', fontWeight: 700 } }, capitalise(monthName(p.month, { year: true }))),
          h('div', { class: 'title small', style: { fontSize: '20px' } }, formatEuros(snap.total_cents ?? 0))),
        h('div', { class: 'row-sub' }, `Parte de cada adulto: ${formatEuros(Math.round((snap.total_cents ?? 0) / n))} · ${n} ${n === 1 ? 'adulto' : 'adultos'}`),
        transfers.length ? h('div', { class: 'bizum-chips' }, transfers.map((t) => h('span', { class: `bizum ${t.paid ? 'paid' : ''}` },
          `${nameOf(t.from_member)} → ${nameOf(t.to_member)} ${formatEuros(t.amount_cents)}${t.paid ? ' · pagado' : ''}`)))
          : h('div', { class: 'row-sub' }, 'Sin Bizums: estaban en paz.'),
        pending ? h('div', { style: { fontSize: '13px', fontWeight: 700, color: '#8A1C12' } }, `${pending} ${pending === 1 ? 'Bizum pendiente' : 'Bizums pendientes'}`) : null));
    }
  }
  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header compact' },
      h('a', { href: '#/cuentas', class: 'icon-btn', 'aria-label': 'Volver a cuentas' }, icon('back', { size: 20, stroke: 2.4 })),
      h('div', null, h('div', { class: 'eyebrow' }, 'Historial'), h('h1', { class: 'title small' }, 'Meses anteriores'))),
    main);
}
