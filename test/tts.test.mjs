import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoicePair, resolvePair } from '../js/tts.js';

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

test('英語ボイスがない場合はnull(日本語ボイスの英語読みは使わない)', () => {
  const voices = [v('Kyoko', 'ja-JP'), v('Thomas', 'fr-FR')];
  assert.equal(pickVoicePair(voices), null);
});

test('ボイス名がローカライズされていてもvoiceURIで品質/ノベルティ判定できる', () => {
  const voices = [
    v('アルバート', 'en-US', { voiceURI: 'com.apple.speech.synthesis.voice.Albert' }),
    v('サマンサ', 'en-US', { voiceURI: 'com.apple.voice.compact.en-US.Samantha' }),
  ];
  const pair = pickVoicePair(voices);
  assert.equal(pair.A.name, 'サマンサ');
});

test('resolvePair は最新リストの同一ボイス(voiceURI一致)に差し替える', () => {
  const oldA = v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' });
  const oldB = v('Daniel', 'en-GB', { voiceURI: 'apple.Daniel' });
  const freshA = v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' });
  const freshB = v('Daniel', 'en-GB', { voiceURI: 'apple.Daniel' });
  const resolved = resolvePair({ A: oldA, B: oldB }, [freshB, freshA]);
  assert.equal(resolved.A, freshA);
  assert.equal(resolved.B, freshB);
});

test('resolvePair はAが最新リストに無ければnull', () => {
  const pair = { A: v('Ghost', 'en-US', { voiceURI: 'gone' }), B: v('Daniel', 'en-GB') };
  assert.equal(resolvePair(pair, [v('Daniel', 'en-GB')]), null);
});

test('resolvePair はBだけ消えていればBにAを使う', () => {
  const freshA = v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' });
  const pair = {
    A: v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' }),
    B: v('Ghost', 'en-GB', { voiceURI: 'gone' }),
  };
  const resolved = resolvePair(pair, [freshA]);
  assert.equal(resolved.A, freshA);
  assert.equal(resolved.B, freshA);
});

test('resolvePair はpairがnullならnull', () => {
  assert.equal(resolvePair(null, [v('Samantha')]), null);
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
