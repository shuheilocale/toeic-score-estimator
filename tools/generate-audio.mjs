// リスニング音声の事前生成スクリプト(Gemini TTS → m4a)。
// アイテムバンクを変更したら再実行して audio/ を更新する。
//
//   GEMINI_API_KEY=... node tools/generate-audio.mjs          # 全件
//   GEMINI_API_KEY=... node tools/generate-audio.mjs L04 L06  # 指定IDのみ
//
// 要件: ffmpeg(PCM→AAC変換)

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { listeningBank } from '../js/items.js';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_API_KEY が設定されていません');
  process.exit(1);
}

const MODEL = process.env.TTS_MODEL ?? 'gemini-3.8-flash-tts';
// W: 女声 / M: 男声(問題文の the woman / the man と一致させる)
const VOICE = { W: 'Kore', M: 'Charon' };
const OUT_DIR = new URL('../audio/', import.meta.url).pathname;
// 注意: このモデルはプロンプト内のスタイル指示文を本文として読み上げて
// しまう(検証済み)。テキストは読み上げる本文のみを渡すこと。

const CHECK_ITEM = {
  id: 'check',
  script: [
    { v: 'W', text: 'This is a listening check. If you can hear this voice clearly, you are ready to begin.' },
  ],
};

const only = process.argv.slice(2);
const targets = [...listeningBank, CHECK_ITEM].filter(
  (it) => only.length === 0 || only.includes(it.id)
);

mkdirSync(OUT_DIR, { recursive: true });

function buildRequest(item) {
  const speakers = [...new Set(item.script.map((l) => l.v))];
  if (speakers.length === 1) {
    const text = item.script.map((l) => l.text).join(' ');
    return {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE[speakers[0]] } },
        },
      },
    };
  }
  // gemini-3.8系は行ごとに speechMetadata.speaker を指定する形式
  return {
    contents: [
      { parts: item.script.map((l) => ({ text: l.text, speechMetadata: { speaker: l.v } })) },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: speakers.map((s) => ({
            speaker: s,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE[s] } },
          })),
        },
      },
    },
  };
}

async function callTTS(item, attempt = 1) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(item)),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      const wait = attempt * 15000;
      console.log(`  ${item.id}: HTTP ${res.status}、${wait / 1000}秒後にリトライ`);
      await new Promise((r) => setTimeout(r, wait));
      return callTTS(item, attempt + 1);
    }
    throw new Error(`${item.id}: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`${item.id}: 音声データが返らなかった ${JSON.stringify(json).slice(0, 300)}`);
  return part.inlineData; // { mimeType: 'audio/L16;codec=pcm;rate=24000', data: base64 }
}

// APIはWAVコンテナ(audio/wav)を返す。以前これを生PCMとして扱っていた
// ため、RIFFヘッダが先頭のクリック音、dataチャンク後方のメタデータ
// (IPTCのAI生成メディア表示)が末尾のホワイトノイズになっていた。
// コンテナはffmpegに解釈させ、dataチャンクの範囲だけを音声として使う。
function toM4a(id, inlineData) {
  const buf = Buffer.from(inlineData.data, 'base64');
  const mime = inlineData.mimeType ?? '';
  const outPath = `${OUT_DIR}${id}.m4a`;
  let inputArgs;
  let tmpPath;
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' || mime.includes('wav')) {
    tmpPath = `${OUT_DIR}${id}.wav`;
    inputArgs = ['-i', tmpPath];
  } else {
    // 旧形式(audio/L16 生PCM)へのフォールバック
    const rate = /rate=(\d+)/.exec(mime)?.[1] ?? '24000';
    tmpPath = `${OUT_DIR}${id}.pcm`;
    inputArgs = ['-f', 's16le', '-ar', rate, '-ac', '1', '-i', tmpPath];
  }
  writeFileSync(tmpPath, buf);
  execFileSync('ffmpeg', ['-y', ...inputArgs, '-c:a', 'aac', '-b:a', '64k', outPath], {
    stdio: 'pipe',
  });
  rmSync(tmpPath);
  verifyQuietEdges(id, outPath);
}

// 変換後の先頭50ms・末尾200msが静かであることを検証する(ノイズ混入ガード)
function verifyQuietEdges(id, path) {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', '24000', '-',
  ], { maxBuffer: 64 * 1024 * 1024 });
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const rmsDb = (seg) => {
    let acc = 0;
    for (const s of seg) acc += s * s;
    return 20 * Math.log10(Math.max(Math.sqrt(acc / seg.length), 1) / 32768);
  };
  const head = rmsDb(samples.subarray(0, 1200));
  const tail = rmsDb(samples.subarray(-4800));
  if (head > -40 || tail > -40) {
    throw new Error(`${id}: 端にノイズの疑い(先頭${head.toFixed(0)}dB / 末尾${tail.toFixed(0)}dB)`);
  }
}

for (const item of targets) {
  process.stdout.write(`${item.id} ... `);
  const inlineData = await callTTS(item);
  toM4a(item.id, inlineData);
  console.log('OK');
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(`完了: ${targets.length}件 → audio/`);
