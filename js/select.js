// 適応型出題: 現在のθ推定(EAP)で Fisher情報量が最大の未出題項目を選ぶ。

import { eap, fisherInfo } from './irt.js';

export function selectNextItem(bank, administeredIds, post) {
  const theta = eap(post);
  let best = null;
  let bestInfo = -Infinity;
  for (const item of bank) {
    if (administeredIds.has(item.id)) continue;
    const info = fisherInfo(theta, item);
    if (info > bestInfo) {
      bestInfo = info;
      best = item;
    }
  }
  return best;
}
