// 出題時に選択肢の並びをシャッフルする(非破壊)。
// バンク内の正解位置の偏りを消し、パターン推測を防ぐ。

export function shuffleOptions(item, rng = Math.random) {
  const indices = item.options.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    options: indices.map((i) => item.options[i]),
    answer: indices.indexOf(item.answer),
  };
}
