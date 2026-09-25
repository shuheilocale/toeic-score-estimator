// θの事後分布を TOEIC スコアの確率分布に変換する。
// 変換係数は公開されている受験者平均(L≈300, R≈270)に基づく近似で、
// 項目パラメータは実測校正ではないため簡易推定である。

const SECTION_MEAN = { L: 300, R: 270 };
const SLOPE = 90;
const SCORE_MIN = 5;
const SCORE_MAX = 495;

export function thetaToScore(theta, section) {
  const raw = SECTION_MEAN[section] + SLOPE * theta;
  const rounded = Math.round(raw / 5) * 5;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, rounded));
}

// θ事後分布 → セクションスコアの離散分布 { scores, probs }
export function sectionScoreDistribution(post, section) {
  const byScore = new Map();
  post.thetas.forEach((t, i) => {
    const s = thetaToScore(t, section);
    byScore.set(s, (byScore.get(s) ?? 0) + post.probs[i]);
  });
  return normalize(fromMap(byScore));
}

// 独立仮定のもとで L+R の畳み込み
export function totalScoreDistribution(distL, distR) {
  const byScore = new Map();
  distL.scores.forEach((sl, i) => {
    distR.scores.forEach((sr, j) => {
      const s = sl + sr;
      byScore.set(s, (byScore.get(s) ?? 0) + distL.probs[i] * distR.probs[j]);
    });
  });
  return normalize(fromMap(byScore));
}

// 離散分布の分位点(CDFがq以上になる最小スコア)
export function quantile(dist, q) {
  let cum = 0;
  for (let i = 0; i < dist.scores.length; i++) {
    cum += dist.probs[i];
    if (cum >= q - 1e-12) return dist.scores[i];
  }
  return dist.scores[dist.scores.length - 1];
}

// 中央信用区間 [lo, hi](例: mass=0.8 → 10%〜90%分位)
export function credibleInterval(dist, mass) {
  const tail = (1 - mass) / 2;
  return [quantile(dist, tail), quantile(dist, 1 - tail)];
}

function fromMap(byScore) {
  const scores = [...byScore.keys()].sort((x, y) => x - y);
  return { scores, probs: scores.map((s) => byScore.get(s)) };
}

function normalize({ scores, probs }) {
  const sum = probs.reduce((s, p) => s + p, 0);
  return { scores, probs: probs.map((p) => p / sum) };
}
