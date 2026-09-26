// 画面フロー: start → listening → reading → result
// 回答のたびにθの事後分布を更新し、情報量最大の問題を適応的に出題する。

import { listeningBank, readingBank, TEST_PLANS } from './items.js';
import { createPosterior, updatePosterior } from './irt.js';
import { selectNextItem, listeningPool } from './select.js';
import {
  sectionScoreDistribution,
  totalScoreDistribution,
  quantile,
  credibleInterval,
} from './scoring.js';
import { shuffleOptions } from './shuffle.js';
import { isTTSSupported, initVoices, speakScript, cancelSpeech } from './tts.js';
import { renderDensityChart, renderIntervalBar } from './chart.js';

const $ = (id) => document.getElementById(id);
const LETTERS = ['A', 'B', 'C', 'D'];
const LOW_TIME_SEC = 30;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SECTIONS = {
  L: { name: 'リスニング', bank: listeningBank },
  R: { name: 'リーディング', bank: readingBank },
};

function planFor(sec) {
  return sec === 'L' ? state.plan.listening : state.plan.reading;
}

const state = {
  plan: TEST_PLANS.standard,
  section: null,
  posterior: { L: createPosterior(), R: createPosterior() },
  administered: new Set(),
  answered: { L: 0, R: 0 },
  correct: { L: 0, R: 0 },
  responses: [],
  current: null,
  replaysLeft: 0,
  timer: { remaining: 0, total: 0, id: null },
  voices: null,
  ttsFallback: false,
  audioToken: 0,
  locked: false,
};

// ---------- 画面切替 ----------

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  window.scrollTo(0, 0);
}

// ---------- スタート画面 ----------

$('btn-audio-check').addEventListener('click', async () => {
  const status = $('audio-check-status');
  status.className = 'audio-status';
  status.textContent = '再生しています…';

  // まず事前生成音声(ニューラルTTS)を試す
  try {
    await playAudioFile('audio/check.m4a');
    status.textContent = '聞こえていればOKです。(高品質音声)';
    status.classList.add('ok');
    return;
  } catch {
    // ファイルが無い/再生できない場合はブラウザ読み上げへ
  }

  if (!isTTSSupported()) {
    status.textContent = 'このブラウザは音声に対応していません。スクリプト表示で受験できます。';
    status.classList.add('ng');
    return;
  }
  try {
    state.voices = state.voices ?? (await initVoices());
    const used = await speakScript(
      [{ v: 'W', text: 'This is a listening check. If you can hear this voice clearly, you are ready to begin.' }],
      state.voices
    );
    state.voices = used;
    const names = used.W === used.M ? used.W.name : `${used.W.name} / ${used.M.name}`;
    status.textContent = `聞こえていればOKです。(音声: ${names})`;
    status.classList.add('ok');
  } catch {
    status.textContent = '音声を再生できませんでした。スクリプト表示で受験できます。';
    status.classList.add('ng');
  }
});

$('btn-start').addEventListener('click', async () => {
  const selected = document.querySelector('input[name="plan"]:checked');
  state.plan = TEST_PLANS[selected?.value] ?? TEST_PLANS.standard;
  if (isTTSSupported() && !state.voices) {
    state.voices = await initVoices();
  }
  startSection('L');
});

$('btn-retry').addEventListener('click', () => location.reload());

// ---------- セクション進行 ----------

function startSection(sec) {
  state.section = sec;
  const plan = planFor(sec);
  $('section-label').textContent = SECTIONS[sec].name;
  renderProgress();
  showScreen('screen-test');
  startTimer(plan.timeLimitSec);
  askNext();
}

function endSection() {
  stopTimer();
  state.audioToken++;
  stopAudioFile();
  cancelSpeech();
  if (state.section === 'L') {
    startSection('R');
  } else {
    showResult();
  }
}

function askNext() {
  const sec = state.section;
  const { bank } = SECTIONS[sec];
  if (state.answered[sec] >= planFor(sec).count) {
    endSection();
    return;
  }
  // リスニングは冒頭に写真描写問題(Part 1風)をクォータ分だけ出す
  const pool =
    sec === 'L'
      ? listeningPool(bank, state.administered, planFor('L').photoCount ?? 0)
      : bank;
  const item = selectNextItem(pool, state.administered, state.posterior[sec]);
  if (!item) {
    endSection();
    return;
  }
  state.administered.add(item.id);
  // 写真問題は音声に選択肢の順序(A〜D)が焼き込まれているためシャッフル不可
  const { options, answer } = item.image
    ? { options: item.options, answer: item.answer }
    : shuffleOptions(item);
  state.current = { item, options, answer };
  state.locked = false;
  presentItem();
}

function presentItem() {
  const sec = state.section;
  const { item, options } = state.current;
  renderProgress();

  $('question-no').textContent = `Q${state.answered[sec] + 1} / ${planFor(sec).count}`;
  $('question-text').textContent = item.question;

  const passageEl = $('passage');
  passageEl.hidden = item.passage === undefined;
  if (item.passage !== undefined) passageEl.textContent = item.passage;

  const isPhoto = Boolean(item.image);
  const photoPanel = $('photo-panel');
  photoPanel.hidden = !isPhoto;
  if (isPhoto) $('photo-img').src = item.image;
  $('photo-hint').hidden = !isPhoto;

  // 写真問題は本物のPart 1と同様に選択肢の英文を表示せず、A〜Dのマークだけ置く
  const optionsEl = $('options');
  optionsEl.textContent = '';
  optionsEl.classList.toggle('photo-row', isPhoto);
  options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    const bubble = document.createElement('span');
    bubble.className = 'bubble';
    bubble.textContent = LETTERS[i];
    btn.append(bubble);
    if (isPhoto) {
      btn.setAttribute('aria-label', `選択肢${LETTERS[i]}`);
    } else {
      const label = document.createElement('span');
      label.textContent = text;
      btn.append(label);
    }
    btn.addEventListener('click', () => onAnswer(i, btn));
    optionsEl.append(btn);
  });

  $('transcript').hidden = true;
  if (sec === 'L') {
    state.replaysLeft = 1;
    $('audio-panel').hidden = false;
    updateReplayButton();
    playCurrentAudio();
  } else {
    $('audio-panel').hidden = true;
  }
}

// ---------- リスニング音声 ----------
// 優先順: 事前生成音声ファイル(ニューラルTTS) → ブラウザ読み上げ → スクリプト表示

let currentAudio = null;

function playAudioFile(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('audio-load-failed'));
    audio.play().catch(reject);
  });
}

function stopAudioFile() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio = null;
  }
}

async function playCurrentAudio() {
  const { item } = state.current;
  const token = ++state.audioToken;
  const stateEl = $('audio-state');
  stopAudioFile();

  stateEl.textContent = '再生中…';
  stateEl.classList.add('speaking');

  try {
    await playAudioFile(`audio/${item.id}.m4a`);
    if (token !== state.audioToken) return;
    stateEl.textContent = '再生が終わりました。';
    stateEl.classList.remove('speaking');
    return;
  } catch {
    if (token !== state.audioToken) return;
    // ファイルが無い環境ではブラウザ読み上げへフォールバック
  }

  if (!isTTSSupported()) {
    showTranscriptFallback();
    return;
  }
  if (!state.voices) {
    state.voices = await initVoices();
    if (token !== state.audioToken) return;
    if (!state.voices) {
      showTranscriptFallback();
      return;
    }
  }
  try {
    await speakScript(item.script, state.voices);
    if (token !== state.audioToken) return;
    stateEl.textContent = '再生が終わりました。';
    stateEl.classList.remove('speaking');
  } catch (e) {
    if (token !== state.audioToken || e.message === 'canceled') return;
    showTranscriptFallback();
  }
}

function showTranscriptFallback() {
  const { item } = state.current;
  state.ttsFallback = true;
  $('audio-state').textContent = '音声を再生できないため、スクリプトを表示しています。';
  $('audio-state').classList.remove('speaking');
  $('btn-replay').disabled = true;
  const el = $('transcript');
  el.textContent = formatScript(item.script);
  el.hidden = false;
}

function formatScript(script) {
  // 話者が1人だけなら M:/W: の接頭辞は付けない(アナウンス・写真問題)
  const speakers = new Set(script.map((l) => l.v));
  if (speakers.size < 2) return script.map((l) => l.text).join('\n');
  return script.map((line) => `${line.v}: ${line.text}`).join('\n');
}

$('btn-replay').addEventListener('click', () => {
  if (state.replaysLeft <= 0) return;
  state.replaysLeft--;
  updateReplayButton();
  playCurrentAudio();
});

function updateReplayButton() {
  const btn = $('btn-replay');
  btn.disabled = state.replaysLeft <= 0;
  btn.textContent = `もう一度聞く(残り${state.replaysLeft}回)`;
}

// ---------- 回答処理 ----------

function onAnswer(index, btn) {
  if (state.locked) return;
  state.locked = true;
  state.audioToken++;
  stopAudioFile();
  cancelSpeech();

  const sec = state.section;
  const { item, options, answer } = state.current;
  const correct = index === answer;

  btn.classList.add('marked');
  for (const b of document.querySelectorAll('.option')) b.disabled = true;

  state.posterior[sec] = updatePosterior(state.posterior[sec], item, correct);
  state.answered[sec]++;
  if (correct) state.correct[sec]++;
  state.responses.push({
    section: sec,
    item,
    options,
    answer,
    chosen: index,
    correct,
  });

  setTimeout(askNext, reducedMotion ? 0 : 280);
}

// ---------- タイマー ----------

function startTimer(totalSec) {
  stopTimer();
  state.timer.total = totalSec;
  state.timer.remaining = totalSec;
  renderTimer();
  state.timer.id = setInterval(() => {
    state.timer.remaining--;
    renderTimer();
    if (state.timer.remaining <= 0) endSection();
  }, 1000);
}

function stopTimer() {
  if (state.timer.id) clearInterval(state.timer.id);
  state.timer.id = null;
}

function renderTimer() {
  const { remaining, total } = state.timer;
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, '0');
  const timerEl = $('timer');
  timerEl.textContent = `${m}:${s}`;
  timerEl.classList.toggle('low', remaining <= LOW_TIME_SEC);
  const fill = $('timer-fill');
  fill.style.width = `${(remaining / total) * 100}%`;
  fill.classList.toggle('low', remaining <= LOW_TIME_SEC);
}

function renderProgress() {
  const sec = state.section;
  const plan = planFor(sec);
  const dots = $('progress-dots');
  dots.textContent = '';
  for (let i = 0; i < plan.count; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    if (i < state.answered[sec]) d.classList.add('done');
    else if (i === state.answered[sec]) d.classList.add('current');
    dots.append(d);
  }
}

// ---------- 結果 ----------

function showResult() {
  const distL = sectionScoreDistribution(state.posterior.L, 'L');
  const distR = sectionScoreDistribution(state.posterior.R, 'R');
  const total = totalScoreDistribution(distL, distR);
  const median = quantile(total, 0.5);
  const [lo, hi] = credibleInterval(total, 0.8);

  $('total-median').textContent = median;
  $('total-ci').textContent = `80%の確率で ${lo}〜${hi}点 の範囲と推定されます。`;

  renderDensityChart($('chart'), total, { ci: [lo, hi], median });

  const tbody = $('quantile-table').querySelector('tbody');
  tbody.textContent = '';
  for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const tr = document.createElement('tr');
    const th = document.createElement('td');
    th.textContent = `${Math.round(q * 100)}%`;
    const td = document.createElement('td');
    td.textContent = `${quantile(total, q)}点`;
    tr.append(th, td);
    tbody.append(tr);
  }

  renderSectionResult('L', distL);
  renderSectionResult('R', distR);
  renderCaveats();
  renderReview();
  showScreen('screen-result');
}

function renderSectionResult(sec, dist) {
  const prefix = sec.toLowerCase();
  const med = quantile(dist, 0.5);
  const [lo, hi] = credibleInterval(dist, 0.8);
  const answered = state.answered[sec];
  const planCount = planFor(sec).count;

  const summary = $(`${prefix}-summary`);
  summary.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = med;
  summary.append(strong, `点(80%: ${lo}〜${hi})`);

  renderIntervalBar($(`${prefix}-interval`), { lo, hi, median: med });

  const notes = [`正答 ${state.correct[sec]} / 回答 ${answered}問`];
  if (answered === 0) {
    notes.push('回答がなかったため推定できません(事前分布のまま表示しています)。');
  } else if (answered < planCount) {
    notes.push('時間切れのため回答数が少なく、推定の幅が広めに出ています。');
  }
  if (sec === 'L' && state.ttsFallback) {
    notes.push('音声の代わりにスクリプトを読んで解答したため、実際のリスニング力とずれる可能性があります。');
  }
  $(`${prefix}-note`).textContent = notes.join(' ');
}

function renderCaveats() {
  const box = $('result-caveats');
  box.textContent = '';
  const lines = [
    `この結果は約${state.plan.minutes}分・最大${state.plan.listening.count + state.plan.reading.count}問の簡易テストによる推定です。分布の幅は「その範囲に収まる確からしさ」を表します。`,
    '問題の難易度は実際の受験データで校正したものではないため、目安としてご利用ください。',
  ];
  for (const t of lines) {
    const p = document.createElement('p');
    p.textContent = t;
    box.append(p);
  }
}

function renderReview() {
  const list = $('review-list');
  list.textContent = '';
  for (const r of state.responses) {
    const li = document.createElement('li');

    const head = document.createElement('p');
    head.className = 'review-q';
    const verdict = document.createElement('span');
    verdict.className = `review-verdict ${r.correct ? 'ok' : 'ng'}`;
    verdict.textContent = r.correct ? '正解' : '不正解';
    head.append(verdict, ` [${SECTIONS[r.section].name}] `);
    const q = document.createElement('span');
    q.className = 'review-en';
    q.textContent = r.item.question;
    head.append(q);
    li.append(head);

    if (r.item.image) {
      const img = document.createElement('img');
      img.className = 'review-photo';
      img.src = r.item.image;
      img.alt = '写真描写問題の写真';
      img.loading = 'lazy';
      li.append(img);
    }
    if (r.item.script) {
      const script = document.createElement('p');
      script.className = 'review-en review-note';
      script.textContent = formatScript(r.item.script);
      li.append(script);
    }
    if (r.item.passage !== undefined) {
      const passage = document.createElement('p');
      passage.className = 'review-en review-note';
      passage.textContent = r.item.passage;
      li.append(passage);
    }

    const answers = document.createElement('p');
    answers.className = 'review-note';
    const yours = `${LETTERS[r.chosen]}. ${r.options[r.chosen]}`;
    const right = `${LETTERS[r.answer]}. ${r.options[r.answer]}`;
    answers.textContent = r.correct
      ? `あなたの解答: ${yours}`
      : `あなたの解答: ${yours} / 正解: ${right}`;
    li.append(answers);

    const note = document.createElement('p');
    note.className = 'review-note';
    note.textContent = r.item.jaNote;
    li.append(note);

    list.append(li);
  }
}
