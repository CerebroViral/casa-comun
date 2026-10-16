// Casa y perfil [Casa]: my name and colour, who lives here, the invite code and the house settings.
import { h, icon, avatar, footer, toggle, openSheet, sheetHeader, segmented, confirmDialog, field, toast } from '../ui.js';
import { colourPicker } from './onboarding.js';
import { rpc } from '../data.js';
import { appUrl, friendlyError } from '../supabase-client.js';
import { signOut } from '../app.js';

function memberLabel(m) {
  if (m.kind === 'child') return `${m.child_label === 'niño' ? 'Niño' : 'Niña'} · media ración`;
  return 'Adulto';
}

export function render(ctx) {
  const me = ctx.me;
  const house = ctx.v.household;
  const settings = house.settings ?? {};
  const saveSettings = (patch) => ctx.mutate('household.update', { id: house.id, patch: { settings: { ...settings, ...patch } } });

  // ---- Tu perfil
  const name = h('input', { id: 'nombre', class: 'input h44', maxlength: 24, value: me?.display_name ?? '', autocomplete: 'given-name' });
  const nameError = h('div', { class: 'form-error', role: 'alert' });
  name.addEventListener('change', () => {
    const v = name.value.trim();
    if (!v) { nameError.textContent = 'Tu nombre no puede quedar vacío.'; name.value = me.display_name; return; }
    nameError.textContent = '';
    if (v !== me.display_name) ctx.mutate('member.update', { id: me.id, patch: { display_name: v } });
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  const profile = h('section', { class: 'card pad stack', style: { gap: '12px' } },
    h('h2', { class: 'section-label', style: { margin: 0 } }, 'Tu perfil'),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      avatar(me, { size: 52, cls: 'avatar-lg' }),
      h('div', { class: 'grow field', style: { gap: '4px' } }, h('label', { for: 'nombre', class: 'field-label small' }, 'Tu nombre'), name, nameError)),
    h('div', { class: 'field', style: { gap: '6px' } },
      h('div', { class: 'field-label small' }, 'Tu color'),
      colourPicker(me?.color, (c) => ctx.mutate('member.update', { id: me.id, patch: { color: c } }))),
    h('div', { class: 'caption' }, 'Cada uno elige su nombre y su color desde su propio móvil.'));

  // ---- En casa
  const people = [...ctx.members].sort((a, b) => (a.kind === b.kind ? (a.created_at < b.created_at ? -1 : 1) : a.kind === 'adult' ? -1 : 1));
  const membersCard = h('section', { class: 'card list-2' }, people.map((m) => {
    const content = [
      avatar(m, { size: 34 }),
      h('div', { class: 'grow', style: { fontSize: '15px', fontWeight: 700, textAlign: 'left' } }, m.display_name,
        m.id === me?.id ? h('span', { style: { fontWeight: 500, color: '#5B6660' } }, ' (tú)') : null),
      h('span', { style: { fontSize: '12px', color: '#5B6660' } }, memberLabel(m)),
    ];
    return m.kind === 'child'
      ? h('button', { type: 'button', class: 'row row-btn', style: { padding: '10px 0' }, 'aria-label': `${m.display_name}, ${memberLabel(m)}. Editar`, onclick: () => openChildForm(ctx, m) }, content)
      : h('div', { class: 'row', style: { padding: '10px 0' } }, content);
  }));

  // ---- Código + calorías
  const share = `https://wa.me/?text=${encodeURIComponent(`¡Únete a nuestra casa en Casa Común! Abre ${appUrl} , crea tu cuenta y pon este código: ${house.invite_code}`)}`;
  const codeCard = h('section', { class: 'card list-2' },
    h('div', { class: 'row', style: { padding: '12px 0', flexWrap: 'wrap' } },
      h('div', { class: 'grow' }, h('div', { style: { fontSize: '15px', fontWeight: 700 } }, 'Código para unirse'), h('div', { class: 'row-sub' }, 'Compártelo con los de casa')),
      h('span', { class: 'code', 'aria-label': `Código ${house.invite_code.split('').join(' ')}` }, house.invite_code),
      h('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } },
        h('a', { href: share, target: '_blank', rel: 'noopener', class: 'btn btn-dark', style: { height: '44px', fontSize: '15px', flex: '1 1 auto' } },
          icon('share', { size: 18, color: '#FFFFFF' }), 'Compartir por WhatsApp'),
        h('button', {
          type: 'button', class: 'btn btn-ghost', style: { height: '44px', fontSize: '15px' },
          onclick: async () => {
            const ok = await confirmDialog({ title: '¿Cambiar el código?', body: 'El código de ahora deja de valer. Los que ya están en casa siguen dentro.', confirm: 'Cambiar' });
            if (!ok) return;
            try { await rpc('regenerate_invite_code', { p_household: house.id }); await ctx.refresh(); toast('Código nuevo listo.'); } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
          },
        }, 'Cambiar código'))),
    h('div', { class: 'row', style: { padding: '12px 0' } },
      h('div', { class: 'grow' }, h('div', { style: { fontSize: '15px', fontWeight: 700 } }, 'Mostrar calorías'), h('div', { class: 'row-sub' }, 'En menús y recetas')),
      toggle({ checked: settings.show_calories !== false, label: 'Mostrar calorías', onChange: (v) => saveSettings({ show_calories: v }) })));

  // ---- Casa: nombre y tiendas
  const houseName = h('input', { class: 'input h44', maxlength: 40, value: house.name });
  houseName.addEventListener('change', () => {
    const v = houseName.value.trim();
    if (v && v !== house.name) ctx.mutate('household.update', { id: house.id, patch: { name: v } });
    else houseName.value = house.name;
  });
  const stores = ctx.stores;
  const newStore = h('input', { class: 'input h44', maxlength: 30, placeholder: 'Otra tienda', 'aria-label': 'Nombre de la tienda nueva' });
  const addStore = () => {
    const v = newStore.value.trim();
    if (!v || stores.some((s) => s.toLowerCase() === v.toLowerCase()) || v.toLowerCase() === 'otro') { newStore.value = ''; return; }
    saveSettings({ stores: [...stores, v] });
  };
  newStore.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addStore(); } });
  const houseCard = h('section', { class: 'card pad stack', style: { gap: '12px' } },
    field('Nombre de la casa', houseName),
    h('div', { class: 'field' },
      h('div', { class: 'field-label' }, 'Tiendas'),
      h('div', { class: 'choice-pills' },
        stores.map((s) => h('span', { class: 'store-chip' }, s,
          stores.length > 1 ? h('button', { type: 'button', 'aria-label': `Quitar ${s}`, onclick: () => saveSettings({ stores: stores.filter((x) => x !== s) }) }, icon('close', { size: 16, stroke: 2.4 })) : null)),
        h('span', { class: 'store-chip', style: { paddingRight: '12px', color: '#5B6660' } }, 'Otro')),
      h('div', { style: { display: 'flex', gap: '8px' } }, newStore, h('button', { type: 'button', class: 'btn btn-ghost', style: { height: '44px' }, onclick: addStore }, 'Añadir'))));

  // ---- Avanzado: quién reparte gastos
  const adults = ctx.members.filter((m) => m.kind === 'adult');
  const advanced = h('details', { class: 'card pad advanced' },
    h('summary', null, 'Avanzado', icon('down', { size: 20 })),
    h('div', { class: 'stack' },
      h('div', { class: 'field-label' }, 'Quién paga a partes iguales'),
      adults.map((m) => h('div', { class: 'between', style: { alignItems: 'center', minHeight: '48px' } },
        h('span', { style: { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 } }, avatar(m, { size: 30 }), m.display_name),
        toggle({
          checked: m.shares_costs, label: `${m.display_name} paga a partes iguales`,
          onChange: async (v) => {
            try { await rpc('set_member_flags', { p_member_id: m.id, p_shares_costs: v, p_active: null }); await ctx.refresh(); } catch (e) { toast(friendlyError(e), { kind: 'error' }); ctx.rerender(); }
          },
        }))),
      h('div', { class: 'caption' }, 'Cambia las cuentas del mes abierto. Los meses cerrados no cambian.')));

  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header', style: { display: 'block', paddingBottom: '8px' } },
      h('div', { class: 'eyebrow' }, 'Ajustes'),
      h('h1', { class: 'title' }, 'Nuestra casa')),
    h('div', { class: 'screen-main' },
      profile,
      h('h2', { class: 'section-label', style: { margin: 0 } }, 'En casa'),
      membersCard,
      h('button', { type: 'button', class: 'btn btn-ghost', style: { height: '48px', fontSize: '15px' }, onclick: () => openChildForm(ctx, null) },
        icon('plus', { size: 18, stroke: 2.4 }), 'Añadir niño o niña'),
      codeCard,
      houseCard,
      advanced,
      h('a', { href: '#/instalar', class: 'btn btn-ghost', style: { height: '48px', fontSize: '15px' } }, icon('phone', { size: 18 }), 'Cómo instalar la app'),
      h('button', {
        type: 'button', class: 'btn btn-ghost', style: { height: '48px', fontSize: '15px' },
        onclick: async () => {
          const pending = ctx.state.queue.length;
          const ok = await confirmDialog(pending
            ? { title: '¿Cerrar sesión?', body: `Tienes ${pending} ${pending === 1 ? 'cambio' : 'cambios'} sin enviar. Si sales ahora, se pierden. Mejor espera a tener cobertura.`, confirm: 'Salir y perderlos', danger: true }
            : { title: '¿Cerrar sesión?', body: 'Para volver a entrar necesitarás tu correo y tu contraseña.', confirm: 'Cerrar sesión' });
          if (ok) signOut({ discardQueue: true });
        },
      }, icon('logout', { size: 18 }), 'Cerrar sesión'),
      h('div', { class: 'caption', style: { textAlign: 'center' } }, ctx.state.email ?? ''),
      footer()));
}

function openChildForm(ctx, child) {
  const editing = Boolean(child);
  let color = child?.color ?? '#A3245A';
  let label = child?.child_label ?? 'niña';
  openSheet((close) => {
    const name = h('input', { class: 'input', maxlength: 24, value: child?.display_name ?? '' });
    const error = h('div', { class: 'form-error', role: 'alert' });
    const form = h('form', { class: 'stack', style: { gap: '16px' }, novalidate: true },
      field('Nombre', name),
      h('div', { class: 'sheet-section' }, h('div', { class: 'field-label' }, 'Es'),
        segmented([{ value: 'niña', label: 'Niña' }, { value: 'niño', label: 'Niño' }], label, (v) => { label = v; }, { label: 'Niña o niño' })),
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Color'), colourPicker(color, (c) => { color = c; }, { label: 'Color' })),
      h('div', { class: 'caption' }, 'Cuenta como media ración en menús. No necesita cuenta ni móvil.'),
      error,
      h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, editing ? 'Guardar' : 'Añadir'),
      editing ? h('button', {
        type: 'button', class: 'btn btn-ghost btn-block', style: { color: '#B42318' },
        onclick: async () => {
          const ok = await confirmDialog({ title: `¿Quitar a ${child.display_name}?`, body: 'Deja de aparecer en casa. Se puede volver a añadir.', confirm: 'Quitar', danger: true });
          if (!ok) return;
          try { await rpc('set_member_flags', { p_member_id: child.id, p_shares_costs: null, p_active: false }); await ctx.refresh(); close(); } catch (e) { error.textContent = friendlyError(e); }
        },
      }, 'Quitar de la casa') : null);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = name.value.trim();
      if (!v) { error.textContent = 'Escribe su nombre.'; return; }
      if (editing) {
        ctx.mutate('member.update', { id: child.id, patch: { display_name: v, color, child_label: label } });
        close();
        return;
      }
      try {
        await rpc('add_child', { p_household: ctx.v.household.id, p_display_name: v, p_color: color, p_child_label: label });
        await ctx.refresh();
        close();
      } catch (err) { error.textContent = friendlyError(err); }
    });
    return [sheetHeader({ eyebrow: 'En casa', title: editing ? child.display_name : 'Añadir niño o niña', close }), form];
  }, { label: editing ? `Editar ${child.display_name}` : 'Añadir niño o niña' });
}
