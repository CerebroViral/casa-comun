# Casa Común — data model, security and server functions

Supabase Postgres, region EU (Frankfurt). All tables have RLS **enabled**. Write the schema as
`supabase/schema.sql` plus repeatable, non-destructive migrations in `supabase/migrations/`.
Money = `integer` cents. Timestamps = `timestamptz`. Periods use the Europe/Madrid calendar month.

## Tables (Phase 1)

```
households      id uuid pk, name text, invite_code text unique, settings jsonb
                ({show_calories:true, stores:["Mercadona","Dia"]}), created_by uuid, created_at
members         id uuid pk, household_id fk, user_id uuid null unique-per-household (null = child),
                display_name text (1–24), color text (one of 6 palette hexes), kind ('adult'|'child'),
                child_label ('niña'|'niño'|null), portion_factor numeric(3,2) default 1,
                shares_costs bool, active bool default true, created_at
shopping_items  id uuid pk, household_id, client_id uuid unique, name, quantity_text, category,
                list ('monthly'|'urgent'), scope ('common'|'personal'), for_member_id null,
                estimated_cents int null, catalog_item_id null (Phase 2), status ('pending'|'bought'),
                purchase_id null, added_by member, created_at, updated_at
purchases       id uuid pk, household_id, client_id uuid unique, period_id fk, description,
                amount_cents int > 0, paid_by member, store text, scope ('common'|'personal'),
                for_member_id null, item_id null, is_big_shop bool default false,
                purchased_at timestamptz, created_by member, created_at, deleted_at null (soft delete)
periods         id uuid pk, household_id, month text 'YYYY-MM', status ('open'|'closed'),
                closed_at, closed_by, snapshot jsonb null, unique(household_id, month)
transfers       id uuid pk, period_id, from_member, to_member, amount_cents, paid bool default false,
                paid_at null, marked_by null
frequent_items  view or table: name + count per household (for the "Frecuentes" chips)
audit_log       id, household_id, member_id, action text, details jsonb, created_at

-- La Rueda (chores)
chore_settings  household_id pk, start_date date (a Monday), participants uuid[] (ordered member ids),
                rotate_kitchen bool default true, batch_weekday int default 6 (0=Mon … 6=Sun),
                cleaning_weekday int default 5, cleaning_note text, created_at, updated_at
kitchen_template household_id, weekday int 0–6, cook_member, cleaner_member,
                pk(household_id, weekday), check(cook_member <> cleaner_member)
chore_tasks     id, household_id, name, icon text, sort int, active bool, links_to ('shopping'|null)
cleaning_grid   household_id, week_index int (0…n−1), task_id, member_id  (only when edited by hand;
                otherwise the Latin-square rule applies)
chore_overrides id, household_id, date date, role ('cook'|'kitchen_clean'|'task'), task_id null,
                member_id, source ('swap'|'manual'), swap_id null, created_by, created_at
chore_swaps     id, household_id, from_member, to_member, date, role, task_id null,
                exchange_date null, exchange_role null, exchange_task_id null,
                status ('pending'|'accepted'|'declined'|'expired'), created_at, answered_at
chore_done      id, household_id, date date (the day, or the week's Monday for weekly tasks), role,
                task_id null, member_id, done_by, done_at, unique(household_id, date, role, task_id)
house_rules     id, household_id, title text, body text, sort int
```

Members also get `in_chores bool` (default true for adults, false for children).

Assignments are **never stored per day**: a pure function
`assignmentsForWeek(settings, template, tasks, grid, overrides, weekMonday)` (one JS module, unit-tested,
used by the app; mirrored in SQL only if a server feature needs it) derives who does what from the inputs
above. Only overrides, swaps and done marks are rows.

## Tables (Phase 2) — see RECIPES-AI.md for the meaning of each column

```
catalog_items      global, read-only for users: id, name_es, aliases text[], category,
                   kcal_per_100g numeric null, edible_fraction numeric default 1,
                   unit ('g'|'ml'|'ud'), grams_per_unit numeric null, density numeric null,
                   kcal_source text, ref_price_cents int null, ref_price_qty numeric null,
                   ref_price_unit ('kg'|'l'|'ud'), ref_store text null, ref_price_date date null,
                   needs_review bool
household_prices   household_id, catalog_item_id, store, price_cents, qty, unit, observed_at,
                   purchase_id null   (learned from the family's own purchases)
meal_plans         id, household_id, kind ('single'|'week'|'month'), meals text[], adults int,
                   children int, budget_cents, preferences jsonb, total_cents, created_by, created_at
recipes            id, plan_id, household_id, day_index, meal ('breakfast'|'lunch'|'dinner'),
                   title, minutes, portions numeric (e.g. 4.5), steps jsonb, leftover_from uuid null,
                   cost_cents, kcal_total int null, kcal_per_portion int null, warnings jsonb
recipe_ingredients id, recipe_id, catalog_item_id null, name, grams numeric, qty_text,
                   cost_cents null, kcal int null,
                   price_source ('household'|'reference'|'ai_estimate'|'none'),
                   kcal_source ('catalog'|'ai_estimate'|'none'), at_home bool default false
ai_usage           household_id, day date, calls int   (daily cap)
```

## Row level security

- Helper `is_member(h uuid)`: `exists(select 1 from members where household_id=h and user_id=auth.uid()
  and active)`. Every household table: select/insert/update only `using (is_member(household_id))`.
- `members`: a user may update **only their own row's** `display_name` and `color`; adults may insert/update
  child rows of their household; `shares_costs`, `active`, `kind` change only through RPC.
- `purchases` of a **closed** period: no update/delete (enforced by trigger, not only RLS).
- `catalog_items`: select for authenticated, no writes from clients.
- `audit_log`: insert by RPCs only, select by members.
- No table is readable by `anon`.

## RPCs (security definer, `search_path` pinned, each validates membership first)

| RPC | Does |
| --- | --- |
| `create_household(name, display_name, color)` | creates household + first adult member + open period + invite code |
| `join_household(code, display_name, color)` | adds the caller as adult member; error `Código no válido` |
| `regenerate_invite_code(household)` | new code, logged |
| `mark_item_bought(item_id, amount_cents, paid_by, store, scope, client_id)` | atomically creates the purchase in the open period and marks the item; refuses if already bought, returning who bought it |
| `add_purchase(...)` | purchase without item (incl. big shop) |
| `period_summary(household, month)` | C, shares, paid, balances, transfers (computed with the exact rule in SPEC §4–5) |
| `close_period(household, month)` | stores snapshot + transfers, clears bought monthly items, opens next month; idempotent |
| `reopen_period(household, month)` | only the last closed one, logged |
| `mark_transfer_paid(transfer_id)` | records who and when |
| `save_rueda_setup(household, settings, template, tasks)` | creates/updates the rota; validates cook ≠ cleaner and that participants are members |
| `request_swap(...)` / `respond_swap(swap_id, accept)` | creates the request; on accept writes the override(s) atomically; only the addressee can answer |
| `mark_chore_done(date, role, task_id)` | the assigned person or any adult |

The split and transfer maths live in **one** place server-side (`period_summary`, SQL or plpgsql) and are
mirrored in a client JS module only to show offline estimates; both are covered by the same test vectors.
