// 項目反応理論(3PLモデル)の数理コア。ブラウザ/Node 両対応の純粋関数群。

const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_STEP = 0.05;

// 正答確率 P(θ) = c + (1-c) / (1 + exp(-a(θ-b)))
export function prob3PL(theta, { a, b, c }) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

// 3PLのFisher情報量 I(θ) = a^2 * (Q/P) * ((P-c)/(1-c))^2
export function fisherInfo(theta, item) {
  const p = prob3PL(theta, item);
  const q = 1 - p;
  const { a, c } = item;
  const ratio = (p - c) / (1 - c);
  return a * a * (q / p) * ratio * ratio;
}

// θのグリッド事後分布。初期状態は事前 N(0,1) を離散化・正規化したもの。
export function createPosterior() {
  const thetas = [];
  const probs = [];
  for (let t = GRID_MIN; t <= GRID_MAX + 1e-9; t += GRID_STEP) {
    thetas.push(t);
    probs.push(Math.exp(-0.5 * t * t));
  }
  return normalize({ thetas, probs });
}

// 回答1件で事後分布をベイズ更新した新しい分布を返す(非破壊)。
export function updatePosterior(post, item, correct) {
  const probs = post.probs.map((p, i) => {
    const pCorrect = prob3PL(post.thetas[i], item);
    return p * (correct ? pCorrect : 1 - pCorrect);
  });
  return normalize({ thetas: post.thetas, probs });
}

// EAP(事後期待値)
export function eap(post) {
  return post.thetas.reduce((s, t, i) => s + t * post.probs[i], 0);
}

// 事後標準偏差
export function posteriorSD(post) {
  const mean = eap(post);
  const variance = post.thetas.reduce(
    (s, t, i) => s + (t - mean) * (t - mean) * post.probs[i],
    0
  );
  return Math.sqrt(variance);
}

function normalize({ thetas, probs }) {
  const sum = probs.reduce((s, p) => s + p, 0);
  return { thetas, probs: probs.map((p) => p / sum) };
}
