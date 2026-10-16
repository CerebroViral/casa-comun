// Line icons taken from the approved mockups (24×24, stroke = currentColor). Only a few extra ones
// (task icons, share, edit, delete, arrows) are drawn in the same style.

export const ICONS = {
  cart: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  wheel: '<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3v4h-4M5.5 21v-4h4"/>',
  pot: '<path d="M4 11h16v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5z"/><path d="M2 11h20M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  forward: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  bath: '<path d="M5 10h14v2a7 7 0 0 1-14 0v-2z"/><path d="M7 10V5a2 2 0 0 1 2-2h2v7M9 19l-1 2h8l-1-2"/>',
  broom: '<path d="M19 3l-7 9"/><path d="M12 12c-3 0-5 2-6 5l-1 4h8l1-4c.5-2 0-4-2-5z"/>',
  sparkle: '<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  laundry: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h.01M11 6.5h.01"/>',
  plant: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7zM12 13c0-3-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/><path d="M8 21h8"/>',
  dish: '<path d="M3 15h18M5 15a7 7 0 0 1 14 0M12 6v2M4 18h16"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  move: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  cloudOff: '<path d="M3 3l18 18"/><path d="M8 8a5 5 0 0 0-1 0 4 4 0 0 0 0 8h9M17.5 17H18a3.5 3.5 0 0 0 1.5-6.7A6 6 0 0 0 10.4 6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
};

export const TASK_ICONS = ['bath', 'broom', 'sparkle', 'trash', 'cart', 'laundry', 'plant', 'dish'];

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, { size = 24, stroke = 2, color = 'currentColor', label = null, cls = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', stroke);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (cls) svg.setAttribute('class', cls);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}
