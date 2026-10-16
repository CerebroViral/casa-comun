-- Migration 20261016000000 · Phase 1 (identical to schema.sql at the time of writing). Safe to re-run.
-- Casa Común — database schema, Phase 1 (compra, cuentas y La Rueda).
-- Supabase Postgres (15+). Safe to run more than once: every statement is idempotent and non-destructive.
-- Money is always integer cents. Periods are Europe/Madrid calendar months ('YYYY-MM').
-- Phase 2 tables (catalogue, recipes…) come in a later migration; columns that will point to them
-- (shopping_items.catalog_item_id) already exist without a foreign key.

-- ---------------------------------------------------------------------------------------------------------
-- Small pure helpers
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.madrid_month(ts timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(ts at time zone 'Europe/Madrid', 'YYYY-MM')
$$;

create or replace function public.next_month(m text) returns text
language sql immutable set search_path = public as $$
  select to_char((m || '-01')::date + interval '1 month', 'YYYY-MM')
$$;

create or replace function public.madrid_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Europe/Madrid')::date
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  settings    jsonb not null default '{"show_calories": true, "stores": ["Mercadona", "Dia"]}'::jsonb,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  display_name   text not null check (char_length(btrim(display_name)) between 1 and 24),
  color          text not null check (color in ('#1F5F7A', '#9A3412', '#4D5B2A', '#6B3F7A', '#A3245A', '#3B4540')),
  kind           text not null check (kind in ('adult', 'child')),
  child_label    text check (child_label in ('niña', 'niño')),
  portion_factor numeric(3, 2) not null default 1 check (portion_factor > 0 and portion_factor <= 1),
  shares_costs   boolean not null default true,
  in_chores      boolean not null default true,
  active         boolean not null default true,
  created_at     timestamptz not null default clock_timestamp(),
  constraint members_user_once unique (household_id, user_id),
  constraint members_child_has_no_account check (kind = 'adult' or user_id is null)
);
create index if not exists members_user_idx on public.members (user_id);

create table if not exists public.periods (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  month        text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status       text not null default 'open' check (status in ('open', 'closed')),
  closed_at    timestamptz,
  closed_by    uuid references public.members (id) on delete set null,
  snapshot     jsonb,
  created_at   timestamptz not null default now(),
  constraint periods_month_once unique (household_id, month)
);

create table if not exists public.shopping_items (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  client_id       uuid not null default gen_random_uuid() unique,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  quantity_text   text check (char_length(quantity_text) <= 40),
  category        text not null default 'Otros' check (category in (
                    'Fruta y verdura', 'Carne y pescado', 'Lácteos y huevos', 'Panadería', 'Despensa',
                    'Congelados', 'Bebidas', 'Limpieza y hogar', 'Higiene', 'Otros')),
  list            text not null default 'monthly' check (list in ('monthly', 'urgent')),
  scope           text not null default 'common' check (scope in ('common', 'personal')),
  for_member_id   uuid references public.members (id) on delete set null,
  estimated_cents integer check (estimated_cents >= 0 and estimated_cents <= 10000000),
  catalog_item_id uuid, -- Phase 2: references catalog_items(id)
  status          text not null default 'pending' check (status in ('pending', 'bought')),
  purchase_id     uuid,
  added_by        uuid references public.members (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists shopping_items_household_idx on public.shopping_items (household_id);

create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  client_id     uuid not null default gen_random_uuid() unique,
  period_id     uuid not null references public.periods (id) on delete restrict,
  description   text not null check (char_length(btrim(description)) between 1 and 80),
  -- Null only for a personal purchase whose price nobody typed (it never enters the split).
  amount_cents  integer check (amount_cents > 0 and amount_cents <= 10000000),
  paid_by       uuid not null references public.members (id),
  store         text check (char_length(store) <= 40),
  scope         text not null default 'common' check (scope in ('common', 'personal')),
  for_member_id uuid references public.members (id) on delete set null,
  item_id       uuid references public.shopping_items (id) on delete set null,
  is_big_shop   boolean not null default false,
  purchased_at  timestamptz not null default now(),
  created_by    uuid references public.members (id) on delete set null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint purchases_amount_required check (amount_cents is not null or scope = 'personal'),
  constraint purchases_big_shop_is_common check (not is_big_shop or scope = 'common')
);
create index if not exists purchases_period_idx on public.purchases (period_id);
create index if not exists purchases_household_idx on public.purchases (household_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shopping_items_purchase_fk') then
    alter table public.shopping_items add constraint shopping_items_purchase_fk
      foreign key (purchase_id) references public.purchases (id) on delete set null;
  end if;
end $$;

create table if not exists public.transfers (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  period_id    uuid not null references public.periods (id) on delete cascade,
  from_member  uuid not null references public.members (id),
  to_member    uuid not null references public.members (id),
  amount_cents integer not null check (amount_cents > 0),
  paid         boolean not null default false,
  paid_at      timestamptz,
  marked_by    uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint transfers_two_people check (from_member <> to_member)
);
create index if not exists transfers_period_idx on public.transfers (period_id);

-- Kept by a trigger on shopping_items, so counts survive list clean-ups (feeds the "Frecuentes" chips).
create table if not exists public.frequent_items (
  household_id  uuid not null references public.households (id) on delete cascade,
  name_key      text not null,
  name          text not null,
  category      text not null,
  times         integer not null default 1,
  last_added_at timestamptz not null default now(),
  primary key (household_id, name_key)
);

create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  member_id    uuid references public.members (id) on delete set null,
  action       text not null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_household_idx on public.audit_log (household_id, created_at desc);

-- La Rueda ------------------------------------------------------------------------------------------------

create table if not exists public.chore_settings (
  household_id     uuid primary key references public.households (id) on delete cascade,
  start_date       date not null check (extract(isodow from start_date) = 1),
  participants     uuid[] not null check (cardinality(participants) >= 2),
  rotate_kitchen   boolean not null default true,
  batch_weekday    integer not null default 6 check (batch_weekday between 0 and 6),
  cleaning_weekday integer not null default 5 check (cleaning_weekday between 0 and 6),
  cleaning_note    text not null default '30–45 min entre todos. La basura, cuando haga falta.'
                   check (char_length(cleaning_note) <= 160),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.kitchen_template (
  household_id   uuid not null references public.households (id) on delete cascade,
  weekday        integer not null check (weekday between 0 and 6),
  cook_member    uuid not null references public.members (id),
  cleaner_member uuid not null references public.members (id),
  primary key (household_id, weekday),
  constraint kitchen_template_two_people check (cook_member <> cleaner_member)
);

create table if not exists public.chore_tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  icon         text not null default 'sparkle' check (icon in ('bath', 'broom', 'sparkle', 'trash', 'cart', 'laundry', 'plant', 'dish')),
  sort         integer not null default 0,
  active       boolean not null default true,
  links_to     text check (links_to in ('shopping')),
  created_at   timestamptz not null default now()
);
create index if not exists chore_tasks_household_idx on public.chore_tasks (household_id);

create table if not exists public.cleaning_grid (
  household_id uuid not null references public.households (id) on delete cascade,
  week_index   integer not null check (week_index >= 0),
  task_id      uuid not null references public.chore_tasks (id) on delete cascade,
  member_id    uuid not null references public.members (id),
  primary key (household_id, week_index, task_id)
);

create table if not exists public.chore_swaps (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  from_member      uuid not null references public.members (id),
  to_member        uuid not null references public.members (id),
  date             date not null,
  role             text not null check (role in ('cook', 'kitchen_clean', 'task')),
  task_id          uuid references public.chore_tasks (id) on delete cascade,
  exchange_date    date,
  exchange_role    text check (exchange_role in ('cook', 'kitchen_clean', 'task')),
  exchange_task_id uuid references public.chore_tasks (id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at       timestamptz not null default now(),
  answered_at      timestamptz,
  constraint chore_swaps_two_people check (from_member <> to_member),
  constraint chore_swaps_task_role check ((role = 'task') = (task_id is not null)),
  constraint chore_swaps_exchange_complete check (
    (exchange_date is null and exchange_role is null and exchange_task_id is null)
    or (exchange_date is not null and exchange_role is not null
        and (exchange_role = 'task') = (exchange_task_id is not null)))
);
create index if not exists chore_swaps_household_idx on public.chore_swaps (household_id, status);

create table if not exists public.chore_overrides (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date         date not null,
  role         text not null check (role in ('cook', 'kitchen_clean', 'task')),
  task_id      uuid references public.chore_tasks (id) on delete cascade,
  member_id    uuid not null references public.members (id),
  source       text not null check (source in ('swap', 'manual')),
  swap_id      uuid references public.chore_swaps (id) on delete set null,
  created_by   uuid references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint chore_overrides_task_role check ((role = 'task') = (task_id is not null)),
  constraint chore_overrides_slot unique nulls not distinct (household_id, date, role, task_id)
);

create table if not exists public.chore_done (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date         date not null, -- the day, or the week's Monday for weekly tasks
  role         text not null check (role in ('cook', 'kitchen_clean', 'task')),
  task_id      uuid references public.chore_tasks (id) on delete cascade,
  member_id    uuid not null references public.members (id),
  done_by      uuid references public.members (id) on delete set null,
  done_at      timestamptz not null default now(),
  constraint chore_done_task_role check ((role = 'task') = (task_id is not null)),
  constraint chore_done_slot unique nulls not distinct (household_id, date, role, task_id)
);

create table if not exists public.house_rules (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 60),
  body         text not null default '' check (char_length(body) <= 300),
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists house_rules_household_idx on public.house_rules (household_id);

-- ---------------------------------------------------------------------------------------------------------
-- Membership helpers (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = h and user_id = auth.uid() and active)
$$;

create or replace function public.my_member_id(h uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where household_id = h and user_id = auth.uid() and active limit 1
$$;

-- Raises unless the caller is an active adult of the household; returns the caller's member id.
create or replace function public._require_member(h uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'No has iniciado sesión.', errcode = '42501';
  end if;
  v_me := public.my_member_id(h);
  if v_me is null then
    raise exception using message = 'No perteneces a esta casa.', errcode = '42501';
  end if;
  return v_me;
end $$;

create or replace function public._log(h uuid, m uuid, a text, d jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (household_id, member_id, action, details) values (h, m, a, coalesce(d, '{}'::jsonb))
$$;

create or replace function public._new_invite_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no O, 0, I, 1
  v_code text;
  v_bytes bytea;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.households where invite_code = v_code);
  end loop;
  return v_code;
end $$;

-- The household's current open period (latest open month). Creates the current month if none is open.
create or replace function public._current_period(h uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.periods where household_id = h and status = 'open' order by month desc limit 1;
  if v_id is null then
    insert into public.periods (household_id, month) values (h, public.madrid_month(now()))
    on conflict (household_id, month) do nothing;
    select id into v_id from public.periods where household_id = h and status = 'open' order by month desc limit 1;
    if v_id is null then
      raise exception using message = 'No hay ningún mes abierto. Reabre el último mes.', errcode = 'P0001';
    end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------------------

-- Every member id stored in a row must belong to that row's household. Column names come as trigger args.
create or replace function public._check_members_same_household() returns trigger
language plpgsql security definer set search_path = public as $$
declare col text; v uuid;
begin
  foreach col in array TG_ARGV loop
    v := (to_jsonb(NEW) ->> col)::uuid;
    if v is not null and not exists (select 1 from public.members where id = v and household_id = NEW.household_id) then
      raise exception using message = 'Esa persona no es de esta casa.', errcode = 'P0001';
    end if;
  end loop;
  return NEW;
end $$;

create or replace function public._check_task_same_household() returns trigger
language plpgsql security definer set search_path = public as $$
declare col text; v uuid;
begin
  foreach col in array TG_ARGV loop
    v := (to_jsonb(NEW) ->> col)::uuid;
    if v is not null and not exists (select 1 from public.chore_tasks where id = v and household_id = NEW.household_id) then
      raise exception using message = 'Esa tarea no es de esta casa.', errcode = 'P0001';
    end if;
  end loop;
  return NEW;
end $$;

create or replace function public._members_normalise() returns trigger
language plpgsql set search_path = public as $$
begin
  NEW.display_name := btrim(NEW.display_name);
  if NEW.kind = 'adult' then NEW.child_label := null; end if;
  return NEW;
end $$;

create or replace function public._items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  NEW.name := btrim(NEW.name);
  if TG_OP = 'INSERT' then
    v_me := public.my_member_id(NEW.household_id);
    if v_me is not null then NEW.added_by := v_me; end if;
    if NEW.scope = 'personal' and NEW.for_member_id is null then NEW.for_member_id := NEW.added_by; end if;
  else
    NEW.updated_at := now();
  end if;
  if NEW.scope = 'common' then NEW.for_member_id := null; end if;
  return NEW;
end $$;

create or replace function public._items_count_frequent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.frequent_items (household_id, name_key, name, category, times, last_added_at)
  values (NEW.household_id, lower(btrim(NEW.name)), btrim(NEW.name), NEW.category, 1, now())
  on conflict (household_id, name_key) do update
    set times = public.frequent_items.times + 1, name = excluded.name,
        category = excluded.category, last_added_at = now();
  return NEW;
end $$;

-- Purchases of a closed month are frozen (only the item link may be cleared when an item is deleted).
create or replace function public._purchases_guard_closed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if TG_OP = 'UPDATE' then
    if (to_jsonb(NEW) - 'item_id') = (to_jsonb(OLD) - 'item_id') then
      return NEW;
    end if;
    if NEW.period_id is distinct from OLD.period_id then
      raise exception using message = 'Una compra no puede cambiar de mes.', errcode = 'P0001';
    end if;
  end if;
  if TG_OP = 'INSERT' then
    select status into v_status from public.periods where id = NEW.period_id;
  else
    select status into v_status from public.periods where id = OLD.period_id;
  end if;
  if v_status = 'closed' then
    raise exception using message = 'Ese mes está cerrado. Para cambiarlo, reabre el mes.', errcode = 'P0001';
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  if NEW.scope = 'common' then NEW.for_member_id := null; end if;
  NEW.description := btrim(NEW.description);
  return NEW;
end $$;

-- Deleting (soft) a purchase puts its list item back to pending; restoring it marks it bought again.
create or replace function public._purchases_sync_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.item_id is null then return NEW; end if;
  if OLD.deleted_at is null and NEW.deleted_at is not null then
    update public.shopping_items set status = 'pending', purchase_id = null
     where id = NEW.item_id and purchase_id = NEW.id;
  elsif OLD.deleted_at is not null and NEW.deleted_at is null then
    update public.shopping_items set status = 'bought', purchase_id = NEW.id
     where id = NEW.item_id and status = 'pending';
  end if;
  return NEW;
end $$;

create or replace function public._touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists members_normalise on public.members;
create trigger members_normalise before insert or update on public.members
  for each row execute function public._members_normalise();

drop trigger if exists items_before_write on public.shopping_items;
create trigger items_before_write before insert or update on public.shopping_items
  for each row execute function public._items_before_write();
drop trigger if exists items_members on public.shopping_items;
create trigger items_members before insert or update on public.shopping_items
  for each row execute function public._check_members_same_household('for_member_id', 'added_by');
drop trigger if exists items_count_frequent on public.shopping_items;
create trigger items_count_frequent after insert on public.shopping_items
  for each row execute function public._items_count_frequent();

drop trigger if exists purchases_guard_closed on public.purchases;
create trigger purchases_guard_closed before insert or update or delete on public.purchases
  for each row execute function public._purchases_guard_closed();
drop trigger if exists purchases_members on public.purchases;
create trigger purchases_members before insert or update on public.purchases
  for each row execute function public._check_members_same_household('paid_by', 'for_member_id', 'created_by');
drop trigger if exists purchases_sync_item on public.purchases;
create trigger purchases_sync_item after update of deleted_at on public.purchases
  for each row execute function public._purchases_sync_item();

drop trigger if exists transfers_members on public.transfers;
create trigger transfers_members before insert or update on public.transfers
  for each row execute function public._check_members_same_household('from_member', 'to_member', 'marked_by');

drop trigger if exists chore_settings_touch on public.chore_settings;
create trigger chore_settings_touch before update on public.chore_settings
  for each row execute function public._touch_updated_at();
drop trigger if exists kitchen_template_members on public.kitchen_template;
create trigger kitchen_template_members before insert or update on public.kitchen_template
  for each row execute function public._check_members_same_household('cook_member', 'cleaner_member');
drop trigger if exists cleaning_grid_members on public.cleaning_grid;
create trigger cleaning_grid_members before insert or update on public.cleaning_grid
  for each row execute function public._check_members_same_household('member_id');
drop trigger if exists cleaning_grid_task on public.cleaning_grid;
create trigger cleaning_grid_task before insert or update on public.cleaning_grid
  for each row execute function public._check_task_same_household('task_id');
drop trigger if exists chore_overrides_members on public.chore_overrides;
create trigger chore_overrides_members before insert or update on public.chore_overrides
  for each row execute function public._check_members_same_household('member_id', 'created_by');
drop trigger if exists chore_overrides_task on public.chore_overrides;
create trigger chore_overrides_task before insert or update on public.chore_overrides
  for each row execute function public._check_task_same_household('task_id');
drop trigger if exists chore_swaps_members on public.chore_swaps;
create trigger chore_swaps_members before insert or update on public.chore_swaps
  for each row execute function public._check_members_same_household('from_member', 'to_member');
drop trigger if exists chore_swaps_task on public.chore_swaps;
create trigger chore_swaps_task before insert or update on public.chore_swaps
  for each row execute function public._check_task_same_household('task_id', 'exchange_task_id');
drop trigger if exists chore_done_members on public.chore_done;
create trigger chore_done_members before insert or update on public.chore_done
  for each row execute function public._check_members_same_household('member_id', 'done_by');
drop trigger if exists chore_done_task on public.chore_done;
create trigger chore_done_task before insert or update on public.chore_done
  for each row execute function public._check_task_same_household('task_id');

-- ---------------------------------------------------------------------------------------------------------
-- Split and transfer maths (SPEC §4–5). Mirrored in js/money.js; both run the same test vectors.
-- ---------------------------------------------------------------------------------------------------------

-- Greedy settlement: the largest debtor pays the largest creditor, repeat. Ties go to the earlier person
-- in the given order. Balances are in cents and must add up to zero.
create or replace function public._greedy_transfers(p_ids uuid[], p_bal bigint[])
returns table (from_member uuid, to_member uuid, amount_cents bigint)
language plpgsql immutable set search_path = public as $$
declare
  bal bigint[] := p_bal;
  n integer := coalesce(array_length(p_ids, 1), 0);
  d integer; c integer; amt bigint; guard integer := 0;
begin
  loop
    d := null; c := null;
    for i in 1..n loop
      if bal[i] < 0 and (d is null or bal[i] < bal[d]) then d := i; end if;
      if bal[i] > 0 and (c is null or bal[i] > bal[c]) then c := i; end if;
    end loop;
    exit when d is null or c is null;
    amt := least(-bal[d], bal[c]);
    from_member := p_ids[d]; to_member := p_ids[c]; amount_cents := amt;
    return next;
    bal[d] := bal[d] + amt;
    bal[c] := bal[c] - amt;
    guard := guard + 1;
    exit when guard > 1000;
  end loop;
end $$;

-- Live numbers of a period: C, shares (floor + 1 cent to the first members in order), paid, balances.
-- People = members with shares_costs (in created_at order) plus anyone else who paid a common purchase.
create or replace function public._period_numbers(p_period_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_h uuid;
  v_total bigint; v_big bigint; v_has_big boolean;
  v_ids uuid[]; v_n integer; v_base bigint := 0; v_rem bigint := 0;
  v_people jsonb := '[]'::jsonb;
  v_share bigint;
  r record;
begin
  select household_id into v_h from public.periods where id = p_period_id;
  select coalesce(sum(amount_cents), 0),
         coalesce(sum(amount_cents) filter (where is_big_shop), 0),
         coalesce(bool_or(is_big_shop), false)
    into v_total, v_big, v_has_big
    from public.purchases
   where period_id = p_period_id and scope = 'common' and deleted_at is null;

  select array_agg(id order by created_at, id) into v_ids
    from public.members where household_id = v_h and shares_costs and active;
  v_ids := coalesce(v_ids, '{}'::uuid[]);
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n > 0 then
    v_base := v_total / v_n;
    v_rem := v_total % v_n;
  end if;

  for r in
    with paid as (
      select paid_by,
             sum(amount_cents) as paid,
             coalesce(sum(amount_cents) filter (where not is_big_shop), 0) as before_big
        from public.purchases
       where period_id = p_period_id and scope = 'common' and deleted_at is null
       group by paid_by
    )
    select m.id, (m.id = any (v_ids)) as sharer, array_position(v_ids, m.id) as pos, m.created_at,
           coalesce(p.paid, 0) as paid, coalesce(p.before_big, 0) as before_big
      from public.members m
      left join paid p on p.paid_by = m.id
     where m.household_id = v_h and ((m.id = any (v_ids)) or coalesce(p.paid, 0) > 0)
     order by (m.id = any (v_ids)) desc, array_position(v_ids, m.id), m.created_at, m.id
  loop
    v_share := case when r.sharer then v_base + case when r.pos <= v_rem then 1 else 0 end else 0 end;
    v_people := v_people || jsonb_build_object(
      'member_id', r.id,
      'shares_costs', r.sharer,
      'share_cents', v_share,
      'paid_cents', r.paid,
      'paid_before_big_cents', r.before_big,
      'balance_cents', r.paid - v_share);
  end loop;

  return jsonb_build_object(
    'total_cents', v_total,
    'during_cents', v_total - v_big,
    'big_shop_cents', v_big,
    'has_big_shop', v_has_big,
    'big_shop_payers', coalesce((select jsonb_agg(distinct paid_by) from public.purchases
                                  where period_id = p_period_id and is_big_shop and deleted_at is null), '[]'::jsonb),
    'sharers_count', v_n,
    'people', v_people);
end $$;

-- Keeps the transfers table in line with the period's balances. Paid transfers are money already moved:
-- they are kept and counted, and the remaining debts are settled greedily. Unpaid rows that still match
-- keep their id (so "Marcar pagado" from another phone still works).
create or replace function public._sync_transfers(p_period_id uuid, p_numbers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_h uuid;
  v_ids uuid[] := '{}'; v_bal bigint[] := '{}';
  p jsonb; t record; i integer;
begin
  select household_id into v_h from public.periods where id = p_period_id;
  for p in select * from jsonb_array_elements(p_numbers -> 'people') loop
    v_ids := v_ids || (p ->> 'member_id')::uuid;
    v_bal := v_bal || (p ->> 'balance_cents')::bigint;
  end loop;
  for t in select from_member, to_member, amount_cents from public.transfers where period_id = p_period_id and paid loop
    i := array_position(v_ids, t.from_member);
    if i is null then v_ids := v_ids || t.from_member; v_bal := v_bal || 0::bigint; i := array_length(v_ids, 1); end if;
    v_bal[i] := v_bal[i] + t.amount_cents;
    i := array_position(v_ids, t.to_member);
    if i is null then v_ids := v_ids || t.to_member; v_bal := v_bal || 0::bigint; i := array_length(v_ids, 1); end if;
    v_bal[i] := v_bal[i] - t.amount_cents;
  end loop;

  delete from public.transfers tr
   where tr.period_id = p_period_id and not tr.paid
     and not exists (select 1 from public._greedy_transfers(v_ids, v_bal) w
                      where w.from_member = tr.from_member and w.to_member = tr.to_member
                        and w.amount_cents = tr.amount_cents);
  insert into public.transfers (household_id, period_id, from_member, to_member, amount_cents)
  select v_h, p_period_id, w.from_member, w.to_member, w.amount_cents
    from public._greedy_transfers(v_ids, v_bal) w
   where not exists (select 1 from public.transfers tr
                      where tr.period_id = p_period_id and not tr.paid
                        and tr.from_member = w.from_member and tr.to_member = w.to_member
                        and tr.amount_cents = w.amount_cents);
end $$;

create or replace function public._period_transfers(p_period_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'from_member', from_member, 'to_member', to_member, 'amount_cents', amount_cents,
           'paid', paid, 'paid_at', paid_at, 'marked_by', marked_by) order by paid, amount_cents desc, created_at), '[]'::jsonb)
    from public.transfers where period_id = p_period_id
$$;

-- ---------------------------------------------------------------------------------------------------------
-- RPCs (the only way to create households, join, buy, close months and set up La Rueda)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.create_household(p_name text, p_display_name text, p_color text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_h uuid; v_m uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'No has iniciado sesión.', errcode = '42501';
  end if;
  insert into public.households (name, invite_code, created_by)
  values (btrim(p_name), public._new_invite_code(), auth.uid())
  returning id into v_h;
  insert into public.members (household_id, user_id, display_name, color, kind, portion_factor, shares_costs, in_chores)
  values (v_h, auth.uid(), p_display_name, p_color, 'adult', 1, true, true)
  returning id into v_m;
  insert into public.periods (household_id, month) values (v_h, public.madrid_month(now()));
  perform public._log(v_h, v_m, 'household.create', jsonb_build_object('name', p_name));
  return jsonb_build_object('household_id', v_h, 'member_id', v_m);
end $$;

create or replace function public.join_household(p_code text, p_display_name text, p_color text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_h uuid; v_m uuid;
begin
  if auth.uid() is null then
    raise exception using message = 'No has iniciado sesión.', errcode = '42501';
  end if;
  select id into v_h from public.households where invite_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if v_h is null then
    raise exception using message = 'Código no válido', errcode = 'P0001';
  end if;
  select id into v_m from public.members where household_id = v_h and user_id = auth.uid();
  if v_m is not null then
    update public.members set active = true where id = v_m;
  else
    insert into public.members (household_id, user_id, display_name, color, kind, portion_factor, shares_costs, in_chores)
    values (v_h, auth.uid(), p_display_name, p_color, 'adult', 1, true, true)
    returning id into v_m;
    perform public._log(v_h, v_m, 'member.join', jsonb_build_object('display_name', p_display_name));
  end if;
  return jsonb_build_object('household_id', v_h, 'member_id', v_m);
end $$;

create or replace function public.regenerate_invite_code(p_household uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_code text;
begin
  v_me := public._require_member(p_household);
  v_code := public._new_invite_code();
  update public.households set invite_code = v_code where id = p_household;
  perform public._log(p_household, v_me, 'invite_code.regenerate');
  return v_code;
end $$;

create or replace function public.add_child(p_household uuid, p_display_name text, p_color text, p_child_label text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_id uuid;
begin
  v_me := public._require_member(p_household);
  insert into public.members (household_id, user_id, display_name, color, kind, child_label, portion_factor, shares_costs, in_chores)
  values (p_household, null, p_display_name, p_color, 'child', p_child_label, 0.5, false, false)
  returning id into v_id;
  perform public._log(p_household, v_me, 'member.add_child', jsonb_build_object('member_id', v_id));
  return v_id;
end $$;

-- Advanced settings: who shares costs; deactivating a child (adults leave by themselves, not handled here).
create or replace function public.set_member_flags(p_member_id uuid, p_shares_costs boolean default null, p_active boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_m public.members;
begin
  select * into v_m from public.members where id = p_member_id;
  if v_m.id is null then
    raise exception using message = 'Esa persona no existe.', errcode = 'P0001';
  end if;
  v_me := public._require_member(v_m.household_id);
  if p_active is not null and v_m.kind = 'adult' then
    raise exception using message = 'Solo se puede quitar a niños desde aquí.', errcode = 'P0001';
  end if;
  update public.members
     set shares_costs = coalesce(p_shares_costs, shares_costs),
         active = coalesce(p_active, active)
   where id = p_member_id;
  perform public._log(v_m.household_id, v_me, 'member.flags',
    jsonb_build_object('member_id', p_member_id, 'shares_costs', p_shares_costs, 'active', p_active));
end $$;

create or replace function public.mark_item_bought(
  p_item_id uuid, p_amount_cents integer, p_paid_by uuid, p_store text, p_scope text, p_client_id uuid,
  p_for_member_id uuid default null, p_purchased_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid; v_item public.shopping_items; v_existing public.purchases; v_period uuid; v_pid uuid; v_by text;
begin
  select * into v_existing from public.purchases where client_id = p_client_id;
  select * into v_item from public.shopping_items where id = p_item_id for update;
  if v_item.id is null then
    if v_existing.id is not null then
      return jsonb_build_object('status', 'ok', 'purchase_id', v_existing.id, 'duplicate', true);
    end if;
    raise exception using message = 'Ese producto ya no está en la lista.', errcode = 'P0001';
  end if;
  v_me := public._require_member(v_item.household_id);
  if v_existing.id is not null then
    if v_existing.household_id <> v_item.household_id then
      raise exception using message = 'Compra duplicada.', errcode = 'P0001';
    end if;
    return jsonb_build_object('status', 'ok', 'purchase_id', v_existing.id, 'duplicate', true);
  end if;
  if v_item.status = 'bought' then
    select m.display_name into v_by
      from public.purchases p join public.members m on m.id = coalesce(p.created_by, p.paid_by)
     where p.id = v_item.purchase_id;
    return jsonb_build_object('status', 'already_bought', 'by', coalesce(v_by, 'Alguien'), 'purchase_id', v_item.purchase_id);
  end if;
  if p_scope not in ('common', 'personal') then
    raise exception using message = 'Elige Común o Personal.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.members where id = p_paid_by and household_id = v_item.household_id and kind = 'adult' and active) then
    raise exception using message = 'Elige quién lo pagó.', errcode = 'P0001';
  end if;
  if p_amount_cents is null and p_scope = 'common' then
    raise exception using message = 'Escribe cuánto costó.', errcode = 'P0001';
  end if;
  v_period := public._current_period(v_item.household_id);
  insert into public.purchases (household_id, client_id, period_id, description, amount_cents, paid_by, store, scope,
                                for_member_id, item_id, purchased_at, created_by)
  values (v_item.household_id, p_client_id, v_period, v_item.name, p_amount_cents, p_paid_by, nullif(btrim(p_store), ''),
          p_scope, case when p_scope = 'personal' then coalesce(p_for_member_id, v_item.for_member_id, p_paid_by) end,
          v_item.id, coalesce(p_purchased_at, now()), v_me)
  returning id into v_pid;
  update public.shopping_items set status = 'bought', purchase_id = v_pid where id = v_item.id;
  return jsonb_build_object('status', 'ok', 'purchase_id', v_pid);
end $$;

create or replace function public.add_purchase(
  p_household uuid, p_description text, p_amount_cents integer, p_paid_by uuid, p_store text, p_scope text,
  p_client_id uuid, p_for_member_id uuid default null, p_is_big_shop boolean default false,
  p_purchased_at timestamptz default null, p_month text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_existing uuid; v_period uuid; v_pid uuid;
begin
  v_me := public._require_member(p_household);
  select id into v_existing from public.purchases where client_id = p_client_id and household_id = p_household;
  if v_existing is not null then
    return jsonb_build_object('status', 'ok', 'purchase_id', v_existing, 'duplicate', true);
  end if;
  if not exists (select 1 from public.members where id = p_paid_by and household_id = p_household and kind = 'adult' and active) then
    raise exception using message = 'Elige quién lo pagó.', errcode = 'P0001';
  end if;
  if p_month is not null then
    select id into v_period from public.periods where household_id = p_household and month = p_month and status = 'open';
    if v_period is null then
      raise exception using message = 'Ese mes está cerrado. Para cambiarlo, reabre el mes.', errcode = 'P0001';
    end if;
  else
    v_period := public._current_period(p_household);
  end if;
  insert into public.purchases (household_id, client_id, period_id, description, amount_cents, paid_by, store, scope,
                                for_member_id, is_big_shop, purchased_at, created_by)
  values (p_household, p_client_id, v_period, p_description, p_amount_cents, p_paid_by, nullif(btrim(p_store), ''),
          p_scope, case when p_scope = 'personal' then coalesce(p_for_member_id, p_paid_by) end,
          coalesce(p_is_big_shop, false), coalesce(p_purchased_at, now()), v_me)
  returning id into v_pid;
  return jsonb_build_object('status', 'ok', 'purchase_id', v_pid);
end $$;

-- C, shares, paid, balances and transfers of a month. Open months are computed live (and their transfers
-- kept in sync); closed months return the snapshot frozen at closing plus the transfers' paid state.
create or replace function public.period_summary(p_household uuid, p_month text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_p public.periods; v_numbers jsonb;
begin
  perform public._require_member(p_household);
  select * into v_p from public.periods where household_id = p_household and month = p_month;
  if v_p.id is null then
    raise exception using message = 'Ese mes no existe.', errcode = 'P0001';
  end if;
  if v_p.status = 'closed' and v_p.snapshot is not null then
    v_numbers := v_p.snapshot;
  else
    v_numbers := public._period_numbers(v_p.id);
    perform public._sync_transfers(v_p.id, v_numbers);
  end if;
  return v_numbers || jsonb_build_object(
    'period_id', v_p.id, 'month', v_p.month, 'status', v_p.status, 'closed_at', v_p.closed_at,
    'closed_by', v_p.closed_by, 'transfers', public._period_transfers(v_p.id));
end $$;

create or replace function public.close_period(p_household uuid, p_month text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_p public.periods; v_numbers jsonb; v_people jsonb; v_next text;
begin
  v_me := public._require_member(p_household);
  select * into v_p from public.periods where household_id = p_household and month = p_month for update;
  if v_p.id is null then
    raise exception using message = 'Ese mes no existe.', errcode = 'P0001';
  end if;
  if v_p.status = 'closed' then
    return jsonb_build_object('status', 'already_closed', 'month', p_month);
  end if;

  v_numbers := public._period_numbers(v_p.id);
  perform public._sync_transfers(v_p.id, v_numbers);
  -- Freeze names and colours as they were, so history reads the same even if someone renames later.
  select coalesce(jsonb_agg(p || jsonb_build_object('display_name', m.display_name, 'color', m.color)
                            order by ord), '[]'::jsonb)
    into v_people
    from jsonb_array_elements(v_numbers -> 'people') with ordinality as x(p, ord)
    join public.members m on m.id = (p ->> 'member_id')::uuid;
  v_numbers := jsonb_set(v_numbers, '{people}', v_people)
               || jsonb_build_object('transfers_at_close', public._period_transfers(v_p.id));

  delete from public.shopping_items
   where household_id = p_household and list = 'monthly' and status = 'bought';
  update public.periods
     set status = 'closed', closed_at = now(), closed_by = v_me, snapshot = v_numbers
   where id = v_p.id;
  v_next := public.next_month(p_month);
  insert into public.periods (household_id, month) values (p_household, v_next)
  on conflict (household_id, month) do nothing;
  perform public._log(p_household, v_me, 'period.close', jsonb_build_object('month', p_month, 'total_cents', v_numbers -> 'total_cents'));
  return jsonb_build_object('status', 'closed', 'month', p_month, 'next_month', v_next);
end $$;

create or replace function public.reopen_period(p_household uuid, p_month text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_last text; v_next public.periods;
begin
  v_me := public._require_member(p_household);
  select max(month) into v_last from public.periods where household_id = p_household and status = 'closed';
  if v_last is null or v_last <> p_month then
    raise exception using message = 'Solo se puede reabrir el último mes cerrado.', errcode = 'P0001';
  end if;
  update public.periods set status = 'open', closed_at = null, closed_by = null, snapshot = null
   where household_id = p_household and month = p_month;
  -- If the following month was opened by the closing and nothing was recorded in it yet, remove it.
  select * into v_next from public.periods
   where household_id = p_household and month = public.next_month(p_month) and status = 'open';
  if v_next.id is not null
     and not exists (select 1 from public.purchases where period_id = v_next.id)
     and not exists (select 1 from public.transfers where period_id = v_next.id) then
    delete from public.periods where id = v_next.id;
  end if;
  perform public._log(p_household, v_me, 'period.reopen', jsonb_build_object('month', p_month));
  return jsonb_build_object('status', 'open', 'month', p_month);
end $$;

create or replace function public.mark_transfer_paid(p_transfer_id uuid, p_paid boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_transfer_id for update;
  if v_t.id is null then
    raise exception using message = 'Las cuentas han cambiado. Vuelve a abrir el cierre.', errcode = 'P0001';
  end if;
  v_me := public._require_member(v_t.household_id);
  update public.transfers
     set paid = p_paid,
         paid_at = case when p_paid then now() end,
         marked_by = case when p_paid then v_me end
   where id = p_transfer_id;
  perform public._log(v_t.household_id, v_me, case when p_paid then 'transfer.paid' else 'transfer.unpaid' end,
    jsonb_build_object('transfer_id', p_transfer_id, 'amount_cents', v_t.amount_cents));
  return jsonb_build_object('status', 'ok');
end $$;

-- La Rueda ------------------------------------------------------------------------------------------------

-- p_settings: {start_date, participants[], rotate_kitchen, batch_weekday, cleaning_weekday, cleaning_note}
-- p_template: [{weekday, cook_member, cleaner_member}] × 7
-- p_tasks:    [{id?, name, icon, links_to}] in display order, or null to leave tasks as they are
create or replace function public.save_rueda_setup(p_household uuid, p_settings jsonb, p_template jsonb, p_tasks jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid; v_participants uuid[]; v_start date; v_row jsonb; v_task jsonb; v_keep uuid[] := '{}'; v_id uuid;
  v_sort integer := 0; v_cook uuid; v_clean uuid; v_days integer[] := '{}';
begin
  v_me := public._require_member(p_household);
  select array_agg(value::uuid order by ord) into v_participants
    from jsonb_array_elements_text(p_settings -> 'participants') with ordinality as x(value, ord);
  if v_participants is null or cardinality(v_participants) < 2 then
    raise exception using message = 'La Rueda necesita al menos dos personas.', errcode = 'P0001';
  end if;
  if (select count(distinct x) from unnest(v_participants) x) <> cardinality(v_participants) then
    raise exception using message = 'Cada persona solo puede estar una vez.', errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_participants) x
              where not exists (select 1 from public.members m where m.id = x and m.household_id = p_household and m.active)) then
    raise exception using message = 'Esa persona no es de esta casa.', errcode = 'P0001';
  end if;
  v_start := (p_settings ->> 'start_date')::date;
  if v_start is null or extract(isodow from v_start) <> 1 then
    raise exception using message = 'La Rueda tiene que empezar en lunes.', errcode = 'P0001';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_template, '[]'::jsonb)) loop
    v_cook := (v_row ->> 'cook_member')::uuid;
    v_clean := (v_row ->> 'cleaner_member')::uuid;
    if v_cook is null or v_clean is null or not (v_cook = any (v_participants)) or not (v_clean = any (v_participants)) then
      raise exception using message = 'Falta alguien en el cuadro de cocina.', errcode = 'P0001';
    end if;
    if v_cook = v_clean then
      raise exception using message = 'La misma persona no puede cocinar y limpiar la cocina el mismo día.', errcode = 'P0001';
    end if;
    v_days := v_days || (v_row ->> 'weekday')::integer;
  end loop;
  if (select array_agg(d order by d) from unnest(v_days) d) is distinct from array[0, 1, 2, 3, 4, 5, 6] then
    raise exception using message = 'El cuadro de cocina tiene que tener los 7 días.', errcode = 'P0001';
  end if;

  insert into public.chore_settings (household_id, start_date, participants, rotate_kitchen, batch_weekday, cleaning_weekday, cleaning_note)
  values (p_household, v_start, v_participants,
          coalesce((p_settings ->> 'rotate_kitchen')::boolean, true),
          coalesce((p_settings ->> 'batch_weekday')::integer, 6),
          coalesce((p_settings ->> 'cleaning_weekday')::integer, 5),
          coalesce(p_settings ->> 'cleaning_note', '30–45 min entre todos. La basura, cuando haga falta.'))
  on conflict (household_id) do update
    set start_date = excluded.start_date, participants = excluded.participants,
        rotate_kitchen = excluded.rotate_kitchen, batch_weekday = excluded.batch_weekday,
        cleaning_weekday = excluded.cleaning_weekday, cleaning_note = excluded.cleaning_note;

  delete from public.kitchen_template where household_id = p_household;
  insert into public.kitchen_template (household_id, weekday, cook_member, cleaner_member)
  select p_household, (r ->> 'weekday')::integer, (r ->> 'cook_member')::uuid, (r ->> 'cleaner_member')::uuid
    from jsonb_array_elements(p_template) r;

  if p_tasks is not null then
    for v_task in select * from jsonb_array_elements(p_tasks) loop
      v_id := nullif(v_task ->> 'id', '')::uuid;
      if v_id is not null and exists (select 1 from public.chore_tasks where id = v_id and household_id = p_household) then
        update public.chore_tasks
           set name = btrim(v_task ->> 'name'), icon = coalesce(v_task ->> 'icon', icon), sort = v_sort, active = true,
               links_to = nullif(v_task ->> 'links_to', '')
         where id = v_id;
      else
        insert into public.chore_tasks (household_id, name, icon, sort, active, links_to)
        values (p_household, btrim(v_task ->> 'name'), coalesce(v_task ->> 'icon', 'sparkle'), v_sort, true,
                nullif(v_task ->> 'links_to', ''))
        returning id into v_id;
      end if;
      v_keep := v_keep || v_id;
      v_sort := v_sort + 1;
    end loop;
    update public.chore_tasks set active = false where household_id = p_household and not (id = any (v_keep));
  end if;

  update public.members set in_chores = (id = any (v_participants)) where household_id = p_household;
  -- A hand-edited cleaning grid only makes sense for the current participants.
  delete from public.cleaning_grid
   where household_id = p_household
     and (week_index >= cardinality(v_participants) or not (member_id = any (v_participants)));
  perform public._log(p_household, v_me, 'rueda.setup', jsonb_build_object('participants', to_jsonb(v_participants)));
end $$;

create or replace function public.request_swap(
  p_household uuid, p_date date, p_role text, p_task_id uuid, p_to_member uuid,
  p_exchange_date date default null, p_exchange_role text default null, p_exchange_task_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_id uuid;
begin
  v_me := public._require_member(p_household);
  if p_date < public.madrid_today() then
    raise exception using message = 'Ese turno ya ha pasado.', errcode = 'P0001';
  end if;
  if p_to_member = v_me then
    raise exception using message = 'Elige a otra persona.', errcode = 'P0001';
  end if;
  if not exists (select 1 from public.members where id = p_to_member and household_id = p_household
                   and kind = 'adult' and user_id is not null and active) then
    raise exception using message = 'Esa persona no puede recibir cambios.', errcode = 'P0001';
  end if;
  update public.chore_swaps set status = 'expired', answered_at = now()
   where household_id = p_household and status = 'pending' and date < public.madrid_today();
  insert into public.chore_swaps (household_id, from_member, to_member, date, role, task_id,
                                  exchange_date, exchange_role, exchange_task_id)
  values (p_household, v_me, p_to_member, p_date, p_role, p_task_id, p_exchange_date, p_exchange_role, p_exchange_task_id)
  returning id into v_id;
  perform public._log(p_household, v_me, 'swap.request', jsonb_build_object('swap_id', v_id));
  return v_id;
end $$;

create or replace function public.respond_swap(p_swap_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_s public.chore_swaps; v_me uuid;
begin
  select * into v_s from public.chore_swaps where id = p_swap_id for update;
  if v_s.id is null then
    raise exception using message = 'Esa petición ya no existe.', errcode = 'P0001';
  end if;
  v_me := public._require_member(v_s.household_id);
  if v_s.to_member <> v_me then
    raise exception using message = 'Solo la persona a la que se lo piden puede contestar.', errcode = '42501';
  end if;
  if v_s.status <> 'pending' then
    return jsonb_build_object('status', v_s.status);
  end if;
  if v_s.date < public.madrid_today() then
    update public.chore_swaps set status = 'expired', answered_at = now() where id = v_s.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if p_accept then
    insert into public.chore_overrides (household_id, date, role, task_id, member_id, source, swap_id, created_by)
    values (v_s.household_id, v_s.date, v_s.role, v_s.task_id, v_s.to_member, 'swap', v_s.id, v_me)
    on conflict on constraint chore_overrides_slot do update
      set member_id = excluded.member_id, source = 'swap', swap_id = excluded.swap_id,
          created_by = excluded.created_by, created_at = now();
    if v_s.exchange_date is not null then
      insert into public.chore_overrides (household_id, date, role, task_id, member_id, source, swap_id, created_by)
      values (v_s.household_id, v_s.exchange_date, v_s.exchange_role, v_s.exchange_task_id, v_s.from_member, 'swap', v_s.id, v_me)
      on conflict on constraint chore_overrides_slot do update
        set member_id = excluded.member_id, source = 'swap', swap_id = excluded.swap_id,
            created_by = excluded.created_by, created_at = now();
    end if;
  end if;
  update public.chore_swaps set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
   where id = v_s.id;
  perform public._log(v_s.household_id, v_me, case when p_accept then 'swap.accept' else 'swap.decline' end,
    jsonb_build_object('swap_id', v_s.id));
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end $$;

-- Any adult can hand a single turn to someone else (logged). The base rotation never changes.
create or replace function public.reassign_chore(p_household uuid, p_date date, p_role text, p_task_id uuid, p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := public._require_member(p_household);
  insert into public.chore_overrides (household_id, date, role, task_id, member_id, source, created_by)
  values (p_household, p_date, p_role, p_task_id, p_member, 'manual', v_me)
  on conflict on constraint chore_overrides_slot do update
    set member_id = excluded.member_id, source = 'manual', swap_id = null,
        created_by = excluded.created_by, created_at = now();
  perform public._log(p_household, v_me, 'rueda.reassign',
    jsonb_build_object('date', p_date, 'role', p_role, 'task_id', p_task_id, 'member_id', p_member));
end $$;

create or replace function public.mark_chore_done(
  p_household uuid, p_date date, p_role text, p_task_id uuid, p_member uuid, p_done boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := public._require_member(p_household);
  if p_done then
    insert into public.chore_done (household_id, date, role, task_id, member_id, done_by)
    values (p_household, p_date, p_role, p_task_id, p_member, v_me)
    on conflict on constraint chore_done_slot do update
      set member_id = excluded.member_id, done_by = excluded.done_by, done_at = now();
  else
    delete from public.chore_done
     where household_id = p_household and date = p_date and role = p_role and task_id is not distinct from p_task_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------------------

alter table public.households       enable row level security;
alter table public.members          enable row level security;
alter table public.periods          enable row level security;
alter table public.shopping_items   enable row level security;
alter table public.purchases        enable row level security;
alter table public.transfers        enable row level security;
alter table public.frequent_items   enable row level security;
alter table public.audit_log        enable row level security;
alter table public.chore_settings   enable row level security;
alter table public.kitchen_template enable row level security;
alter table public.chore_tasks      enable row level security;
alter table public.cleaning_grid    enable row level security;
alter table public.chore_swaps      enable row level security;
alter table public.chore_overrides  enable row level security;
alter table public.chore_done       enable row level security;
alter table public.house_rules      enable row level security;

-- Nothing is readable by anon. Authenticated users get exactly the grants below; RLS narrows to their house.
revoke all on table
  public.households, public.members, public.periods, public.shopping_items, public.purchases, public.transfers,
  public.frequent_items, public.audit_log, public.chore_settings, public.kitchen_template, public.chore_tasks,
  public.cleaning_grid, public.chore_swaps, public.chore_overrides, public.chore_done, public.house_rules
  from anon, authenticated;

grant select on table
  public.households, public.members, public.periods, public.shopping_items, public.purchases, public.transfers,
  public.frequent_items, public.audit_log, public.chore_settings, public.kitchen_template, public.chore_tasks,
  public.cleaning_grid, public.chore_swaps, public.chore_overrides, public.chore_done, public.house_rules
  to authenticated;

grant update (name, settings) on public.households to authenticated;
grant update (display_name, color, child_label) on public.members to authenticated;
grant insert (id, household_id, client_id, name, quantity_text, category, list, scope, for_member_id, estimated_cents, added_by)
  on public.shopping_items to authenticated;
grant update (name, quantity_text, category, list, scope, for_member_id, estimated_cents)
  on public.shopping_items to authenticated;
grant delete on public.shopping_items to authenticated;
grant update (description, amount_cents, paid_by, store, scope, for_member_id, is_big_shop, purchased_at, deleted_at)
  on public.purchases to authenticated;
grant update (rotate_kitchen, batch_weekday, cleaning_weekday, cleaning_note) on public.chore_settings to authenticated;
grant insert (id, household_id, name, icon, sort, active, links_to) on public.chore_tasks to authenticated;
grant update (name, icon, sort, active, links_to) on public.chore_tasks to authenticated;
grant insert, update, delete on public.cleaning_grid to authenticated;
grant insert (id, household_id, title, body, sort) on public.house_rules to authenticated;
grant update (title, body, sort) on public.house_rules to authenticated;
grant delete on public.house_rules to authenticated;

do $$
declare t text;
begin
  -- Plain "members of the house can read" policy on every household table.
  foreach t in array array['members', 'periods', 'shopping_items', 'purchases', 'transfers', 'frequent_items',
                           'audit_log', 'chore_settings', 'kitchen_template', 'chore_tasks', 'cleaning_grid',
                           'chore_swaps', 'chore_overrides', 'chore_done', 'house_rules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(household_id))',
                   t || '_select', t);
  end loop;
  -- Tables members may write directly (column grants above limit what they can touch).
  foreach t in array array['shopping_items', 'chore_tasks', 'cleaning_grid', 'house_rules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member(household_id))',
                   t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id))',
                   t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_member(household_id))',
                   t || '_delete', t);
  end loop;
end $$;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated using (public.is_member(id));
drop policy if exists households_update on public.households;
create policy households_update on public.households for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

-- Each person edits only their own name and colour; any adult may edit a child's profile.
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (user_id = auth.uid() or (kind = 'child' and public.is_member(household_id)))
  with check (user_id = auth.uid() or (kind = 'child' and public.is_member(household_id)));

drop policy if exists purchases_update on public.purchases;
create policy purchases_update on public.purchases for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists chore_settings_update on public.chore_settings;
create policy chore_settings_update on public.chore_settings for update to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- ---------------------------------------------------------------------------------------------------------
-- Function privileges: internal helpers are not callable from the API; the RPCs are, by signed-in users.
-- ---------------------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_member(uuid),
  public.my_member_id(uuid),
  public.madrid_month(timestamptz),
  public.next_month(text),
  public.madrid_today(),
  public.create_household(text, text, text),
  public.join_household(text, text, text),
  public.regenerate_invite_code(uuid),
  public.add_child(uuid, text, text, text),
  public.set_member_flags(uuid, boolean, boolean),
  public.mark_item_bought(uuid, integer, uuid, text, text, uuid, uuid, timestamptz),
  public.add_purchase(uuid, text, integer, uuid, text, text, uuid, uuid, boolean, timestamptz, text),
  public.period_summary(uuid, text),
  public.close_period(uuid, text),
  public.reopen_period(uuid, text),
  public.mark_transfer_paid(uuid, boolean),
  public.save_rueda_setup(uuid, jsonb, jsonb, jsonb),
  public.request_swap(uuid, date, text, uuid, uuid, date, text, uuid),
  public.respond_swap(uuid, boolean),
  public.reassign_chore(uuid, date, text, uuid, uuid),
  public.mark_chore_done(uuid, date, text, uuid, uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Realtime: changes the app listens to (filtered by household in the client; RLS still applies).
-- ---------------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['households', 'members', 'periods', 'shopping_items', 'purchases', 'transfers',
                             'chore_settings', 'kitchen_template', 'chore_tasks', 'cleaning_grid',
                             'chore_overrides', 'chore_swaps', 'chore_done', 'house_rules'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
