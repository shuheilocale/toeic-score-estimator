// Web Speech API(speechSynthesis)のラッパー。
// 話者A/Bに別ボイス(なければピッチ差)を割り当てて会話を読み上げる。

const SPEECH_RATE = 0.95;
const VOICE_LOAD_TIMEOUT_MS = 2000;

export function isTTSSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ボイス一覧は非同期に読み込まれるため、voiceschanged を待つ。
export function initVoices() {
  return new Promise((resolve) => {
    if (!isTTSSupported()) {
      resolve(null);
      return;
    }
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) return null;
      const english = voices.filter((v) => v.lang.startsWith('en'));
      const pool = english.length > 0 ? english : voices;
      const preferUS = pool.filter((v) => v.lang === 'en-US');
      const primary = preferUS[0] ?? pool[0];
      const secondary =
        preferUS.find((v) => v !== primary) ?? pool.find((v) => v !== primary) ?? primary;
      return { A: primary, B: secondary };
    };
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

// script([{v:'A'|'B', text}])を順番に読み上げる。全行完了で resolve、
// エラー時は reject(呼び出し側でスクリプト表示にフォールバックする)。
export function speakScript(script, voices) {
  return new Promise((resolve, reject) => {
    if (!isTTSSupported()) {
      reject(new Error('speechSynthesis not supported'));
      return;
    }
    speechSynthesis.cancel();

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

    const sameVoice = !voices || voices.A === voices.B;
    let index = 0;
    const speakNext = () => {
      if (index >= script.length) {
        settle(resolve);
        return;
      }
      const line = script[index++];
      const u = new SpeechSynthesisUtterance(line.text);
      u.lang = 'en-US';
      u.rate = SPEECH_RATE;
      if (voices) u.voice = voices[line.v] ?? voices.A;
      // 同一ボイスしかない環境では話者Bをピッチで区別する
      u.pitch = sameVoice && line.v === 'B' ? 1.3 : 1.0;
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
