// Part 1風写真の生成スクリプト(Gemini画像生成 + vision検証ループ)。
// 生成した写真をGemini visionに見せ、「正解文だけが真の描写である」ことを
// 機械検証してから採用する。検証に落ちたらプロンプトを強化して再生成。
//
//   GEMINI_API_KEY=... node tools/generate-images.mjs          # 全件
//   GEMINI_API_KEY=... node tools/generate-images.mjs P03      # 指定IDのみ
//
// 要件: ffmpeg(PNG→JPEG変換・リサイズ)

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { listeningBank } from '../js/items.js';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_API_KEY が設定されていません');
  process.exit(1);
}

const IMG_MODEL = process.env.IMG_MODEL ?? 'gemini-3.1-flash-image';
const VERIFY_MODEL = 'gemini-2.5-flash';
const OUT_DIR = new URL('../images/', import.meta.url).pathname;
const LETTERS = ['A', 'B', 'C', 'D'];

// 各写真のシーン指示。誤答選択肢が「偽」になるよう写り込みを明示的に排除する。
const SCENES = {
  P01: 'A woman sitting alone on a park bench, reading an open paperback book with both hands. No phone, no bicycle, no gardening tools anywhere in the frame. Green park with trees in the background, daytime.',
  P02: 'A middle-aged man in casual clothes watering a flower bed with a metal watering can in a home garden. No lawnmower, no rake, no tree sapling, no fallen leaves in the frame.',
  P03: 'Two businesspeople standing in a bright modern office, shaking hands and facing each other. Neither is holding a phone. Desks and a window in the background, nobody touching the furniture.',
  P04: 'A young woman sitting at a café table, both hands typing on an open laptop. A full cup of coffee sits untouched on the table beside her. No coffee pot, no cleaning cloth in the frame.',
  P05: 'A warehouse worker in a safety vest stacking cardboard boxes into a neat pile on the floor. Fully stocked shelves in the background. No truck, no tape dispenser, no packing tape in the frame.',
  P06: 'An empty modern conference room with eight chairs neatly arranged around a long table. The table surface is completely clear. No people anywhere in the frame.',
};

const SUFFIX =
  ' Photorealistic photograph, natural lighting, 4:3 landscape orientation, no visible text, logos, or watermarks.';

const only = process.argv.slice(2);
const targets = listeningBank.filter(
  (it) => it.image && (only.length === 0 || only.includes(it.id))
);

mkdirSync(OUT_DIR, { recursive: true });

async function api(model, body) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function generatePng(prompt) {
  const json = await api(IMG_MODEL, { contents: [{ parts: [{ text: prompt }] }] });
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`画像が返らなかった: ${JSON.stringify(json).slice(0, 300)}`);
  return Buffer.from(part.inlineData.data, 'base64');
}

// 4文それぞれの真偽と最良の1文を判定させる
async function verify(pngBuffer, item) {
  const statements = item.options.map((t, i) => `${LETTERS[i]}: ${t}`).join('\n');
  const json = await api(VERIFY_MODEL, {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/png', data: pngBuffer.toString('base64') } },
          {
            text:
              'This photo is for a TOEIC Part 1 question. For each statement, judge strictly ' +
              'whether it is a factually true description of the photo. Then name the single best ' +
              'description.\n' + statements +
              '\nAnswer in exactly this format:\nA: true|false\nB: true|false\nC: true|false\nD: true|false\nBEST: <letter>',
          },
        ],
      },
    ],
  });
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const truths = LETTERS.map((l) => new RegExp(`${l}:\\s*true`, 'i').test(text));
  const best = /BEST:\s*([A-D])/i.exec(text)?.[1];
  const intended = LETTERS[item.answer];
  const ok = best === intended && truths.filter(Boolean).length === 1 && truths[item.answer];
  return { ok, best, truths, raw: text.trim() };
}

function pngToJpg(id, pngBuffer) {
  const pngPath = `${OUT_DIR}${id}.png`;
  writeFileSync(pngPath, pngBuffer);
  execFileSync('ffmpeg', [
    '-y', '-i', pngPath, '-vf', 'scale=900:-2', '-q:v', '4', `${OUT_DIR}${id}.jpg`,
  ], { stdio: 'pipe' });
  rmSync(pngPath);
}

for (const item of targets) {
  const scene = SCENES[item.id];
  if (!scene) {
    console.error(`${item.id}: SCENES にシーン指示がない`);
    process.exit(1);
  }
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    process.stdout.write(`${item.id} 生成${attempt}回目 ... `);
    const png = await generatePng(scene + SUFFIX);
    const result = await verify(png, item);
    if (result.ok) {
      pngToJpg(item.id, png);
      console.log(`OK(検証: BEST=${result.best})`);
      done = true;
    } else {
      console.log(`検証NG(BEST=${result.best}, truths=${result.truths}) → 再生成`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!done) {
    console.error(`${item.id}: 3回とも検証に失敗。SCENESの指示を見直してください`);
    process.exit(1);
  }
}
console.log(`完了: ${targets.length}件 → images/`);
