// 감마 스윕.
//
// 축은 셋이 아니라 둘이다. dpsIndex = damageIndex ÷ (1 − 쿨감/100) 이므로
// DPS는 한 방 딜과 쿨감의 함수지 독립 축이 아니다.
//
// 쿨감이 실전에서 얼마나 사이클 단축으로 전환되는지를 λ 하나로 담는다.
//
//   실전 지표(λ) = 한 방 딜 ÷ (1 − λ · 쿨감/100)
//
//   λ = 1  쿨감이 100% 굴러간다 — 지금의 DPS
//   λ = 0  전혀 못 굴린다 — 순수 한 방 딜
//
// λ를 물어보면 그 감이 결과를 지배한다. 그래서 묻지 않고 0~1을 전부 훑어
// "이 빌드가 1등인 λ 구간"을 구한다. 넓은 구간을 지배하는 빌드가 견고하다 —
// λ를 몰라도 어떤 값을 믿든 최선이기 때문이다.
//
// 후보는 파레토 프론트 위의 점들뿐이라 재탐색이 없다.
import { clamp, readNumber } from "./util.js";

// 쿨감 상한(80%)은 계산 그대로 따른다.
const COOLDOWN_CAP = 80;

/** λ에서의 실전 지표. */
export function scoreAt(entry, lambda) {
  const cooldown = clamp(readNumber(entry.cooldownReduction), 0, COOLDOWN_CAP);
  return entry.damageIndex / (1 - (lambda * cooldown) / 100);
}

// 두 빌드의 점수가 같아지는 λ. 없으면 null.
//
//   d1 / (1 − λc1) = d2 / (1 − λc2)
//   d1 − λ·d1·c2 = d2 − λ·d2·c1
//   λ = (d1 − d2) / (d1·c2 − d2·c1)
function crossing(a, b) {
  const d1 = a.damageIndex;
  const d2 = b.damageIndex;
  const c1 = clamp(readNumber(a.cooldownReduction), 0, COOLDOWN_CAP) / 100;
  const c2 = clamp(readNumber(b.cooldownReduction), 0, COOLDOWN_CAP) / 100;
  const denominator = d1 * c2 - d2 * c1;
  if (Math.abs(denominator) < 1e-12) return null;
  const lambda = (d1 - d2) / denominator;
  return lambda > 0 && lambda < 1 ? lambda : null;
}

/**
 * 각 빌드가 1등인 λ 구간을 구한다.
 *
 * 지배자는 두 빌드의 교차점에서만 바뀌므로, 교차점들로 λ를 잘라
 * 각 조각의 중앙에서 승자를 정하면 구간이 정확히 나온다. 표본 추출이 아니다.
 *
 * @param {object[]} front 파레토 프론트
 * @returns {{segments: object[], byId: Map<string, object>}}
 */
export function sweepGamma(front) {
  const empty = { segments: [], byId: new Map() };
  if (!Array.isArray(front) || front.length === 0) return empty;

  const cuts = new Set([0, 1]);
  for (let i = 0; i < front.length; i += 1) {
    for (let j = i + 1; j < front.length; j += 1) {
      const lambda = crossing(front[i], front[j]);
      if (lambda !== null) cuts.add(lambda);
    }
  }

  const edges = [...cuts].sort((a, b) => a - b);
  const raw = [];

  for (let i = 0; i < edges.length - 1; i += 1) {
    const from = edges[i];
    const to = edges[i + 1];
    if (to - from < 1e-9) continue;

    const middle = (from + to) / 2;
    let winner = front[0];
    let best = scoreAt(front[0], middle);
    for (const entry of front) {
      const score = scoreAt(entry, middle);
      if (score > best) { best = score; winner = entry; }
    }
    raw.push({ from, to, entry: winner });
  }

  // 같은 빌드가 연달아 이기면 한 구간으로 합친다.
  const segments = [];
  for (const piece of raw) {
    const last = segments[segments.length - 1];
    if (last && last.entry.id === piece.entry.id) last.to = piece.to;
    else segments.push({ ...piece });
  }

  const byId = new Map();
  for (const segment of segments) {
    segment.width = segment.to - segment.from;
    const found = byId.get(segment.entry.id);
    if (found) {
      found.width += segment.width;
      found.segments.push(segment);
    } else {
      byId.set(segment.entry.id, {
        entry: segment.entry,
        width: segment.width,
        segments: [segment],
      });
    }
  }

  // 가장 넓은 λ 구간을 지배하는 빌드가 추천. 동률이면 한 방 딜이 높은 쪽.
  let champion = null;
  for (const item of byId.values()) {
    if (!champion
      || item.width > champion.width + 1e-9
      || (Math.abs(item.width - champion.width) < 1e-9 && item.entry.damageIndex > champion.entry.damageIndex)) {
      champion = item;
    }
  }
  for (const item of byId.values()) item.champion = item === champion;

  return { segments, byId, championId: champion?.entry.id ?? null };
}
