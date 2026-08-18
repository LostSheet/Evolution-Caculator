// 곡선에 세울 수 있는 축.
//
// 탐색은 한 방 딜 × DPS와 한 방 딜 × 쿨감, 두 곡선만 미리 뽑는다. 그 밖의
// 조합은 남은 점들 위에서 다시 그린다 — 탐색이 무엇을 남길지는 정해진 축이
// 정했으므로 낯선 조합에서는 곡선이 성길 수 있다.
import { formatNumber, formatInteger } from "./util.js";

const percent = value => `${Math.round(value * 10) / 10}%`;

export const CHART_AXES = [
  { key: "damageIndex", label: "한 방 딜", tick: formatInteger },
  { key: "dpsIndex", label: "DPS", tick: formatInteger },
  { key: "cooldownReduction", label: "쿨타임 감소", tick: percent },
  { key: "critRateRaw", label: "치명타 적중률", tick: percent },
  { key: "critDamage", label: "치명타 피해", tick: percent },
  { key: "attackSpeedBonus", label: "공격 속도", tick: percent },
  { key: "moveSpeedBonus", label: "이동 속도", tick: percent },
];

export function chartAxis(key, fallback) {
  return CHART_AXES.find(axis => axis.key === key)
    ?? CHART_AXES.find(axis => axis.key === fallback)
    ?? CHART_AXES[0];
}

/** 값을 축의 눈금대로 읽는다. 툴팁이 쓴다. */
export function axisValue(axis, entry) {
  const value = entry?.[axis.key];
  return Number.isFinite(value) ? formatNumber(value) : "—";
}
