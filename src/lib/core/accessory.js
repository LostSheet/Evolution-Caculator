// 악세 한 짝이 주는 것 전부, 그리고 갈아끼웠을 때의 딜 변화.
//
// 아머리의 낀 악세와 경매장 매물을 **같은 꼴**로 뽑는 것이 이 파일의 일이다.
// 그래야 "이걸로 바꾸면 얼마"를 뺄셈 하나로 잴 수 있다.
//
// 악세 한 짝은 셋을 준다:
//   1. 기본 효과 — 주스탯(힘·민첩·지능). 품질마다 다르다.
//   2. 연마 효과 — 고대는 세 줄. 퍼센트도 있고 평면도 있다.
//   3. 아크 패시브 포인트 — 깨달음 +12 같은 것. 딜에는 안 실린다.
//
// 우리 악세 모델은 부위마다 두 갈래(상중하)만 든다. 세 번째 줄과 평면은
// 그 모델에 자리가 없어서, 여기서 평면·퍼센트로 따로 들고 다닌다.
import { calculateMetrics, mergeState, DEFAULT_STATE, assembleAttack } from "./metrics.js";
import { readNumber } from "./util.js";

/** 부위마다 우리가 모델로 든 두 갈래. */
export const ACCESSORY_SLOTS = [
  { key: "necklace", part: "목걸이", label: "목걸이", index: 0, fields: ["additionalDamage", "dealtDamage"] },
  { key: "earrings", part: "귀걸이", label: "귀걸이 1", index: 0, fields: ["attackPower", "weaponAttack"] },
  { key: "earrings", part: "귀걸이", label: "귀걸이 2", index: 1, fields: ["attackPower", "weaponAttack"] },
  { key: "rings", part: "반지", label: "반지 1", index: 0, fields: ["critRate", "critDamage"] },
  { key: "rings", part: "반지", label: "반지 2", index: 1, fields: ["critRate", "critDamage"] },
];

/**
 * 연마 효과 이름 → 이 계산기가 아는 자리.
 *
 * kind가 "option"이면 부위 모델의 상중하 칸으로 가고, "flat"이면 평면으로
 * 간다. 목록에 없는 것(아군 공격력 강화 효과 등)은 내 딜에 안 실린다 —
 * 버리지 않고 이름을 남겨 화면이 "이건 안 셌다"고 말할 수 있게 한다.
 */
const GRIND_MAP = {
  "치명타 적중률": { kind: "option", field: "critRate" },
  "치명타 피해": { kind: "option", field: "critDamage" },
  "추가 피해": { kind: "option", field: "additionalDamage" },
  "적에게 주는 피해 증가": { kind: "option", field: "dealtDamage" },
  "공격력 %": { kind: "option", field: "attackPower" },
  "무기 공격력 %": { kind: "option", field: "weaponAttack" },
  "공격력 +": { kind: "flat", field: "attackPower" },
  "무기 공격력 +": { kind: "flat", field: "weaponAttack" },
};

// 상중하를 되짚는 표. 게임이 값을 못 박아 두어서 값 하나면 등급이 정해진다.
const GRADE_VALUES = {
  critRate: { high: 1.55, mid: 0.95, low: 0.4 },
  critDamage: { high: 4, mid: 2.4, low: 1.1 },
  additionalDamage: { high: 2.6, mid: 1.6, low: 0.6 },
  dealtDamage: { high: 2, mid: 1.2, low: 0.55 },
  attackPower: { high: 1.55, mid: 0.95, low: 0.4 },
  weaponAttack: { high: 3, mid: 1.8, low: 0.8 },
};

/** 값에서 등급을 되짚는다. 못 정하면 null — 짐작해서 넣지 않는다. */
export function gradeOf(field, value) {
  const table = GRADE_VALUES[field];
  if (!table) return null;
  let best = null;
  let gap = Infinity;
  for (const [grade, amount] of Object.entries(table)) {
    const d = Math.abs(amount - value);
    if (d < gap) { gap = d; best = grade; }
  }
  return gap <= 0.06 ? best : null;
}

/**
 * 경매장 매물 하나를 우리 꼴로.
 *
 * 응답의 Options는 Type으로 갈린다:
 *   STAT               힘/민첩/지능/체력 — 기본 효과
 *   ACCESSORY_UPGRADE  연마 효과
 *   ARK_PASSIVE        아크 패시브 포인트
 */
export function readListing(item) {
  const out = {
    name: String(item?.Name ?? ""),
    grade: String(item?.Grade ?? ""),
    quality: readNumber(item?.GradeQuality),
    price: readNumber(item?.AuctionInfo?.BuyPrice),
    startPrice: readNumber(item?.AuctionInfo?.StartPrice),
    mainStat: 0,
    options: {},
    flat: { attackPower: 0, weaponAttack: 0 },
    unmodeled: [],
  };
  (item?.Options ?? []).forEach(option => {
    const type = String(option?.Type ?? "");
    const name = String(option?.OptionName ?? "").trim();
    const value = readNumber(option?.Value);
    if (type === "STAT") {
      // 셋이 같은 값으로 오고 하나만 쓴다. 체력은 딜과 무관하다.
      if (name === "지능" || name === "힘" || name === "민첩") out.mainStat = Math.max(out.mainStat, value);
      return;
    }
    if (type !== "ACCESSORY_UPGRADE") return;
    // 퍼센트인지 평면인지로 같은 이름이 갈린다 — '공격력 +1.55%'와 '공격력 +390'.
    const key = option?.IsValuePercentage ? `${name} %` : `${name} +`;
    const hit = GRIND_MAP[key] ?? GRIND_MAP[name];
    if (!hit) { out.unmodeled.push(`${name} ${value}${option?.IsValuePercentage ? "%" : ""}`); return; }
    if (hit.kind === "flat") { out.flat[hit.field] += value; return; }
    const grade = gradeOf(hit.field, value);
    if (grade) out.options[hit.field] = grade;
    else out.unmodeled.push(`${name} ${value}%`);
  });
  return out;
}

/**
 * 이 매물을 그 자리에 끼운 상태.
 *
 * 어려운 곳은 힘민지다. 아머리를 불러오면 게임이 알려 준 기본 공격력으로 힘민지
 * 총합을 **되짚어 못 박는다**(derivedMainTotal) — 장비 합만 더하면 물약·도감 몫이
 * 빠져 3%쯤 모자라기 때문이다. 그 못을 뽑으면 악세를 갈기도 전에 딜이 1.7% 내려
 * 앉아, 상상 반지로 바꿔도 손해로 보인다.
 *
 * 그래서 못을 뽑지 않고 **옮긴다**. 되짚기가 D = (1+기본%)·√(A·B/6)를 뒤집는
 * 식이므로, 새 D는 옛 D에 √((A'/A)·(B'/B))를 곱하면 된다 — 퍼센트가 약분되어
 * 카르마도 아바타도 다시 셀 필요가 없다.
 */
export function withListing(state, slot, listing, worn) {
  const next = mergeState(DEFAULT_STATE, state);
  const acc = next.accessories;
  const target = slot.key === "necklace" ? acc.necklace : acc[slot.key][slot.index];

  // 모델이 아는 두 칸만 갈아끼운다. 매물에 없으면 '없음'이다.
  slot.fields.forEach(field => { target[field] = listing.options[field] ?? "none"; });

  const before = assembleAttack(state);
  const attack = { ...next.attack };
  const scale = 1 + readNumber(before.mainScalePercent) / 100;

  // 지금 낀 것의 주스탯을 모르면 손대지 않는다 — 0으로 놓는 것도 답을 고른 것이다.
  const mainDelta = readNumber(worn?.mainStat) > 0 && readNumber(listing.mainStat) > 0
    ? readNumber(listing.mainStat) - readNumber(worn.mainStat)
    : 0;
  const weaponDelta = readNumber(listing.flat.weaponAttack) - readNumber(worn?.flat?.weaponAttack);

  if (mainDelta !== 0 || weaponDelta !== 0) {
    const mainBefore = Math.max(1, readNumber(before.mainStat));
    const weaponAllBefore = Math.max(1, readNumber(attack.weaponFlatAll));

    attack.mainFlat = Math.max(0, readNumber(attack.mainFlat) + mainDelta);
    attack.weaponFlat = Math.max(0, readNumber(attack.weaponFlat) + weaponDelta);
    attack.weaponFlatAll = Math.max(0, readNumber(attack.weaponFlatAll) + weaponDelta);
    if (readNumber(attack.mainTotal) > 0) {
      attack.mainTotal = Math.max(0, readNumber(attack.mainTotal) + mainDelta * scale);
    }
    if (readNumber(attack.baseAttackPower) > 0) {
      const mainAfter = Math.max(1, mainBefore + mainDelta * scale);
      const weaponAllAfter = Math.max(1, readNumber(attack.weaponFlatAll));
      attack.baseAttackPower = readNumber(attack.baseAttackPower)
        * Math.sqrt((mainAfter / mainBefore) * (weaponAllAfter / weaponAllBefore));
    }
  }
  next.attack = attack;

  // 평면 공격력은 캐릭터 합에 안 들어 있다 — 직접 입력 줄로 얹는다.
  const attackFlat = readNumber(listing.flat.attackPower) - readNumber(worn?.flat?.attackPower);
  if (attackFlat !== 0) {
    next.baseEffects = [
      ...(next.baseEffects ?? []),
      { id: "__listing", label: "매물 평면 공격력", category: "flat:attackPower", customCategory: "", amount: attackFlat, formula: "", cap: "" },
    ];
  }
  return next;
}

/**
 * 매물 목록에 값을 매긴다.
 *
 * 기준은 지금 내 빌드다. 딜 증가와 골드당을 같이 낸다 — 어느 쪽으로 정렬할지는
 * 부르는 쪽이 정한다.
 */
export function valueListings(state, slot, listings, worn) {
  const now = calculateMetrics(state).damageIndex;
  if (!(now > 0)) return [];
  return listings.map(listing => {
    const after = calculateMetrics(withListing(state, slot, listing, worn)).damageIndex;
    const gain = (after / now - 1) * 100;
    const price = readNumber(listing.price) || readNumber(listing.startPrice);
    return {
      listing,
      gain,
      price,
      // 골드 만 냥당 딜 %. 가격이 없으면(입찰만 있는 매물) 안 잰다.
      perGold: price > 0 && gain > 0 ? gain / (price / 10000) : null,
    };
  });
}

// --- 조합 격자 ---------------------------------------------------------------
//
// 부위 하나가 가질 수 있는 연마 조합은 4×4다 — 두 갈래가 각각 상·중·하·무관.
// 목록이 아니라 격자로 두는 이유는, 답이 "어느 칸이 싸고 잘 오르나"이기 때문이다.
// 줄로 세우면 그 지형이 안 보인다.
//
// '무관'은 경매장에 "이 옵션이 없는 것"을 물을 방법이 없어서 생긴 칸이다.
// 조건을 안 걸었을 뿐이므로 그 칸의 최저가는 나머지 셋의 최저가를 포함한다.

export const GRADE_LABEL = { high: "상", mid: "중", low: "하", none: "없음" };
export const GRADES = ["high", "mid", "low", "any"];
export const GRADE_PICK = { high: "상", mid: "중", low: "하", any: "무관" };

/** 우리 칸 이름 → 경매장이 부르는 이름. GRIND_MAP을 뒤집은 것이다. */
export const FIELD_API_NAME = Object.fromEntries(
  Object.entries(GRIND_MAP)
    .filter(([, hit]) => hit.kind === "option")
    .map(([name, hit]) => [hit.field, name]),
);

export const gradeValue = (field, grade) => GRADE_VALUES[field]?.[grade] ?? 0;

/** 화면에 쓰는 짧은 이름. 경매장 이름은 격자 머리에 넣기엔 길다. */
export const FIELD_LABEL = {
  critRate: "치명타 적중률",
  critDamage: "치명타 피해",
  additionalDamage: "추가 피해",
  dealtDamage: "적에게 주는 피해",
  attackPower: "공격력",
  weaponAttack: "무기 공격력",
};

/** 격자 한 칸을 경매장 질의의 EtcOptions로. '무관'은 조건을 안 건다. */
export function comboQuery(slot, combo) {
  return slot.fields
    .map((field, at) => ({ field, grade: combo[at] }))
    .filter(pick => pick.grade !== "any")
    .map(pick => ({
      field: pick.field,
      name: FIELD_API_NAME[pick.field],
      value: gradeValue(pick.field, pick.grade),
    }));
}

/** 지금 낀 것이 격자의 어느 칸인지. 표에 내 자리를 찍는다. */
export function wornCombo(state, slot) {
  const acc = state?.accessories;
  const target = slot.key === "necklace" ? acc?.necklace : acc?.[slot.key]?.[slot.index];
  return slot.fields.map(field => {
    const grade = target?.[field] ?? "none";
    return grade === "none" ? "any" : grade;
  });
}
