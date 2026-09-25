// 画面フロー: start → listening → reading → result
// 回答のたびにθの事後分布を更新し、情報量最大の問題を適応的に出題する。

import { listeningBank, readingBank, TEST_PLAN } from './items.js';
import { createPosterior, updatePosterior } from './irt.js';
import { selectNextItem } from './select.js';
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
  L: { name: 'リスニング', bank: listeningBank, plan: TEST_PLAN.listening },
  R: { name: 'リーディング', bank: readingBank, plan: TEST_PLAN.reading },
};

const state = {
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
  if (!isTTSSupported()) {
    status.textContent = 'このブラウザは音声に対応していません。スクリプト表示で受験できます。';
    status.classList.add('ng');
    return;
  }
  status.textContent = '再生しています…';
  try {
    state.voices = state.voices ?? (await initVoices());
    const used = await speakScript(
      [{ v: 'A', text: 'This is a listening check. If you can hear this voice clearly, you are ready to begin.' }],
      state.voices
    );
    state.voices = used;
    const names = used.A === used.B ? used.A.name : `${used.A.name} / ${used.B.name}`;
    status.textContent = `聞こえていればOKです。(音声: ${names})`;
    status.classList.add('ok');
  } catch {
    status.textContent = '音声を再生できませんでした。スクリプト表示で受験できます。';
    status.classList.add('ng');
  }
});

$('btn-start').addEventListener('click', async () => {
  if (isTTSSupported() && !state.voices) {
    state.voices = await initVoices();
  }
  startSection('L');
});

$('btn-retry').addEventListener('click', () => location.reload());

// ---------- セクション進行 ----------

function startSection(sec) {
  state.section = sec;
  const { name, plan } = SECTIONS[sec];
  $('section-label').textContent = name;
  renderProgress();
  showScreen('screen-test');
  startTimer(plan.timeLimitSec);
  askNext();
}

function endSection() {
  stopTimer();
  state.audioToken++;
  cancelSpeech();
  if (state.section === 'L') {
    startSection('R');
  } else {
    showResult();
  }
}

function askNext() {
  const sec = state.section;
  const { bank, plan } = SECTIONS[sec];
  if (state.answered[sec] >= plan.count) {
    endSection();
    return;
  }
  const item = selectNextItem(bank, state.administered, state.posterior[sec]);
  if (!item) {
    endSection();
    return;
  }
  state.administered.add(item.id);
  const { options, answer } = shuffleOptions(item);
  state.current = { item, options, answer };
  state.locked = false;
  presentItem();
}

function presentItem() {
  const sec = state.section;
  const { item, options } = state.current;
  renderProgress();

  $('question-no').textContent = `Q${state.answered[sec] + 1} / ${SECTIONS[sec].plan.count}`;
  $('question-text').textContent = item.question;

  const passageEl = $('passage');
  passageEl.hidden = item.passage === undefined;
  if (item.passage !== undefined) passageEl.textContent = item.passage;

  const optionsEl = $('options');
  optionsEl.textContent = '';
  options.forEach((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    const bubble = document.createElement('span');
    bubble.className = 'bubble';
    bubble.textContent = LETTERS[i];
    const label = document.createElement('span');
    label.textContent = text;
    btn.append(bubble, label);
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

async function playCurrentAudio() {
  const { item } = state.current;
  const token = ++state.audioToken;
  const stateEl = $('audio-state');

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
  stateEl.textContent = '再生中…';
  stateEl.classList.add('speaking');
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
  if (script.length === 1) return script[0].text;
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
  const { plan } = SECTIONS[sec];
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
  const planCount = SECTIONS[sec].plan.count;

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
    'この結果は約10分・最大20問の簡易テストによる推定です。分布の幅は「その範囲に収まる確からしさ」を表します。',
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
