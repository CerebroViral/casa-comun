// Login, sign-up and password reset (email + password, no confirmation step).
import { sb, appUrl, friendlyError } from '../supabase-client.js';
import { h, field, footer, toast } from '../ui.js';

function brand(sub) {
  return h('div', { class: 'auth-brand' },
    h('img', { src: 'assets/icons/icon-192.png', alt: '', width: 56, height: 56 }),
    h('div', null,
      h('h1', { class: 'title' }, 'Casa Común'),
      h('div', { class: 'eyebrow' }, sub)));
}

export function render({ ui }) {
  const mode = ui.authMode ?? 'login';
  const setMode = (m) => { ui.authMode = m; window.dispatchEvent(new HashChangeEvent('hashchange')); };
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: ui.authEmail ?? '' });
  email.addEventListener('input', () => { ui.authEmail = email.value; });
  const error = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' },
    mode === 'signup' ? 'Crear cuenta' : mode === 'reset' ? 'Enviarme el enlace' : 'Entrar');

  if (mode === 'reset') {
    const form = h('form', { class: 'card', novalidate: true },
      h('div', null, h('div', { class: 'field-label' }, '¿Has olvidado la contraseña?'),
        h('div', { class: 'field-hint' }, 'Te mandamos un correo con un enlace para poner una nueva.')),
      field('Tu correo', email), error, submit,
      h('button', { type: 'button', class: 'link-btn', onclick: () => setMode('login') }, 'Volver a entrar'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      if (!email.value.includes('@')) { error.textContent = 'Escribe tu correo.'; return; }
      submit.disabled = true;
      const { error: err } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: appUrl });
      submit.disabled = false;
      if (err) { error.textContent = friendlyError(err); return; }
      toast('Te hemos enviado un correo. Abre el enlace desde este móvil.', { kind: 'info', ms: 7000 });
      setMode('login');
    });
    return h('div', { class: 'auth' }, brand('Nueva contraseña'), form, h('div', { class: 'grow' }), footer());
  }

  const password = h('input', {
    class: 'input', type: 'password', required: true, minlength: 6,
    autocomplete: mode === 'signup' ? 'new-password' : 'current-password',
  });
  const form = h('form', { class: 'card', novalidate: true },
    field('Tu correo', email),
    field('Contraseña', password, mode === 'signup' ? { hint: 'Al menos 6 caracteres.' } : {}),
    error,
    submit,
    mode === 'login'
      ? h('div', { class: 'between' },
        h('button', { type: 'button', class: 'link-btn', onclick: () => setMode('signup') }, 'Crear una cuenta'),
        h('button', { type: 'button', class: 'link-btn', onclick: () => setMode('reset') }, 'He olvidado la contraseña'))
      : h('button', { type: 'button', class: 'link-btn', onclick: () => setMode('login') }, 'Ya tengo cuenta: entrar'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const em = email.value.trim();
    if (!em.includes('@')) { error.textContent = 'Escribe tu correo.'; return; }
    if (password.value.length < 6) { error.textContent = 'La contraseña tiene que tener al menos 6 caracteres.'; return; }
    submit.disabled = true;
    const fn = mode === 'signup'
      ? sb.auth.signUp({ email: em, password: password.value })
      : sb.auth.signInWithPassword({ email: em, password: password.value });
    const { data, error: err } = await fn;
    submit.disabled = false;
    if (err) { error.textContent = friendlyError(err); return; }
    if (mode === 'signup' && !data.session) {
      error.textContent = 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.';
    }
  });

  return h('div', { class: 'auth' },
    brand(mode === 'signup' ? 'Crea tu cuenta para la casa' : 'La compra, las cuentas y los turnos de casa'),
    form,
    h('div', { class: 'grow' }),
    footer());
}

export function renderNewPassword({ done }) {
  const password = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const error = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, 'Guardar contraseña');
  const form = h('form', { class: 'card', novalidate: true }, field('Nueva contraseña', password, { hint: 'Al menos 6 caracteres.' }), error, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (password.value.length < 6) { error.textContent = 'La contraseña tiene que tener al menos 6 caracteres.'; return; }
    submit.disabled = true;
    const { error: err } = await sb.auth.updateUser({ password: password.value });
    submit.disabled = false;
    if (err) { error.textContent = friendlyError(err); return; }
    toast('Contraseña cambiada.');
    done();
  });
  return h('div', { class: 'auth' }, brand('Pon una contraseña nueva'), form, h('div', { class: 'grow' }), footer());
}

export function renderNotConfigured() {
  return h('div', { class: 'auth' }, brand('Falta conectar la base de datos'),
    h('div', { class: 'card' },
      h('p', { class: 'confirm-body' }, 'Esta copia de la app todavía no tiene los datos de Supabase. Hay que poner la dirección del proyecto y la clave pública (anon key) en el archivo config.js. Los pasos están en docs/SETUP.md.')),
    h('div', { class: 'grow' }), footer());
}
