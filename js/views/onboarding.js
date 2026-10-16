// First time: create a house or join one with its invite code. Each person picks their own name and colour.
import { h, field, footer, PALETTE } from '../ui.js';
import { rpc } from '../data.js';
import { friendlyError } from '../supabase-client.js';
import { signOut } from '../app.js';

export function colourPicker(selected, onPick, { label = 'Tu color' } = {}) {
  const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label });
  const draw = (sel) => wrap.replaceChildren(...PALETTE.map((p) => h('button', {
    type: 'button', role: 'radio', class: 'swatch', style: { background: p.hex },
    'aria-checked': String(p.hex === sel), 'aria-label': p.hex === sel ? `${p.name}, elegido` : p.name,
    onclick: () => { draw(p.hex); onPick(p.hex); },
  })));
  draw(selected);
  return wrap;
}

export function render({ ui, email, done }) {
  const mode = ui.onboardMode ?? 'create';
  const rerender = (m) => { ui.onboardMode = m; window.dispatchEvent(new HashChangeEvent('hashchange')); };
  const guess = (email ?? '').split('@')[0].replace(/[._\d]+/g, ' ').trim();
  const name = h('input', { class: 'input', maxlength: 24, autocomplete: 'given-name', value: ui.onboardName ?? (guess ? guess[0].toUpperCase() + guess.slice(1) : '') });
  name.addEventListener('input', () => { ui.onboardName = name.value; });
  let color = ui.onboardColor ?? PALETTE[0].hex;
  const error = h('div', { class: 'form-error', role: 'alert' });

  const tabs = h('div', { class: 'tabs2', style: { padding: 0 } },
    h('button', { type: 'button', class: `tab-btn ${mode === 'create' ? 'on' : ''}`, 'aria-pressed': String(mode === 'create'), onclick: () => rerender('create') }, 'Crear casa'),
    h('button', { type: 'button', class: `tab-btn ${mode === 'join' ? 'on' : ''}`, 'aria-pressed': String(mode === 'join'), onclick: () => rerender('join') }, 'Unirme con código'));

  const house = h('input', { class: 'input', maxlength: 40, value: ui.onboardHouse ?? '', placeholder: 'Por ejemplo: Casa de Madrid' });
  house.addEventListener('input', () => { ui.onboardHouse = house.value; });
  const code = h('input', {
    class: 'input code', maxlength: 6, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false',
    value: ui.onboardCode ?? '', style: { textTransform: 'uppercase' },
  });
  code.addEventListener('input', () => { ui.onboardCode = code.value; });

  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, mode === 'create' ? 'Crear casa' : 'Unirme');
  const form = h('form', { class: 'card', novalidate: true },
    tabs,
    mode === 'create'
      ? field('Nombre de la casa', house)
      : field('Código de la casa', code, { hint: 'Son 6 letras y números. Te lo pasa quien creó la casa.' }),
    field('Tu nombre', name, { hint: 'Así te verán los demás. Lo puedes cambiar luego.' }),
    h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Tu color'), colourPicker(color, (c) => { color = c; ui.onboardColor = c; })),
    error,
    submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const display = name.value.trim();
    if (!display) { error.textContent = 'Escribe tu nombre.'; return; }
    submit.disabled = true;
    try {
      if (mode === 'create') {
        if (!house.value.trim()) { error.textContent = 'Ponle un nombre a la casa.'; submit.disabled = false; return; }
        await rpc('create_household', { p_name: house.value.trim(), p_display_name: display, p_color: color });
      } else {
        const c = code.value.replace(/\s/g, '').toUpperCase();
        if (c.length !== 6) { error.textContent = 'El código tiene 6 caracteres.'; submit.disabled = false; return; }
        await rpc('join_household', { p_code: c, p_display_name: display, p_color: color });
      }
      await done();
    } catch (err) {
      error.textContent = friendlyError(err);
      submit.disabled = false;
    }
  });

  return h('div', { class: 'auth' },
    h('div', null,
      h('div', { class: 'eyebrow' }, 'Bienvenida'),
      h('h1', { class: 'title' }, 'Vuestra casa')),
    form,
    h('button', { type: 'button', class: 'link-btn', onclick: () => signOut() }, `Salir (${email ?? ''})`),
    h('div', { class: 'grow' }),
    footer());
}
