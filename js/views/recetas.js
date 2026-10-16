// Recetas tab: Phase 2. Until then, a short note so the tab is not empty.
import { h, icon } from '../ui.js';

export function render() {
  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header', style: { display: 'block', paddingBottom: '8px' } },
      h('div', { class: 'eyebrow' }, 'Menús con presupuesto'),
      h('h1', { class: 'title' }, 'Recetas')),
    h('div', { class: 'screen-main' },
      h('section', { class: 'card pad stack', style: { gap: '12px', alignItems: 'flex-start' } },
        icon('pot', { size: 32, color: '#C2410C' }),
        h('div', { style: { fontSize: '17px', fontWeight: 700 } }, 'Muy pronto'),
        h('p', { class: 'confirm-body' }, 'Aquí podréis crear el menú de la semana o del mes con vuestro presupuesto, ver lo que cuesta cada plato y sus calorías por ración, y pasar los ingredientes a la lista con un toque.'))));
}
