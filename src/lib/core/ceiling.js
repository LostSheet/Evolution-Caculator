// 쿨감 소화 한계 스윕.
//
// λ가 어려웠던 이유는 단위가 없어서다. "쿨감이 33% 전환된다"는 말은 아무도
// 자기 로테이션에 대입할 수 없다. 같은 생각을 게임에서 읽는 단위로 옮긴다.
//
// 딜 사이클의 길이는 이렇게 정해진다:
//
//   사이클 = max( 쿨타임에 묶인 시간, 안 줄어드는 시간 )
//
// 뒤쪽은 시전 시간·보스 패턴·이동처럼 쿨감이 건드릴 수 없는 몫이다. 그래서
// 쿨감은 어느 지점까지만 사이클을 줄이고, 그 위로는 버려진다. 그 지점을
// '소화 한계'라 부른다 — 단위가 %이고, 쿨감과 같은 눈금이다.
//
//   DPS 배수 = 1 / (1 − min(쿨감, 한계)/100)
//
//   한계 0%    쿨감이 하나도 안 먹힘 → 한 방 딜 순위 그대로
//   한계 25%   쿨감 25%까지만 소화. 40% 쌓은 빌드는 15%를 버린 셈이다.
//   한계 ≥ 최대 전부 소화 → 지금의 DPS 순위 그대로
//
// 한계를 물어보지 않고 0부터 훑어서 "이 빌드가 1등인 한계 구간"을 구한다.
// 읽을 때 "내 로테이션은 쿨감 30%쯤에서 막힌다" 하나만 대입하면 된다.
import { clamp, readNumber } from "./util.js";

const COOLDOWN_CAP = 80;

const cooldownOf = entry => clamp(readNumber(entry.cooldownReduction), 0, COOLDOWN_CAP);

/** 소화 한계가 cap일 때의 실전 지표. */
export function scoreAtCeiling(entry, cap) {
  const used = Math.min(cooldownOf(entry), clamp(readNumber(cap), 0, COOLDOWN_CAP));
  return readNumber(entry.damageIndex) / (1 - used / 100);
}

/**
 * 각 빌드가 1등인 소화 한계 구간을 구한다.
 *
 * 한계 κ에서 후보는 딱 둘뿐이다. 이미 다 소화한 빌드 중에서는 DPS가 가장 높은
 * 쪽이, 아직 남는 빌드 중에서는 한 방 딜이 가장 높은 쪽이 이긴다. 프론트를
 * 한 방 딜 내림차순으로 세우면 그 둘은 언제나 이웃한 두 지점이다.
 *
 *   경계 κ* = 100 × (1 − d[i+1] / dps[i])
 *
 * 그 경계는 반드시 c[i]와 c[i+1] 사이에 있으므로, 프론트의 모든 지점이
 * 각각 정확히 하나의 연속 구간을 가져간다. 빈손으로 남는 지점이 없다.
 *
 * @param {object[]} front 파레토 프론트
 * @returns {{segments: object[], byId: Map<string, object>, championId: ?string, maxCeiling: number}}
 */
export function sweepCeiling(front) {
  const empty = { segments: [], byId: new Map(), championId: null, maxCeiling: 0 };
  if (!Array.isArray(front) || front.length === 0) return empty;

  const points = front
    .map(entry => ({ entry, damage: readNumber(entry.damageIndex), cooldown: cooldownOf(entry) }))
    .sort((a, b) => b.damage - a.damage || a.cooldown - b.cooldown);

  // 한계를 그 위로 더 올려도 아무것도 안 바뀌는 지점에서 멈춘다.
  const maxCeiling = points.reduce((max, point) => Math.max(max, point.cooldown), 0);
  if (points.length === 1 || maxCeiling <= 0) {
    const only = points[0];
    const segment = { from: 0, to: Math.max(maxCeiling, 1), width: 1, entry: only.entry };
    return {
      segments: [segment],
      byId: new Map([[only.entry.id, { entry: only.entry, width: 1, segments: [segment] }]]),
      championId: only.entry.id,
      maxCeiling: Math.max(maxCeiling, 1),
    };
  }

  const cuts = [0];
  for (let i = 0; i < points.length - 1; i += 1) {
    const dps = points[i].damage / (1 - points[i].cooldown / 100);
    const boundary = 100 * (1 - points[i + 1].damage / dps);
    // 프론트가 완전한 파레토라면 경계는 늘 앞 구간 안쪽이지만, 수치 오차나
    // 동률로 어긋날 수 있으므로 단조가 되도록 눌러 둔다.
    cuts.push(clamp(boundary, cuts[cuts.length - 1], maxCeiling));
  }
  cuts.push(maxCeiling);

  const raw = [];
  for (let i = 0; i < points.length; i += 1) {
    const from = cuts[i];
    const to = cuts[i + 1];
    if (to - from < 1e-9) continue;
    raw.push({ from, to, entry: points[i].entry });
  }

  const segments = [];
  for (const piece of raw) {
    const last = segments[segments.length - 1];
    if (last && last.entry.id === piece.entry.id) last.to = piece.to;
    else segments.push({ ...piece });
  }

  const byId = new Map();
  for (const segment of segments) {
    segment.width = (segment.to - segment.from) / maxCeiling;
    const found = byId.get(segment.entry.id);
    if (found) {
      found.width += segment.width;
      found.segments.push(segment);
    } else {
      byId.set(segment.entry.id, { entry: segment.entry, width: segment.width, segments: [segment] });
    }
  }

  let champion = null;
  for (const item of byId.values()) {
    if (!champion
      || item.width > champion.width + 1e-9
      || (Math.abs(item.width - champion.width) < 1e-9 && item.entry.damageIndex > champion.entry.damageIndex)) {
      champion = item;
    }
  }

  return { segments, byId, championId: champion?.entry.id ?? null, maxCeiling };
}

/**
 * 구간 하나를 사람이 읽는 글자로. 표와 곡선이 같은 문구를 쓰도록 여기 둔다.
 *
 * 마지막 구간은 위쪽이 열려 있다 — 한계를 그보다 더 올려도 이미 모두가
 * 다 소화한 뒤라 순위가 안 바뀐다. 그래서 `27%+`로 적는다.
 *
 * @param {{from: number, to: number}} segment 구간
 * @param {number} maxCeiling 스윕의 오른쪽 끝
 */
export function formatCeilingSegment(segment, maxCeiling) {
  const from = Math.round(segment.from);
  const to = Math.round(segment.to);
  if (segment.to >= maxCeiling - 1e-9) return `${from}%+`;
  // 반올림해서 같아지는 아주 좁은 구간은 한 숫자로. 없는 폭을 있는 것처럼
  // 적는 것보다 "이 언저리에서만 1등"이라고 읽히는 편이 정확하다.
  if (from === to) return `${from}%`;
  return `${from}–${to}%`;
}

/** 한 빌드가 가져간 구간 전부. 프론트 위에 없으면 빈 배열. */
export function ceilingLabel(sweep, id) {
  const found = sweep.byId.get(id);
  if (!found) return "";
  return found.segments.map(segment => formatCeilingSegment(segment, sweep.maxCeiling)).join(", ");
}
