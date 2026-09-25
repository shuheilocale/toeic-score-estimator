import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listeningBank, readingBank, TEST_PLAN } from '../js/items.js';

const allItems = [...listeningBank, ...readingBank];

test('IDはバンク全体で一意', () => {
  const ids = allItems.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('出題数に対してバンクに十分な問題がある', () => {
  assert.ok(listeningBank.length >= TEST_PLAN.listening.count + 5);
  assert.ok(readingBank.length >= TEST_PLAN.reading.count + 5);
});

test('全問題が4択で、正解インデックスが範囲内、選択肢は重複なし', () => {
  for (const it of allItems) {
    assert.equal(it.options.length, 4, it.id);
    assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 4, it.id);
    assert.equal(new Set(it.options).size, 4, it.id);
  }
});

test('IRTパラメータが妥当な範囲にある', () => {
  for (const it of allItems) {
    assert.ok(it.a >= 0.5 && it.a <= 2.0, `${it.id} a=${it.a}`);
    assert.ok(it.b >= -3 && it.b <= 3, `${it.id} b=${it.b}`);
    assert.equal(it.c, 0.25, it.id);
  }
});

test('バンク内の難易度bは易〜難まで分布している', () => {
  for (const bank of [listeningBank, readingBank]) {
    const bs = bank.map((i) => i.b);
    assert.ok(Math.min(...bs) <= -1.5);
    assert.ok(Math.max(...bs) >= 2.0);
  }
});

test('リスニング問題は必ず読み上げスクリプトを持つ', () => {
  for (const it of listeningBank) {
    assert.ok(Array.isArray(it.script) && it.script.length > 0, it.id);
    for (const line of it.script) {
      assert.ok(['A', 'B'].includes(line.v), it.id);
      assert.ok(line.text.trim().length > 0, it.id);
    }
  }
});

test('リーディングのpassage型は本文を持つ', () => {
  for (const it of readingBank) {
    if (it.passage !== undefined) {
      assert.ok(it.passage.trim().length > 20, it.id);
    }
  }
});

test('全問題に日本語の解説がある', () => {
  for (const it of allItems) {
    assert.ok(typeof it.jaNote === 'string' && it.jaNote.length > 0, it.id);
  }
});
