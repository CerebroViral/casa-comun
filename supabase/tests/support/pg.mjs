// A local stand-in for a Supabase database: PGlite (real Postgres compiled to WASM) plus the bits of
// Supabase the schema relies on — the auth schema, auth.uid(), the anon/authenticated roles with
// Supabase's default grants, and the supabase_realtime publication. Used by the DB tests and by the
// fake Supabase server that the E2E tests run against.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const SUPABASE_STUB = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create publication supabase_realtime;
`;

export const schemaSql = () => readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8');

export async function createDb({ loadSchema = true } = {}) {
  // Like PostgREST, keep `date` values as 'YYYY-MM-DD' strings (OID 1082) instead of JS Dates.
  const db = new PGlite({ parsers: { 1082: (v) => v } });
  await db.exec(SUPABASE_STUB);
  if (loadSchema) await db.exec(schemaSql());
  return db;
}

export async function createUser(db, email) {
  const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
  return rows[0].id;
}

// Runs fn(tx) inside a transaction as the given user (role authenticated), or as anon when userId is null.
export async function asUser(db, userId, fn) {
  return db.transaction(async (tx) => {
    const role = userId ? 'authenticated' : 'anon';
    const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

// Convenience: one statement as a user, returning rows. Errors propagate.
export async function q(db, userId, sql, params = []) {
  return asUser(db, userId, async (tx) => (await tx.query(sql, params)).rows);
}
