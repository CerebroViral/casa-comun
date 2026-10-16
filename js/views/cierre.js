// Cierre de mes [Cierre]. Moment 1 (before the big shop): estimate of what each one puts in.
// Moment 2 (big shop entered): exact amounts, Bizums to settle, close the month. Closed months: frozen view.
import { h, icon, avatar, confirmDialog, toast } from '../ui.js';
import { formatEuros, formatAmount, periodNumbers, pendingTransfers, splitShares } from '../money.js';
import { monthName, nextMonth, capitalise, formatLongDay, madridDate } from '../periods.js';
import { rpc } from '../data.js';
import { friendlyError, isNetworkError } from '../supabase-client.js';
import { openPurchaseForm } from '../sheets/purchase-form.js';

const cache = new Map(); // `${month}|${snapshot time}` → { data } | { error }

function load(ctx, month) {
  const key = `${month}|${ctx.v.fetched_at}`;
  if (cache.has(key)) return cache.get(key);
  cache.set(key, { loading: true });
  rpc('period_summary', { p_household: ctx.v.household.id, p_month: month })
    .then((data) => cache.set(key, { data }))
    .catch((e) => cache.set(key, { error: e }))
    .finally(() => ctx.rerender());
  return cache.get(key);
}

function euroMaybeWhole(cents) {
  return cents % 100 === 0 ? `${formatAmount(cents).replace(',00', '')} €` : formatEuros(cents);
}

export function render(ctx) {
  const month = ctx.params[0] ?? ctx.month;
  const period = (ctx.v.periods ?? []).find((p) => p.month === month);
  const res = load(ctx, month);
  const closed = period?.status === 'closed';

  let summary = res.data;
  let offline = false;
  if (!summary && period && !closed && (res.error || !ctx.online)) {
    // No signal: the same maths, computed on the phone, without Bizum marking.
    const purchases = (ctx.v.purchases ?? []).filter((p) => p.period_id === period.id && !p.deleted_at);
    summary = periodNumbers(ctx.v.members ?? [], purchases);
    summary.transfers = pendingTransfers(summary.people);
    summary.status = 'open';
    offline = true;
  }

  const header = h('header', { class: 'screen-header compact' },
    h('a', { href: closed ? '#/meses' : '#/cuentas', class: 'icon-btn', 'aria-label': closed ? 'Volver a meses anteriores' : 'Volver a cuentas' },
      icon('back', { size: 20, stroke: 2.4 })),
    h('div', null,
      h('div', { class: 'eyebrow' }, closed && period?.closed_at ? `Cerrado el ${formatLongDay(madridDate(period.closed_at))}` : 'Fin de mes'),
      h('h1', { class: 'title small' }, `Cierre de ${monthName(month)}`)));

  const main = h('div', { class: 'screen-main' });
  if (!summary) {
    main.append(h('div', { class: 'empty' },
      res.error && !isNetworkError(res.error.supabase ?? res.error, res.error.status) ? friendlyError(res.error) : (ctx.online ? 'Cargando…' : 'Sin conexión.')));
    return h('div', { class: 'screen' }, header, main);
  }
  if (offline) {
    main.append(h('div', { class: 'notice warn' }, icon('cloudOff', { size: 18 }), h('span', null, 'Sin conexión: cuentas calculadas en el móvil. Para marcar Bizums o cerrar el mes hace falta cobertura.')));
  }

  const people = summary.people ?? [];
  const who = (p) => ctx.member(p.member_id) ?? { display_name: p.display_name ?? '—', color: p.color ?? '#3B4540' };

  if (!closed && !summary.has_big_shop) {
    main.append(...momentBefore(ctx, month, summary, people, who));
  } else {
    main.append(...momentAfter(ctx, summary, people, who, { offline }));
  }

  if (!closed && !offline) {
    const close = h('button', {
      type: 'button', class: summary.has_big_shop ? 'btn btn-primary btn-big' : 'btn btn-ghost',
      onclick: async () => {
        const ok = await confirmDialog({
          title: `¿Cerrar ${monthName(month)}?`,
          body: `Las compras de ${monthName(month)} quedan guardadas y ya no se podrán cambiar (si hay un error, se puede reabrir). Lo comprado de la compra del mes se quita de la lista. Empieza ${monthName(nextMonth(month))}.`,
          confirm: 'Cerrar el mes',
        });
        if (!ok) return;
        close.disabled = true;
        try {
          await rpc('close_period', { p_household: ctx.v.household.id, p_month: month });
          await ctx.refresh();
          toast(`${capitalise(monthName(month))} cerrado. Empieza ${monthName(nextMonth(month))}.`);
          ctx.go(`#/cierre/${month}`);
        } catch (e) {
          close.disabled = false;
          toast(friendlyError(e), { kind: 'error' });
        }
      },
    }, summary.has_big_shop
      ? `Cerrar ${monthName(month)} y empezar ${monthName(nextMonth(month))}`
      : `Cerrar ${monthName(month)} sin compra grande`);
    main.append(close);
  }

  if (closed) {
    const lastClosed = (ctx.v.periods ?? []).filter((p) => p.status === 'closed').map((p) => p.month).sort().pop();
    main.append(h('a', { href: `#/compras/${month}`, class: 'btn btn-ghost' }, `Ver las compras de ${monthName(month)}`));
    if (lastClosed === month) {
      main.append(h('button', {
        type: 'button', class: 'link-btn',
        onclick: async () => {
          const ok = await confirmDialog({
            title: `¿Reabrir ${monthName(month)}?`,
            body: 'Sirve para corregir un error. Queda apuntado quién lo reabrió. Luego hay que volver a cerrarlo.',
            confirm: 'Reabrir',
          });
          if (!ok) return;
          try {
            await rpc('reopen_period', { p_household: ctx.v.household.id, p_month: month });
            await ctx.refresh();
            toast(`${capitalise(monthName(month))} está abierto otra vez.`);
          } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
        },
      }, `Reabrir ${monthName(month)}`));
    }
  }
  main.append(h('a', { href: '#/meses', style: { textAlign: 'center', fontSize: '14px', fontWeight: 600, padding: '6px' } }, 'Ver meses anteriores'));
  return h('div', { class: 'screen' }, header, main);
}

function person(ctx, m, sub, amount) {
  return h('div', { class: 'row' },
    avatar(m, { size: 36 }),
    h('div', { class: 'grow' }, h('div', { class: 'row-title strong' }, m.display_name), h('div', { class: 'row-sub' }, sub)),
    h('div', { class: 'put-amount' }, amount));
}

// Before the big shop: estimate from the list so the family can pool money before going.
function momentBefore(ctx, month, summary, people, who) {
  const pending = (ctx.v.items ?? []).filter((i) => i.list === 'monthly' && i.status === 'pending' && i.scope === 'common');
  const estimate = pending.reduce((a, i) => a + (i.estimated_cents ?? 0), 0);
  const missing = pending.filter((i) => i.estimated_cents === null || i.estimated_cents === undefined).length;
  const sharers = people.filter((p) => p.shares_costs).map((p) => p.member_id);
  const shares2 = splitShares(summary.total_cents + estimate, sharers);
  const n = sharers.length || 1;
  const total2 = summary.total_cents + estimate;
  return [
    h('section', { class: 'card pad stack' },
      h('div', { class: 'between', style: { fontSize: '14px' } }, h('span', { style: { color: '#5B6660' } }, 'Compras durante el mes'), h('span', { style: { fontWeight: 600 } }, formatEuros(summary.during_cents))),
      h('div', { class: 'between', style: { fontSize: '14px' } }, h('span', { style: { color: '#5B6660' } }, 'Compra grande (estimada con la lista)'), h('span', { style: { fontWeight: 600 } }, formatEuros(estimate, { approx: true }))),
      h('div', { style: { height: '1px', background: '#ECEFED' } }),
      h('div', { class: 'between' }, h('span', { style: { fontSize: '15px', fontWeight: 700 } }, 'Gasto común total (estimado)'), h('span', { class: 'title small' }, formatEuros(total2, { approx: true }))),
      h('div', { class: 'share-pill' }, `Parte de cada adulto: ≈ ${formatEuros(Math.round(total2 / n))}`),
      missing ? h('div', { class: 'caption' }, `${missing} ${missing === 1 ? 'producto de la lista no tiene' : 'productos de la lista no tienen'} precio y no cuentan.`) : null),
    h('h2', { class: 'section-label', style: { margin: 0 } }, 'Lo que pone cada uno para la compra grande'),
    h('section', { class: 'card list-4' }, people.filter((p) => p.shares_costs).map((p) => {
      const share = shares2.get(p.member_id) ?? 0;
      const put = share - p.paid_cents;
      return person(ctx, who(p),
        put >= 0 ? `${formatAmount(share)} − ${formatAmount(p.paid_cents)} ya adelantado` : `Ya lleva ${formatEuros(-put)} de más`,
        formatEuros(Math.max(0, put), { approx: true }));
    })),
    h('div', { class: 'notice info' }, icon('info', { size: 18, color: '#174A5F' }),
      h('span', null, 'Es una estimación con los precios de la lista. Cuando metáis la compra grande, la cuenta sale exacta.')),
    h('button', { type: 'button', class: 'btn btn-primary btn-big', onclick: () => openPurchaseForm(ctx, { bigShop: true, month }) },
      icon('plus', { size: 20, stroke: 2.6, color: '#FFFFFF' }), 'Añadir la compra grande'),
  ];
}

// After the big shop (or a closed month): exact amounts and the Bizums.
function momentAfter(ctx, summary, people, who, { offline }) {
  const n = summary.sharers_count || 1;
  const share = Math.round(summary.total_cents / n);
  const out = [];
  out.push(h('section', { class: 'card pad stack' },
    summary.has_big_shop ? [
      h('div', { class: 'between', style: { fontSize: '14px' } }, h('span', { style: { color: '#5B6660' } }, 'Compras durante el mes'), h('span', { style: { fontWeight: 600 } }, formatEuros(summary.during_cents))),
      h('div', { class: 'between', style: { fontSize: '14px' } }, h('span', { style: { color: '#5B6660' } }, 'Compra grande de fin de mes'), h('span', { style: { fontWeight: 600 } }, formatEuros(summary.big_shop_cents))),
      h('div', { style: { height: '1px', background: '#ECEFED' } }),
    ] : null,
    h('div', { class: 'between' }, h('span', { style: { fontSize: '15px', fontWeight: 700 } }, 'Gasto común total'), h('span', { class: 'title small' }, formatEuros(summary.total_cents))),
    h('div', { class: 'share-pill' }, `Parte de cada adulto: ${euroMaybeWhole(summary.total_cents)} ÷ ${n} = ${formatEuros(share)}`)));

  out.push(h('h2', { class: 'section-label', style: { margin: 0 } }, summary.has_big_shop ? 'Lo que pone cada uno para la compra grande' : 'Lo que pone cada uno'));
  out.push(h('section', { class: 'card list-4' }, people.filter((p) => p.shares_costs || p.paid_cents).map((p) => {
    const before = summary.has_big_shop ? p.paid_before_big_cents : p.paid_cents;
    const put = p.share_cents - before;
    return person(ctx, who(p), `${formatAmount(p.share_cents)} − ${formatAmount(before)} ya adelantado`, formatEuros(put));
  })));

  // Bizums, grouped by who receives them.
  const transfers = summary.transfers ?? [];
  const bigPayers = (summary.big_shop_payers ?? []).map((id) => ctx.member(id)?.display_name ?? people.find((p) => p.member_id === id)?.display_name ?? '—');
  const creditors = [...new Set(transfers.map((t) => t.to_member))];
  out.push(h('section', { class: 'card pad stack' },
    bigPayers.length ? h('div', { style: { fontSize: '14px', fontWeight: 700 } }, `Pagó la compra grande: ${bigPayers.join(' y ')}`) : null,
    !transfers.length ? h('div', { style: { fontSize: '14px', color: '#5B6660' } }, 'No hace falta ningún Bizum: estáis en paz.') : null,
    creditors.map((to) => {
      const mine = transfers.filter((t) => t.to_member === to);
      const allPaid = mine.every((t) => t.paid);
      const toName = ctx.member(to)?.display_name ?? people.find((p) => p.member_id === to)?.display_name ?? '—';
      return [
        h('div', { style: { fontSize: '13px', color: '#5B6660' } }, `${allPaid ? 'Bizums' : 'Bizums pendientes'} a ${toName}:`),
        h('div', { class: 'bizum-chips' }, mine.map((t) => bizumChip(ctx, t, people, { offline }))),
      ];
    }),
    transfers.length && !offline ? h('div', { class: 'caption' }, 'Toca un Bizum cuando esté hecho para marcarlo como pagado.') : null));
  return out;
}

function bizumChip(ctx, t, people, { offline }) {
  const fromName = ctx.member(t.from_member)?.display_name ?? people.find((p) => p.member_id === t.from_member)?.display_name ?? '—';
  const toName = ctx.member(t.to_member)?.display_name ?? '—';
  const text = `${fromName} → ${formatEuros(t.amount_cents)}${t.paid ? ' · pagado' : ''}`;
  if (offline || !t.id) return h('span', { class: `bizum ${t.paid ? 'paid' : ''}` }, text);
  return h('button', {
    type: 'button', class: `bizum ${t.paid ? 'paid' : ''}`,
    'aria-label': t.paid ? `${fromName} pagó ${formatEuros(t.amount_cents)} a ${toName}. Desmarcar` : `${fromName} debe ${formatEuros(t.amount_cents)} a ${toName}. Marcar pagado`,
    onclick: async () => {
      const ok = await confirmDialog(t.paid
        ? { title: '¿Desmarcar este Bizum?', body: `Vuelve a quedar pendiente que ${fromName} pague ${formatEuros(t.amount_cents)} a ${toName}.`, confirm: 'Desmarcar' }
        : { title: 'Marcar pagado', body: `¿${fromName} ya ha pagado ${formatEuros(t.amount_cents)} a ${toName}?`, confirm: 'Sí, pagado' });
      if (!ok) return;
      try {
        await rpc('mark_transfer_paid', { p_transfer_id: t.id, p_paid: !t.paid });
        await ctx.refresh();
      } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
    },
  }, text);
}
