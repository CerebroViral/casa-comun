// La Rueda [Rueda, Tareas]: Cocina (who cooks / cleans the kitchen), Limpieza (weekly tasks) and Normas.
import { h, icon, avatar, memberChip, paletteOf, openSheet, sheetHeader, confirmDialog, field, toast } from '../ui.js';
import { sb } from '../supabase-client.js';
import { check } from '../data.js';
import { friendlyError } from '../supabase-client.js';
import { addDays, mondayOf, weekdayName, capitalise, weekdayIndex } from '../periods.js';
import { assignmentsForWeek, cleaningRotation, upcomingKitchenTurns, ROLE_COOK, ROLE_KITCHEN_CLEAN, ROLE_TASK } from '../rueda.js';
import { openTurnSheet, openSwapSheet, swapCard, turnPhrase, dayMonth } from '../sheets/turn.js';

export function render(ctx) {
  const tab = ctx.params[0] ?? 'cocina';
  if (!ctx.rota) return renderEmpty(ctx);
  const offset = ctx.ui.ruedaWeek ?? 0;
  const thisMonday = mondayOf(ctx.today);
  const monday = addDays(thisMonday, offset * 7);
  const week = assignmentsForWeek(ctx.rota.settings, ctx.rota.template, ctx.rota.tasks, ctx.rota.grid, ctx.rota.overrides, monday);
  const done = ctx.rueda.done ?? [];
  const isDone = (date, role, taskId = null) => done.some((d) => d.date === date && d.role === role && (d.task_id ?? null) === taskId);
  const setWeek = (d) => { ctx.ui.ruedaWeek = offset + d; ctx.rerender(); };

  const header = h('header', { class: 'screen-header end' },
    h('div', { class: 'grow' },
      h('div', { class: 'eyebrow' }, `Turnos de la casa · semana ${week.weekNumber} de ${week.cycleLength}`),
      h('h1', { class: 'title' }, 'La Rueda')),
    tab !== 'normas' ? [
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Semana anterior', onclick: () => setWeek(-1) }, icon('back', { size: 18, stroke: 2.4 })),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Semana siguiente', onclick: () => setWeek(1) }, icon('forward', { size: 18, stroke: 2.4 })),
    ] : null);

  const segs = h('div', { style: { padding: '0 18px' } },
    h('nav', { class: 'seg3', 'aria-label': 'Partes de la Rueda' },
      [['cocina', 'Cocina'], ['limpieza', 'Limpieza'], ['normas', 'Normas']].map(([k, label]) => h('a', {
        href: `#/rueda/${k}`, class: k === tab ? 'on' : '', 'aria-current': k === tab ? 'page' : null,
      }, label))));

  const main = h('div', { class: 'screen-main', style: { paddingTop: '12px' } });
  // Requests addressed to me, and mine waiting for an answer.
  const swaps = (ctx.rueda.swaps ?? []).filter((s) => s.status === 'pending' && s.date >= ctx.today);
  for (const s of swaps.filter((x) => x.to_member === ctx.me?.id)) main.append(swapCard(ctx, s));
  for (const s of swaps.filter((x) => x.from_member === ctx.me?.id)) {
    const task = s.task_id ? (ctx.rueda.tasks ?? []).find((t) => t.id === s.task_id) : null;
    main.append(h('div', { class: 'notice info' }, icon('clock', { size: 18, color: '#174A5F' }),
      h('span', null, `Esperando a ${ctx.name(s.to_member)}: cambiar ${turnPhrase({ date: s.date, role: s.role, task }, ctx.today)}.`)));
  }
  if (offset !== 0) {
    main.append(h('div', { class: 'between', style: { alignItems: 'center' } },
      h('div', { class: 'eyebrow' }, `Semana del ${dayMonth(monday)} al ${dayMonth(addDays(monday, 6))}`),
      h('button', { type: 'button', class: 'link-btn', onclick: () => { ctx.ui.ruedaWeek = 0; ctx.rerender(); } }, 'Volver a esta semana')));
  }

  if (tab === 'cocina') main.append(...cocina(ctx, week, isDone, offset === 0));
  else if (tab === 'limpieza') main.append(...limpieza(ctx, week, isDone));
  else main.append(...normas(ctx));

  if (tab !== 'normas') {
    main.append(h('a', { href: '#/rueda/ajustes', style: { textAlign: 'center', fontSize: '14px', fontWeight: 600, padding: '6px' } }, 'Ajustes de la Rueda'));
  }
  return h('div', { class: 'screen' }, header, segs, main);
}

function renderEmpty(ctx) {
  return h('div', { class: 'screen' },
    h('header', { class: 'screen-header' }, h('div', null, h('div', { class: 'eyebrow' }, 'Turnos de la casa'), h('h1', { class: 'title' }, 'La Rueda'))),
    h('div', { class: 'screen-main' },
      h('section', { class: 'card pad stack', style: { gap: '12px' } },
        h('div', { style: { fontSize: '17px', fontWeight: 700 } }, 'Quién cocina, quién limpia y quién va a la compra'),
        h('p', { class: 'confirm-body' }, 'Metéis vuestro cuadro de turnos tal cual lo tenéis en papel, o la app lo reparte sola. Cada semana la rueda gira para que a todos les toque de todo.'),
        h('a', { href: '#/rueda/ajustes', class: 'btn btn-primary btn-big' }, 'Crear la Rueda'))));
}

function chipButton(ctx, slot, { date, role, task = null, done, today = false }) {
  const m = ctx.member(slot.member_id);
  if (!m) return h('span', { class: 'chip', style: { background: '#ECEFED', color: '#5B6660' } }, '—');
  const what = role === ROLE_TASK ? task.name.toLowerCase() : role === ROLE_COOK ? 'cocina' : 'limpia la cocina';
  return memberChip(m, {
    tag: 'button', type: 'button', done, outline: today,
    'aria-label': `${m.display_name} ${what}${done ? ', hecho' : ''}. Opciones`,
    onclick: () => openTurnSheet(ctx, { date, role, task, member_id: slot.member_id, source: slot.source, done }),
  });
}

function cocina(ctx, week, isDone, current) {
  const out = [];
  const today = week.days.find((d) => d.date === ctx.today);
  if (current && today) {
    const cook = ctx.member(today.cook.member_id);
    const cleaner = ctx.member(today.cleaner.member_id);
    out.push(h('section', { class: 'card dark today-card', 'aria-label': 'Hoy' },
      h('div', { class: 'label' }, `Hoy · ${weekdayName(today.weekday)}`),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' } },
        h('div', { class: 'today-person' }, avatar(cook, { size: 38 }), h('div', { style: { minWidth: 0 } }, h('div', { class: 'role' }, 'Cocina'), h('div', { class: 'name' }, cook?.display_name ?? '—'))),
        h('div', { class: 'today-person' }, avatar(cleaner, { size: 38 }), h('div', { style: { minWidth: 0 } }, h('div', { class: 'role' }, 'Limpia la cocina'), h('div', { class: 'name' }, cleaner?.display_name ?? '—')))),
      h('div', { class: 'today-foot' }, `Cena para los ${ctx.members.length} + almuerzos de mañana${today.batch ? ' · hoy toca cocinar para la semana' : ''}`)));
  }
  const next = ctx.me ? upcomingKitchenTurns(ctx.rota, ctx.me.id, ctx.today, { days: 7 * ctx.rota.settings.participants.length, done: ctx.rueda.done ?? [] })[0] : null;
  if (next) {
    const day = next.date === ctx.today ? 'hoy' : next.date === addDays(ctx.today, 1) ? 'mañana' : weekdayName(weekdayIndex(next.date));
    const far = next.date > addDays(ctx.today, 6);
    out.push(h('div', { class: 'notice info' }, icon('clock', { size: 18, color: '#174A5F' }),
      h('div', { class: 'grow' }, 'Tu próximo turno: ', h('strong', null, `${day}${far ? ` ${dayMonth(next.date)}` : ''}`), `, ${next.role === ROLE_COOK ? 'cocinar' : 'limpiar la cocina'}`),
      h('button', {
        type: 'button', class: 'link-btn inline', style: { color: '#174A5F', fontWeight: 700, fontSize: '13px', minHeight: '44px', padding: '0 4px', margin: '-12px -4px' },
        onclick: () => openSwapSheet(ctx, { ...next, member_id: ctx.me.id }),
      }, 'Cambiar')));
  }
  out.push(h('section', { class: 'card week-table', 'aria-label': 'Turnos de cocina de la semana' },
    h('div', { class: 'week-row head', 'aria-hidden': 'true' }, h('span', null, 'Día'), h('span', null, 'Cocina'), h('span', null, 'Limpia')),
    week.days.map((d) => {
      const isToday = d.date === ctx.today;
      return h('div', { class: `week-row ${isToday ? 'today' : ''}` },
        h('span', { class: 'day-name' }, capitalise(weekdayName(d.weekday)), isToday ? ' · hoy' : '',
          d.batch ? h('span', { class: 'batch-tag' }, 'para la semana') : null),
        chipButton(ctx, d.cook, { date: d.date, role: ROLE_COOK, done: isDone(d.date, ROLE_COOK), today: isToday }),
        chipButton(ctx, d.cleaner, { date: d.date, role: ROLE_KITCHEN_CLEAN, done: isDone(d.date, ROLE_KITCHEN_CLEAN), today: isToday }));
    })));
  return out;
}

function limpieza(ctx, week, isDone) {
  const s = ctx.rota.settings;
  const n = s.participants.length;
  const out = [];
  out.push(h('div', { class: 'notice pos' }, icon('calendar', { size: 18, color: '#1F7A4D' }),
    h('span', null, 'El ', h('strong', null, weekdayName(s.cleaning_weekday ?? 5)), `, ${s.cleaning_note ?? ''}`)));
  if (!week.tasks.length) {
    out.push(h('div', { class: 'card empty' }, 'No hay tareas. Añádelas en Ajustes de la Rueda.'));
    return out;
  }
  out.push(h('section', { class: 'card', style: { padding: '2px 12px' }, 'aria-label': 'Tareas de la semana' }, week.tasks.map((row) => {
    const done = isDone(row.date, ROLE_TASK, row.task.id);
    const m = ctx.member(row.member_id);
    return h('div', { class: 'task-row' },
      icon(row.task.icon ?? 'sparkle', { size: 22, stroke: 1.8, color: '#3B4540' }),
      h('div', { class: 'grow' }, h('div', { style: { fontSize: '15px', fontWeight: 600 } }, row.task.name),
        row.task.links_to === 'shopping' ? h('div', { class: 'row-sub' }, 'Turno rotativo · enlaza con la Lista') : null),
      chipButton(ctx, row, { date: row.date, role: ROLE_TASK, task: row.task, done: false }),
      h('button', {
        type: 'button', class: `done-box ${done ? 'on' : ''}`, 'aria-pressed': String(done),
        'aria-label': `${row.task.name}${m ? ` (${m.display_name})` : ''}: ${done ? 'hecho. Quitar' : 'marcar como hecho'}`,
        onclick: () => ctx.mutate('chore.done', {
          household_id: ctx.v.household.id, date: row.date, role: ROLE_TASK, task_id: row.task.id,
          member_id: row.member_id, done: !done, done_by: ctx.me?.id,
        }),
      }, done ? icon('check', { size: 16, stroke: 3, color: '#FFFFFF' }) : null));
  })));

  const tasks = week.tasks.map((r) => r.task);
  const rotation = cleaningRotation(s, ctx.rota.tasks, ctx.rota.grid);
  const cols = `30px repeat(${tasks.length}, minmax(0, 1fr))`;
  const current = week.weekNumber - 1;
  out.push(h('h2', { class: 'section-label', style: { margin: 0 } }, `Rotación de ${n} semanas`));
  out.push(h('section', { class: 'card rotation', 'aria-label': `Rotación de ${n} semanas` },
    h('div', { class: 'rotation-row head', style: { gridTemplateColumns: cols } }, h('span', null, 'Sem.'), tasks.map((t) => h('span', { title: t.name }, shortName(t.name)))),
    rotation.map((row, w) => h('div', { class: `rotation-row ${w === current ? 'current' : ''}`, style: { gridTemplateColumns: cols }, 'aria-current': w === current ? 'true' : null },
      h('span', { class: 'week-num' }, String(w + 1)),
      row.map((memberId, t) => {
        const m = ctx.member(memberId);
        const pal = m ? paletteOf(m.color) : { tint: '#ECEFED', text: '#5B6660' };
        return h('button', {
          type: 'button', class: 'rotation-cell', style: { background: pal.tint, color: pal.text, border: 'none' },
          'aria-label': `Semana ${w + 1}, ${tasks[t].name}: ${m?.display_name ?? 'nadie'}. Cambiar`,
          onclick: () => openGridCell(ctx, w, tasks[t], memberId),
        }, h('span', null, m?.display_name ?? '—'));
      }))),
  ));
  out.push(h('div', { class: 'caption', style: { textAlign: 'center' } }, `Al terminar la semana ${n}, la rueda vuelve a empezar.`));
  return out;
}

// Column header for the rotation grid: "Baño completo" → "Baño", "Ir a la compra" → "Compra".
function shortName(name) {
  const words = name.split(/\s+/).filter(Boolean);
  let word = words[0] ?? '';
  if (word.length <= 3 && words.length > 1) word = words[words.length - 1];
  word = word.charAt(0).toUpperCase() + word.slice(1);
  return word.length > 8 ? `${word.slice(0, 7)}.` : word;
}

function openGridCell(ctx, weekIndex, task, current) {
  const people = ctx.rota.settings.participants.map((id) => ctx.member(id)).filter(Boolean);
  const hand = (ctx.rota.grid ?? []).some((g) => g.week_index === weekIndex && g.task_id === task.id);
  openSheet((close) => {
    const save = async (memberId) => {
      try {
        if (memberId === null) {
          check(await sb.from('cleaning_grid').delete().eq('household_id', ctx.v.household.id).eq('week_index', weekIndex).eq('task_id', task.id));
        } else {
          check(await sb.from('cleaning_grid').upsert({ household_id: ctx.v.household.id, week_index: weekIndex, task_id: task.id, member_id: memberId }));
        }
        await ctx.refresh();
        close();
      } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
    };
    return [
      sheetHeader({ eyebrow: `Semana ${weekIndex + 1} de la rueda`, title: task.name, close }),
      h('div', { class: 'caption' }, 'Cambia quién lo hace esa semana de la rueda, en todas las vueltas.'),
      h('div', { class: 'choice-pills' }, people.map((m) => h('button', {
        type: 'button', class: 'choice-pill', 'aria-pressed': String(m.id === current), onclick: () => save(m.id),
      }, m.display_name))),
      hand ? h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => save(null) }, 'Volver al reparto automático') : null,
    ];
  }, { label: task.name });
}

function normas(ctx) {
  const rules = [...(ctx.rueda.rules ?? [])].sort((a, b) => a.sort - b.sort || (a.created_at < b.created_at ? -1 : 1));
  const move = async (i, d) => {
    const a = rules[i]; const b = rules[i + d];
    if (!a || !b) return;
    try {
      check(await sb.from('house_rules').update({ sort: i + d }).eq('id', a.id));
      check(await sb.from('house_rules').update({ sort: i }).eq('id', b.id));
      // Normalise the rest so the order is stable.
      await Promise.all(rules.map((r, k) => (k !== i && k !== i + d && r.sort !== k ? sb.from('house_rules').update({ sort: k }).eq('id', r.id) : null)));
      await ctx.refresh();
    } catch (e) { toast(friendlyError(e), { kind: 'error' }); }
  };
  const out = [];
  if (!rules.length) out.push(h('div', { class: 'card empty' }, h('strong', null, 'Todavía no hay normas'), 'Añadid las que queráis para la casa.'));
  rules.forEach((r, i) => out.push(h('section', { class: 'card rule-card' },
    h('span', { class: 'rule-num', 'aria-hidden': 'true' }, String(i + 1)),
    h('button', { type: 'button', class: 'grow', style: { border: 'none', background: 'none', textAlign: 'left', padding: 0, minHeight: '44px' }, 'aria-label': `${r.title}. Editar`, onclick: () => openRuleForm(ctx, r, rules.length) },
      h('div', { style: { fontSize: '15px', fontWeight: 700 } }, r.title),
      r.body ? h('div', { class: 'row-sub', style: { fontSize: '14px' } }, r.body) : null),
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('button', { type: 'button', class: 'icon-btn', style: { width: '36px', height: '36px' }, 'aria-label': `Subir ${r.title}`, disabled: i === 0, onclick: () => move(i, -1) }, icon('up', { size: 18 })),
      h('button', { type: 'button', class: 'icon-btn', style: { width: '36px', height: '36px' }, 'aria-label': `Bajar ${r.title}`, disabled: i === rules.length - 1, onclick: () => move(i, 1) }, icon('down', { size: 18 }))))));
  out.push(h('button', { type: 'button', class: 'btn btn-ghost', style: { height: '48px', fontSize: '15px' }, onclick: () => openRuleForm(ctx, null, rules.length) },
    icon('plus', { size: 18, stroke: 2.4 }), 'Añadir norma'));
  out.push(h('div', { class: 'caption', style: { textAlign: 'center', fontSize: '14px', fontWeight: 600 } }, 'Entre todos es más fácil y más justo.'));
  return out;
}

function openRuleForm(ctx, rule, count) {
  openSheet((close) => {
    const title = h('input', { class: 'input', maxlength: 60, value: rule?.title ?? '' });
    const body = h('textarea', { class: 'textarea', maxlength: 300 }, rule?.body ?? '');
    const error = h('div', { class: 'form-error', role: 'alert' });
    const form = h('form', { class: 'stack', style: { gap: '16px' }, novalidate: true },
      field('Norma', title), field('Explicación (opcional)', body), error,
      h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-big' }, rule ? 'Guardar' : 'Añadir'),
      rule ? h('button', {
        type: 'button', class: 'btn btn-ghost btn-block', style: { color: '#B42318' },
        onclick: async () => {
          if (!await confirmDialog({ title: '¿Borrar esta norma?', body: rule.title, confirm: 'Borrar', danger: true })) return;
          try { check(await sb.from('house_rules').delete().eq('id', rule.id)); await ctx.refresh(); close(); } catch (e) { error.textContent = friendlyError(e); }
        },
      }, 'Borrar norma') : null);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = title.value.trim();
      if (!t) { error.textContent = 'Escribe la norma.'; return; }
      try {
        if (rule) check(await sb.from('house_rules').update({ title: t, body: body.value.trim() }).eq('id', rule.id));
        else check(await sb.from('house_rules').insert({ household_id: ctx.v.household.id, title: t, body: body.value.trim(), sort: count }));
        await ctx.refresh();
        close();
      } catch (err) { error.textContent = friendlyError(err); }
    });
    return [sheetHeader({ eyebrow: 'Normas de la casa', title: rule ? 'Editar norma' : 'Nueva norma', close }), form];
  }, { label: rule ? 'Editar norma' : 'Nueva norma' });
}
