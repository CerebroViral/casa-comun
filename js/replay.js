// Offline changes. Each mutation in the local queue is applied on top of the last server snapshot, so
// the screen always shows what the person did even before the server confirms it. Pure functions.

export const MUTATION_TYPES = [
  'item.add', 'item.update', 'item.delete', 'items.clear', 'item.buy',
  'purchase.add', 'purchase.update', 'purchase.delete', 'chore.done', 'member.update', 'household.update',
];

// The open period new purchases go to: the latest open month (same rule as SQL _current_period).
export function currentPeriod(snap) {
  const open = (snap.periods ?? []).filter((p) => p.status === 'open');
  open.sort((a, b) => (a.month < b.month ? 1 : -1));
  return open[0] ?? null;
}

export function applyMutation(snap, m) {
  const p = m.payload;
  switch (m.type) {
    case 'item.add': {
      if (snap.items.some((i) => i.client_id === p.item.client_id || i.id === p.item.id)) return snap;
      // p.local holds fields the server sets itself (created_at), used only until the snapshot arrives.
      return { ...snap, items: [...snap.items, { status: 'pending', purchase_id: null, ...p.local, ...p.item }] };
    }
    case 'item.update':
      return { ...snap, items: snap.items.map((i) => (i.id === p.id ? { ...i, ...p.patch } : i)) };
    case 'item.delete':
      return { ...snap, items: snap.items.filter((i) => i.id !== p.id) };
    case 'items.clear':
      return { ...snap, items: snap.items.filter((i) => !p.ids.includes(i.id)) };
    case 'item.buy': {
      const item = snap.items.find((i) => i.id === p.item_id);
      if (!item || item.status === 'bought') return snap;
      if (snap.purchases.some((x) => x.client_id === p.client_id)) return snap;
      const period = currentPeriod(snap);
      const purchase = {
        id: p.client_id,
        client_id: p.client_id,
        household_id: item.household_id,
        period_id: period?.id ?? null,
        description: item.name,
        amount_cents: p.amount_cents,
        paid_by: p.paid_by,
        store: p.store,
        scope: p.scope,
        for_member_id: p.scope === 'personal' ? (p.for_member_id ?? item.for_member_id ?? p.paid_by) : null,
        item_id: item.id,
        is_big_shop: false,
        purchased_at: p.purchased_at,
        created_by: p.created_by,
        created_at: p.purchased_at,
        deleted_at: null,
        pending: true,
      };
      return {
        ...snap,
        items: snap.items.map((i) => (i.id === item.id ? { ...i, status: 'bought', purchase_id: purchase.id } : i)),
        purchases: [...snap.purchases, purchase],
      };
    }
    case 'purchase.add': {
      if (snap.purchases.some((x) => x.client_id === p.client_id)) return snap;
      const period = p.month
        ? (snap.periods ?? []).find((x) => x.month === p.month && x.status === 'open')
        : currentPeriod(snap);
      const purchase = {
        id: p.client_id,
        client_id: p.client_id,
        household_id: p.household_id,
        period_id: period?.id ?? null,
        description: p.description,
        amount_cents: p.amount_cents,
        paid_by: p.paid_by,
        store: p.store,
        scope: p.scope,
        for_member_id: p.scope === 'personal' ? (p.for_member_id ?? p.paid_by) : null,
        item_id: null,
        is_big_shop: !!p.is_big_shop,
        purchased_at: p.purchased_at,
        created_by: p.created_by,
        created_at: p.purchased_at,
        deleted_at: null,
        pending: true,
      };
      return { ...snap, purchases: [...snap.purchases, purchase] };
    }
    case 'purchase.update':
      return {
        ...snap,
        purchases: snap.purchases.map((x) => (x.id === p.id ? { ...x, ...p.patch } : x)),
      };
    case 'purchase.delete': {
      const target = snap.purchases.find((x) => x.id === p.id);
      if (!target) return snap;
      return {
        ...snap,
        purchases: snap.purchases.map((x) => (x.id === p.id ? { ...x, deleted_at: p.deleted_at } : x)),
        items: snap.items.map((i) => (i.id === target.item_id && i.purchase_id === target.id
          ? { ...i, status: 'pending', purchase_id: null } : i)),
      };
    }
    case 'member.update':
      return { ...snap, members: snap.members.map((x) => (x.id === p.id ? { ...x, ...p.patch } : x)) };
    case 'household.update':
      return { ...snap, household: { ...snap.household, ...p.patch } };
    case 'chore.done': {
      const done = (snap.rueda?.done ?? []).filter((d) => !(d.date === p.date && d.role === p.role
        && (d.task_id ?? null) === (p.task_id ?? null)));
      if (p.done) done.push({ date: p.date, role: p.role, task_id: p.task_id ?? null, member_id: p.member_id, done_by: p.done_by });
      return { ...snap, rueda: { ...snap.rueda, done } };
    }
    default:
      return snap;
  }
}

export function applyQueue(snap, queue) {
  return queue.reduce((s, m) => applyMutation(s, m), snap);
}
