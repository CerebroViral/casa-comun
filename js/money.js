// Money is always integer cents. This module mirrors the server maths in supabase/schema.sql
// (_period_numbers, _greedy_transfers); both are checked against tests/vectors/split.json.

const NBSP = ' ';
const MINUS = '−';

const fmt2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const fmt0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });

// Parses what people type: "5,58", "5.58", "1.234,50", "1,234.50", "5", "5 €". Returns cents or null.
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/[\s ]/g, '').replace(/^€|(€|eur|euros)$/i, '');
  if (s === '') return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart; let decPart = '';
  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    const i = s.lastIndexOf(decSep);
    intPart = s.slice(0, i);
    decPart = s.slice(i + 1);
    if (intPart.includes(decSep) || !validGroups(intPart, thouSep)) return null;
    intPart = intPart.split(thouSep).join('');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length === 2 && parts[1].length !== 3) {
      [intPart, decPart] = parts;
    } else if (parts.length === 2 && sep === ',') {
      // "5,555" is not a sensible amount in Spain; "1,234" is ambiguous — refuse rather than guess.
      return null;
    } else if (validGroups(s, sep)) {
      intPart = parts.join(''); // "1.234" or "1.234.567" — thousands
    } else {
      return null;
    }
  } else {
    intPart = s;
  }
  if (intPart === '' || !/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(decPart)) return null;
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

function validGroups(s, sep) {
  const parts = s.split(sep);
  if (parts.length === 1) return /^\d+$/.test(s);
  return /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((p) => /^\d{3}$/.test(p));
}

// 558 → "5,58 €"; with { sign: true } → "+5,58 €" / "−5,58 €"; { whole: true } → "186 €".
export function formatEuros(cents, { sign = false, whole = false, approx = false } = {}) {
  if (cents === null || cents === undefined) return 'sin datos';
  const abs = Math.abs(cents);
  const body = whole ? fmt0.format(Math.round(abs / 100)) : fmt2.format(abs / 100);
  let prefix = '';
  if (cents < 0) prefix = MINUS;
  else if (sign && cents > 0) prefix = '+';
  return `${approx ? `≈${NBSP}` : ''}${prefix}${body}${NBSP}€`;
}

// "150,00" without the euro sign (used in "150,00 − 80,00 ya adelantado").
export function formatAmount(cents) {
  return (cents < 0 ? MINUS : '') + fmt2.format(Math.abs(cents) / 100);
}

// For an input field: 558 → "5,58".
export function centsToInput(cents) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

// Splits total cents between ids (already in order): floor each, the first `total mod n` get +1 cent.
export function splitShares(totalCents, orderedIds) {
  const n = orderedIds.length;
  const shares = new Map();
  if (n === 0) return shares;
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  orderedIds.forEach((id, i) => shares.set(id, base + (i < rem ? 1 : 0)));
  return shares;
}

// Same rule as public._period_numbers. members: [{id, created_at, shares_costs, active}],
// purchases: [{amount_cents, paid_by, scope, is_big_shop, deleted_at}] of one period.
export function periodNumbers(members, purchases) {
  const common = purchases.filter((p) => p.scope === 'common' && !p.deleted_at && p.amount_cents);
  const total = sum(common.map((p) => p.amount_cents));
  const big = sum(common.filter((p) => p.is_big_shop).map((p) => p.amount_cents));
  const byOrder = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sharers = members.filter((m) => m.shares_costs && m.active !== false).sort(byOrder);
  const sharerIds = sharers.map((m) => m.id);
  const shares = splitShares(total, sharerIds);
  const paid = new Map();
  const before = new Map();
  for (const p of common) {
    paid.set(p.paid_by, (paid.get(p.paid_by) ?? 0) + p.amount_cents);
    if (!p.is_big_shop) before.set(p.paid_by, (before.get(p.paid_by) ?? 0) + p.amount_cents);
  }
  const others = members
    .filter((m) => !sharerIds.includes(m.id) && (paid.get(m.id) ?? 0) > 0)
    .sort(byOrder);
  const people = [...sharers, ...others].map((m) => {
    const share = shares.get(m.id) ?? 0;
    const paidCents = paid.get(m.id) ?? 0;
    return {
      member_id: m.id,
      shares_costs: sharerIds.includes(m.id),
      share_cents: share,
      paid_cents: paidCents,
      paid_before_big_cents: before.get(m.id) ?? 0,
      balance_cents: paidCents - share,
    };
  });
  return {
    total_cents: total,
    during_cents: total - big,
    big_shop_cents: big,
    has_big_shop: common.some((p) => p.is_big_shop),
    big_shop_payers: [...new Set(common.filter((p) => p.is_big_shop).map((p) => p.paid_by))],
    sharers_count: sharerIds.length,
    people,
  };
}

// Largest debtor pays largest creditor, repeat. entries: [{id, balance}] in order (ties → earlier).
export function greedyTransfers(entries) {
  const bal = entries.map((e) => e.balance);
  const out = [];
  for (let guard = 0; guard < 1000; guard++) {
    let d = -1; let c = -1;
    for (let i = 0; i < bal.length; i++) {
      if (bal[i] < 0 && (d < 0 || bal[i] < bal[d])) d = i;
      if (bal[i] > 0 && (c < 0 || bal[i] > bal[c])) c = i;
    }
    if (d < 0 || c < 0) break;
    const amount = Math.min(-bal[d], bal[c]);
    out.push({ from_member: entries[d].id, to_member: entries[c].id, amount_cents: amount });
    bal[d] += amount;
    bal[c] -= amount;
  }
  return out;
}

// Transfers still to make, counting the ones already paid as money moved (mirrors _sync_transfers).
export function pendingTransfers(people, paidTransfers = []) {
  const entries = people.map((p) => ({ id: p.member_id, balance: p.balance_cents }));
  const idx = (id) => {
    let i = entries.findIndex((e) => e.id === id);
    if (i < 0) { entries.push({ id, balance: 0 }); i = entries.length - 1; }
    return i;
  };
  for (const t of paidTransfers) {
    entries[idx(t.from_member)].balance += t.amount_cents;
    entries[idx(t.to_member)].balance -= t.amount_cents;
  }
  return greedyTransfers(entries);
}

export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
