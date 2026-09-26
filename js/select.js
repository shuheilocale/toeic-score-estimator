// 適応型出題: 現在のθ推定(EAP)で Fisher情報量が高い未出題項目のうち、
// 上位K件からランダムに1つ選ぶ(randomesque法)。常に1位を出すと
// 全受験者・再受験で同じ問題列になるため、露出を分散させる。

import { eap, fisherInfo } from './irt.js';

const TOP_K = 3;

export function selectNextItem(bank, administeredIds, post, rng = Math.random) {
  const theta = eap(post);
  const candidates = bank
    .filter((item) => !administeredIds.has(item.id))
    .map((item) => ({ item, info: fisherInfo(theta, item) }))
    .sort((a, b) => b.info - a.info);
  if (candidates.length === 0) return null;
  const top = candidates.slice(0, TOP_K);
  return top[Math.floor(rng() * top.length)].item;
}
