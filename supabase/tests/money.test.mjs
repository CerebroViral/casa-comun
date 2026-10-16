// The server's split and transfer maths (period_summary) against the same vectors as js/money.js.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, q } from './support/pg.mjs';
import { newAdult, createHouse, join, addPurchase, month } from './support/fixtures.mjs';

const vectors = JSON.parse(readFileSync(new URL('../../tests/vectors/split.json', import.meta.url)));
let db;
before(async () => { db = await createDb(); });

for (const v of vectors) {
  test(`period_summary matches vector: ${v.name}`, async () => {
    const byKey = {};
    const ordered = [...v.members].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const adults = ordered.filter((m) => m.kind !== 'child');
    const owner = await newAdult(db, adults[0].key);
    const house = await createHouse(db, owner);
    byKey[adults[0].key] = owner;
    for (const m of ordered.slice(1)) {
      if (m.kind === 'child') {
        const [{ id }] = await q(db, owner.userId, `select public.add_child($1, $2, '#A3245A', 'niña') as id`, [house.id, m.key]);
        byKey[m.key] = { memberId: id };
      } else {
        const p = await newAdult(db, m.key);
        await join(db, p, house.code);
        byKey[m.key] = p;
      }
    }
    for (const m of v.members) {
      await db.query('update public.members set created_at = $1 where id = $2', [m.created_at, byKey[m.key].memberId]);
      if (!m.shares_costs && m.kind !== 'child') {
        await q(db, owner.userId, 'select public.set_member_flags($1, false, null)', [byKey[m.key].memberId]);
      }
    }
    for (const p of v.purchases) {
      const payer = byKey[p.paid_by];
      const id = await addPurchase(db, payer, house.id, { amount: p.amount_cents, scope: p.scope, big: !!p.is_big_shop });
      if (p.deleted) {
        await q(db, payer.userId, 'update public.purchases set deleted_at = now() where id = $1', [id]);
      }
    }
    const [{ s }] = await q(db, owner.userId, 'select public.period_summary($1, $2) as s', [house.id, await month(db)]);
    const keyOf = Object.fromEntries(Object.entries(byKey).map(([k, p]) => [p.memberId, k]));
    const e = v.expected;
    assert.equal(s.total_cents, e.total_cents);
    assert.equal(s.during_cents, e.during_cents);
    assert.equal(s.big_shop_cents, e.big_shop_cents);
    assert.equal(s.has_big_shop, e.has_big_shop);
    assert.equal(s.sharers_count, e.sharers_count);
    assert.deepEqual(s.people.map((p) => ({
      key: keyOf[p.member_id], share_cents: p.share_cents, paid_cents: p.paid_cents,
      paid_before_big_cents: p.paid_before_big_cents, balance_cents: p.balance_cents,
    })), e.people);
    const sortT = (list) => [...list].sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`));
    assert.deepEqual(
      sortT(s.transfers.map((t) => ({ from: keyOf[t.from_member], to: keyOf[t.to_member], amount_cents: t.amount_cents }))),
      sortT(e.transfers),
    );
  });
}
