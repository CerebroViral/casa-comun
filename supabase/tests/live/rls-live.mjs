// Row level security check against the REAL Supabase project, with two real users in two houses.
// Needs "Confirm email" switched off in Supabase Auth (as the app does). Creates 2 test users and 2 test
// houses; delete them afterwards from Authentication → Users if you like.
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node supabase/tests/live/rls-live.mjs
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (the public anon key, never the service_role key).');
  process.exit(2);
}
const tag = Date.now();
const mk = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const a = mk();
const b = mk();
const anon = mk();
await ok(a.auth.signUp({ email: `rls.a.${tag}@example.com`, password: `Prueba-${tag}` }));
await ok(b.auth.signUp({ email: `rls.b.${tag}@example.com`, password: `Prueba-${tag}` }));
if (!(await a.auth.getSession()).data.session) {
  console.error('Sign-up needs email confirmation. Switch off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email.');
  process.exit(1);
}
const ha = await ok(a.rpc('create_household', { p_name: 'Prueba RLS A', p_display_name: 'A', p_color: '#1F5F7A' }));
const hb = await ok(b.rpc('create_household', { p_name: 'Prueba RLS B', p_display_name: 'B', p_color: '#9A3412' }));
const id = crypto.randomUUID();
await ok(a.from('shopping_items').insert({ id, client_id: id, household_id: ha.household_id, name: 'Leche' }));
await ok(a.rpc('add_purchase', { p_household: ha.household_id, p_description: 'Fruta', p_amount_cents: 1000, p_paid_by: ha.member_id, p_store: 'Dia', p_scope: 'common', p_client_id: crypto.randomUUID() }));

console.log('Casa Común — RLS en vivo');
const tables = ['households', 'members', 'periods', 'shopping_items', 'purchases', 'transfers', 'frequent_items', 'audit_log',
  'chore_settings', 'kitchen_template', 'chore_tasks', 'cleaning_grid', 'chore_swaps', 'chore_overrides', 'chore_done', 'house_rules'];

await check('B no ve nada de la casa A', async () => {
  for (const t of tables) {
    const col = t === 'households' ? 'id' : 'household_id';
    const { data, error } = await b.from(t).select('*').eq(col, ha.household_id);
    assert.ok(!error, `${t}: ${error?.message}`);
    assert.equal(data.length, 0, `${t} leaked`);
  }
});
await check('A ve lo suyo', async () => {
  assert.equal((await ok(a.from('shopping_items').select('id').eq('household_id', ha.household_id))).length, 1);
});
await check('anon no lee ninguna tabla', async () => {
  for (const t of tables) {
    const { data, error } = await anon.from(t).select('*').limit(1);
    assert.ok(error || data.length === 0, `${t} readable by anon`);
  }
});
await check('B no puede escribir en la casa A', async () => {
  const ins = await b.from('shopping_items').insert({ household_id: ha.household_id, name: 'Intruso' });
  assert.ok(ins.error, 'insert should fail');
  const upd = await b.from('shopping_items').update({ name: 'X' }).eq('id', id).select();
  assert.equal(upd.data?.length ?? 0, 0);
  const del = await b.from('shopping_items').delete().eq('id', id).select();
  assert.equal(del.data?.length ?? 0, 0);
  assert.equal((await ok(a.from('shopping_items').select('name').eq('id', id)))[0].name, 'Leche');
});
await check('las funciones rechazan otra casa', async () => {
  const m = new Date().toISOString().slice(0, 7);
  for (const [fn, args] of [
    ['period_summary', { p_household: ha.household_id, p_month: m }],
    ['close_period', { p_household: ha.household_id, p_month: m }],
    ['regenerate_invite_code', { p_household: ha.household_id }],
    ['add_purchase', { p_household: ha.household_id, p_description: 'x', p_amount_cents: 1, p_paid_by: ha.member_id, p_store: 'x', p_scope: 'common', p_client_id: crypto.randomUUID() }],
  ]) {
    const { error } = await b.rpc(fn, args);
    assert.ok(error, `${fn} should fail`);
  }
});
await check('nadie cambia el estado de un producto ni el código a mano', async () => {
  assert.ok((await a.from('shopping_items').update({ status: 'bought' }).eq('id', id)).error);
  assert.ok((await a.from('households').update({ invite_code: 'AAAAAA' }).eq('id', ha.household_id)).error);
});
await check('las funciones internas no se pueden llamar', async () => {
  assert.ok((await b.rpc('_new_invite_code')).error);
});
console.log(`\n${passed} comprobaciones superadas. Casas de prueba: ${ha.household_id}, ${hb.household_id}`);
