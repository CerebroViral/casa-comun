// Lista de la compra [Main]: two lists, items grouped by category, estimate card, add button.
import { h, icon, avatar, footer, confirmDialog } from '../ui.js';
import { CATEGORIES } from '../categories.js';
import { formatEuros } from '../money.js';
import { monthName } from '../periods.js';
import { shoppingPersonForWeek } from '../rueda.js';
import { openComprado } from '../sheets/comprado.js';
import { openItemForm, openItemActions } from '../sheets/item-form.js';

export function render(ctx) {
  const tab = ctx.ui.listTab ?? 'monthly';
  const setTab = (t) => { ctx.ui.listTab = t; ctx.rerender(); };
  const items = ctx.v.items ?? [];
  const purchases = new Map((ctx.v.purchases ?? []).map((p) => [p.id, p]));
  const unsent = new Set(ctx.state.queue.flatMap((m) => [m.payload?.item?.id, m.payload?.item_id, m.payload?.id].filter(Boolean)));
  const count = (list) => items.filter((i) => i.list === list && i.status === 'pending').length;
  const shopper = ctx.rota ? ctx.member(shoppingPersonForWeek(ctx.rota, ctx.today)) : null;

  const adults = ctx.members.filter((m) => m.kind === 'adult');
  const shown = adults.slice(0, 4);
  const header = h('header', { class: 'screen-header' },
    h('div', { class: 'grow' },
      h('h1', { class: 'title' }, 'Casa Común'),
      h('div', { class: 'eyebrow' }, `${ctx.members.length} en casa · ${monthName(ctx.month)}`),
      shopper ? h('div', { class: 'eyebrow' }, 'Esta semana va a la compra: ', h('strong', null, shopper.display_name)) : null),
    h('div', { class: 'avatar-stack list-head-avatars', role: 'img', 'aria-label': `En casa: ${ctx.members.map((m) => m.display_name).join(', ')}` },
      shown.map((m) => avatar(m, { size: 32 })),
      adults.length > 4 ? avatar({ display_name: `+${adults.length - 4}`, color: '#5B6660' }, { size: 32 }) : null));

  const tabs = h('div', { class: 'tabs2', role: 'tablist' },
    tabButton('monthly', `Compra del mes · ${count('monthly')}`, tab, setTab),
    tabButton('urgent', `Hace falta ya · ${count('urgent')}`, tab, setTab));

  const inTab = items.filter((i) => i.list === tab);
  const main = h('div', { class: 'screen-main tight', style: { paddingTop: '6px', paddingBottom: '96px' } });
  if (!inTab.length) {
    main.append(h('div', { class: 'empty' },
      h('strong', null, tab === 'monthly' ? 'La compra del mes está vacía' : 'No hace falta nada urgente'),
      'Pulsa «Añadir producto» para apuntar algo.'));
  }
  for (const category of CATEGORIES) {
    const group = inTab.filter((i) => (i.category ?? 'Otros') === category);
    if (!group.length) continue;
    group.sort((a, b) => (a.status === b.status ? (a.created_at < b.created_at ? -1 : 1) : a.status === 'pending' ? -1 : 1));
    main.append(
      h('h2', { class: 'section-label cat-label', style: { margin: 0 } }, category),
      h('div', { class: 'card list', style: { borderRadius: '14px' } }, group.map((item) => itemRow(ctx, item, purchases, unsent))));
  }
  const bought = inTab.filter((i) => i.status === 'bought');
  if (bought.length) {
    main.append(h('div', { style: { textAlign: 'center', paddingTop: '8px' } },
      h('button', {
        type: 'button', class: 'link-btn',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Limpiar comprados',
            body: `Se quitan de la lista ${bought.length} ${bought.length === 1 ? 'producto comprado' : 'productos comprados'}. Las compras siguen en las cuentas.`,
            confirm: 'Limpiar',
          });
          if (ok) ctx.mutate('items.clear', { ids: bought.map((i) => i.id) });
        },
      }, 'Limpiar comprados')));
  }
  main.append(footer());

  const fab = h('button', { type: 'button', class: 'fab', onclick: () => openItemForm(ctx, { list: tab }) },
    icon('plus', { size: 20, stroke: 2.6 }), 'Añadir producto');

  return h('div', { class: 'screen' }, header, tabs, tab === 'monthly' ? summaryCard(ctx, items) : null, main, fab);
}

function tabButton(value, label, current, setTab) {
  return h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(value === current), class: `tab-btn ${value === current ? 'on' : ''}`,
    onclick: () => setTab(value),
  }, label);
}

function summaryCard(ctx, items) {
  const pending = items.filter((i) => i.list === 'monthly' && i.status === 'pending' && i.scope === 'common');
  const priced = pending.filter((i) => i.estimated_cents !== null && i.estimated_cents !== undefined);
  const total = priced.reduce((a, i) => a + i.estimated_cents, 0);
  const missing = pending.length - priced.length;
  const n = ctx.sharers.length || 1;
  return h('section', { class: 'card summary', 'aria-label': 'Estimado de la compra del mes' },
    h('div', { class: 'grow' },
      h('div', { class: 'eyebrow' }, 'Estimado de la compra del mes'),
      h('div', { class: 'big-number' }, formatEuros(total, { whole: true, approx: true })),
      h('div', { class: 'caption' }, `Precios ${ctx.stores.join(' y ')} · estimados`),
      missing ? h('div', { class: 'caption' }, `${missing} ${missing === 1 ? 'producto sin precio' : 'productos sin precio'}`) : null),
    h('div', { class: 'pill' }, `${formatEuros(Math.round(total / n))} / adulto`));
}

function itemRow(ctx, item, purchases, unsent) {
  const bought = item.status === 'bought';
  const purchase = bought ? purchases.get(item.purchase_id) : null;
  const waiting = unsent.has(item.id) || purchase?.pending;
  const qty = item.quantity_text ? `${item.quantity_text} · ` : '';
  let meta;
  if (bought) {
    const who = purchase ? ctx.name(purchase.paid_by) : 'alguien';
    meta = `Comprado por ${who}${purchase?.store ? ` · ${purchase.store}` : ''}`;
  } else if (item.scope === 'personal') {
    meta = `${qty}solo para ${ctx.name(item.for_member_id ?? item.added_by)}`;
  } else {
    meta = `${qty}añadido por ${ctx.name(item.added_by)}`;
  }
  let price;
  if (bought) {
    price = purchase?.amount_cents ? h('div', { class: 'amount real' }, formatEuros(purchase.amount_cents)) : h('div', { class: 'amount none' }, 'sin precio');
  } else {
    price = item.estimated_cents !== null && item.estimated_cents !== undefined
      ? h('div', { class: 'amount' }, formatEuros(item.estimated_cents, { approx: true }))
      : h('div', { class: 'amount none' }, 'sin precio');
  }
  const tickLabel = bought ? `${item.name}, comprado. Opciones` : `Marcar ${item.name} como comprado`;
  return h('div', { class: 'item-row' },
    h('button', {
      type: 'button', class: 'tick', 'aria-label': tickLabel,
      onclick: () => (bought ? openItemActions(ctx, item, purchase) : openComprado(ctx, item)),
    }, h('span', { class: `tick-box ${bought ? 'done' : ''}` }, bought ? icon('check', { size: 16, stroke: 3, color: '#FFFFFF' }) : null)),
    h('button', { type: 'button', class: 'item-body', 'aria-label': `${item.name}. Editar, mover o eliminar`, onclick: () => openItemActions(ctx, item, purchase) },
      h('div', { class: 'grow' },
        h('div', { class: `item-name ${bought ? 'bought' : ''}` }, item.name),
        h('div', { class: 'item-meta' }, meta, waiting ? h('span', { class: 'pending-dot' }, ' · sin enviar') : null)),
      h('div', { class: 'item-price' }, price,
        h('div', { class: item.scope === 'personal' ? 'tag-personal' : 'tag-common' }, item.scope === 'personal' ? 'Personal' : 'Común'))));
}
