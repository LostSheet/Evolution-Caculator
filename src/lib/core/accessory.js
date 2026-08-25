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
  { key: "necklace", part: "목걸이", label: "목걸이", index: 0, fields: ["dealtDamage", "additionalDamage"] },
  { key: "earrings", part: "귀걸이", label: "귀걸이 1", index: 0, fields: ["attackPower", "weaponAttack"] },
  { key: "earrings", part: "귀걸이", label: "귀걸이 2", index: 1, fields: ["attackPower", "weaponAttack"] },
  { key: "rings", part: "반지", label: "반지 1", index: 0, fields: ["critDamage", "critRate"] },
  { key: "rings", part: "반지", label: "반지 2", index: 1, fields: ["critDamage", "critRate"] },
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
export const GRADE_VALUES = {
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
    // 연마 세 줄을 온 대로. { name, value, percent, grade, counted }
    lines: [],
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
    const percent = !!option?.IsValuePercentage;
    const key = percent ? `${name} %` : `${name} +`;
    const hit = GRIND_MAP[key] ?? GRIND_MAP[name];
    const line = { name, value, percent, field: hit?.field ?? null, kind: hit?.kind ?? null, grade: null, counted: false };
    out.lines.push(line);
    if (!hit) { out.unmodeled.push(`${name} ${value}${percent ? "%" : ""}`); return; }
    if (hit.kind === "flat") { out.flat[hit.field] += value; line.counted = true; return; }
    const grade = gradeOf(hit.field, value);
    if (grade) { out.options[hit.field] = grade; line.grade = grade; line.counted = true; }
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

// --- 부위 -------------------------------------------------------------------
//
// 화면이 고르는 단위는 자리가 아니라 부위다. 반지가 둘이라고 시장이 둘로
// 갈리지는 않는다 — 같은 매물을 놓고 "둘 중 나쁜 쪽을 바꾼다"가 실제 행동이다.

export const ACCESSORY_PARTS = [
  { key: "necklace", label: "목걸이", part: "목걸이", fields: ["dealtDamage", "additionalDamage"] },
  { key: "rings", label: "반지", part: "반지", fields: ["critDamage", "critRate"] },
];

export const partSlots = part => ACCESSORY_SLOTS.filter(slot => slot.key === part.key);

/** 같은 매물이 조합을 넘나들며 여러 번 잡힌다('무관'이 나머지를 품는다). */
export const listingKey = listing => [
  listing.name, listing.quality, listing.price, listing.startPrice, listing.mainStat,
  listing.lines.map(line => `${line.name}:${line.value}:${line.percent ? 1 : 0}`).join(","),
].join("|");

/**
 * 이 매물을 어느 자리에 끼는 게 나은가.
 *
 * 반지가 둘이면 나쁜 쪽을 바꾼다. 좋은 쪽과 견주면 멀쩡한 매물이 손해로 보인다.
 */
export function bestSwap(state, part, listing, wornOf) {
  let best = null;
  partSlots(part).forEach(slot => {
    const worn = wornOf(slot);
    const after = calculateMetrics(withListing(state, slot, listing, worn)).damageIndex;
    if (!best || after > best.after) best = { slot, worn, after };
  });
  return best;
}

/** 부위 하나의 매물들에 값을 매긴다. 자리 고르기는 안에서 끝낸다. */
export function valuePart(state, part, listings, wornOf) {
  const now = calculateMetrics(state).damageIndex;
  if (!(now > 0)) return [];
  return listings.map(listing => {
    const best = bestSwap(state, part, listing, wornOf);
    const gain = (best.after / now - 1) * 100;
    const price = readNumber(listing.price) || readNumber(listing.startPrice);
    return {
      listing,
      slot: best.slot,
      gain,
      price,
      // 골드 만 냥당 딜 %. 손해나는 매물은 안 잰다 — '싸게 손해'를 줄 세우면 안 된다.
      perGold: price > 0 && gain > 0 ? gain / (price / 10000) : null,
    };
  });
}

/**
 * 연마 세 줄을 읽는 순서로.
 *
 * 주요 옵션이 앞이다 — 목걸이는 적주피·추피, 반지는 치피·치적. 게임은 굴린
 * 순서대로 적어 주는데, 그러면 같은 반지라도 줄 순서가 매물마다 달라서 표를
 * 세로로 훑을 수가 없다. 없는 옵션은 자리를 안 잡고 뒤가 당겨진다.
 */
export function orderedLines(part, listing) {
  const rank = line => {
    if (line.kind === "option") {
      const at = part.fields.indexOf(line.field);
      if (at >= 0) return at;
    }
    // 평면 공격력·무공은 딜에 실리므로 못 세는 줄보다는 앞이다.
    return line.counted ? part.fields.length : part.fields.length + 1;
  };
  return [...listing.lines]
    .map((line, at) => ({ line, at, rank: rank(line) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map(item => item.line);
}

/** 이 매물이 격자의 어느 칸인가. 모델이 아는 두 갈래만 본다. */
export const comboOf = (part, listing) =>
  part.fields.map(field => listing.options[field] ?? "none");

/**
 * 가성비 경계 — 자기보다 싸면서 더 센 매물이 없는 것들.
 *
 * 경계 아래의 점은 살 이유가 없다. 그리고 경계의 기울기가 곧 한계 골드당이라,
 * 선이 눕는 지점부터는 돈을 더 써도 덜 오른다. 그래프와 답 띠가 같은 것을
 * 보게 하려면 한 군데서 세야 한다.
 */
export function priceFrontier(rows) {
  const sorted = rows
    .filter(row => row.gain > 0 && row.price > 0)
    .sort((a, b) => a.price - b.price || b.gain - a.gain);
  const kept = [];
  let best = 0;
  sorted.forEach(row => { if (row.gain > best) { best = row.gain; kept.push(row); } });
  return kept;
}

/**
 * 경계에서 '살 만한 것' 몇 장만 골라 낸다.
 *
 * 경계에는 옆 점과 0.01%밖에 차이 안 나는 것들이 붙어 있다. 그걸 다 늘어놓으면
 * 고르라는 건지 읽으라는 건지 알 수 없다. 앞의 것보다 눈에 띄게 세진 것만 남긴다.
 */
export function frontierPicks(rows, limit = 5) {
  const front = priceFrontier(rows);
  if (front.length === 0) return [];
  const top = front[front.length - 1].gain;
  const step = top * 0.12;
  const picks = [front[0]];
  front.slice(1).forEach(row => {
    if (row.gain - picks[picks.length - 1].gain >= step) picks.push(row);
  });
  // 제일 센 것은 늘 남는다 — "돈을 다 쓰면 어디까지"가 답의 한쪽 끝이다.
  const best = front[front.length - 1];
  if (picks[picks.length - 1] !== best) picks.push(best);
  return picks.length <= limit ? picks : [
    picks[0],
    ...picks.slice(1, -1).filter((_, at) => at % Math.ceil((picks.length - 2) / (limit - 2)) === 0),
    picks[picks.length - 1],
  ].slice(0, limit);
}

/**
 * 칸 하나의 경향.
 *
 * 최고값 한 장으로 칸끼리 견주면 편향이 생긴다 — 극단 통계라, 어쩌다 싸게
 * 올라온 한 장이 그 조합 전체를 대표해 버린다. 열 장의 중앙값이 훨씬 덜 흔들린다.
 *
 * 골드당은 부호를 살려 센다. 줄 하나짜리로 볼 때는 손해에 골드당을 안 매기지만
 * (싸게 손해 보는 것이 덜 나쁜 것은 아니므로), 칸의 경향으로는 "이 조합은
 * 사면 대체로 내려간다"가 답이라 음수도 답의 일부다.
 */
const median = list => {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const at = sorted.length >> 1;
  return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2;
};
const mean = list => (list.length === 0 ? 0 : list.reduce((sum, x) => sum + x, 0) / list.length);

export function cellStats(rows) {
  if (rows.length === 0) return null;
  const priced = rows.filter(row => row.price > 0);
  const source = priced.length > 0 ? priced : rows;
  const rateOf = row => (row.price > 0 ? row.gain / (row.price / 10000) : 0);
  const rates = source.map(rateOf);
  const gains = source.map(row => row.gain);
  const prices = source.map(row => row.price);
  const top = source.reduce((best, row) => (rateOf(row) > rateOf(best) ? row : best), source[0]);
  return {
    n: rows.length,
    median: { rate: median(rates), gain: median(gains), price: median(prices) },
    mean: { rate: mean(rates), gain: mean(gains), price: mean(prices) },
    best: { rate: rateOf(top), gain: top.gain, price: top.price, row: top },
  };
}

/**
 * 이 부위의 옵션이 딛고 서는 현재 스펙.
 *
 * 치적 옵션의 값어치는 지금 치피가 얼마인지에 달려 있고, 추피 옵션의 값어치는
 * 지금 추피 합이 얼마인지에 달려 있다. 그 숫자를 옆에 안 적어 두면 화면이
 * 내놓는 +0.64%가 어디서 온 건지 알 길이 없다.
 *
 * 적주피는 뺐다. 주는 피해는 저희끼리 곱연산이라 지금 값에 거의 안 매인다.
 */
export const PART_CONTEXT = {
  rings: [
    { label: "치명타 적중률", read: report => report.critRateCapped, unit: "%" },
    { label: "치명타 피해", read: report => report.critDamage, unit: "%" },
  ],
  necklace: [
    { label: "추가 피해", read: report => report.damageGroups?.["추가 피해"], unit: "%" },
  ],
  earrings: [
    { label: "공격력", read: report => report.damageGroups?.["공격력"], unit: "%" },
    { label: "무기 공격력", read: report => report.damageGroups?.["무기 공격력"], unit: "%" },
  ],
};
