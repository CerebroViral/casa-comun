// The schema can be pasted twice without breaking anything, and the first migration matches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, createUser, q, schemaSql } from './support/pg.mjs';

test('running schema.sql again keeps data and policies', async () => {
  const db = await createDb();
  const u = await createUser(db, 'dos.veces@prueba.es');
  const [{ r }] = await q(db, u, `select public.create_household('Casa', 'Ana', '#1F5F7A') as r`);
  await db.exec(schemaSql());
  await db.exec(schemaSql());
  const houses = await q(db, u, 'select id from public.households');
  assert.deepEqual(houses.map((h) => h.id), [r.household_id]);
  const policies = await db.query(`select count(*)::int as n from pg_policies where schemaname = 'public'`);
  assert.ok(policies.rows[0].n >= 20);
  const noRls = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(noRls.rows, [], 'every table has RLS enabled');
  await db.close();
});

test('the Phase 1 migration is the same SQL as schema.sql', () => {
  const migration = readFileSync(new URL('../migrations/20261016000000_phase1.sql', import.meta.url), 'utf8');
  assert.equal(migration.split('\n').slice(1).join('\n'), schemaSql());
});
