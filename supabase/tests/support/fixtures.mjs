// Builds households through the real RPCs, as real (stub) auth users.
import { createUser, q } from './pg.mjs';

let seq = 0;

export async function newAdult(db, name = 'Persona') {
  seq += 1;
  const userId = await createUser(db, `${name.toLowerCase().replace(/\W/g, '')}${seq}@prueba.es`);
  return { userId, name };
}

export async function createHouse(db, owner, { name = 'Casa', color = '#1F5F7A' } = {}) {
  const [{ r }] = await q(db, owner.userId, 'select public.create_household($1, $2, $3) as r', [name, owner.name, color]);
  const [{ invite_code: code }] = await q(db, owner.userId, 'select invite_code from public.households where id = $1', [r.household_id]);
  owner.memberId = r.member_id;
  return { id: r.household_id, code };
}

export async function join(db, person, code, color = '#9A3412') {
  const [{ r }] = await q(db, person.userId, 'select public.join_household($1, $2, $3) as r', [code, person.name, color]);
  person.memberId = r.member_id;
  return r;
}

export async function addPurchase(db, person, householdId, { amount, scope = 'common', big = false, description = 'Compra', paidBy } = {}) {
  const [{ r }] = await q(db, person.userId,
    `select public.add_purchase($1, $2, $3, $4, 'Mercadona', $5, gen_random_uuid(), null, $6) as r`,
    [householdId, description, amount, paidBy ?? person.memberId, scope, big]);
  return r.purchase_id;
}

export const month = async (db) => (await db.query(`select public.madrid_month(now()) as m`)).rows[0].m;
