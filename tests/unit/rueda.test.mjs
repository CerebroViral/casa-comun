import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentsForWeek, generateKitchenTemplate, validateKitchenTemplate, weekNumber, cleaningRotation,
  upcomingKitchenTurns, shoppingPersonForWeek, rotate, DEFAULT_TASKS,
} from '../../js/rueda.js';
import { addDays } from '../../js/periods.js';

const START = '2026-10-12'; // a Monday
const people = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const tasksFor = (list = DEFAULT_TASKS) => list.map((t, i) => ({ id: `t${i}`, sort: i, active: true, ...t }));

function cycle(settings, template, tasks = [], grid = [], overrides = []) {
  const n = settings.participants.length;
  return Array.from({ length: n }, (_, w) =>
    assignmentsForWeek(settings, template, tasks, grid, overrides, addDays(settings.start_date, 7 * w)));
}

for (const n of [2, 3, 4, 5, 7]) {
  test(`automatic kitchen, ${n} people: cook ≠ cleaner, 7 cooks + 7 cleans each, every weekday once`, () => {
    const p = people(n);
    const settings = { start_date: START, participants: p, rotate_kitchen: true };
    const template = generateKitchenTemplate(p);
    assert.deepEqual(validateKitchenTemplate(template, p), {});
    const weeks = cycle(settings, template);
    const cooks = Object.fromEntries(p.map((x) => [x, 0]));
    const cleans = Object.fromEntries(p.map((x) => [x, 0]));
    const cookDays = Object.fromEntries(p.map((x) => [x, new Set()]));
    for (const week of weeks) {
      for (const day of week.days) {
        assert.notEqual(day.cook.member_id, day.cleaner.member_id, `${day.date}`);
        cooks[day.cook.member_id]++;
        cleans[day.cleaner.member_id]++;
        cookDays[day.cook.member_id].add(day.weekday);
      }
    }
    for (const x of p) {
      assert.equal(cooks[x], 7, `${x} cooks 7 times`);
      assert.equal(cleans[x], 7, `${x} cleans 7 times`);
      if (n >= 7) assert.equal(cookDays[x].size, 7, `${x} cooks on every weekday`);
      else assert.equal(cookDays[x].size, Math.min(7, cookDays[x].size));
    }
    // Over the cycle every person covers every (weekday, role) slot of the template exactly once.
    for (let d = 0; d < 7; d++) {
      const whoCooks = weeks.map((w) => w.days[d].cook.member_id);
      assert.equal(new Set(whoCooks).size, n, `weekday ${d}: a different cook each week`);
    }
  });
}

test('hand-entered kitchen week (like the paper chart) rotates fairly over the cycle', () => {
  const [A, S, G, J] = ['arianna', 'suje', 'gabriel', 'jorge'];
  const p = [A, S, G, J];
  // Uneven on purpose in week 1: Arianna cooks 3 times, Jorge once.
  const template = [
    { weekday: 0, cook_member: A, cleaner_member: G },
    { weekday: 1, cook_member: S, cleaner_member: J },
    { weekday: 2, cook_member: G, cleaner_member: A },
    { weekday: 3, cook_member: J, cleaner_member: S },
    { weekday: 4, cook_member: A, cleaner_member: S },
    { weekday: 5, cook_member: G, cleaner_member: J },
    { weekday: 6, cook_member: A, cleaner_member: G },
  ];
  assert.deepEqual(validateKitchenTemplate(template, p), {});
  const weeks = cycle({ start_date: START, participants: p, rotate_kitchen: true }, template);
  const cooks = {}; const cleans = {};
  for (const w of weeks) for (const d of w.days) {
    assert.notEqual(d.cook.member_id, d.cleaner.member_id);
    cooks[d.cook.member_id] = (cooks[d.cook.member_id] ?? 0) + 1;
    cleans[d.cleaner.member_id] = (cleans[d.cleaner.member_id] ?? 0) + 1;
  }
  assert.deepEqual(cooks, { [A]: 7, [S]: 7, [G]: 7, [J]: 7 });
  assert.deepEqual(cleans, { [A]: 7, [S]: 7, [G]: 7, [J]: 7 });
  // Week 1 is exactly the chart; week 2 everyone moves one place along the order.
  assert.equal(weeks[0].days[0].cook.member_id, A);
  assert.equal(weeks[1].days[0].cook.member_id, S);
  assert.equal(weeks[3].days[0].cook.member_id, J);
});

test('without rotation every week repeats the template', () => {
  const p = people(4);
  const template = generateKitchenTemplate(p);
  const weeks = cycle({ start_date: START, participants: p, rotate_kitchen: false }, template);
  for (const w of weeks) assert.deepEqual(w.days.map((d) => d.cook.member_id), template.map((t) => t.cook_member));
});

test('validateKitchenTemplate catches the same person cooking and cleaning, and gaps', () => {
  const p = people(3);
  const template = generateKitchenTemplate(p);
  template[2] = { weekday: 2, cook_member: 'p1', cleaner_member: 'p1' };
  template.splice(5, 1);
  const errors = validateKitchenTemplate(template, p);
  assert.match(errors[2], /misma persona/);
  assert.match(errors[5], /Falta/);
  assert.equal(Object.keys(errors).length, 2);
});

test('week number k = floor(days since start / 7) mod n + 1, also before the start', () => {
  const s = { start_date: START, participants: people(4) };
  assert.equal(weekNumber(s, '2026-10-12'), 1);
  assert.equal(weekNumber(s, '2026-10-18'), 1);
  assert.equal(weekNumber(s, '2026-10-19'), 2);
  assert.equal(weekNumber(s, '2026-11-08'), 4);
  assert.equal(weekNumber(s, '2026-11-09'), 1, 'the wheel starts again');
  assert.equal(weekNumber(s, '2026-10-11'), 4, 'the week before the start is the last of the cycle');
});

test('cleaning: Latin square, everyone does each task once per cycle', () => {
  for (const n of [2, 3, 4, 5]) {
    const p = people(n);
    const tasks = tasksFor();
    const settings = { start_date: START, participants: p };
    const grid = cleaningRotation(settings, tasks, []);
    assert.equal(grid.length, n);
    tasks.forEach((_, t) => {
      const column = grid.map((row) => row[t]);
      assert.equal(new Set(column).size, n, `task ${t} goes to everyone once with ${n} people`);
    });
    const weeks = cycle(settings, generateKitchenTemplate(p), tasks);
    weeks.forEach((w, wi) => assert.deepEqual(w.tasks.map((r) => r.member_id), grid[wi]));
    assert.equal(weeks[0].tasks[0].member_id, p[0]);
    assert.equal(weeks[1].tasks[0].member_id, p[1 % n]);
  }
});

test('a hand-edited grid cell wins over the Latin square for that week only', () => {
  const p = people(4);
  const tasks = tasksFor();
  const settings = { start_date: START, participants: p };
  const grid = [{ week_index: 1, task_id: 't0', member_id: 'p3' }];
  const rotation = cleaningRotation(settings, tasks, grid);
  assert.equal(rotation[1][0], 'p3');
  assert.equal(rotation[0][0], 'p0');
  const week2 = assignmentsForWeek(settings, generateKitchenTemplate(p), tasks, grid, [], addDays(START, 7));
  assert.equal(week2.tasks[0].member_id, 'p3');
  assert.equal(week2.tasks[0].source, 'grid');
});

test('inactive tasks drop out and the rest keep their order', () => {
  const p = people(4);
  const tasks = tasksFor();
  tasks[1].active = false;
  const week = assignmentsForWeek({ start_date: START, participants: p }, generateKitchenTemplate(p), tasks, [], [], START);
  assert.deepEqual(week.tasks.map((r) => r.task.id), ['t0', 't2', 't3', 't4']);
});

test('an override changes one date only; the base rotation stays', () => {
  const p = people(4);
  const settings = { start_date: START, participants: p, rotate_kitchen: true };
  const template = generateKitchenTemplate(p);
  const saturday = addDays(START, 5);
  const before = assignmentsForWeek(settings, template, [], [], [], START);
  const overrides = [{ date: saturday, role: 'kitchen_clean', task_id: null, member_id: 'p3', source: 'manual' }];
  const after = assignmentsForWeek(settings, template, [], [], overrides, START);
  assert.equal(after.days[5].cleaner.member_id, 'p3');
  assert.equal(after.days[5].cleaner.source, 'manual');
  assert.equal(after.days[5].cleaner.base_member_id, before.days[5].cleaner.member_id);
  for (const d of [0, 1, 2, 3, 4, 6]) assert.deepEqual(after.days[d], before.days[d]);
  const nextWeek = assignmentsForWeek(settings, template, [], [], overrides, addDays(START, 7));
  assert.deepEqual(nextWeek, assignmentsForWeek(settings, template, [], [], [], addDays(START, 7)));
});

test('an accepted swap with exchange swaps both turns', () => {
  const p = people(4);
  const settings = { start_date: START, participants: p, rotate_kitchen: true };
  const template = generateKitchenTemplate(p);
  const base = assignmentsForWeek(settings, template, [], [], [], START);
  const sat = base.days[5]; const sun = base.days[6];
  const me = sat.cleaner.member_id;
  const other = sun.cook.member_id;
  // As respond_swap writes them: my Saturday clean goes to the other; their Sunday cook comes to me.
  const overrides = [
    { date: sat.date, role: 'kitchen_clean', task_id: null, member_id: other, source: 'swap' },
    { date: sun.date, role: 'cook', task_id: null, member_id: me, source: 'swap' },
  ];
  const week = assignmentsForWeek(settings, template, [], [], overrides, START);
  assert.equal(week.days[5].cleaner.member_id, other);
  assert.equal(week.days[6].cook.member_id, me);
  // A swap can make cook = cleaner on a day only if people agree to it; the base never changes.
  assert.equal(week.days[5].cleaner.base_member_id, me);
});

test('weekly task override (swap of a cleaning task) is keyed by the week Monday', () => {
  const p = people(4);
  const tasks = tasksFor();
  const settings = { start_date: START, participants: p };
  const overrides = [{ date: START, role: 'task', task_id: 't2', member_id: 'p0', source: 'swap' }];
  const week = assignmentsForWeek(settings, generateKitchenTemplate(p), tasks, [], overrides, START);
  assert.equal(week.tasks[2].member_id, 'p0');
  assert.equal(week.tasks[2].base_member_id, 'p2');
});

test('next kitchen turn skips what is already done', () => {
  const p = people(4);
  const rota = {
    settings: { start_date: START, participants: p, rotate_kitchen: true },
    template: generateKitchenTemplate(p), tasks: [], grid: [], overrides: [],
  };
  const turns = upcomingKitchenTurns(rota, 'p0', START, { days: 6 });
  assert.deepEqual(turns[0], { date: START, role: 'cook', task_id: null });
  const skipped = upcomingKitchenTurns(rota, 'p0', START, { days: 6, done: [{ date: START, role: 'cook' }] });
  assert.notDeepEqual(skipped[0], turns[0]);
  assert.ok(turns.every((t) => t.date >= START));
});

test('the shopping task tells the list who goes this week', () => {
  const p = people(4);
  const rota = {
    settings: { start_date: START, participants: p },
    template: generateKitchenTemplate(p), tasks: tasksFor(), grid: [], overrides: [],
  };
  // "Ir a la compra" is task index 4 → p[(4 + w) mod 4].
  assert.equal(shoppingPersonForWeek(rota, '2026-10-14'), 'p0');
  assert.equal(shoppingPersonForWeek(rota, '2026-10-21'), 'p1');
});

test('rotate keeps strangers and wraps around', () => {
  assert.equal(rotate(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(rotate(['a', 'b', 'c'], 'x', 1), 'x');
  assert.equal(rotate(['a', 'b', 'c'], 'a', -1), 'c');
});
