// Web Speech API(speechSynthesis)のラッパー。
// 話者A/Bに別ボイス(なければピッチ差)を割り当てて会話を読み上げる。

const SPEECH_RATE = 0.95;
const VOICE_LOAD_TIMEOUT_MS = 2000;

export function isTTSSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// macOS/iOSに同梱されているジョーク・効果音ボイス。読み上げ品質が極端に
// 悪い(ロボット声・歌声など)ため、他に選択肢がある限り使わない。
const NOVELTY_VOICES = [
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'eddy', 'flo', 'fred', 'good news', 'grandma', 'grandpa',
  'jester', 'junior', 'kathy', 'organ', 'ralph', 'reed', 'rocko', 'sandy',
  'shelley', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
];

// 品質が確認できている標準ボイス(優先度順)。名前の部分一致で判定する。
const PREFERRED_FEMALE = [
  'samantha', 'google us english', 'aria', 'jenny', 'zira', 'ava', 'allison',
  'susan', 'joelle', 'zoe', 'victoria', 'karen', 'moira', 'tessa', 'serena', 'nicky',
];
const PREFERRED_MALE = [
  'alex', 'guy', 'david', 'mark', 'daniel', 'evan', 'nathan', 'tom', 'aaron', 'oliver', 'rishi',
];

// 判定は name と voiceURI を合わせた文字列で行う。Safari等ではボイス名が
// OSの表示言語にローカライズされる(例:「サマンサ」)ため、識別子である
// voiceURI(例: com.apple.voice.compact.en-US.Samantha)も見る。
function matchText(voice) {
  return `${voice.name} ${voice.voiceURI ?? ''}`.toLowerCase();
}

// 短い名前('tom'等)が別語の一部に誤マッチしないよう単語単位で照合する
function hasName(text, name) {
  return name.includes(' ') ? text.includes(name) : text.split(/[^a-z]+/).includes(name);
}

function isNovelty(text) {
  return NOVELTY_VOICES.some((n) => hasName(text, n));
}

function genderOf(text) {
  if (PREFERRED_FEMALE.some((p) => hasName(text, p))) return 'f';
  if (PREFERRED_MALE.some((p) => hasName(text, p))) return 'm';
  return null;
}

function voiceScore(voice) {
  const text = matchText(voice);
  if (isNovelty(text)) return -100;
  let score = 0;
  const fi = PREFERRED_FEMALE.findIndex((p) => hasName(text, p));
  const mi = PREFERRED_MALE.findIndex((p) => hasName(text, p));
  // 話者Aはまず女性ボイス群(各OSの最高品質デフォルトが多い)から探す
  const best = Math.min(fi === -1 ? 99 : fi, mi === -1 ? 99 : mi + PREFERRED_FEMALE.length);
  if (best < 99) score += 50 - best;
  if (voice.lang === 'en-US') score += 20;
  else if (voice.lang.startsWith('en')) score += 10;
  if (/enhanced|premium|natural/.test(text)) score += 5;
  if (voice.default) score += 3;
  return score;
}

// 女性話者W・男性話者Mのボイスペアを選ぶ。問題文の「the woman / the man」と
// 聞こえる声の性別を一致させるため、ラベルは性別で固定する。
// - W: 女声として知られる品質ボイス。なければ最高スコアのボイス。
// - M: 男声として知られる品質ボイス。なければ性別不明の品質ボイス、
//      それも無ければWと同一(読み上げ側がピッチを下げて区別する)。
// 英語ボイスがひとつも無い環境では null を返す。日本語等のボイスが英語を
// 読むとカタカナ英語になり、リスニング推定として成立しないため、
// その場合はスクリプト表示にフォールバックさせる。
export function pickVoicePair(voices) {
  if (!voices || voices.length === 0) return null;
  const english = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
  if (english.length === 0) return null;
  const scored = english
    .map((v) => ({ v, score: voiceScore(v), gender: genderOf(matchText(v)) }))
    .sort((a, b) => b.score - a.score);
  const W = (scored.find((s) => s.gender === 'f') ?? scored[0]).v;
  const M = (
    scored.find((s) => s.gender === 'm' && s.v !== W) ??
    scored.find((s) => s.gender === null && s.score >= 0 && s.v !== W) ??
    { v: W }
  ).v;
  return { W, M };
}

// 以前選んだボイスを「現在の」getVoices() リストの同一ボイスに差し替える。
// 古いスナップショットのボイスオブジェクトを utterance.voice に渡すと、
// 環境によっては無視されてシステム既定(日本語等)の声で読まれてしまう。
export function resolvePair(pair, list) {
  if (!pair || !list || list.length === 0) return null;
  const find = (voice) =>
    (voice.voiceURI ? list.find((v) => v.voiceURI === voice.voiceURI) : null) ??
    list.find((v) => v.name === voice.name && v.lang === voice.lang) ??
    null;
  const W = find(pair.W);
  if (!W) return null;
  const M = (pair.M && find(pair.M)) || W;
  return { W, M };
}

// ボイス一覧は非同期に読み込まれるため、voiceschanged を待つ。
export function initVoices() {
  return new Promise((resolve) => {
    if (!isTTSSupported()) {
      resolve(null);
      return;
    }
    const pick = () => pickVoicePair(speechSynthesis.getVoices());
    const immediate = pick();
    if (immediate) {
      resolve(immediate);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(pick());
    };
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
  });
}

// script([{v:'A'|'B', text}])を順番に読み上げる。resolve時に実際に使った
// ボイスペアを返す。英語ボイスが見つからなければ reject('no-english-voice')。
export function speakScript(script, pair, volume = 1) {
  return new Promise((resolve, reject) => {
    if (!isTTSSupported()) {
      reject(new Error('speechSynthesis not supported'));
      return;
    }
    speechSynthesis.cancel();

    // 読み上げ直前に最新リストから取り直す(古いボイスオブジェクト対策)
    const fresh = speechSynthesis.getVoices();
    const voices = resolvePair(pair, fresh) ?? pickVoicePair(fresh) ?? pair;
    if (!voices) {
      reject(new Error('no-english-voice'));
      return;
    }

    // 一部環境(特にモバイル)では speak() が無反応のまま止まることがある。
    // 想定読み上げ時間を大きく超えたら打ち切ってフォールバックさせる。
    let settled = false;
    const words = script.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    const watchdog = setTimeout(() => {
      settle(() => reject(new Error('timeout')));
      speechSynthesis.cancel();
    }, 5000 + words * 600);
    const settle = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      fn();
    };

    // Mに男声を割り当てられなかった環境では、M話者の行だけピッチを下げて
    // 聞き分けられるようにする
    const mNeedsPitchDown = genderOf(matchText(voices.M)) !== 'm';
    let index = 0;
    const speakNext = () => {
      if (index >= script.length) {
        settle(() => resolve(voices));
        return;
      }
      const line = script[index++];
      const u = new SpeechSynthesisUtterance(line.text);
      const voice = line.v === 'M' ? voices.M : voices.W;
      u.voice = voice;
      // langはボイス自身のlangに合わせる。不一致だとボイス指定が無視され、
      // システム既定(日本語等)の声で読まれる環境があるため。
      u.lang = voice.lang || 'en-US';
      u.rate = SPEECH_RATE;
      u.volume = volume;
      u.pitch = line.v === 'M' && mNeedsPitchDown ? 0.8 : 1.0;
      u.onend = () => setTimeout(speakNext, 350);
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          settle(() => reject(new Error('canceled')));
        } else {
          settle(() => reject(new Error(`speech error: ${e.error}`)));
        }
      };
      speechSynthesis.speak(u);
    };
    speakNext();
  });
}

export function cancelSpeech() {
  if (isTTSSupported()) speechSynthesis.cancel();
}
