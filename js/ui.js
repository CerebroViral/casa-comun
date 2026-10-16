// Tiny DOM toolkit: element builder, avatars and member chips, bottom sheets, confirm dialogs and toasts.
import { icon } from './icons.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export { icon };

// Member palette (6 swatches from the Casa mockup) with the tint/text pairs used for chips (contrast ≥ 4.5:1).
export const PALETTE = [
  { hex: '#1F5F7A', name: 'Azul', tint: '#E1EEF3', text: '#174A5F' },
  { hex: '#9A3412', name: 'Teja', tint: '#F9E5DA', text: '#7C2D12' },
  { hex: '#4D5B2A', name: 'Oliva', tint: '#E7ECD9', text: '#3A4520' },
  { hex: '#6B3F7A', name: 'Morado', tint: '#EEE3F2', text: '#4F2D5B' },
  { hex: '#A3245A', name: 'Rosa', tint: '#F8E1EB', text: '#7A1B43' },
  { hex: '#3B4540', name: 'Grafito', tint: '#E5E8E6', text: '#2A322E' },
];

export function paletteOf(hex) {
  return PALETTE.find((p) => p.hex.toLowerCase() === String(hex).toLowerCase()) ?? PALETTE[5];
}

export function initial(name) {
  const s = String(name ?? '').trim();
  return s ? [...s][0].toUpperCase() : '?';
}

export function avatar(member, { size = 36, cls = '' } = {}) {
  return h('span', {
    class: `avatar ${cls}`.trim(),
    style: { width: `${size}px`, height: `${size}px`, background: member?.color ?? '#3B4540' },
    'aria-hidden': 'true',
  }, initial(member?.display_name));
}

// Tinted chip with the member's name (Rueda). Optional done tick.
export function memberChip(member, { done = false, outline = false, tag = 'span', cls = 'chip', ...rest } = {}) {
  const p = paletteOf(member?.color);
  return h(tag, {
    class: cls,
    style: { background: p.tint, color: p.text, ...(outline ? { boxShadow: `inset 0 0 0 2px ${member.color}` } : {}) },
    ...rest,
  }, h('span', { class: 'chip-name' }, member?.display_name ?? '—'), done ? icon('check', { size: 13, stroke: 3, label: 'hecho' }) : null);
}

export function footer() {
  return h('div', { class: 'footer' }, 'By SophieNexus · © 2026 Todos los derechos reservados');
}

// Segmented control (two or three options). onChange(value).
export function segmented(options, value, onChange, { label, cls = 'seg' } = {}) {
  const wrap = h('div', { class: cls, role: 'radiogroup', 'aria-label': label });
  const render = (v) => {
    wrap.replaceChildren(...options.map((o) => h('button', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(o.value === v),
      class: o.value === v ? 'on' : '',
      style: o.value === v && o.color ? { color: o.color } : null,
      onclick: () => { render(o.value); onChange(o.value); },
    }, o.label)));
  };
  render(value);
  return wrap;
}

export function toggle({ checked, label, onChange }) {
  const btn = h('button', {
    type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(!!checked), 'aria-label': label,
    onclick: () => {
      const now = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(now));
      onChange(now);
    },
  }, h('span', { class: 'switch-knob' }));
  return btn;
}

// Bottom sheet built on <dialog> (focus trap, Esc to close). build(close) returns the content nodes.
export function openSheet(build, { label, onClose } = {}) {
  const dialog = h('dialog', { class: 'sheet', 'aria-label': label });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    onClose?.();
  };
  const panel = h('div', { class: 'sheet-panel' }, h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }));
  append(panel, [build(close)]);
  dialog.append(panel);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  document.getElementById('app').append(dialog);
  dialog.showModal();
  return { close, dialog };
}

export function sheetHeader({ eyebrow, title, sub, close }) {
  return h('div', { class: 'sheet-head' },
    h('div', { class: 'grow' },
      eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null,
      h('h2', { class: 'sheet-title' }, title),
      sub ? h('div', { class: 'eyebrow' }, sub) : null),
    h('button', { type: 'button', class: 'icon-btn grey', 'aria-label': 'Cerrar', onclick: close },
      icon('close', { size: 18, stroke: 2.4 })));
}

export function confirmDialog({ title, body, confirm = 'Aceptar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'confirm', 'aria-label': title });
    const done = (v) => { dialog.close(); dialog.remove(); resolve(v); };
    dialog.append(h('div', { class: 'confirm-panel' },
      h('h2', { class: 'confirm-title' }, title),
      body ? h('p', { class: 'confirm-body' }, body) : null,
      h('div', { class: 'confirm-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => done(false) }, cancel),
        h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => done(true) }, confirm))));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    document.getElementById('app').append(dialog);
    dialog.showModal();
  });
}

let toastTimer = null;
export function toast(message, { kind = 'info', ms = 3200 } = {}) {
  const host = document.getElementById('toast');
  if (!host) return;
  host.className = `toast show ${kind}`;
  host.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { host.className = 'toast'; }, ms);
}

export function field(labelText, input, { hint, id } = {}) {
  const inputId = id || input.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = inputId;
  return h('div', { class: 'field' },
    h('label', { for: inputId, class: 'field-label' }, labelText),
    input,
    hint ? h('div', { class: 'field-hint' }, hint) : null);
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
