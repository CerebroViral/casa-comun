// Cuentas del mes [Cuentas]: what was advanced, each adult's share and balance (colour + sign + text).
import { h, icon, avatar } from '../ui.js';
import { formatEuros, periodNumbers } from '../money.js';
import { monthName, relativeDay, capitalise } from '../periods.js';
import { openPurchaseForm } from '../sheets/purchase-form.js';

export function purchaseRow(ctx, p, { editable = true } = {}) {
  const parts = [relativeDay(p.purchased_at, ctx.today), ctx.name(p.paid_by), p.store].filter(Boolean);
  const tags = [];
  if (p.is_big_shop) tags.push(h('span', { class: 'tag-common' }, ' · Compra grande'));
  if (p.scope === 'personal') tags.push(h('span', { class: 'tag-personal' }, ` · Personal${p.for_member_id && p.for_member_id !== p.paid_by ? ` (${ctx.name(p.for_member_id)})` : ''}`));
  if (p.pending) tags.push(h('span', { class: 'pending-dot' }, ' · sin enviar'));
  const body = [
    h('div', { class: 'grow' },
      h('div', { class: 'row-title' }, p.description),
      h('div', { class: 'row-sub' }, parts.join(' · '), tags)),
    h('div', { class: 'row-amount' }, p.amount_cents ? formatEuros(p.amount_cents) : 'sin precio'),
  ];
  if (!editable) return h('div', { class: 'row', style: { gap: '10px' } }, body);
  return h('button', {
    type: 'button', class: 'row row-btn',
    'aria-label': `${p.description}, ${p.amount_cents ? formatEuros(p.amount_cents) : 'sin precio'}. Editar`,
    onclick: () => openPurchaseForm(ctx, { purchase: p }),
  }, body);
}

export function balanceText(cents) {
  return formatEuros(cents, { sign: true });
}

export function balanceClass(cents) {
  return cents > 0 ? 'pos' : cents < 0 ? 'neg' : 'zero';
}

export function render(ctx) {
  const period = ctx.period;
  const purchases = (ctx.v.purchases ?? []).filter((p) => p.period_id === period?.id && !p.deleted_at);
  const numbers = periodNumbers(ctx.v.members ?? [], purchases);
  const n = numbers.sharers_count;
  const maxPaid = Math.max(0, ...numbers.people.map((p) => p.paid_cents));
  const reopened = (ctx.v.periods ?? []).filter((p) => p.status === 'open' && p.id !== period?.id);

  const rows = numbers.people.map((p) => {
    const m = ctx.member(p.member_id);
    const pct = maxPaid ? Math.round((p.paid_cents / maxPaid) * 100) : 0;
    const status = p.balance_cents > 0 ? 'lleva puesto de más' : p.balance_cents < 0 ? 'le falta por poner' : 'está al día';
    return h('div', { class: 'row balance-row' },
      avatar(m, { size: 36 }),
      h('div', { class: 'grow', style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
        h('div', { class: 'between' },
          h('span', { class: 'row-title strong' }, m?.display_name ?? '—'),
          h('span', { style: { fontSize: '14px', color: '#5B6660', whiteSpace: 'nowrap' } }, `adelantó ${formatEuros(p.paid_cents)}`)),
        h('div', { class: 'bar', role: 'presentation' }, pct ? h('span', { style: { width: `${pct}%`, background: m?.color ?? '#3B4540' } }) : null)),
      h('div', { class: `balance ${balanceClass(p.balance_cents)}` },
        h('span', { 'aria-hidden': 'true' }, balanceText(p.balance_cents)),
        h('span', { class: 'sr-only' }, `${balanceText(p.balance_cents)}, ${status}`)));
  });

  const latest = [...purchases].sort((a, b) => (a.purchased_at < b.purchased_at ? 1 : -1)).slice(0, 3);

  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header', style: { display: 'block', paddingBottom: '8px' } },
      h('div', { class: 'eyebrow' }, 'Gastos comunes · solo comida'),
      h('h1', { class: 'title' }, `Cuentas de ${monthName(ctx.month)}`)),
    h('div', { class: 'screen-main' },
      reopened.map((p) => h('div', { class: 'notice warn' }, icon('info', { size: 18 }),
        h('span', { class: 'grow' }, `${capitalise(monthName(p.month))} está reabierto.`),
        h('a', { href: `#/cierre/${p.month}`, style: { fontWeight: 700, color: 'inherit' } }, 'Revisar y cerrar'))),
      h('section', { class: 'card dark stat-card', 'aria-label': 'Resumen del mes' },
        h('div', null, h('div', { class: 'stat-label' }, 'Adelantado este mes'), h('div', { class: 'big-number' }, formatEuros(numbers.total_cents))),
        h('div', null, h('div', { class: 'stat-label' }, 'Parte de cada adulto'), h('div', { class: 'big-number' }, formatEuros(n ? Math.round(numbers.total_cents / n) : 0))),
        h('div', { class: 'caption' }, `Entre ${n} ${n === 1 ? 'adulto' : 'adultos'} a partes iguales`)),
      h('section', { class: 'card list-4', 'aria-label': 'Lo que lleva cada uno' }, rows),
      h('div', { class: 'caption', style: { marginTop: '-4px' } }, 'En verde: lleva puesto de más. En rojo: le falta por poner. Se ajusta en el cierre.'),
      h('div', { class: 'label-row' },
        h('h2', { class: 'section-label', style: { margin: 0 } }, 'Últimas compras'),
        h('button', { type: 'button', class: 'link-btn', style: { padding: '0 4px', minHeight: '32px' }, onclick: () => openPurchaseForm(ctx) }, '+ Añadir gasto')),
      latest.length
        ? h('section', { class: 'card list' }, latest.map((p) => purchaseRow(ctx, p)))
        : h('div', { class: 'card empty' }, 'Todavía no hay compras este mes.'),
      purchases.length > 3 ? h('a', { href: '#/compras', style: { textAlign: 'center', fontSize: '14px', fontWeight: 600, padding: '6px' } }, `Ver todas (${purchases.length})`) : null,
      h('a', { href: '#/cierre', class: 'btn btn-primary btn-54' }, 'Preparar cierre de mes', icon('forward', { size: 18, stroke: 2.4, color: '#FFFFFF' }))));
}
