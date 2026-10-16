import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseMoney, formatEuros, formatAmount, centsToInput, splitShares, periodNumbers, greedyTransfers, pendingTransfers, sum,
} from '../../js/money.js';

const vectors = JSON.parse(readFileSync(new URL('../vectors/split.json', import.meta.url)));
const NBSP = ' ';

test('parseMoney accepts the Spanish ways of typing an amount', () => {
  assert.equal(parseMoney('5,58'), 558);
  assert.equal(parseMoney('5.58'), 558);
  assert.equal(parseMoney('1.234,50'), 123450);
  assert.equal(parseMoney('1,234.50'), 123450);
  assert.equal(parseMoney('1.234'), 123400);
  assert.equal(parseMoney('12.345.678,90'), 1234567890);
  assert.equal(parseMoney('5'), 500);
  assert.equal(parseMoney('5,5'), 550);
  assert.equal(parseMoney('0,99'), 99);
  assert.equal(parseMoney(' 5,58 € '), 558);
  assert.equal(parseMoney('5,58 €'), 558);
  assert.equal(parseMoney('12.5'), 1250);
});

test('parseMoney refuses what it cannot read for sure', () => {
  for (const bad of ['', '   ', 'abc', '5,555', '-5', '5,5,5', '1.23.4', '1,2345', '5€5', null, undefined, '1.234.5']) {
    assert.equal(parseMoney(bad), null, `"${bad}" should be refused`);
  }
});

test('formatEuros uses es-ES with comma decimals, dot thousands, and a real minus', () => {
  assert.equal(formatEuros(558), `5,58${NBSP}€`);
  assert.equal(formatEuros(123450), `1.234,50${NBSP}€`);
  assert.equal(formatEuros(4375, { sign: true }), `+43,75${NBSP}€`);
  assert.equal(formatEuros(-1125, { sign: true }), `−11,25${NBSP}€`);
  assert.equal(formatEuros(0, { sign: true }), `0,00${NBSP}€`);
  assert.equal(formatEuros(18640, { whole: true, approx: true }), `≈${NBSP}186${NBSP}€`);
  assert.equal(formatEuros(null), 'sin datos');
  assert.equal(formatAmount(15000), '150,00');
  assert.equal(centsToInput(558), '5,58');
  assert.equal(centsToInput(null), '');
});

test('splitShares adds up exactly, remainder to the first members', () => {
  for (const total of [0, 1, 2, 3, 99, 100, 101, 1001, 10003, 99999, 123457]) {
    for (const n of [1, 2, 3, 4, 5, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const shares = [...splitShares(total, ids).values()];
      assert.equal(sum(shares), total, `total ${total} among ${n}`);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
      assert.deepEqual(shares, [...shares].sort((a, b) => b - a), 'bigger shares first');
    }
  }
  assert.deepEqual([...splitShares(10, []).values()], []);
});

for (const v of vectors) {
  test(`split vector: ${v.name}`, () => {
    const members = v.members.map((m) => ({ id: m.key, created_at: m.created_at, shares_costs: m.shares_costs, active: true }));
    const purchases = v.purchases.map((p) => ({
      amount_cents: p.amount_cents, paid_by: p.paid_by, scope: p.scope,
      is_big_shop: !!p.is_big_shop, deleted_at: p.deleted ? '2026-10-20T10:00:00Z' : null,
    }));
    const n = periodNumbers(members, purchases);
    const e = v.expected;
    assert.equal(n.total_cents, e.total_cents);
    assert.equal(n.during_cents, e.during_cents);
    assert.equal(n.big_shop_cents, e.big_shop_cents);
    assert.equal(n.has_big_shop, e.has_big_shop);
    assert.equal(n.sharers_count, e.sharers_count);
    assert.deepEqual(n.people.map((p) => ({
      key: p.member_id, share_cents: p.share_cents, paid_cents: p.paid_cents,
      paid_before_big_cents: p.paid_before_big_cents, balance_cents: p.balance_cents,
    })), e.people);
    assert.equal(sum(n.people.map((p) => p.balance_cents)), 0, 'balances add up to zero');
    const transfers = pendingTransfers(n.people);
    assert.deepEqual(transfers.map((t) => ({ from: t.from_member, to: t.to_member, amount_cents: t.amount_cents })), e.transfers);
  });
}

test('greedy transfers settle every balance exactly', () => {
  const entries = [
    { id: 'a', balance: 1234 }, { id: 'b', balance: -500 }, { id: 'c', balance: -734 },
    { id: 'd', balance: 300 }, { id: 'e', balance: -300 },
  ];
  const out = greedyTransfers(entries);
  const after = Object.fromEntries(entries.map((e) => [e.id, e.balance]));
  for (const t of out) { after[t.from_member] += t.amount_cents; after[t.to_member] -= t.amount_cents; }
  assert.ok(Object.values(after).every((b) => b === 0));
  assert.ok(out.length <= entries.length - 1, 'at most n−1 transfers');
  assert.deepEqual(out[0], { from_member: 'c', to_member: 'a', amount_cents: 734 }, 'largest debtor pays largest creditor first');
});

test('paid transfers count as money already moved', () => {
  const people = [
    { member_id: 'J', balance_cents: 38500 }, { member_id: 'E', balance_cents: -12500 },
    { member_id: 'H', balance_cents: -11000 }, { member_id: 'C', balance_cents: -15000 },
  ];
  const rest = pendingTransfers(people, [{ from_member: 'C', to_member: 'J', amount_cents: 15000 }]);
  assert.deepEqual(rest, [
    { from_member: 'E', to_member: 'J', amount_cents: 12500 },
    { from_member: 'H', to_member: 'J', amount_cents: 11000 },
  ]);
  // Someone paid a bit less than asked: only the difference is left.
  const partial = pendingTransfers(people, [{ from_member: 'C', to_member: 'J', amount_cents: 10000 }]);
  assert.deepEqual(partial[0], { from_member: 'E', to_member: 'J', amount_cents: 12500 });
  assert.equal(sum(partial.map((t) => t.amount_cents)), 38500 - 10000);
});
