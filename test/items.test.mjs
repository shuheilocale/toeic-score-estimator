import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { listeningBank, readingBank, TEST_PLANS } from '../js/items.js';

const allItems = [...listeningBank, ...readingBank];

test('IDはバンク全体で一意', () => {
  const ids = allItems.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('どのプランの出題数に対してもバンクに十分な問題がある', () => {
  for (const plan of Object.values(TEST_PLANS)) {
    assert.ok(listeningBank.length >= plan.listening.count + 5, plan.label);
    assert.ok(readingBank.length >= plan.reading.count + 5, plan.label);
  }
});

test('プランは複数あり、長いプランほど問題数が多い', () => {
  const plans = Object.values(TEST_PLANS);
  assert.ok(plans.length >= 2);
  const [a, b] = plans;
  assert.ok(b.listening.count > a.listening.count);
  assert.ok(b.reading.count > a.reading.count);
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

test('リスニング問題は必ず読み上げスクリプトを持つ(話者はM/W)', () => {
  for (const it of listeningBank) {
    assert.ok(Array.isArray(it.script) && it.script.length > 0, it.id);
    for (const line of it.script) {
      assert.ok(['M', 'W'].includes(line.v), it.id);
      assert.ok(line.text.trim().length > 0, it.id);
    }
  }
});

test('質問文が男女に言及する場合、その性別の話者がスクリプトに存在する', () => {
  for (const it of listeningBank) {
    const q = it.question.toLowerCase();
    if (/\bwoman\b/.test(q)) {
      assert.ok(it.script.some((l) => l.v === 'W'), `${it.id}: womanに言及するがW話者がいない`);
    }
    if (/\bman\b/.test(q)) {
      assert.ok(it.script.some((l) => l.v === 'M'), `${it.id}: manに言及するがM話者がいない`);
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

test('全リスニング項目に事前生成音声(audio/<id>.m4a)がある', () => {
  // 項目を追加・変更したら tools/generate-audio.mjs で音声を再生成すること
  for (const it of listeningBank) {
    const path = new URL(`../audio/${it.id}.m4a`, import.meta.url).pathname;
    assert.ok(existsSync(path), `${it.id}: audio/${it.id}.m4a がない`);
    assert.ok(statSync(path).size > 10000, `${it.id}: 音声ファイルが小さすぎる`);
  }
  const check = new URL('../audio/check.m4a', import.meta.url).pathname;
  assert.ok(existsSync(check), 'audio/check.m4a がない');
});

test('全問題に日本語の解説がある', () => {
  for (const it of allItems) {
    assert.ok(typeof it.jaNote === 'string' && it.jaNote.length > 0, it.id);
  }
});
