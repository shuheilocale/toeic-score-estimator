import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prob3PL,
  fisherInfo,
  createPosterior,
  updatePosterior,
  eap,
  posteriorSD,
} from '../js/irt.js';

const item = (a, b, c = 0.25) => ({ a, b, c });

test('prob3PL は θ=b で c と 1 の中間値を返す', () => {
  const p = prob3PL(0, item(1.2, 0));
  assert.ok(Math.abs(p - (0.25 + 0.75 / 2)) < 1e-9);
});

test('prob3PL は θ に対して単調増加し、c と 1 に漸近する', () => {
  const it = item(1.0, 0.5);
  assert.ok(prob3PL(-1, it) < prob3PL(0, it));
  assert.ok(prob3PL(0, it) < prob3PL(2, it));
  assert.ok(Math.abs(prob3PL(-10, it) - 0.25) < 1e-3);
  assert.ok(Math.abs(prob3PL(10, it) - 1) < 1e-3);
});

test('fisherInfo は困難度 b の近くで最大になる', () => {
  const it = item(1.3, 0.8);
  // 3PLの情報量ピークはbよりわずかに上だが、b±2よりはb近傍が大きい
  const near = fisherInfo(0.9, it);
  assert.ok(near > fisherInfo(-1.2, it));
  assert.ok(near > fisherInfo(2.8, it));
});

test('createPosterior は正規化された事前分布(N(0,1))を返す', () => {
  const post = createPosterior();
  const sum = post.probs.reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(Math.abs(eap(post)) < 1e-6); // 事前の平均は0
  assert.ok(Math.abs(posteriorSD(post) - 1) < 0.02); // 事前のSDは約1
});

test('易しい問題に正解すると EAP が上がり、誤答すると下がる', () => {
  const prior = createPosterior();
  const easy = item(1.2, -1.0);
  const up = updatePosterior(prior, easy, true);
  const down = updatePosterior(prior, easy, false);
  assert.ok(eap(up) > eap(prior));
  assert.ok(eap(down) < eap(prior));
});

test('回答を重ねるほど事後分布の SD が狭くなる', () => {
  let post = createPosterior();
  const sd0 = posteriorSD(post);
  const bank = [item(1.2, -0.5), item(1.0, 0), item(1.4, 0.5), item(1.1, 1.0)];
  for (const it of bank) post = updatePosterior(post, it, true);
  assert.ok(posteriorSD(post) < sd0);
});

test('updatePosterior は元の分布を破壊しない(純粋関数)', () => {
  const prior = createPosterior();
  const before = [...prior.probs];
  updatePosterior(prior, item(1.0, 0), true);
  assert.deepEqual(prior.probs, before);
});

test('updatePosterior 後も正規化されている', () => {
  let post = createPosterior();
  post = updatePosterior(post, item(1.5, 2.0), false);
  const sum = post.probs.reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});
