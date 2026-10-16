// Crear / ajustar la Rueda: who takes part and in what order, start Monday, the kitchen week (typed in like
// the paper chart, or generated), weekly cleaning tasks, the cleaning note and (first time) house rules.
import { h, icon, toggle, field, toast, confirmDialog } from '../ui.js';
import { TASK_ICONS } from '../icons.js';
import { rpc, check } from '../data.js';
import { sb, friendlyError } from '../supabase-client.js';
import { mondayOf, weekdayName, capitalise, formatLongDay } from '../periods.js';
import { generateKitchenTemplate, validateKitchenTemplate, DEFAULT_TASKS, DEFAULT_CLEANING_NOTE, SUGGESTED_RULES } from '../rueda.js';

const ICON_NAMES = { bath: 'Baño', broom: 'Escoba', sparkle: 'Brillo', trash: 'Basura', cart: 'Carro', laundry: 'Lavadora', plant: 'Planta', dish: 'Platos' };

function initialDraft(ctx) {
  const r = ctx.rueda;
  const s = r.settings;
  const participants = s?.participants?.length ? [...s.participants] : ctx.members.filter((m) => m.kind === 'adult').map((m) => m.id);
  const tasks = (r.tasks ?? []).filter((t) => t.active !== false).sort((a, b) => a.sort - b.sort)
    .map((t) => ({ id: t.id, name: t.name, icon: t.icon, links_to: t.links_to }));
  return {
    existing: Boolean(s),
    participants,
    start_date: s?.start_date ?? mondayOf(ctx.today),
    rotate_kitchen: s?.rotate_kitchen ?? true,
    batch_weekday: s?.batch_weekday ?? 6,
    cleaning_weekday: s?.cleaning_weekday ?? 5,
    cleaning_note: s?.cleaning_note ?? DEFAULT_CLEANING_NOTE,
    template: (r.template?.length === 7 ? r.template : generateKitchenTemplate(participants))
      .map((t) => ({ weekday: t.weekday, cook_member: t.cook_member, cleaner_member: t.cleaner_member })),
    tasks: tasks.length ? tasks : DEFAULT_TASKS.map((t) => ({ ...t })),
    rules: SUGGESTED_RULES.map((x) => ({ ...x, keep: true })),
  };
}

export function render(ctx) {
  if (!ctx.ui.ruedaDraft) ctx.ui.ruedaDraft = initialDraft(ctx);
  const d = ctx.ui.ruedaDraft;
  const redraw = () => ctx.rerender();
  const people = d.participants.map((id) => ctx.member(id)).filter(Boolean);
  const errors = validateKitchenTemplate(d.template, d.participants);
  const memberOptions = (selected) => [h('option', { value: '' }, '—'),
    ...people.map((m) => h('option', { value: m.id, selected: m.id === selected }, m.display_name))];

  // 1. Participants and order
  const all = ctx.members;
  const order = h('section', { class: 'card', style: { padding: '4px 14px' } },
    [...people, ...all.filter((m) => !d.participants.includes(m.id))].map((m) => {
      const i = d.participants.indexOf(m.id);
      const inRota = i >= 0;
      return h('div', { class: 'order-row' },
        h('input', {
          type: 'checkbox', class: 'check', checked: inRota, id: `p-${m.id}`,
          onchange: (e) => {
            if (e.target.checked) d.participants.push(m.id);
            else d.participants = d.participants.filter((x) => x !== m.id);
            redraw();
          },
        }),
        h('label', { for: `p-${m.id}`, class: 'grow', style: { fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px' } },
          inRota ? h('span', { class: 'rule-num' }, String(i + 1)) : null, m.display_name,
          m.kind === 'child' ? h('span', { class: 'row-sub' }, ' · niña/o') : null),
        inRota ? [
          h('button', { type: 'button', class: 'icon-btn grey', 'aria-label': `Subir a ${m.display_name}`, disabled: i === 0,
            onclick: () => { [d.participants[i - 1], d.participants[i]] = [d.participants[i], d.participants[i - 1]]; redraw(); } }, icon('up', { size: 18 })),
          h('button', { type: 'button', class: 'icon-btn grey', 'aria-label': `Bajar a ${m.display_name}`, disabled: i === d.participants.length - 1,
            onclick: () => { [d.participants[i + 1], d.participants[i]] = [d.participants[i], d.participants[i + 1]]; redraw(); } }, icon('down', { size: 18 })),
        ] : null);
    }));

  // 2. Start
  const start = h('input', { class: 'input', type: 'date', value: d.start_date });
  start.addEventListener('change', () => { if (start.value) { d.start_date = mondayOf(start.value); redraw(); } });

  // 3. Kitchen week
  const grid = h('div', { class: 'setup-grid' },
    h('span', { class: 'field-label small' }, 'Día'), h('span', { class: 'field-label small' }, 'Cocina'), h('span', { class: 'field-label small' }, 'Limpia'),
    Array.from({ length: 7 }, (_, w) => {
      const row = d.template.find((t) => t.weekday === w) ?? { weekday: w };
      const set = (key) => (e) => {
        const existing = d.template.find((t) => t.weekday === w);
        if (existing) existing[key] = e.target.value || null;
        else d.template.push({ weekday: w, [key]: e.target.value || null });
        redraw();
      };
      return [
        h('span', { class: 'day-name' }, capitalise(weekdayName(w))),
        h('select', { class: 'select', 'aria-label': `${capitalise(weekdayName(w))}: cocina`, onchange: set('cook_member') }, memberOptions(row.cook_member)),
        h('select', { class: 'select', 'aria-label': `${capitalise(weekdayName(w))}: limpia la cocina`, onchange: set('cleaner_member') }, memberOptions(row.cleaner_member)),
        errors[w] ? h('div', { class: 'form-error day-error', role: 'alert' }, errors[w]) : null,
      ];
    }));

  // 4. Tasks
  const tasks = h('section', { class: 'card', style: { padding: '4px 14px' } }, d.tasks.map((t, i) => h('div', { class: 'task-edit' },
    h('input', { class: 'input h44', maxlength: 40, value: t.name, placeholder: 'Nombre de la tarea', 'aria-label': 'Nombre de la tarea', oninput: (e) => { t.name = e.target.value; } }),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
      icon(t.icon ?? 'sparkle', { size: 22, stroke: 1.8, color: '#3B4540' }),
      h('select', {
        class: 'select grow', style: { height: '44px', padding: '0 8px' }, 'aria-label': `Icono de ${t.name || 'la tarea'}`,
        onchange: (e) => { t.icon = e.target.value; redraw(); },
      }, TASK_ICONS.map((k) => h('option', { value: k, selected: k === t.icon }, ICON_NAMES[k]))),
      h('button', { type: 'button', class: 'icon-btn grey', 'aria-label': `Subir ${t.name}`, disabled: i === 0, onclick: () => { [d.tasks[i - 1], d.tasks[i]] = [d.tasks[i], d.tasks[i - 1]]; redraw(); } }, icon('up', { size: 18 })),
      h('button', { type: 'button', class: 'icon-btn grey', 'aria-label': `Bajar ${t.name}`, disabled: i === d.tasks.length - 1, onclick: () => { [d.tasks[i + 1], d.tasks[i]] = [d.tasks[i], d.tasks[i + 1]]; redraw(); } }, icon('down', { size: 18 })),
      h('button', { type: 'button', class: 'icon-btn grey', 'aria-label': `Quitar ${t.name}`, onclick: () => { d.tasks.splice(i, 1); redraw(); } }, icon('delete', { size: 18 }))),
    t.links_to === 'shopping' ? h('div', { class: 'row-sub' }, 'Enlaza con la Lista: «Esta semana va a la compra».') : null)));

  const cleaningDay = h('select', { class: 'select', onchange: (e) => { d.cleaning_weekday = Number(e.target.value); } },
    Array.from({ length: 7 }, (_, w) => h('option', { value: w, selected: w === d.cleaning_weekday }, capitalise(weekdayName(w)))));
  const note = h('input', { class: 'input', maxlength: 160, value: d.cleaning_note, oninput: (e) => { d.cleaning_note = e.target.value; } });
  const batch = h('select', { class: 'select', onchange: (e) => { d.batch_weekday = Number(e.target.value); } },
    Array.from({ length: 7 }, (_, w) => h('option', { value: w, selected: w === d.batch_weekday }, capitalise(weekdayName(w)))));

  const error = h('div', { class: 'form-error', role: 'alert' });
  const save = h('button', {
    type: 'button', class: 'btn btn-primary btn-big',
    onclick: async () => {
      error.textContent = '';
      if (d.participants.length < 2) { error.textContent = 'La Rueda necesita al menos dos personas.'; return; }
      if (Object.keys(validateKitchenTemplate(d.template, d.participants)).length) { error.textContent = 'Revisa el cuadro de cocina: hay días con problemas.'; return; }
      const cleanTasks = d.tasks.map((t) => ({ ...t, name: t.name.trim() })).filter((t) => t.name);
      save.disabled = true;
      try {
        await rpc('save_rueda_setup', {
          p_household: ctx.v.household.id,
          p_settings: {
            start_date: d.start_date, participants: d.participants, rotate_kitchen: d.rotate_kitchen,
            batch_weekday: d.batch_weekday, cleaning_weekday: d.cleaning_weekday, cleaning_note: d.cleaning_note.trim(),
          },
          p_template: d.template,
          p_tasks: cleanTasks,
        });
        if (!d.existing) {
          const rules = d.rules.filter((r) => r.keep).map((r, i) => ({ household_id: ctx.v.household.id, title: r.title, body: r.body, sort: i }));
          if (rules.length) check(await sb.from('house_rules').insert(rules));
        }
        ctx.ui.ruedaDraft = null;
        await ctx.refresh();
        toast(d.existing ? 'Rueda guardada.' : '¡La Rueda está lista!');
        ctx.go('#/rueda/cocina');
      } catch (e) {
        save.disabled = false;
        error.textContent = friendlyError(e);
      }
    },
  }, d.existing ? 'Guardar la Rueda' : 'Crear la Rueda');

  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header compact' },
      h('a', {
        href: '#/rueda', class: 'icon-btn', 'aria-label': 'Volver a la Rueda',
        onclick: async (e) => {
          e.preventDefault();
          if (await confirmDialog({ title: '¿Salir sin guardar?', body: 'Los cambios de esta pantalla se pierden.', confirm: 'Salir' })) {
            ctx.ui.ruedaDraft = null;
            ctx.go('#/rueda');
          }
        },
      }, icon('back', { size: 20, stroke: 2.4 })),
      h('div', null, h('div', { class: 'eyebrow' }, 'La Rueda'), h('h1', { class: 'title small' }, d.existing ? 'Ajustes de la Rueda' : 'Crear la Rueda'))),
    h('div', { class: 'screen-main' },
      h('h2', { class: 'section-label', style: { margin: 0 } }, '1 · Quién participa y en qué orden'),
      order,
      h('div', { class: 'caption' }, `${d.participants.length} ${d.participants.length === 1 ? 'persona' : 'personas'}: la rueda da la vuelta cada ${d.participants.length} semanas.`),

      h('h2', { class: 'section-label', style: { margin: 0 } }, '2 · Cuándo empieza'),
      h('section', { class: 'card pad stack' }, field('Primer lunes', start), h('div', { class: 'caption' }, `Empieza el ${formatLongDay(d.start_date)}. La semana va de lunes a domingo.`)),

      h('h2', { class: 'section-label', style: { margin: 0 } }, '3 · Cocina · semana 1'),
      h('section', { class: 'card pad stack', style: { gap: '12px' } },
        h('div', { class: 'caption' }, 'Escribid vuestro cuadro tal cual, o que la app lo reparta. La misma persona no puede cocinar y limpiar el mismo día.'),
        h('button', {
          type: 'button', class: 'btn btn-ghost', style: { height: '44px', fontSize: '15px' },
          onclick: () => { d.template = generateKitchenTemplate(d.participants); redraw(); },
        }, icon('refresh', { size: 18 }), 'Generar automático'),
        grid,
        h('div', { class: 'between', style: { alignItems: 'center' } },
          h('div', null, h('div', { class: 'field-label' }, 'Rotar cada semana'),
            h('div', { class: 'field-hint' }, 'Cada semana todos se mueven un puesto: a todos les tocan todos los días.')),
          toggle({ checked: d.rotate_kitchen, label: 'Rotar cada semana', onChange: (v) => { d.rotate_kitchen = v; } })),
        field('Día de cocinar para la semana', batch)),

      h('h2', { class: 'section-label', style: { margin: 0 } }, '4 · Limpieza semanal'),
      tasks,
      h('button', {
        type: 'button', class: 'btn btn-ghost', style: { height: '44px', fontSize: '15px' },
        onclick: () => { d.tasks.push({ name: '', icon: 'sparkle', links_to: null }); redraw(); },
      }, icon('plus', { size: 18, stroke: 2.4 }), 'Añadir tarea'),
      h('section', { class: 'card pad stack', style: { gap: '12px' } },
        field('Día de limpiar entre todos', cleaningDay),
        field('Nota', note, { hint: `Se ve así: «El ${weekdayName(d.cleaning_weekday)}, ${d.cleaning_note}»` })),

      !d.existing ? [
        h('h2', { class: 'section-label', style: { margin: 0 } }, '5 · Normas de la casa'),
        h('section', { class: 'card', style: { padding: '4px 14px' } }, d.rules.map((r, i) => h('label', { class: 'check-line', style: { alignItems: 'flex-start', padding: '8px 0' } },
          h('input', { type: 'checkbox', class: 'check', checked: r.keep, onchange: (e) => { d.rules[i].keep = e.target.checked; } }),
          h('span', null, h('strong', null, r.title), h('span', { class: 'row-sub', style: { display: 'block', fontWeight: 500 } }, r.body))))),
        h('div', { class: 'caption' }, 'Las podéis cambiar luego en Normas.'),
      ] : null,
      error,
      save));
}
