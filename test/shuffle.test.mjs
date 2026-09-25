import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffleOptions } from '../js/shuffle.js';

const item = {
  id: 'X1',
  options: ['correct', 'wrong1', 'wrong2', 'wrong3'],
  answer: 0,
};

test('シャッフル後も正解インデックスが正しい選択肢を指す', () => {
  for (let seed = 0; seed < 20; seed++) {
    const rng = mulberry(seed);
    const { options, answer } = shuffleOptions(item, rng);
    assert.equal(options[answer], 'correct');
  }
});

test('シャッフル後の選択肢は元と同じ4つの集合', () => {
  const { options } = shuffleOptions(item, mulberry(7));
  assert.deepEqual([...options].sort(), [...item.options].sort());
});

test('元のitemは変更されない', () => {
  shuffleOptions(item, mulberry(3));
  assert.deepEqual(item.options, ['correct', 'wrong1', 'wrong2', 'wrong3']);
  assert.equal(item.answer, 0);
});

test('並び順は乱数で変化する(20回中少なくとも1回は先頭が変わる)', () => {
  let moved = false;
  for (let seed = 0; seed < 20; seed++) {
    const { options } = shuffleOptions(item, mulberry(seed));
    if (options[0] !== 'correct') moved = true;
  }
  assert.ok(moved);
});

function mulberry(seed) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
