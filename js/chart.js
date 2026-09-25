// 結果画面のチャート描画。SVGはCSSカスタムプロパティで着色し、
// ライト/ダーク両モードに追従する。

const NS = 'http://www.w3.org/2000/svg';

// 合計スコアの確率密度曲線 + 80%信用区間帯 + 中央値。
// ホバー(ポインタ)で「そのスコア以下に収まる確率」を表示する。
export function renderDensityChart(container, rawDist, { ci, median }) {
  container.textContent = '';
  // 5点刻みの離散畳み込みはギザつくため、表示専用に平滑化する。
  // 分位点・数値テーブルは生の分布から計算済みで、ここでは形だけを整える。
  const dist = smoothForDisplay(rawDist);

  const W = 640;
  const H = 240;
  const pad = { top: 34, right: 16, bottom: 30, left: 16 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xMin = 10;
  const xMax = 990;
  const maxP = Math.max(...dist.probs);
  const x = (score) => pad.left + ((score - xMin) / (xMax - xMin)) * plotW;
  const y = (p) => pad.top + plotH - (p / maxP) * plotH;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `合計スコアの確率分布。中央値${median}点、80%の確率で${ci[0]}点から${ci[1]}点の範囲。`,
  });
  svg.classList.add('density-chart');

  // 曲線パス(データ点を順に結ぶ)
  const pts = dist.scores.map((s, i) => [x(s), y(dist.probs[i])]);
  const linePath = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const baseline = pad.top + plotH;

  // 全体の面ウォッシュ
  svg.append(el('path', {
    d: `${linePath}L${x(dist.scores.at(-1)).toFixed(1)},${baseline}L${x(dist.scores[0]).toFixed(1)},${baseline}Z`,
    class: 'area-wash',
  }));

  // 80%信用区間の帯(曲線の下だけを塗る)
  const bandPts = pts.filter((_, i) => dist.scores[i] >= ci[0] && dist.scores[i] <= ci[1]);
  if (bandPts.length > 1) {
    const bandPath = bandPts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    svg.append(el('path', {
      d: `${bandPath}L${bandPts.at(-1)[0].toFixed(1)},${baseline}L${bandPts[0][0].toFixed(1)},${baseline}Z`,
      class: 'area-band',
    }));
  }

  // X軸(ベースライン+目盛り)
  svg.append(el('line', { x1: pad.left, y1: baseline, x2: W - pad.right, y2: baseline, class: 'axis-line' }));
  for (const tick of [200, 400, 600, 800]) {
    svg.append(el('line', { x1: x(tick), y1: baseline, x2: x(tick), y2: baseline + 4, class: 'axis-line' }));
    svg.append(text(x(tick), baseline + 18, String(tick), 'axis-label', 'middle'));
  }

  // 密度曲線
  svg.append(el('path', { d: linePath, class: 'density-line' }));

  // 中央値の縦線とラベル
  const mx = x(median);
  svg.append(el('line', { x1: mx, y1: pad.top - 6, x2: mx, y2: baseline, class: 'median-line' }));
  svg.append(text(mx, pad.top - 12, `${median}`, 'median-label', anchorFor(mx, W)));

  // ホバー用クロスヘア+ツールチップ
  const crosshair = el('line', { y1: pad.top, y2: baseline, class: 'crosshair', hidden: '' });
  svg.append(crosshair);
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  container.append(svg, tooltip);

  const cdf = [];
  dist.probs.reduce((cum, p, i) => (cdf[i] = cum + p), 0);

  svg.addEventListener('pointermove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const score = xMin + ((px - pad.left) / plotW) * (xMax - xMin);
    if (score < dist.scores[0] || score > dist.scores.at(-1)) {
      hide();
      return;
    }
    let idx = dist.scores.findIndex((s) => s >= score);
    if (idx < 0) idx = dist.scores.length - 1;
    const sx = x(dist.scores[idx]);
    crosshair.setAttribute('x1', sx);
    crosshair.setAttribute('x2', sx);
    crosshair.removeAttribute('hidden');
    tooltip.textContent = `${dist.scores[idx]}点以下に収まる確率 ${(cdf[idx] * 100).toFixed(0)}%`;
    tooltip.hidden = false;
    const left = Math.min(Math.max((sx / W) * rect.width, 70), rect.width - 70);
    tooltip.style.left = `${left}px`;
  });
  svg.addEventListener('pointerleave', hide);

  function hide() {
    crosshair.setAttribute('hidden', '');
    tooltip.hidden = true;
  }
}

// L/R セクションの区間バー(5〜495のトラック上に80%帯と中央値ドット)
export function renderIntervalBar(container, { lo, hi, median }) {
  container.textContent = '';
  const min = 5;
  const max = 495;
  const pct = (v) => `${(((v - min) / (max - min)) * 100).toFixed(1)}%`;

  const track = document.createElement('div');
  track.className = 'interval-track';
  const band = document.createElement('div');
  band.className = 'interval-band';
  band.style.left = pct(lo);
  band.style.width = `${(((hi - lo) / (max - min)) * 100).toFixed(1)}%`;
  const dot = document.createElement('div');
  dot.className = 'interval-dot';
  dot.style.left = pct(median);
  track.append(band, dot);
  container.append(track);
}

// ガウスカーネル(σ=3ビン≒15点)で確率列を平滑化する。合計は1のまま。
function smoothForDisplay(dist) {
  const sigma = 3;
  const radius = sigma * 3;
  const kernel = [];
  for (let k = -radius; k <= radius; k++) {
    kernel.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  }
  const kSum = kernel.reduce((s, v) => s + v, 0);
  const probs = dist.probs.map((_, i) => {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = Math.min(Math.max(i + k, 0), dist.probs.length - 1);
      acc += dist.probs[j] * kernel[k + radius];
    }
    return acc / kSum;
  });
  const total = probs.reduce((s, p) => s + p, 0);
  return { scores: dist.scores, probs: probs.map((p) => p / total) };
}

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function text(x, y, content, cls, anchor) {
  const node = el('text', { x, y, class: cls, 'text-anchor': anchor });
  node.textContent = content;
  return node;
}

function anchorFor(x, width) {
  if (x < 60) return 'start';
  if (x > width - 60) return 'end';
  return 'middle';
}
