// Añadir gasto (a purchase without a list item, e.g. the big end-of-month shop) and editing a purchase.
import { h, openSheet, sheetHeader, segmented, toggle, confirmDialog, field, uuid } from '../ui.js';
import { parseMoney, centsToInput } from '../money.js';
import { madridDate } from '../periods.js';
import { payerGrid, storePills, lastStore, rememberStore } from './comprado.js';

export function openPurchaseForm(ctx, { purchase = null, bigShop = false, month = null } = {}) {
  const editing = Boolean(purchase);
  const knownStore = (s) => ctx.stores.includes(s);
  const f = {
    paid_by: purchase?.paid_by ?? ctx.me?.id,
    store: purchase ? (knownStore(purchase.store) ? purchase.store : 'Otro') : lastStore(ctx.stores),
    scope: purchase?.scope ?? 'common',
    is_big_shop: purchase?.is_big_shop ?? bigShop,
  };
  openSheet((close) => {
    const desc = h('input', { class: 'input', maxlength: 80, value: purchase?.description ?? (bigShop ? 'Compra grande' : ''), placeholder: 'Ej.: Fruta y verdura' });
    const amount = h('input', { id: 'gasto-importe', inputmode: 'decimal', autocomplete: 'off', value: centsToInput(purchase?.amount_cents), placeholder: '0,00' });
    const otherStore = h('input', {
      class: 'input h44', maxlength: 40, placeholder: '¿Qué tienda? (opcional)', 'aria-label': 'Nombre de la otra tienda',
      value: purchase && !knownStore(purchase.store) && purchase.store !== 'Otro' ? purchase.store ?? '' : '', hidden: f.store !== 'Otro',
    });
    const today = madridDate();
    const date = h('input', { class: 'input', type: 'date', max: today, value: purchase ? madridDate(purchase.purchased_at) : today });
    const error = h('div', { class: 'form-error', role: 'alert' });
    const bigRow = h('div', { class: 'between', style: { alignItems: 'center' }, hidden: f.scope !== 'common' },
      h('div', null, h('div', { class: 'field-label' }, 'Compra grande de fin de mes'),
        h('div', { class: 'field-hint' }, 'Para el cierre: lo que pone cada uno sale exacto.')),
      toggle({ checked: f.is_big_shop, label: 'Compra grande de fin de mes', onChange: (v) => { f.is_big_shop = v; } }));

    const form = h('form', { class: 'stack', style: { gap: '16px' }, novalidate: true },
      field('¿Qué es?', desc),
      h('div', { class: 'field' },
        h('label', { for: 'gasto-importe', class: 'field-label' }, '¿Cuánto costó?'),
        h('div', { class: 'money-input' }, amount, h('span', { 'aria-hidden': 'true' }, '€'))),
      h('div', { class: 'sheet-section' }, h('div', { class: 'field-label' }, '¿Quién lo pagó?'),
        payerGrid(ctx.adults, f.paid_by, (id) => { f.paid_by = id; })),
      h('div', { class: 'sheet-section' }, h('div', { class: 'field-label' }, '¿Dónde?'),
        storePills(ctx.stores, f.store, (s) => { f.store = s; otherStore.hidden = s !== 'Otro'; }), otherStore),
      h('div', { class: 'sheet-section' }, h('div', { class: 'field-label' }, '¿Para quién es?'),
        segmented([{ value: 'common', label: 'Común (se reparte)', color: '#1F7A4D' }, { value: 'personal', label: 'Personal' }], f.scope,
          (v) => { f.scope = v; bigRow.hidden = v !== 'common'; }, { label: '¿Para quién es?' })),
      bigRow,
      field('Fecha', date),
      error,
      h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, editing ? 'Guardar cambios' : 'Guardar gasto'),
      editing ? h('button', {
        type: 'button', class: 'btn btn-ghost btn-block', style: { color: '#B42318' },
        onclick: async () => {
          const ok = await confirmDialog({ title: '¿Borrar esta compra?', body: 'Sale de las cuentas del mes. Si venía de la lista, el producto vuelve a la lista.', confirm: 'Borrar', danger: true });
          if (!ok) return;
          ctx.mutate('purchase.delete', { id: purchase.id, deleted_at: new Date().toISOString() });
          close();
        },
      }, 'Borrar compra') : null);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const description = desc.value.trim();
      const raw = amount.value.trim();
      const cents = raw ? parseMoney(raw) : null;
      if (!description) { error.textContent = 'Escribe qué es.'; desc.focus(); return; }
      if (raw && cents === null) { error.textContent = 'No entiendo ese importe. Escríbelo así: 455,00'; amount.focus(); return; }
      if (cents === 0) { error.textContent = 'El importe tiene que ser mayor que 0.'; return; }
      if (!cents && f.scope === 'common') { error.textContent = 'Escribe cuánto costó.'; amount.focus(); return; }
      if (!date.value || date.value > today) { error.textContent = 'Elige una fecha de hoy o anterior.'; return; }
      const store = f.store === 'Otro' ? (otherStore.value.trim() || 'Otro') : f.store;
      const purchasedAt = date.value === today ? new Date().toISOString() : new Date(`${date.value}T12:00:00`).toISOString();
      const common = f.scope === 'common';
      if (editing) {
        ctx.mutate('purchase.update', {
          id: purchase.id,
          patch: {
            description, amount_cents: cents ?? null, paid_by: f.paid_by, store, scope: f.scope,
            for_member_id: common ? null : (purchase.for_member_id ?? f.paid_by),
            is_big_shop: common && f.is_big_shop, purchased_at: purchasedAt,
          },
        });
      } else {
        rememberStore(f.store);
        ctx.mutate('purchase.add', {
          client_id: uuid(), household_id: ctx.v.household.id, description, amount_cents: cents ?? null,
          paid_by: f.paid_by, store, scope: f.scope, for_member_id: common ? null : f.paid_by,
          is_big_shop: common && f.is_big_shop, purchased_at: purchasedAt, created_by: ctx.me?.id, month,
        });
      }
      close();
    });
    return [sheetHeader({ eyebrow: 'Cuentas', title: editing ? 'Editar compra' : (bigShop ? 'Compra grande' : 'Añadir gasto'), close }), form];
  }, { label: editing ? 'Editar compra' : 'Añadir gasto' });
}
