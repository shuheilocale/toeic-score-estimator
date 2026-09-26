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
  assert.equal(pair.W.name, 'Samantha');
  assert.ok(!['Albert', 'Zarvox', 'Whisper', 'Bad News', 'Bubbles'].includes(pair.M.name));
});

test('女声W・男声Mが揃っていればそれぞれに割り当てる', () => {
  const voices = [v('Albert'), v('Samantha'), v('Alex'), v('Ava')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.W.name, 'Samantha');
  assert.equal(pair.M.name, 'Alex');
});

test('Windows風リストでも動く(W=Zira, M=David)', () => {
  const voices = [
    v('Microsoft David - English (United States)'),
    v('Microsoft Zira - English (United States)'),
  ];
  const pair = pickVoicePair(voices);
  assert.equal(pair.W.name, 'Microsoft Zira - English (United States)');
  assert.equal(pair.M.name, 'Microsoft David - English (United States)');
});

test('男声が無い場合はMにも品質ボイスを使う(ノベルティに落とさない)', () => {
  const voices = [v('Albert'), v('Samantha')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.W.name, 'Samantha');
  assert.equal(pair.M.name, 'Samantha');
});

test('ノベルティしかない場合でもnullにはしない', () => {
  const voices = [v('Albert'), v('Zarvox')];
  const pair = pickVoicePair(voices);
  assert.ok(pair && pair.W && pair.M);
});

test('英語ボイスがない場合はnull(日本語ボイスの英語読みは使わない)', () => {
  const voices = [v('Kyoko', 'ja-JP'), v('Thomas', 'fr-FR')];
  assert.equal(pickVoicePair(voices), null);
});

test('ボイスが1つならWとMは同一(呼び出し側がピッチで区別する)', () => {
  const voices = [v('Samantha')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.W, pair.M);
});

test('空リストはnull', () => {
  assert.equal(pickVoicePair([]), null);
});

test('未知の通常ボイスはノベルティより優先される', () => {
  const voices = [v('Albert'), v('SomeNewVoice')];
  const pair = pickVoicePair(voices);
  assert.equal(pair.W.name, 'SomeNewVoice');
  assert.equal(pair.M.name, 'SomeNewVoice');
});

test('ボイス名がローカライズされていてもvoiceURIで品質/ノベルティ判定できる', () => {
  const voices = [
    v('アルバート', 'en-US', { voiceURI: 'com.apple.speech.synthesis.voice.Albert' }),
    v('サマンサ', 'en-US', { voiceURI: 'com.apple.voice.compact.en-US.Samantha' }),
  ];
  const pair = pickVoicePair(voices);
  assert.equal(pair.W.name, 'サマンサ');
});

test('resolvePair は最新リストの同一ボイス(voiceURI一致)に差し替える', () => {
  const oldW = v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' });
  const oldM = v('Daniel', 'en-GB', { voiceURI: 'apple.Daniel' });
  const freshW = v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' });
  const freshM = v('Daniel', 'en-GB', { voiceURI: 'apple.Daniel' });
  const resolved = resolvePair({ W: oldW, M: oldM }, [freshM, freshW]);
  assert.equal(resolved.W, freshW);
  assert.equal(resolved.M, freshM);
});

test('resolvePair はWが最新リストに無ければnull', () => {
  const pair = { W: v('Ghost', 'en-US', { voiceURI: 'gone' }), M: v('Daniel', 'en-GB') };
  assert.equal(resolvePair(pair, [v('Daniel', 'en-GB')]), null);
});

test('resolvePair はMだけ消えていればMにWを使う', () => {
  const freshW = v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' });
  const pair = {
    W: v('Samantha', 'en-US', { voiceURI: 'apple.Samantha' }),
    M: v('Ghost', 'en-GB', { voiceURI: 'gone' }),
  };
  const resolved = resolvePair(pair, [freshW]);
  assert.equal(resolved.W, freshW);
  assert.equal(resolved.M, freshW);
});

test('resolvePair はpairがnullならnull', () => {
  assert.equal(resolvePair(null, [v('Samantha')]), null);
});
