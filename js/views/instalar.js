// Cómo instalar: Safari (iPhone) and Android steps.
import { h, icon } from '../ui.js';

const step = (n, text) => h('div', { class: 'row', style: { alignItems: 'flex-start' } },
  h('span', { class: 'rule-num' }, String(n)), h('div', { style: { fontSize: '15px', paddingTop: '4px' } }, text));

export function render() {
  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header compact' },
      h('a', { href: '#/casa', class: 'icon-btn', 'aria-label': 'Volver a Casa' }, icon('back', { size: 20, stroke: 2.4 })),
      h('div', null, h('div', { class: 'eyebrow' }, 'Ayuda'), h('h1', { class: 'title small' }, 'Cómo instalar'))),
    h('div', { class: 'screen-main' },
      h('h2', { class: 'section-label', style: { margin: 0 } }, 'iPhone (Safari)'),
      h('section', { class: 'card list' },
        step(1, 'Abre la app en Safari (no en otro navegador).'),
        step(2, ['Toca el botón ', h('strong', null, 'Compartir'), ' (el cuadrado con la flecha hacia arriba).']),
        step(3, ['Baja y toca ', h('strong', null, 'Añadir a pantalla de inicio'), '.']),
        step(4, ['Toca ', h('strong', null, 'Añadir'), '. Ya tienes Casa Común con su icono.'])),
      h('h2', { class: 'section-label', style: { margin: 0 } }, 'Android'),
      h('section', { class: 'card list' },
        step(1, 'Instala el archivo de Casa Común (APK) que os pase Jorge, o abre la app en Chrome.'),
        step(2, ['En Chrome, toca el menú ', h('strong', null, '⋮'), ' y luego ', h('strong', null, 'Instalar aplicación'), ' o ', h('strong', null, 'Añadir a pantalla de inicio'), '.'])),
      h('div', { class: 'notice info' }, icon('info', { size: 18, color: '#174A5F' }),
        h('span', null, 'La lista funciona sin cobertura: lo que apuntes se guarda en el móvil y se envía solo cuando vuelve la señal.'))));
}
