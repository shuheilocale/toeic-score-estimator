import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPosterior, updatePosterior } from '../js/irt.js';
import { selectNextItem } from '../js/select.js';

const bank = [
  { id: 'e1', a: 1.2, b: -2.0, c: 0.25 },
  { id: 'e2', a: 1.1, b: -1.0, c: 0.25 },
  { id: 'm1', a: 1.3, b: 0.0, c: 0.25 },
  { id: 'm2', a: 1.2, b: 0.5, c: 0.25 },
  { id: 'h1', a: 1.4, b: 1.5, c: 0.25 },
  { id: 'h2', a: 1.3, b: 2.4, c: 0.25 },
];

test('出題済みの問題は選ばれない', () => {
  const post = createPosterior();
  const picked = selectNextItem(bank, new Set(['m1', 'm2']), post);
  assert.ok(picked && picked.id !== 'm1' && picked.id !== 'm2');
});

test('全問出題済みなら null を返す', () => {
  const post = createPosterior();
  const all = new Set(bank.map((i) => i.id));
  assert.equal(selectNextItem(bank, all, post), null);
});

test('高能力の事後分布では難しい問題、低能力では易しい問題が選ばれる', () => {
  let high = createPosterior();
  let low = createPosterior();
  const probe = { a: 1.5, b: 0, c: 0.25 };
  for (let i = 0; i < 6; i++) {
    high = updatePosterior(high, probe, true);
    low = updatePosterior(low, probe, false);
  }
  const forHigh = selectNextItem(bank, new Set(), high);
  const forLow = selectNextItem(bank, new Set(), low);
  assert.ok(forHigh.b > forLow.b);
});
