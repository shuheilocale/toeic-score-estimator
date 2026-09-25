import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPosterior, updatePosterior } from '../js/irt.js';
import {
  thetaToScore,
  sectionScoreDistribution,
  totalScoreDistribution,
  quantile,
  credibleInterval,
} from '../js/scoring.js';

const item = (a, b, c = 0.25) => ({ a, b, c });

function answeredPosterior(correctCount, wrongCount) {
  let post = createPosterior();
  const its = [
    item(1.2, -1), item(1.0, -0.5), item(1.3, 0), item(1.1, 0.5),
    item(1.4, 1), item(1.2, 1.5), item(1.0, -1.5), item(1.3, 2),
  ];
  for (let i = 0; i < correctCount; i++) post = updatePosterior(post, its[i % its.length], true);
  for (let i = 0; i < wrongCount; i++) post = updatePosterior(post, its[i % its.length], false);
  return post;
}

test('thetaToScore は 5点刻みで 5〜495 にクランプされる', () => {
  assert.equal(thetaToScore(-10, 'L'), 5);
  assert.equal(thetaToScore(10, 'L'), 495);
  const s = thetaToScore(0.37, 'R');
  assert.equal(s % 5, 0);
  assert.ok(s >= 5 && s <= 495);
});

test('thetaToScore は θ に対して単調非減少', () => {
  let prev = -Infinity;
  for (let t = -4; t <= 4; t += 0.25) {
    const s = thetaToScore(t, 'L');
    assert.ok(s >= prev);
    prev = s;
  }
});

test('sectionScoreDistribution は正規化されスコアは5刻み', () => {
  const dist = sectionScoreDistribution(createPosterior(), 'L');
  const sum = dist.probs.reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(dist.scores.every((s) => s % 5 === 0 && s >= 5 && s <= 495));
});

test('正答が多い事後分布ほどセクション中央値が高い', () => {
  const good = sectionScoreDistribution(answeredPosterior(8, 0), 'L');
  const bad = sectionScoreDistribution(answeredPosterior(0, 8), 'L');
  assert.ok(quantile(good, 0.5) > quantile(bad, 0.5));
});

test('totalScoreDistribution は正規化され 10〜990 の範囲', () => {
  const l = sectionScoreDistribution(createPosterior(), 'L');
  const r = sectionScoreDistribution(createPosterior(), 'R');
  const total = totalScoreDistribution(l, r);
  const sum = total.probs.reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(total.scores.every((s) => s >= 10 && s <= 990));
});

test('合計の中央値はセクション中央値の和に近い', () => {
  const l = sectionScoreDistribution(answeredPosterior(6, 2), 'L');
  const r = sectionScoreDistribution(answeredPosterior(4, 4), 'R');
  const total = totalScoreDistribution(l, r);
  const approx = quantile(l, 0.5) + quantile(r, 0.5);
  assert.ok(Math.abs(quantile(total, 0.5) - approx) < 30);
});

test('quantile は単調で、0.1分位 <= 中央値 <= 0.9分位', () => {
  const dist = sectionScoreDistribution(answeredPosterior(5, 3), 'R');
  const q10 = quantile(dist, 0.1);
  const q50 = quantile(dist, 0.5);
  const q90 = quantile(dist, 0.9);
  assert.ok(q10 <= q50 && q50 <= q90);
});

test('credibleInterval(80%) は中央値を含み、回答が増えると狭くなる', () => {
  const wide = sectionScoreDistribution(answeredPosterior(1, 1), 'L');
  const narrow = sectionScoreDistribution(answeredPosterior(6, 6), 'L');
  const [lo, hi] = credibleInterval(narrow, 0.8);
  const med = quantile(narrow, 0.5);
  assert.ok(lo <= med && med <= hi);
  const [wlo, whi] = credibleInterval(wide, 0.8);
  assert.ok(hi - lo < whi - wlo);
});
