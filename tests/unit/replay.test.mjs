import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQueue, currentPeriod } from '../../js/replay.js';
import { suggestCategory } from '../../js/categories.js';

const base = () => ({
  household: { id: 'h' },
  periods: [{ id: 'p9', month: '2026-09', status: 'closed' }, { id: 'p10', month: '2026-10', status: 'open' }],
  items: [{ id: 'i1', client_id: 'i1', household_id: 'h', name: 'Leche', status: 'pending', purchase_id: null, scope: 'common', for_member_id: null }],
  purchases: [],
  rueda: { done: [] },
});

test('current period is the latest open month', () => {
  assert.equal(currentPeriod(base()).id, 'p10');
});

test('adding, buying offline, then retrying the same mutation never duplicates', () => {
  const add = { type: 'item.add', payload: { item: { id: 'i2', client_id: 'i2', household_id: 'h', name: 'Pan', scope: 'common' } } };
  const buy = { type: 'item.buy', payload: { item_id: 'i2', client_id: 'c1', amount_cents: 145, paid_by: 'm1', store: 'Dia', scope: 'common', purchased_at: '2026-10-16T10:00:00Z', created_by: 'm1' } };
  const s = applyQueue(base(), [add, buy, add, buy]);
  assert.equal(s.items.length, 2);
  assert.equal(s.purchases.length, 1);
  const pan = s.items.find((i) => i.id === 'i2');
  assert.equal(pan.status, 'bought');
  assert.equal(pan.purchase_id, 'c1');
  assert.equal(s.purchases[0].period_id, 'p10');
  assert.equal(s.purchases[0].pending, true);
});

test('buying something already bought is a no-op locally (server decides who wins)', () => {
  const s0 = base();
  s0.items[0] = { ...s0.items[0], status: 'bought', purchase_id: 'x' };
  const s = applyQueue(s0, [{ type: 'item.buy', payload: { item_id: 'i1', client_id: 'c9', amount_cents: 100, paid_by: 'm', scope: 'common' } }]);
  assert.equal(s.purchases.length, 0);
});

test('deleting a purchase puts its item back on the list', () => {
  const buy = { type: 'item.buy', payload: { item_id: 'i1', client_id: 'c1', amount_cents: 570, paid_by: 'm1', scope: 'common', purchased_at: 't' } };
  const del = { type: 'purchase.delete', payload: { id: 'c1', deleted_at: 't2' } };
  const s = applyQueue(base(), [buy, del]);
  assert.equal(s.items[0].status, 'pending');
  assert.equal(s.purchases[0].deleted_at, 't2');
});

test('personal purchases default to the payer', () => {
  const add = { type: 'purchase.add', payload: { client_id: 'c2', household_id: 'h', description: 'Café', amount_cents: 390, paid_by: 'm2', scope: 'personal', purchased_at: 't' } };
  const s = applyQueue(base(), [add]);
  assert.equal(s.purchases[0].for_member_id, 'm2');
});

test('edit, move, clear and mark chores done', () => {
  const s = applyQueue(base(), [
    { type: 'item.update', payload: { id: 'i1', patch: { list: 'urgent' } } },
    { type: 'chore.done', payload: { date: '2026-10-16', role: 'cook', task_id: null, member_id: 'm1', done: true, done_by: 'm1' } },
    { type: 'chore.done', payload: { date: '2026-10-16', role: 'cook', task_id: null, member_id: 'm1', done: true, done_by: 'm1' } },
  ]);
  assert.equal(s.items[0].list, 'urgent');
  assert.equal(s.rueda.done.length, 1);
  const cleared = applyQueue(s, [
    { type: 'items.clear', payload: { ids: ['i1'] } },
    { type: 'chore.done', payload: { date: '2026-10-16', role: 'cook', task_id: null, done: false } },
  ]);
  assert.equal(cleared.items.length, 0);
  assert.equal(cleared.rueda.done.length, 0);
});

test('category suggestions from the item name', () => {
  assert.equal(suggestCategory('Leche semidesnatada'), 'Lácteos y huevos');
  assert.equal(suggestCategory('Plátanos de Canarias'), 'Fruta y verdura');
  assert.equal(suggestCategory('Leche de avena'), 'Bebidas');
  assert.equal(suggestCategory('Pasta de dientes'), 'Higiene');
  assert.equal(suggestCategory('Macarrones'), 'Despensa');
  assert.equal(suggestCategory('Ternera'), 'Carne y pescado', '"te" must not match inside other words');
  assert.equal(suggestCategory('Guisantes congelados'), 'Congelados');
  assert.equal(suggestCategory('Cosa rara'), 'Otros');
});
