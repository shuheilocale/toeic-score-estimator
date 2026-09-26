import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPosterior, updatePosterior } from '../js/irt.js';
import { selectNextItem, listeningPool } from '../js/select.js';

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

test('高能力の事後分布では難しい問題、低能力では易しい問題が選ばれる(rng固定)', () => {
  let high = createPosterior();
  let low = createPosterior();
  const probe = { a: 1.5, b: 0, c: 0.25 };
  for (let i = 0; i < 6; i++) {
    high = updatePosterior(high, probe, true);
    low = updatePosterior(low, probe, false);
  }
  const top1 = () => 0; // 常に情報量1位を選ぶ
  const forHigh = selectNextItem(bank, new Set(), high, top1);
  const forLow = selectNextItem(bank, new Set(), low, top1);
  assert.ok(forHigh.b > forLow.b);
});

test('乱数により情報量上位3件の中から異なる問題が選ばれうる', () => {
  const post = createPosterior();
  const ids = new Set();
  for (const r of [0, 0.4, 0.7, 0.99]) {
    ids.add(selectNextItem(bank, new Set(), post, () => r).id);
  }
  assert.ok(ids.size >= 2, '乱数を変えても同じ問題しか選ばれない');
});

test('選ばれる問題は常に情報量上位3件のいずれか', () => {
  const post = createPosterior();
  // このbankでθ=0の情報量上位3件はb=0, 0.5, -1.0あたり(易しすぎ/難しすぎは外れる)
  for (const r of [0, 0.2, 0.5, 0.8, 0.99]) {
    const picked = selectNextItem(bank, new Set(), post, () => r);
    assert.ok(['m1', 'm2', 'e2', 'h1'].includes(picked.id), `top外の${picked.id}が選ばれた`);
  }
});

test('残りが3件未満でもエラーにならない', () => {
  const post = createPosterior();
  const administered = new Set(['e1', 'e2', 'm1', 'm2', 'h1']);
  const picked = selectNextItem(bank, administered, post, () => 0.99);
  assert.equal(picked.id, 'h2');
});

const mixedBank = [
  { id: 'p1', image: 'images/p1.jpg', a: 1.0, b: -2.0, c: 0.25 },
  { id: 'p2', image: 'images/p2.jpg', a: 1.0, b: -1.5, c: 0.25 },
  { id: 'n1', a: 1.0, b: 0.0, c: 0.25 },
  { id: 'n2', a: 1.0, b: 0.5, c: 0.25 },
];

test('写真クォータが残っていれば写真問題だけが候補になる', () => {
  const pool = listeningPool(mixedBank, new Set(), 1);
  assert.deepEqual(pool.map((i) => i.id).sort(), ['p1', 'p2']);
});

test('クォータ消化後は通常問題だけが候補になる', () => {
  const pool = listeningPool(mixedBank, new Set(['p1']), 1);
  assert.deepEqual(pool.map((i) => i.id).sort(), ['n1', 'n2']);
});

test('クォータ0なら最初から通常問題だけが候補になる', () => {
  const pool = listeningPool(mixedBank, new Set(), 0);
  assert.deepEqual(pool.map((i) => i.id).sort(), ['n1', 'n2']);
});

test('候補が空になる場合は全バンクにフォールバックする', () => {
  const noPhotos = [{ id: 'n1', a: 1, b: 0, c: 0.25 }];
  const pool = listeningPool(noPhotos, new Set(), 1);
  assert.deepEqual(pool.map((i) => i.id), ['n1']);
});
