// Añadir / editar producto, and the per-item actions (edit, move to the other list, undo purchase, delete).
import { h, icon, openSheet, sheetHeader, segmented, confirmDialog, field, toast, uuid } from '../ui.js';
import { CATEGORIES, suggestCategory } from '../categories.js';
import { parseMoney, centsToInput } from '../money.js';
import { formatEuros } from '../money.js';

function personPills(people, selected, onPick) {
  const wrap = h('div', { class: 'choice-pills', role: 'radiogroup', 'aria-label': '¿Para quién?' });
  const draw = (sel) => wrap.replaceChildren(...people.map((m) => h('button', {
    type: 'button', role: 'radio', class: 'choice-pill', 'aria-checked': String(m.id === sel),
    onclick: () => { draw(m.id); onPick(m.id); },
  }, m.display_name)));
  draw(selected);
  return wrap;
}

function newItem(ctx, fields) {
  const id = uuid();
  ctx.mutate('item.add', {
    item: {
      id,
      client_id: id,
      household_id: ctx.v.household.id,
      name: fields.name,
      quantity_text: fields.quantity_text || null,
      category: fields.category,
      list: fields.list,
      scope: fields.scope,
      for_member_id: fields.scope === 'personal' ? fields.for_member_id : null,
      estimated_cents: fields.estimated_cents ?? null,
      added_by: ctx.me?.id,
    },
    local: { created_at: new Date().toISOString() },
  });
}

export function openItemForm(ctx, { item = null, list = 'monthly' } = {}) {
  const editing = Boolean(item);
  const f = {
    name: item?.name ?? '',
    quantity_text: item?.quantity_text ?? '',
    list: item?.list ?? list,
    scope: item?.scope ?? 'common',
    for_member_id: item?.for_member_id ?? ctx.me?.id,
    category: item?.category ?? 'Otros',
  };
  let categoryTouched = editing;

  openSheet((close) => {
    const listId = 'frecuentes-lista';
    const name = h('input', { class: 'input', maxlength: 80, autocomplete: 'off', list: listId, value: f.name, enterkeyhint: 'next', autofocus: !editing });
    const datalist = h('datalist', { id: listId }, (ctx.v.frequent ?? []).map((x) => h('option', { value: x.name })));
    const qty = h('input', { class: 'input', maxlength: 40, value: f.quantity_text, placeholder: 'Ej.: 6 L, 2 kg, 1 docena' });
    const price = h('input', { inputmode: 'decimal', autocomplete: 'off', value: centsToInput(item?.estimated_cents), placeholder: 'Opcional' });
    const category = h('select', { class: 'select' }, CATEGORIES.map((c) => h('option', { value: c, selected: c === f.category }, c)));
    const error = h('div', { class: 'form-error', role: 'alert' });
    const forWhom = h('div', { class: 'sheet-section', hidden: f.scope !== 'personal' },
      h('div', { class: 'field-label' }, '¿Para quién?'),
      personPills(ctx.adults, f.for_member_id, (id) => { f.for_member_id = id; }));

    name.addEventListener('input', () => {
      error.textContent = '';
      const known = (ctx.v.frequent ?? []).find((x) => x.name.toLowerCase() === name.value.trim().toLowerCase());
      if (!categoryTouched) category.value = known?.category ?? suggestCategory(name.value);
    });
    category.addEventListener('change', () => { categoryTouched = true; });

    // Skip what is already waiting on the list, so one tap never duplicates it.
    const onList = new Set((ctx.v.items ?? []).filter((i) => i.status === 'pending').map((i) => i.name.trim().toLowerCase()));
    const freq = (ctx.v.frequent ?? []).filter((x) => !onList.has(x.name.trim().toLowerCase())).slice(0, 12);
    const freqSection = !editing && freq.length ? h('div', { class: 'sheet-section' },
      h('div', { class: 'field-label' }, 'Frecuentes'),
      h('div', { class: 'freq-chips', role: 'group', 'aria-label': 'Frecuentes: un toque para añadir' }, freq.map((x) => {
        const chip = h('button', {
          type: 'button', class: 'freq-chip', 'aria-label': `Añadir ${x.name}`,
          onclick: () => {
            newItem(ctx, { name: x.name, category: x.category, list: f.list, scope: 'common' });
            chip.disabled = true;
            chip.replaceChildren(icon('check', { size: 14, stroke: 3 }), ` ${x.name}`);
            toast(`Añadido: ${x.name}`, { ms: 1800 });
          },
        }, x.name);
        return chip;
      }))) : null;

    const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, editing ? 'Guardar cambios' : 'Añadir a la lista');
    const form = h('form', { class: 'stack', style: { gap: '16px' }, novalidate: true },
      freqSection,
      field('Producto', name),
      datalist,
      field('Cantidad', qty),
      h('div', { class: 'sheet-section' },
        h('div', { class: 'field-label' }, 'Lista'),
        segmented([{ value: 'monthly', label: 'Compra del mes' }, { value: 'urgent', label: 'Hace falta ya' }], f.list, (v) => { f.list = v; }, { label: 'Lista' })),
      h('div', { class: 'sheet-section' },
        h('div', { class: 'field-label' }, '¿Para quién es?'),
        segmented([{ value: 'common', label: 'Común', color: '#1F7A4D' }, { value: 'personal', label: 'Personal' }], f.scope,
          (v) => { f.scope = v; forWhom.hidden = v !== 'personal'; }, { label: '¿Para quién es?' })),
      forWhom,
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'precio-estimado' }, 'Precio estimado'),
        h('div', { class: 'money-input', style: { height: '48px', borderWidth: '1.5px', borderColor: '#A9B3AE' } },
          Object.assign(price, { id: 'precio-estimado', style: 'font-size:20px' }), h('span', { 'aria-hidden': 'true', style: 'font-size:18px' }, '€'))),
      field('Categoría', category),
      error,
      submit);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) { error.textContent = 'Escribe qué hay que comprar.'; name.focus(); return; }
      const raw = price.value.trim();
      const cents = raw ? parseMoney(raw) : null;
      if (raw && cents === null) { error.textContent = 'No entiendo ese precio. Escríbelo así: 5,70'; price.focus(); return; }
      const fields = {
        name: n, quantity_text: qty.value.trim(), category: category.value, list: f.list, scope: f.scope,
        for_member_id: f.scope === 'personal' ? f.for_member_id : null, estimated_cents: cents,
      };
      if (editing) {
        ctx.mutate('item.update', { id: item.id, patch: { ...fields, quantity_text: fields.quantity_text || null } });
      } else {
        newItem(ctx, fields);
        toast(`Añadido: ${n}`, { ms: 1800 });
      }
      close();
    });
    return [sheetHeader({ eyebrow: editing ? 'Editar' : 'Lista de la compra', title: editing ? item.name : 'Añadir producto', close }), form];
  }, { label: editing ? `Editar ${item.name}` : 'Añadir producto' });
}

export function openItemActions(ctx, item, purchase) {
  const other = item.list === 'monthly' ? 'urgent' : 'monthly';
  const otherName = other === 'monthly' ? 'Compra del mes' : 'Hace falta ya';
  const bought = item.status === 'bought';
  const openPeriodIds = new Set((ctx.v.periods ?? []).filter((p) => p.status === 'open').map((p) => p.id));
  const canUndo = bought && purchase && (purchase.pending || openPeriodIds.has(purchase.period_id));
  openSheet((close) => {
    const action = (iconName, label, fn, cls = '') => h('button', { type: 'button', class: `action-item ${cls}`, onclick: () => { close(); fn(); } },
      icon(iconName, { size: 22 }), label);
    let sub = item.quantity_text ?? '';
    if (bought && purchase) {
      sub = `Comprado por ${ctx.name(purchase.paid_by)}${purchase.store ? ` · ${purchase.store}` : ''}${purchase.amount_cents ? ` · ${formatEuros(purchase.amount_cents)}` : ''}`;
    }
    return [
      sheetHeader({ eyebrow: bought ? 'Comprado' : 'Producto', title: item.name, sub: sub || null, close }),
      h('div', { class: 'action-list' },
        !bought ? action('check', 'Marcar como comprado', () => import('./comprado.js').then((m) => m.openComprado(ctx, item))) : null,
        action('edit', 'Editar', () => openItemForm(ctx, { item })),
        action('move', `Mover a «${otherName}»`, () => ctx.mutate('item.update', { id: item.id, patch: { list: other } })),
        canUndo ? action('refresh', 'Deshacer la compra', async () => {
          const ok = await confirmDialog({
            title: 'Deshacer la compra',
            body: `Se borra la compra de «${item.name}» de las cuentas y vuelve a la lista.`,
            confirm: 'Deshacer',
          });
          if (ok) ctx.mutate('purchase.delete', { id: purchase.id, deleted_at: new Date().toISOString() });
        }) : null,
        action('delete', 'Eliminar de la lista', async () => {
          const ok = await confirmDialog({
            title: `¿Eliminar «${item.name}»?`,
            body: bought ? 'Se quita de la lista. La compra se queda en las cuentas.' : 'Se quita de la lista.',
            confirm: 'Eliminar',
            danger: true,
          });
          if (ok) ctx.mutate('item.delete', { id: item.id });
        }, 'danger')),
    ];
  }, { label: item.name });
}
