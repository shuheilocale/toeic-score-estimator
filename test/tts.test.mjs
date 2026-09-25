import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoicePair } from '../js/tts.js';

const v = (name, lang = 'en-US', extra = {}) => ({ name, lang, default: false, ...extra });

test('macOS/Chrome風リストではノベルティボイス(Albert等)を避けて品質ボイスを選ぶ', () => {
  const voices = [
    v('Albert'),
    v('Bad News'),
    v('Bubbles'),
    v('Google US English'),
    v('Kyoko', 'ja-JP'),
    v('Samantha'),
    v('Whisper'),
    v('Zarvox'),
  ];
  const pair = pickVoicePair(voices);
  assert.equal(pair.A.name, 'Samantha');
  assert.notEqual(pair.B.name, 'Albert');
  assert.notEqual(pair.B.name, 'Zarvox');
});

test('話者Bには別のボイスを割り当て、可能なら性別を変える', () => {
  const voices = [v('Albert'), v('Samantha'), v('Alex'), v('Ava')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.A.name, 'Samantha');
  assert.equal(pair.B.name, 'Alex'); // Ava(女声)よりAlex(男声)を優先
});

test('Windows風リストでも動く(Microsoft Zira/David)', () => {
  const voices = [
    v('Microsoft David - English (United States)'),
    v('Microsoft Zira - English (United States)'),
  ];
  const pair = pickVoicePair(voices);
  assert.equal(pair.A.name, 'Microsoft Zira - English (United States)');
  assert.equal(pair.B.name, 'Microsoft David - English (United States)');
});

test('ノベルティしかない場合でもnullにはしない', () => {
  const voices = [v('Albert'), v('Zarvox')];
  const pair = pickVoicePair(voices);
  assert.ok(pair && pair.A && pair.B);
});

test('英語ボイスがない場合は何かしら返す', () => {
  const voices = [v('Kyoko', 'ja-JP'), v('Thomas', 'fr-FR')];
  const pair = pickVoicePair(voices);
  assert.ok(pair && pair.A);
});

test('ボイスが1つならAとBは同一(呼び出し側がピッチで区別する)', () => {
  const voices = [v('Samantha')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.A, pair.B);
});

test('空リストはnull', () => {
  assert.equal(pickVoicePair([]), null);
});

test('未知の通常ボイスはノベルティより優先される', () => {
  const voices = [v('Albert'), v('SomeNewVoice')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.A.name, 'SomeNewVoice');
});
