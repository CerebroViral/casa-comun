// La Rueda: who cooks, who cleans the kitchen and who does each weekly task. Assignments are never
// stored per day — they are derived here from the settings, the kitchen template, the tasks, the optional
// hand-edited cleaning grid and the overrides (swaps / manual changes). Pure functions, unit-tested.
import { addDays, daysBetween, mondayOf, weekdayIndex } from './periods.js';

export const ROLE_COOK = 'cook';
export const ROLE_KITCHEN_CLEAN = 'kitchen_clean';
export const ROLE_TASK = 'task';

// 0-based position of the week inside the cycle (n weeks, n = participants). Works before start_date too.
export function weekPosition(settings, day) {
  const n = settings.participants.length;
  const weeks = Math.floor(daysBetween(settings.start_date, mondayOf(day)) / 7);
  return ((weeks % n) + n) % n;
}

// Spec's k: 1…n.
export function weekNumber(settings, day) {
  return weekPosition(settings, day) + 1;
}

// The person `shift` places later in the participants order (members outside the order stay as they are).
export function rotate(participants, memberId, shift) {
  const i = participants.indexOf(memberId);
  if (i < 0) return memberId;
  const n = participants.length;
  return participants[(((i + shift) % n) + n) % n];
}

// "Generar automático": day d → cook p[d mod n], cleaner p[(d+1) mod n] for week 1. With rotation on,
// week k shifts everyone k−1 places, so over the cycle each person cooks 7 times and cleans 7 times.
export function generateKitchenTemplate(participants) {
  const n = participants.length;
  return Array.from({ length: 7 }, (_, d) => ({
    weekday: d,
    cook_member: participants[d % n],
    cleaner_member: participants[(d + 1) % n],
  }));
}

// Problems with a hand-entered kitchen week, keyed by weekday, in Spanish for the editor.
export function validateKitchenTemplate(template, participants) {
  const errors = {};
  for (let d = 0; d < 7; d++) {
    const row = template.find((t) => t.weekday === d);
    if (!row || !row.cook_member || !row.cleaner_member) errors[d] = 'Falta alguien.';
    else if (row.cook_member === row.cleaner_member) errors[d] = 'No puede cocinar y limpiar la misma persona.';
    else if (!participants.includes(row.cook_member) || !participants.includes(row.cleaner_member)) {
      errors[d] = 'Esa persona no está en la Rueda.';
    }
  }
  return errors;
}

function findOverride(overrides, date, role, taskId = null) {
  return overrides.find((o) => o.date === date && o.role === role && (o.task_id ?? null) === taskId);
}

function activeTasks(tasks) {
  return tasks.filter((t) => t.active !== false).sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1));
}

// Everything for the week starting `weekMonday`.
export function assignmentsForWeek(settings, template, tasks, grid, overrides, weekMonday) {
  const p = settings.participants;
  const n = p.length;
  const pos = weekPosition(settings, weekMonday);
  const shift = settings.rotate_kitchen === false ? 0 : pos;
  const days = [];
  for (let w = 0; w < 7; w++) {
    const date = addDays(weekMonday, w);
    const base = template.find((t) => t.weekday === w);
    const slot = (role, baseMember) => {
      const o = findOverride(overrides, date, role);
      if (o) return { member_id: o.member_id, source: o.source, base_member_id: baseMember };
      return { member_id: baseMember, source: 'rota', base_member_id: baseMember };
    };
    days.push({
      date,
      weekday: w,
      batch: w === (settings.batch_weekday ?? 6),
      cook: slot(ROLE_COOK, base ? rotate(p, base.cook_member, shift) : null),
      cleaner: slot(ROLE_KITCHEN_CLEAN, base ? rotate(p, base.cleaner_member, shift) : null),
    });
  }
  const taskRows = activeTasks(tasks).map((task, t) => {
    const fromGrid = grid.find((g) => g.week_index === pos && g.task_id === task.id);
    const baseMember = fromGrid ? fromGrid.member_id : p[(t + pos) % n];
    const o = findOverride(overrides, weekMonday, ROLE_TASK, task.id);
    return {
      task,
      date: weekMonday,
      member_id: o ? o.member_id : baseMember,
      source: o ? o.source : fromGrid ? 'grid' : 'rota',
      base_member_id: baseMember,
    };
  });
  return { weekMonday, weekNumber: pos + 1, cycleLength: n, days, tasks: taskRows };
}

// The whole cleaning rotation (weeks × tasks) without overrides, for the "ROTACIÓN DE n SEMANAS" grid.
export function cleaningRotation(settings, tasks, grid) {
  const p = settings.participants;
  const n = p.length;
  const list = activeTasks(tasks);
  return Array.from({ length: n }, (_, w) => list.map((task, t) => {
    const fromGrid = grid.find((g) => g.week_index === w && g.task_id === task.id);
    return fromGrid ? fromGrid.member_id : p[(t + w) % n];
  }));
}

// A member's kitchen turns from `fromDay` on (today included unless already done), soonest first.
export function upcomingKitchenTurns(rota, memberId, fromDay, { days = 28, done = [] } = {}) {
  const out = [];
  let monday = mondayOf(fromDay);
  const end = addDays(fromDay, days);
  while (monday <= end) {
    const week = assignmentsForWeek(rota.settings, rota.template, rota.tasks, rota.grid, rota.overrides, monday);
    for (const day of week.days) {
      if (day.date < fromDay || day.date > end) continue;
      for (const [role, slot] of [[ROLE_COOK, day.cook], [ROLE_KITCHEN_CLEAN, day.cleaner]]) {
        if (slot.member_id !== memberId) continue;
        if (done.some((x) => x.date === day.date && x.role === role)) continue;
        out.push({ date: day.date, role, task_id: null });
      }
    }
    monday = addDays(monday, 7);
  }
  return out;
}

// A member's weekly-task turns from the week of `fromDay` on.
export function upcomingTaskTurns(rota, memberId, fromDay, { weeks = 4 } = {}) {
  const out = [];
  let monday = mondayOf(fromDay);
  for (let i = 0; i < weeks; i++) {
    const week = assignmentsForWeek(rota.settings, rota.template, rota.tasks, rota.grid, rota.overrides, monday);
    for (const row of week.tasks) {
      if (row.member_id === memberId) out.push({ date: monday, role: ROLE_TASK, task_id: row.task.id, task: row.task });
    }
    monday = addDays(monday, 7);
  }
  return out;
}

// Who does the task linked to the shopping list ("Ir a la compra") the week of `day`.
export function shoppingPersonForWeek(rota, day) {
  const week = assignmentsForWeek(rota.settings, rota.template, rota.tasks, rota.grid, rota.overrides, mondayOf(day));
  const row = week.tasks.find((t) => t.task.links_to === 'shopping');
  return row ? row.member_id : null;
}

export const DEFAULT_TASKS = [
  { name: 'Baño completo', icon: 'bath', links_to: null },
  { name: 'Suelos y salón', icon: 'broom', links_to: null },
  { name: 'Polvo y superficies', icon: 'sparkle', links_to: null },
  { name: 'Basura y reciclaje', icon: 'trash', links_to: null },
  { name: 'Ir a la compra', icon: 'cart', links_to: 'shopping' },
];

export const DEFAULT_CLEANING_NOTE = '30–45 min entre todos. La basura, cuando haga falta.';

export const SUGGESTED_RULES = [
  { title: 'Cocinar', body: 'Una persona cocina cada noche para todos.' },
  { title: 'Limpiar después de cocinar', body: 'Otra persona se encarga de la cocina.' },
  { title: 'Habitaciones', body: 'Cada uno mantiene la suya limpia y ordenada.' },
  { title: 'Compra', body: 'Pagamos a partes iguales y nos turnamos para ir.' },
  { title: 'Días de descanso', body: 'Si no puedes cumplir tu turno, cámbialo con otra persona.' },
  { title: 'Rotación', body: 'Al terminar el ciclo, volvemos a empezar o ajustamos según la carga de trabajo.' },
];

export function roleLabel(role, task) {
  if (role === ROLE_COOK) return 'cocinar';
  if (role === ROLE_KITCHEN_CLEAN) return 'limpiar la cocina';
  return task ? task.name.toLowerCase() : 'tarea';
}

export { weekdayIndex };
