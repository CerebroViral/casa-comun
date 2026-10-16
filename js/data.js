// Reads the household from Supabase into one snapshot object, and runs queued mutations on the server.
import { sb } from './supabase-client.js';
import { addDays, madridDate } from './periods.js';

function check({ data, error, status }) {
  if (error) {
    const e = new Error(error.message);
    e.supabase = error;
    e.status = status;
    throw e;
  }
  return data;
}

// The household this user belongs to (first active membership), or null.
export async function myMembership(userId) {
  const rows = check(await sb.from('members').select('id, household_id, created_at')
    .eq('user_id', userId).eq('active', true).order('created_at', { ascending: false }).limit(1));
  return rows[0] ?? null;
}

export async function fetchSnapshot(userId) {
  const me = await myMembership(userId);
  if (!me) return { household: null, me_id: null };
  const h = me.household_id;
  const today = madridDate();
  const since = addDays(today, -70);
  const [household, members, periods, items, frequent, settings, template, tasks, grid, overrides, swaps, done, rules] = await Promise.all([
    sb.from('households').select('*').eq('id', h).single().then(check),
    sb.from('members').select('*').eq('household_id', h).order('created_at').then(check),
    sb.from('periods').select('id, household_id, month, status, closed_at, closed_by').eq('household_id', h).order('month', { ascending: false }).then(check),
    sb.from('shopping_items').select('*').eq('household_id', h).order('created_at').then(check),
    sb.from('frequent_items').select('name, category, times').eq('household_id', h).order('times', { ascending: false }).order('last_added_at', { ascending: false }).limit(12).then(check),
    sb.from('chore_settings').select('*').eq('household_id', h).maybeSingle().then(check),
    sb.from('kitchen_template').select('*').eq('household_id', h).then(check),
    sb.from('chore_tasks').select('*').eq('household_id', h).order('sort').then(check),
    sb.from('cleaning_grid').select('*').eq('household_id', h).then(check),
    sb.from('chore_overrides').select('*').eq('household_id', h).gte('date', since).then(check),
    sb.from('chore_swaps').select('*').eq('household_id', h).gte('date', since).then(check),
    sb.from('chore_done').select('*').eq('household_id', h).gte('date', since).then(check),
    sb.from('house_rules').select('*').eq('household_id', h).order('sort').order('created_at').then(check),
  ]);
  const openIds = periods.filter((p) => p.status === 'open').map((p) => p.id);
  const linked = items.map((i) => i.purchase_id).filter(Boolean);
  const [inOpen, ofItems] = await Promise.all([
    openIds.length ? sb.from('purchases').select('*').in('period_id', openIds).order('purchased_at').then(check) : [],
    linked.length ? sb.from('purchases').select('*').in('id', linked).then(check) : [],
  ]);
  const purchases = [...inOpen];
  for (const p of ofItems) if (!purchases.some((x) => x.id === p.id)) purchases.push(p);
  return {
    fetched_at: new Date().toISOString(),
    household,
    me_id: me.id,
    members,
    periods,
    items,
    purchases,
    frequent,
    rueda: { settings, template, tasks, grid, overrides, swaps, done, rules },
  };
}

// Executes one queued mutation. Returns { ok: true, result } or throws (with .supabase / .status).
export async function runMutation(m, snap) {
  const p = m.payload;
  switch (m.type) {
    case 'item.add':
      return check(await sb.from('shopping_items').upsert(p.item, { onConflict: 'client_id', ignoreDuplicates: true }));
    case 'item.update':
      return check(await sb.from('shopping_items').update(p.patch).eq('id', p.id));
    case 'item.delete':
      return check(await sb.from('shopping_items').delete().eq('id', p.id));
    case 'items.clear':
      return check(await sb.from('shopping_items').delete().in('id', p.ids));
    case 'item.buy':
      return check(await sb.rpc('mark_item_bought', {
        p_item_id: p.item_id, p_amount_cents: p.amount_cents, p_paid_by: p.paid_by, p_store: p.store,
        p_scope: p.scope, p_client_id: p.client_id, p_for_member_id: p.for_member_id ?? null,
        p_purchased_at: p.purchased_at,
      }));
    case 'purchase.add':
      return check(await sb.rpc('add_purchase', {
        p_household: p.household_id, p_description: p.description, p_amount_cents: p.amount_cents,
        p_paid_by: p.paid_by, p_store: p.store, p_scope: p.scope, p_client_id: p.client_id,
        p_for_member_id: p.for_member_id ?? null, p_is_big_shop: !!p.is_big_shop, p_purchased_at: p.purchased_at,
        p_month: p.month ?? null,
      }));
    case 'purchase.update': {
      const id = serverPurchaseId(snap, p.id);
      return check(await sb.from('purchases').update(p.patch).eq('id', id));
    }
    case 'purchase.delete': {
      const id = serverPurchaseId(snap, p.id);
      return check(await sb.from('purchases').update({ deleted_at: p.deleted_at }).eq('id', id));
    }
    case 'member.update':
      return check(await sb.from('members').update(p.patch).eq('id', p.id));
    case 'household.update':
      return check(await sb.from('households').update(p.patch).eq('id', p.id));
    case 'chore.done':
      return check(await sb.rpc('mark_chore_done', {
        p_household: p.household_id, p_date: p.date, p_role: p.role, p_task_id: p.task_id ?? null,
        p_member: p.member_id, p_done: p.done,
      }));
    default:
      throw new Error(`Unknown mutation ${m.type}`);
  }
}

// A purchase created offline is known locally by its client_id until the server snapshot arrives.
function serverPurchaseId(snap, id) {
  const found = snap?.purchases?.find((x) => x.id === id || x.client_id === id);
  return found && !found.pending ? found.id : id;
}

export async function rpc(name, args) {
  return check(await sb.rpc(name, args));
}

export async function periodPurchases(periodId) {
  return check(await sb.from('purchases').select('*').eq('period_id', periodId).order('purchased_at', { ascending: false }));
}

export async function closedPeriods(householdId) {
  return check(await sb.from('periods').select('*').eq('household_id', householdId).eq('status', 'closed').order('month', { ascending: false }));
}

export async function periodTransfers(periodIds) {
  if (!periodIds.length) return [];
  return check(await sb.from('transfers').select('*').in('period_id', periodIds));
}

export { check };
