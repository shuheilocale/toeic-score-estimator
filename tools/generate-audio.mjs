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

function pcmToM4a(id, inlineData) {
  const rate = /rate=(\d+)/.exec(inlineData.mimeType)?.[1] ?? '24000';
  const pcmPath = `${OUT_DIR}${id}.pcm`;
  writeFileSync(pcmPath, Buffer.from(inlineData.data, 'base64'));
  execFileSync('ffmpeg', [
    '-y', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', pcmPath,
    '-c:a', 'aac', '-b:a', '64k', `${OUT_DIR}${id}.m4a`,
  ], { stdio: 'pipe' });
  rmSync(pcmPath);
}

for (const item of targets) {
  process.stdout.write(`${item.id} ... `);
  const inlineData = await callTTS(item);
  pcmToM4a(item.id, inlineData);
  console.log('OK');
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(`完了: ${targets.length}件 → audio/`);
