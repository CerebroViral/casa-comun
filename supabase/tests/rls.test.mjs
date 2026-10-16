// Row level security with two real users in two houses, plus the column and trigger rules of DATA-MODEL.md.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, q } from './support/pg.mjs';
import { newAdult, createHouse, join, addPurchase, month } from './support/fixtures.mjs';

let db; let ana; let bea; let carlos; let houseA; let houseB; let itemA; let purchaseA; let childA;

const TABLES = ['households', 'members', 'periods', 'shopping_items', 'purchases', 'transfers', 'frequent_items',
  'audit_log', 'chore_settings', 'kitchen_template', 'chore_tasks', 'cleaning_grid', 'chore_swaps',
  'chore_overrides', 'chore_done', 'house_rules'];

before(async () => {
  db = await createDb();
  ana = await newAdult(db, 'Ana');
  carlos = await newAdult(db, 'Carlos');
  bea = await newAdult(db, 'Bea');
  houseA = await createHouse(db, ana, { name: 'Casa A' });
  await join(db, carlos, houseA.code);
  houseB = await createHouse(db, bea, { name: 'Casa B' });
  [{ id: itemA }] = await q(db, ana.userId,
    `insert into public.shopping_items (household_id, name, quantity_text, estimated_cents) values ($1, 'Leche', '6 L', 570) returning id`,
    [houseA.id]);
  purchaseA = await addPurchase(db, ana, houseA.id, { amount: 1000, description: 'Fruta' });
  [{ id: childA }] = await q(db, ana.userId, `select public.add_child($1, 'Peque', '#A3245A', 'niña') as id`, [houseA.id]);
  await q(db, ana.userId, `select public.period_summary($1, $2)`, [houseA.id, await month(db)]);
  await q(db, ana.userId, `insert into public.house_rules (household_id, title) values ($1, 'Norma A')`, [houseA.id]);
});

test('invite codes are 6 characters without O, 0, I or 1', () => {
  for (const code of [houseA.code, houseB.code]) assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});

test('a user of house B cannot read anything of house A', async () => {
  for (const t of TABLES) {
    const col = t === 'households' ? 'id' : 'household_id';
    const rows = await q(db, bea.userId, `select * from public.${t} where ${col} = $1`, [houseA.id]);
    assert.equal(rows.length, 0, `${t} leaked`);
  }
  const mine = await q(db, bea.userId, 'select id from public.households');
  assert.deepEqual(mine.map((r) => r.id), [houseB.id]);
});

test('anon reads nothing at all', async () => {
  for (const t of TABLES) {
    await assert.rejects(q(db, null, `select * from public.${t}`), /permission denied/, `${t} readable by anon`);
  }
  await assert.rejects(q(db, null, `select public.create_household('x', 'y', '#1F5F7A')`), /permission denied/);
});

test('a user of house B cannot write into house A', async () => {
  await assert.rejects(q(db, bea.userId,
    `insert into public.shopping_items (household_id, name) values ($1, 'Intruso')`, [houseA.id]), /row-level security/);
  const upd = await q(db, bea.userId, `update public.shopping_items set name = 'X' where id = $1 returning id`, [itemA]);
  assert.equal(upd.length, 0);
  const del = await q(db, bea.userId, `delete from public.shopping_items where id = $1 returning id`, [itemA]);
  assert.equal(del.length, 0);
  const pur = await q(db, bea.userId, `update public.purchases set amount_cents = 1 where id = $1 returning id`, [purchaseA]);
  assert.equal(pur.length, 0);
  await assert.rejects(q(db, bea.userId,
    `insert into public.house_rules (household_id, title) values ($1, 'Intrusa')`, [houseA.id]), /row-level security/);
});

test('RPCs refuse other houses', async () => {
  const m = await month(db);
  await assert.rejects(q(db, bea.userId, 'select public.period_summary($1, $2)', [houseA.id, m]), /No perteneces/);
  await assert.rejects(q(db, bea.userId, 'select public.close_period($1, $2)', [houseA.id, m]), /No perteneces/);
  await assert.rejects(q(db, bea.userId, 'select public.regenerate_invite_code($1)', [houseA.id]), /No perteneces/);
  await assert.rejects(q(db, bea.userId,
    `select public.mark_item_bought($1, 500, $2, 'Dia', 'common', gen_random_uuid())`, [itemA, bea.memberId]), /No perteneces/);
  await assert.rejects(q(db, bea.userId,
    `select public.add_purchase($1, 'x', 100, $2, 'Dia', 'common', gen_random_uuid())`, [houseA.id, ana.memberId]), /No perteneces/);
  await assert.rejects(q(db, bea.userId, `select public.add_child($1, 'x', '#1F5F7A', 'niño')`, [houseA.id]), /No perteneces/);
  const [{ id: t }] = await q(db, ana.userId, 'select id from public.transfers where household_id = $1 limit 1', [houseA.id]);
  await assert.rejects(q(db, bea.userId, 'select public.mark_transfer_paid($1)', [t]), /No perteneces/);
});

test('internal helpers cannot be called from the API', async () => {
  const [{ id: period }] = await q(db, ana.userId, 'select id from public.periods where household_id = $1', [houseA.id]);
  await assert.rejects(q(db, bea.userId, 'select public._period_numbers($1)', [period]), /permission denied/);
  await assert.rejects(q(db, bea.userId, 'select public._sync_transfers($1, $2)', [period, '{}']), /permission denied/);
  await assert.rejects(q(db, bea.userId, 'select public._new_invite_code()'), /permission denied/);
});

test('a member of house B cannot point at people of house A', async () => {
  await assert.rejects(q(db, bea.userId,
    `select public.add_purchase($1, 'x', 100, $2, 'Dia', 'common', gen_random_uuid())`, [houseB.id, ana.memberId]), /Elige quién/);
  await assert.rejects(q(db, bea.userId,
    `insert into public.shopping_items (household_id, name, scope, for_member_id) values ($1, 'x', 'personal', $2)`,
    [houseB.id, ana.memberId]), /no es de esta casa/);
});

test('each person edits only their own name and colour; adults edit children', async () => {
  const own = await q(db, carlos.userId, `update public.members set display_name = 'Carlitos', color = '#4D5B2A' where id = $1 returning display_name`, [carlos.memberId]);
  assert.equal(own[0].display_name, 'Carlitos');
  const other = await q(db, carlos.userId, `update public.members set display_name = 'Hackeada' where id = $1 returning id`, [ana.memberId]);
  assert.equal(other.length, 0, 'cannot rename another adult');
  const child = await q(db, carlos.userId, `update public.members set display_name = 'Peque Sol' where id = $1 returning display_name`, [childA]);
  assert.equal(child[0].display_name, 'Peque Sol');
  await assert.rejects(q(db, carlos.userId, `update public.members set shares_costs = false where id = $1`, [carlos.memberId]), /permission denied/);
  await assert.rejects(q(db, carlos.userId, `update public.members set kind = 'child' where id = $1`, [carlos.memberId]), /permission denied/);
  await assert.rejects(q(db, carlos.userId, `update public.members set active = false where id = $1`, [ana.memberId]), /permission denied/);
  await assert.rejects(q(db, carlos.userId, `update public.members set display_name = '' where id = $1`, [carlos.memberId]), /check constraint/);
  await assert.rejects(q(db, carlos.userId, `update public.members set color = '#000000' where id = $1`, [carlos.memberId]), /check constraint/);
  await assert.rejects(q(db, carlos.userId,
    `insert into public.members (household_id, display_name, color, kind) values ($1, 'x', '#1F5F7A', 'adult')`, [houseA.id]),
  /permission denied/);
});

test('list item status and the invite code only change through RPCs', async () => {
  await assert.rejects(q(db, ana.userId, `update public.shopping_items set status = 'bought' where id = $1`, [itemA]), /permission denied/);
  await assert.rejects(q(db, ana.userId, `update public.households set invite_code = 'AAAAAA' where id = $1`, [houseA.id]), /permission denied/);
  await assert.rejects(q(db, ana.userId,
    `insert into public.purchases (household_id, period_id, description, amount_cents, paid_by) select $1, id, 'x', 1, $2 from public.periods where household_id = $1`,
    [houseA.id, ana.memberId]), /permission denied/);
  const [{ added_by: addedBy }] = await q(db, carlos.userId,
    `insert into public.shopping_items (household_id, name, added_by) values ($1, 'Pan', $2) returning added_by`, [houseA.id, ana.memberId]);
  assert.equal(addedBy, carlos.memberId, 'added_by is always the caller');
});

test('join with a wrong code says "Código no válido"; joining twice is harmless', async () => {
  const dani = await newAdult(db, 'Dani');
  await assert.rejects(q(db, dani.userId, `select public.join_household('ZZZZZZ', 'Dani', '#1F5F7A')`), /Código no válido/);
  const first = await join(db, dani, houseB.code.toLowerCase());
  const again = await join(db, dani, ` ${houseB.code} `);
  assert.equal(first.member_id, again.member_id);
});

test('mark_item_bought is atomic, idempotent and refuses a second buyer', async () => {
  const [{ id: item }] = await q(db, ana.userId,
    `insert into public.shopping_items (household_id, name) values ($1, 'Huevos') returning id`, [houseA.id]);
  const clientA = '11111111-1111-4111-8111-111111111111';
  const [{ r: r1 }] = await q(db, ana.userId,
    `select public.mark_item_bought($1, 520, $2, 'Mercadona', 'common', $3) as r`, [item, ana.memberId, clientA]);
  assert.equal(r1.status, 'ok');
  const [{ r: retry }] = await q(db, ana.userId,
    `select public.mark_item_bought($1, 520, $2, 'Mercadona', 'common', $3) as r`, [item, ana.memberId, clientA]);
  assert.equal(retry.status, 'ok');
  assert.equal(retry.duplicate, true);
  assert.equal(retry.purchase_id, r1.purchase_id);
  const [{ r: second }] = await q(db, carlos.userId,
    `select public.mark_item_bought($1, 499, $2, 'Dia', 'common', gen_random_uuid()) as r`, [item, carlos.memberId]);
  assert.equal(second.status, 'already_bought');
  assert.equal(second.by, 'Ana');
  const purchases = await q(db, ana.userId, `select * from public.purchases where item_id = $1`, [item]);
  assert.equal(purchases.length, 1);
  const [it] = await q(db, ana.userId, `select status, purchase_id from public.shopping_items where id = $1`, [item]);
  assert.deepEqual(it, { status: 'bought', purchase_id: r1.purchase_id });
  // Undo: deleting the purchase puts the item back on the list.
  await q(db, carlos.userId, `update public.purchases set deleted_at = now() where id = $1`, [r1.purchase_id]);
  const [back] = await q(db, ana.userId, `select status, purchase_id from public.shopping_items where id = $1`, [item]);
  assert.deepEqual(back, { status: 'pending', purchase_id: null });
});

test('a common purchase needs an amount; a personal one may not', async () => {
  const [{ id: item }] = await q(db, ana.userId,
    `insert into public.shopping_items (household_id, name, scope) values ($1, 'Café', 'personal') returning id, for_member_id`, [houseA.id]);
  await assert.rejects(q(db, ana.userId,
    `select public.add_purchase($1, 'x', null, $2, 'Dia', 'common', gen_random_uuid())`, [houseA.id, ana.memberId]), /Escribe|amount_required|check/);
  const [{ r }] = await q(db, ana.userId,
    `select public.mark_item_bought($1, null, $2, 'Dia', 'personal', gen_random_uuid()) as r`, [item, ana.memberId]);
  assert.equal(r.status, 'ok');
  const [p] = await q(db, ana.userId, `select amount_cents, scope, for_member_id from public.purchases where id = $1`, [r.purchase_id]);
  assert.deepEqual(p, { amount_cents: null, scope: 'personal', for_member_id: ana.memberId });
  const [{ id: other }] = await q(db, ana.userId,
    `insert into public.shopping_items (household_id, name) values ($1, 'Galletas') returning id`, [houseA.id]);
  await assert.rejects(q(db, ana.userId,
    `select public.mark_item_bought($1, 100, $2, 'Dia', 'common', gen_random_uuid())`, [other, childA]), /Elige quién/,
  'a child cannot be the payer');
});

test('closing a month freezes it, clears bought monthly items, opens the next; reopen undoes it', async () => {
  const owner = await newAdult(db, 'Olga');
  const house = await createHouse(db, owner);
  const pablo = await newAdult(db, 'Pablo');
  await join(db, pablo, house.code);
  const m = await month(db);
  const [{ id: bought }] = await q(db, owner.userId,
    `insert into public.shopping_items (household_id, name) values ($1, 'Arroz') returning id`, [house.id]);
  const [{ id: urgentBought }] = await q(db, owner.userId,
    `insert into public.shopping_items (household_id, name, list) values ($1, 'Pan', 'urgent') returning id`, [house.id]);
  const [{ id: pending }] = await q(db, owner.userId,
    `insert into public.shopping_items (household_id, name) values ($1, 'Aceite') returning id`, [house.id]);
  await q(db, owner.userId, `select public.mark_item_bought($1, 260, $2, 'Dia', 'common', gen_random_uuid())`, [bought, owner.memberId]);
  await q(db, owner.userId, `select public.mark_item_bought($1, 145, $2, 'Dia', 'common', gen_random_uuid())`, [urgentBought, owner.memberId]);
  const big = await addPurchase(db, pablo, house.id, { amount: 40000, big: true, description: 'Compra grande' });

  const [{ s }] = await q(db, owner.userId, 'select public.period_summary($1, $2) as s', [house.id, m]);
  assert.equal(s.total_cents, 40405);
  assert.equal(s.transfers.length, 1);
  const [t] = s.transfers;
  assert.equal(t.from_member, owner.memberId);
  assert.equal(t.to_member, pablo.memberId);
  // 40405 / 2 → Olga 20203, Pablo 20202. Olga paid 405 → owes 19798.
  assert.equal(t.amount_cents, 19798);
  // Paying the Bizum before closing survives the closing and later recalculations.
  await q(db, pablo.userId, 'select public.mark_transfer_paid($1)', [t.id]);
  const [{ s: again }] = await q(db, owner.userId, 'select public.period_summary($1, $2) as s', [house.id, m]);
  assert.equal(again.transfers.length, 1);
  assert.equal(again.transfers[0].paid, true);
  assert.equal(again.transfers[0].marked_by, pablo.memberId);

  const [{ r: closed }] = await q(db, owner.userId, 'select public.close_period($1, $2) as r', [house.id, m]);
  assert.equal(closed.status, 'closed');
  const [{ r: twice }] = await q(db, owner.userId, 'select public.close_period($1, $2) as r', [house.id, m]);
  assert.equal(twice.status, 'already_closed', 'closing is idempotent');
  const items = await q(db, owner.userId, `select id from public.shopping_items where household_id = $1 order by name`, [house.id]);
  assert.deepEqual(new Set(items.map((i) => i.id)), new Set([pending, urgentBought]), 'only bought monthly items are cleared');
  const periods = await q(db, owner.userId, `select month, status from public.periods where household_id = $1 order by month`, [house.id]);
  assert.deepEqual(periods.map((p) => p.status), ['closed', 'open']);
  const [{ s: frozen }] = await q(db, owner.userId, 'select public.period_summary($1, $2) as s', [house.id, m]);
  assert.equal(frozen.status, 'closed');
  assert.equal(frozen.total_cents, 40405);
  assert.equal(frozen.people[0].display_name, 'Olga', 'snapshot keeps names');

  await assert.rejects(q(db, owner.userId, `update public.purchases set amount_cents = 1 where id = $1`, [big]), /cerrado/);
  await assert.rejects(q(db, owner.userId, `update public.purchases set deleted_at = now() where id = $1`, [big]), /cerrado/);
  await assert.rejects(q(db, owner.userId,
    `select public.add_purchase($1, 'x', 100, $2, 'Dia', 'common', gen_random_uuid(), null, false, null, $3)`,
    [house.id, owner.memberId, m]), /cerrado/);
  // Deleting a bought urgent item of a closed month is allowed and keeps its purchase.
  await q(db, owner.userId, `delete from public.shopping_items where id = $1`, [urgentBought]);
  const kept = await q(db, owner.userId, `select item_id from public.purchases where household_id = $1 and description = 'Pan'`, [house.id]);
  assert.deepEqual(kept, [{ item_id: null }]);

  // New purchases go to the new month.
  const fresh = await addPurchase(db, owner, house.id, { amount: 300 });
  const [{ month: freshMonth }] = await q(db, owner.userId,
    `select p.month from public.purchases x join public.periods p on p.id = x.period_id where x.id = $1`, [fresh]);
  assert.notEqual(freshMonth, m);

  await assert.rejects(q(db, owner.userId, 'select public.reopen_period($1, $2)', [house.id, '2020-01']), /último mes cerrado/);
  await q(db, pablo.userId, 'select public.reopen_period($1, $2)', [house.id, m]);
  await q(db, owner.userId, `update public.purchases set amount_cents = 39000 where id = $1`, [big]);
  const log = await q(db, owner.userId, `select action from public.audit_log where household_id = $1 order by id`, [house.id]);
  assert.ok(log.some((l) => l.action === 'period.close'));
  assert.ok(log.some((l) => l.action === 'period.reopen'));
  assert.ok(log.some((l) => l.action === 'transfer.paid'));
});

test('La Rueda: setup validates cook ≠ cleaner, participants and Monday start', async () => {
  const s = (participants, start = '2026-10-12') => ({ start_date: start, participants, rotate_kitchen: true });
  const tpl = (a, b) => Array.from({ length: 7 }, (_, d) => ({ weekday: d, cook_member: d % 2 ? a : b, cleaner_member: d % 2 ? b : a }));
  const tasks = [{ name: 'Baño completo', icon: 'bath' }, { name: 'Ir a la compra', icon: 'cart', links_to: 'shopping' }];
  const call = (user, settings, template, t = tasks) => q(db, user.userId,
    'select public.save_rueda_setup($1, $2, $3, $4)', [houseA.id, JSON.stringify(settings), JSON.stringify(template), JSON.stringify(t)]);

  await assert.rejects(call(ana, s([ana.memberId, carlos.memberId]), tpl(ana.memberId, ana.memberId)), /misma persona/);
  await assert.rejects(call(ana, s([ana.memberId]), tpl(ana.memberId, carlos.memberId)), /al menos dos/);
  await assert.rejects(call(ana, s([ana.memberId, bea.memberId]), tpl(ana.memberId, bea.memberId)), /no es de esta casa/);
  await assert.rejects(call(ana, s([ana.memberId, carlos.memberId], '2026-10-13'), tpl(ana.memberId, carlos.memberId)), /lunes/);
  await assert.rejects(call(ana, s([ana.memberId, carlos.memberId]), tpl(ana.memberId, carlos.memberId).slice(0, 6)), /7 días/);
  await assert.rejects(call(bea, s([ana.memberId, carlos.memberId]), tpl(ana.memberId, carlos.memberId)), /No perteneces/);
  await call(ana, s([ana.memberId, carlos.memberId]), tpl(ana.memberId, carlos.memberId));
  const rows = await q(db, carlos.userId, 'select name, sort, links_to from public.chore_tasks where household_id = $1 and active order by sort', [houseA.id]);
  assert.deepEqual(rows, [{ name: 'Baño completo', sort: 0, links_to: null }, { name: 'Ir a la compra', sort: 1, links_to: 'shopping' }]);
  const flags = await q(db, ana.userId, 'select id, in_chores from public.members where household_id = $1', [houseA.id]);
  assert.equal(flags.find((f) => f.id === childA).in_chores, false);
  assert.equal(flags.find((f) => f.id === carlos.memberId).in_chores, true);
  assert.equal((await q(db, bea.userId, 'select * from public.kitchen_template where household_id = $1', [houseA.id])).length, 0);
});

test('La Rueda: only the addressee answers a swap; accepting writes the overrides', async () => {
  const [{ d: day }] = await db.query(`select (public.madrid_today() + 3)::text as d`).then((r) => r.rows);
  const [{ d: other }] = await db.query(`select (public.madrid_today() + 4)::text as d`).then((r) => r.rows);
  const [{ id: swap }] = await q(db, ana.userId,
    `select public.request_swap($1, $2, 'kitchen_clean', null, $3, $4, 'cook', null) as id`, [houseA.id, day, carlos.memberId, other]);
  await assert.rejects(q(db, ana.userId, 'select public.respond_swap($1, true)', [swap]), /Solo la persona/);
  await assert.rejects(q(db, bea.userId, 'select public.respond_swap($1, true)', [swap]), /No perteneces/);
  const [{ r }] = await q(db, carlos.userId, 'select public.respond_swap($1, true) as r', [swap]);
  assert.equal(r.status, 'accepted');
  const overrides = await q(db, ana.userId,
    `select date::text, role, member_id, source from public.chore_overrides where household_id = $1 order by date`, [houseA.id]);
  assert.deepEqual(overrides, [
    { date: day, role: 'kitchen_clean', member_id: carlos.memberId, source: 'swap' },
    { date: other, role: 'cook', member_id: ana.memberId, source: 'swap' },
  ]);
  const [{ r: late }] = await q(db, carlos.userId, 'select public.respond_swap($1, false) as r', [swap]);
  assert.equal(late.status, 'accepted', 'answering twice changes nothing');
  await assert.rejects(q(db, ana.userId,
    `select public.request_swap($1, '2020-01-01', 'cook', null, $2)`, [houseA.id, carlos.memberId]), /ya ha pasado/);
  await assert.rejects(q(db, ana.userId,
    `select public.request_swap($1, $2, 'cook', null, $3)`, [houseA.id, day, childA]), /no puede recibir/);
});

test('La Rueda: done marks toggle and stay inside the house', async () => {
  const today = (await db.query(`select public.madrid_today()::text as d`)).rows[0].d;
  await q(db, carlos.userId, `select public.mark_chore_done($1, $2, 'cook', null, $3, true)`, [houseA.id, today, ana.memberId]);
  await q(db, carlos.userId, `select public.mark_chore_done($1, $2, 'cook', null, $3, true)`, [houseA.id, today, ana.memberId]);
  let done = await q(db, ana.userId, `select done_by from public.chore_done where household_id = $1`, [houseA.id]);
  assert.deepEqual(done, [{ done_by: carlos.memberId }]);
  await q(db, ana.userId, `select public.mark_chore_done($1, $2, 'cook', null, $3, false)`, [houseA.id, today, ana.memberId]);
  done = await q(db, ana.userId, `select * from public.chore_done where household_id = $1`, [houseA.id]);
  assert.equal(done.length, 0);
  await assert.rejects(q(db, bea.userId,
    `select public.mark_chore_done($1, $2, 'cook', null, $3, true)`, [houseA.id, today, ana.memberId]), /No perteneces/);
});
