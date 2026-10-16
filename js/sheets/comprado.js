// Marcar como comprado [Comprado]: how much, who paid, where, common or personal. Works offline.
import { h, icon, avatar, openSheet, sheetHeader, segmented, uuid } from '../ui.js';
import { parseMoney, formatEuros, centsToInput } from '../money.js';
import { monthName } from '../periods.js';

export function lastStore(stores) {
  try {
    const s = localStorage.getItem('cc-last-store');
    if (s && (stores.includes(s) || s === 'Otro')) return s;
  } catch { /* ignore */ }
  return stores[0] ?? 'Otro';
}

export function rememberStore(s) {
  try { localStorage.setItem('cc-last-store', s); } catch { /* ignore */ }
}

export function payerGrid(people, selected, onPick, label = '¿Quién lo pagó?') {
  const grid = h('div', { class: 'payer-grid', role: 'radiogroup', 'aria-label': label });
  const draw = (sel) => grid.replaceChildren(...people.map((m) => h('button', {
    type: 'button', role: 'radio', class: 'payer', 'aria-checked': String(m.id === sel),
    onclick: () => { draw(m.id); onPick(m.id); },
  }, avatar(m, { size: 34 }), h('span', { class: 'payer-name' }, m.display_name))));
  draw(selected);
  return grid;
}

export function storePills(stores, selected, onPick) {
  const options = [...stores, 'Otro'];
  const wrap = h('div', { class: 'choice-pills', role: 'radiogroup', 'aria-label': '¿Dónde?' });
  const draw = (sel) => wrap.replaceChildren(...options.map((s) => h('button', {
    type: 'button', role: 'radio', class: 'choice-pill', 'aria-checked': String(s === sel),
    onclick: () => { draw(s); onPick(s); },
  }, s)));
  draw(selected);
  return wrap;
}

export function openComprado(ctx, item) {
  const n = ctx.sharers.length || 1;
  let payer = ctx.me?.id;
  let store = lastStore(ctx.stores);
  let scope = item.scope;

  openSheet((close) => {
    const amount = h('input', {
      id: 'precio', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', autofocus: true,
      placeholder: item.estimated_cents ? centsToInput(item.estimated_cents) : '0,00',
      'aria-describedby': 'precio-error',
    });
    const error = h('div', { class: 'form-error', id: 'precio-error', role: 'alert' });
    const info = h('div', { class: 'notice pos', role: 'note' });
    const otherStore = h('input', { class: 'input h44', maxlength: 40, placeholder: '¿Qué tienda? (opcional)', 'aria-label': 'Nombre de la otra tienda', hidden: store !== 'Otro' });

    const updateInfo = () => {
      const cents = parseMoney(amount.value);
      info.hidden = scope !== 'common';
      const who = ctx.name(payer);
      const text = cents
        ? `Se suma a las cuentas de ${monthName(ctx.month)}: ${who} adelanta ${formatEuros(cents)} y cada adulto pone ${formatEuros(Math.round(cents / n))}.`
        : `Se suma a las cuentas de ${monthName(ctx.month)} y se reparte entre ${n} ${n === 1 ? 'adulto' : 'adultos'}.`;
      info.replaceChildren(icon('info', { size: 18, color: '#1F7A4D' }), h('span', null, text));
    };
    amount.addEventListener('input', () => { error.textContent = ''; updateInfo(); });

    const save = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, 'Guardar compra');
    const form = h('form', { class: 'stack', style: { gap: '18px' }, novalidate: true },
      h('div', { class: 'field' },
        h('label', { for: 'precio', class: 'field-label' }, '¿Cuánto costó?'),
        h('div', { class: 'money-input' }, amount, h('span', { 'aria-hidden': 'true' }, '€')),
        error),
      ctx.adults.length > 1 ? h('div', { class: 'sheet-section' },
        h('div', { class: 'field-label' }, '¿Quién lo pagó?'),
        payerGrid(ctx.adults, payer, (id) => { payer = id; updateInfo(); })) : null,
      h('div', { class: 'sheet-section' },
        h('div', { class: 'field-label' }, '¿Dónde?'),
        storePills(ctx.stores, store, (s) => { store = s; otherStore.hidden = s !== 'Otro'; }),
        otherStore),
      h('div', { class: 'sheet-section' },
        h('div', { class: 'field-label' }, '¿Para quién es?'),
        segmented([
          { value: 'common', label: 'Común (se reparte)', color: '#1F7A4D' },
          { value: 'personal', label: 'Personal' },
        ], scope, (v) => { scope = v; updateInfo(); }, { label: '¿Para quién es?' })),
      info,
      save);
    updateInfo();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = amount.value.trim();
      const cents = parseMoney(raw);
      if (raw && cents === null) { error.textContent = 'No entiendo ese precio. Escríbelo así: 5,58'; amount.focus(); return; }
      if (cents === 0) { error.textContent = 'El precio tiene que ser mayor que 0.'; amount.focus(); return; }
      if (!cents && scope === 'common') { error.textContent = 'Escribe cuánto costó.'; amount.focus(); return; }
      const storeName = store === 'Otro' ? (otherStore.value.trim() || 'Otro') : store;
      rememberStore(store);
      ctx.mutate('item.buy', {
        item_id: item.id,
        client_id: uuid(),
        amount_cents: cents ?? null,
        paid_by: payer,
        store: storeName,
        scope,
        for_member_id: scope === 'personal' ? (item.for_member_id ?? payer) : null,
        purchased_at: new Date().toISOString(),
        created_by: ctx.me?.id,
      });
      close();
    });

    const sub = [item.quantity_text, item.estimated_cents ? `estimado ${formatEuros(item.estimated_cents, { approx: true })}` : null].filter(Boolean).join(' · ');
    return [sheetHeader({ eyebrow: 'Marcar como comprado', title: item.name, sub: sub || null, close }), form];
  }, { label: `Marcar ${item.name} como comprado` });
}
