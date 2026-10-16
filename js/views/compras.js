// Todas las compras de un mes: comunes (se reparten) y personales (solo informativas).
import { h, icon } from '../ui.js';
import { formatEuros } from '../money.js';
import { monthName, capitalise } from '../periods.js';
import { periodPurchases } from '../data.js';
import { purchaseRow } from './cuentas.js';
import { openPurchaseForm } from '../sheets/purchase-form.js';

const cache = new Map();

export function render(ctx) {
  const month = ctx.params[0] ?? ctx.month;
  const period = (ctx.v.periods ?? []).find((p) => p.month === month);
  const open = period?.status === 'open';
  let list;
  if (open) {
    list = (ctx.v.purchases ?? []).filter((p) => p.period_id === period.id && !p.deleted_at);
  } else if (period) {
    list = cache.get(period.id);
    if (!list) {
      cache.set(period.id, null);
      periodPurchases(period.id).then((rows) => { cache.set(period.id, rows.filter((p) => !p.deleted_at)); ctx.rerender(); })
        .catch(() => { cache.delete(period.id); });
    }
  }
  list = list ? [...list].sort((a, b) => (a.purchased_at < b.purchased_at ? 1 : -1)) : null;
  const common = list?.filter((p) => p.scope === 'common') ?? [];
  const personal = list?.filter((p) => p.scope === 'personal') ?? [];
  const total = common.reduce((a, p) => a + p.amount_cents, 0);

  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header compact' },
      h('a', { href: open ? '#/cuentas' : `#/cierre/${month}`, class: 'icon-btn', 'aria-label': 'Volver' }, icon('back', { size: 20, stroke: 2.4 })),
      h('div', { class: 'grow' },
        h('div', { class: 'eyebrow' }, open ? 'Toca una compra para cambiarla' : 'Mes cerrado'),
        h('h1', { class: 'title small' }, `Compras de ${monthName(month)}`))),
    h('div', { class: 'screen-main' },
      !list ? h('div', { class: 'empty' }, ctx.online ? 'Cargando…' : 'Sin conexión.') : [
        h('div', { class: 'label-row' },
          h('h2', { class: 'section-label', style: { margin: 0 } }, `Comunes · ${formatEuros(total)}`),
          open ? h('button', { type: 'button', class: 'link-btn', style: { padding: '0 4px', minHeight: '32px' }, onclick: () => openPurchaseForm(ctx, { month }) }, '+ Añadir gasto') : null),
        common.length ? h('section', { class: 'card list' }, common.map((p) => purchaseRow(ctx, p, { editable: open })))
          : h('div', { class: 'card empty' }, 'No hay compras comunes.'),
        h('h2', { class: 'section-label', style: { margin: 0 } }, 'Personales · no se reparten'),
        personal.length ? h('section', { class: 'card list' }, personal.map((p) => purchaseRow(ctx, p, { editable: open })))
          : h('div', { class: 'card empty' }, 'No hay compras personales.'),
      ],
      !open && period ? h('div', { class: 'caption', style: { textAlign: 'center' } }, `${capitalise(monthName(month))} está cerrado: para cambiar algo, reábrelo desde su cierre.`) : null));
}
