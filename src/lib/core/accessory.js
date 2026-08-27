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
    // 아크 패시브 깨달음. 연마 줄 수로 정해진다 — 0줄 3점, 2줄 8점, 3줄 12점
    // (목걸이는 4/9/13). 품질과는 무관하다: 품질 90짜리도 연마를 안 했으면 4점이다.
    enlighten: 0,
  };
  (item?.Options ?? []).forEach(option => {
    const type = String(option?.Type ?? "");
    const name = String(option?.OptionName ?? "").trim();
    const value = readNumber(option?.Value);
    if (type === "ARK_PASSIVE") {
      if (name === "깨달음") out.enlighten = value;
      return;
    }
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
/** 알약 하나에 들어갈 만큼 짧은 이름. 게임에서 쓰는 줄임말 그대로다. */
export const FIELD_SHORT = {
  critRate: "치적",
  critDamage: "치피",
  additionalDamage: "추피",
  dealtDamage: "적주피",
  attackPower: "공",
  weaponAttack: "무공",
};

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
  // 프론티어의 왼쪽 끝은 대개 "3,000골드에 +0.00%"다. 정의상 그 가격대의
  // 최고이긴 하지만 살 이유가 없고, 카드 한 자리를 먹으며 아무 말도 안 한다.
  const worth = front.filter(row => row.gain >= top * 0.05);
  if (worth.length === 0) return [];
  const step = top * 0.12;
  const picks = [worth[0]];
  worth.slice(1).forEach(row => {
    if (row.gain - picks[picks.length - 1].gain >= step) picks.push(row);
  });
  // 앞에서 세 장만 자르면 제일 센 것들이 통째로 안 보인다 — 3,000골드부터
  // 300만까지 펼쳐진 답에서 싼 쪽 셋만 남는 꼴이다. 고르게 추린다.
  if (picks.length <= limit) return picks;
  const step2 = (picks.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, at) => picks[Math.round(at * step2)]);
}

// --- 훑기 축 ---------------------------------------------------------------
//
// 부위마다 퍼센트 딜옵은 딱 두 종이다 — 실측으로 확인했다. 반지에 공격력%가
// 붙은 매물은 0개고, 귀걸이에 치적이 붙은 것도 0개다. 그 둘이 slot.fields고,
// 세 번째 줄에 올 수 있는 딜옵은 평면 둘 — 공격력 +, 무기 공격력 +.
//
// 그래서 축은 (주요1 x 주요2 x 세 번째 줄)이다. 평면의 등급까지 쪼개면 조회가
// 두 배 넘게 드는데, 등급은 응답에서 읽어 어차피 알게 되므로 나누지 않는다.

/**
 * 연마 3줄을 다 채운 악세의 깨달음.
 *
 * 깨달음은 검색 조건이 아니다(경매장이 받는 갈래에 아크 패시브가 없다).
 * 연마 줄 수와 품질로 정해지므로 품질 하한으로 대신 걸고, 받아서 이 값으로
 * 한 번 더 거른다 — 임계 품질이 틀려도 결과는 맞는다.
 */
export const ENLIGHTEN_FULL = { necklace: 13, earrings: 12, rings: 12 };

/** 세 번째 줄 축. '무관'은 조건을 안 거는 것이라 2줄짜리도 섞여 온다. */
export const FLAT_AXIS = [
  { key: "any", label: "무관", name: null },
  { key: "attackPower", label: "공격력 +", name: "공격력 +" },
  { key: "weaponAttack", label: "무기 공격력 +", name: "무기 공격력 +" },
];

/** 한 부위를 훑을 때 쏠 조건 전부. 4 x 4 x 3 = 48개. */
export function sweepAxes(part) {
  const out = [];
  GRADES.forEach(a => GRADES.forEach(b => FLAT_AXIS.forEach(flat => {
    out.push({ combo: [a, b], flat: flat.key, picks: comboQuery(part, [a, b]), flatName: flat.name });
  })));
  return out;
}

/** 한 부위를 훑을 때 쏘는 조회 수. 진행률을 그리는 데 쓴다. */
export const SWEEP_TOTAL = GRADES.length * GRADES.length * FLAT_AXIS.length;

/**
 * 칸 하나의 경향.
 *
 * 최고값 한 장으로 조합끼리 견주면 편향이 생긴다 — 극단 통계라, 어쩌다 싸게
 * 올라온 한 장이 그 조합 전체를 대표해 버린다. 중앙값이 훨씬 덜 흔들린다.
 *
 * 골드당은 부호를 살려 센다. 줄 하나짜리로 볼 때는 손해에 골드당을 안 매기지만
 * (싸게 손해 보는 것이 덜 나쁜 것은 아니므로), 조합의 경향으로는 "이 조합은
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

// --- 조합별 재탐색 -----------------------------------------------------------
//
// 치적·치피는 노드와 정면으로 경쟁한다. 치적은 예리한 감각 4% · 혼신의 강타 12%
// · 달인 7%로 노드에서 최대 23%를 살 수 있고, 치피는 진화 노드로 못 산다.
// 그래서 치적 반지의 진짜 값어치는 "치적이 얼마나 늘었나"가 아니라
// **"노드에서 치적을 얼마나 뺄 수 있나"**다. 빌드를 못 박고 재면 그게 0으로 잡힌다.
//
// 매물마다 재탐색하면 336번이라 16분이 걸린다. 그런데 노드 배분을 흔드는 축은
// (치적 x 치피) 16개뿐이다 — 평면 딜옵과 주스탯은 배분을 안 바꾼다(실측:
// 공격력 +390 · 무공 +960 · 주스탯 +1,161을 얹어도 최적 배분이 같았다).
// 그래서 16번이면 336장 전부에 재사용된다.

/** 재탐색이 도는 조합. '무관'은 조건이 아니라 조건 없음이라 여기 안 온다. */
export const REAL_GRADES = ["high", "mid", "low", "none"];

/** 그 조합만 끼운 상태. 주스탯과 평면은 지금 낀 것 그대로 둔다. */
export function withCombo(state, slot, combo, worn) {
  const listing = {
    name: "", grade: "", quality: 0, price: 0, startPrice: 0,
    mainStat: readNumber(worn?.mainStat),
    options: Object.fromEntries(
      slot.fields.map((field, at) => [field, combo[at]]).filter(([, grade]) => grade !== "none"),
    ),
    flat: { attackPower: readNumber(worn?.flat?.attackPower), weaponAttack: readNumber(worn?.flat?.weaponAttack) },
    lines: [], unmodeled: [], enlighten: 0,
  };
  return withListing(state, slot, listing, worn);
}

/**
 * 매물에 값을 매긴다 — 두 기준으로.
 *
 *   gain     지금 빌드 그대로 끼웠을 때
 *   gainOpt  그 조합의 최적 빌드로 갈아탔을 때
 *
 * 둘 다 지금 빌드의 딜을 1로 놓고 잰다. 그래야 "이 반지를 사고 세팅까지 바꾸면
 * 얼마"가 "이 반지만 끼면 얼마"와 같은 자로 읽힌다.
 */
export function valuePart(state, part, listings, wornOf, optima) {
  const now = calculateMetrics(state).damageIndex;
  if (!(now > 0)) return [];
  // 세팅 바꿔서 열의 분모는 '지금 빌드'가 아니라 **지금 낀 조합의 최적 빌드**다.
  //
  // 지금 빌드를 분모로 두면 "노드를 최적으로 다시 짠 이득"이 통째로 섞인다.
  // 그건 모든 매물에 똑같이 얹히는 값이라(실측: 조합이 뭐든 +64.8~65.2%)
  // 매물끼리 견주는 데는 쓸모가 없다. 양쪽 다 최적으로 놓아야 악세 차이만 남는다.
  const optBase = optima?.combos?.[optima?.baseKey] ?? null;
  const nowOpt = optBase ? calculateMetrics(optBase.state).damageIndex : 0;
  return listings.map(listing => {
    const key = comboOf(part, listing).join(":");
    const best = bestSwap(state, part, listing, wornOf);
    const gain = (best.after / now - 1) * 100;
    const price = readNumber(listing.price) || readNumber(listing.startPrice);
    const optState = optima?.combos?.[key]?.state ?? null;
    // 최적 빌드 위에 같은 매물을 얹는다. 자리는 그대로 쓴다 — 재탐색이 그 자리
    // 기준으로 돌았기 때문이다.
    const opt = optState
      ? calculateMetrics(withListing(optState, best.slot, listing, best.worn)).damageIndex
      : 0;
    const gainOpt = opt > 0 && nowOpt > 0 ? (opt / nowOpt - 1) * 100 : null;
    const rate = g => (price > 0 && g > 0 ? g / (price / 10000) : null);
    return {
      listing, slot: best.slot, gain, price,
      perGold: rate(gain),
      // 세팅까지 바꿨을 때. 재탐색을 안 돌렸으면 null이다.
      gainOpt, perGoldOpt: gainOpt === null ? null : rate(gainOpt),
      combo: key,
    };
  });
}

// --- 두 짝 -------------------------------------------------------------------
//
// 같은 그룹의 옵션은 저희끼리 합연산이라 두 번째가 값이 떨어진다. 반면 공격력%와
// 무공%는 C = √(A×B/6)를 지나며 곱으로 만나므로 나눠 주는 쪽이 유리해질 수 있다.
// 그 뒤집힘은 두 짝을 실제로 끼워 봐야 나온다 — 한 짝 딜의 합이 아니다.
//
// 그렇다고 336장 중 둘을 고르면 56,280쌍이다. 프론티어 점끼리만 짝지으면
// 열댓 개의 제곱이라 순식간에 끝나고, 프론티어 밖의 쌍은 어차피 프론티어에
// 못 오른다 — 둘 다 자기 가격대에서 지는 매물이기 때문이다.

/**
 * 두 자리를 한꺼번에 갈았을 때.
 *
 * 가격은 합계다. 그래야 "200만으로 한 짝 상상을 살까, 두 짝을 100만씩 살까"가
 * 같은 축에서 비교된다.
 */
export function pairRows(state, part, rows, wornOf, limit = 18) {
  const slots = partSlots(part);
  if (slots.length < 2) return [];
  const now = calculateMetrics(state).damageIndex;
  if (!(now > 0)) return [];
  const front = priceFrontier(rows).slice(-limit);
  const out = [];
  front.forEach((a, i) => {
    front.forEach((b, j) => {
      // 같은 매물을 두 번 살 수는 없다. 순서는 뜻이 없으니 절반만 본다.
      if (j < i) return;
      if (i === j && a.listing === b.listing) return;
      const first = withListing(state, slots[0], a.listing, wornOf(slots[0]));
      const both = withListing(first, slots[1], b.listing, wornOf(slots[1]));
      const gain = (calculateMetrics(both).damageIndex / now - 1) * 100;
      const price = a.price + b.price;
      out.push({
        pair: [a, b], gain, price,
        perGold: price > 0 && gain > 0 ? gain / (price / 10000) : null,
      });
    });
  });
  return priceFrontier(out);
}

// --- 밴드 -------------------------------------------------------------------
//
// 조합별 최적 빌드를 하나씩 뽑아 견주려 했더니, 그 '최적'이 축(한 방 딜이냐
// DPS냐)에 따라 완전히 다른 빌드였다. 실측: 같은 조합에서 한 방 딜 최적은
// 7,259/10,105이고 DPS 최적은 5,447/11,516이다. 축을 안 고르면 최적이 없고,
// 고르면 그 선택이 답을 정해 버린다.
//
// 그래서 값 하나 대신 **범위**로 답한다. 세팅을 하나로 정하지 않고, 쓸 만한
// 세팅 전부에서 이 악세의 값어치를 재어 min~max를 낸다. 파레토 프론트를 쓰면
// 그 띠가 곧 "어떤 축을 고르든 답은 이 안"이 된다.
//
// 띠의 폭이 그 자체로 답이다:
//   좁다        세팅과 무관하게 확정 (치적을 지금과 같게 두는 조합은 0.01%p)
//   넓다        세팅이 정한다
//   0을 걸친다  도박 — 지금 세팅에서는 손해인데 노드를 다시 짜면 이득이다

/** 노드 배분만 갈아 끼운 상태. 세팅 집합을 훑을 때 쓴다. */
const withNodes = (state, nodeLevels) => {
  const next = mergeState(DEFAULT_STATE, state);
  next.nodeLevels = { ...nodeLevels };
  return next;
};

/**
 * 조합마다 값어치의 띠.
 *
 * 세팅마다 딜의 절대값이 다르므로(5,325~7,195) 그 세팅 **안에서의** 상대 증감을
 * 잰다. 그래야 세팅끼리 견줄 수 있다.
 */
export function comboBands(state, part, slot, worn, settings) {
  if (!settings || settings.length === 0) return null;
  const base = wornCombo(state, slot).map(g => (g === "any" ? "none" : g));
  const out = new Map();
  const seats = settings.map(nodes => withNodes(state, nodes));
  const nowOf = seats.map(seat => calculateMetrics(withCombo(seat, slot, base, worn)).damageIndex);

  REAL_GRADES.forEach(a => REAL_GRADES.forEach(b => {
    const combo = [a, b];
    let lo = Infinity;
    let hi = -Infinity;
    seats.forEach((seat, at) => {
      const now = nowOf[at];
      if (!(now > 0)) return;
      const got = calculateMetrics(withCombo(seat, slot, combo, worn)).damageIndex;
      const v = (got / now - 1) * 100;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    if (lo <= hi) out.set(combo.join(":"), { lo, hi, width: hi - lo });
  }));
  return { bands: out, baseKey: base.join(":"), count: settings.length };
}

/**
 * 매물 하나의 띠.
 *
 * 조합의 띠에 주스탯·평면 몫을 얹는다. 그 둘은 세팅과 무관하므로(실측: 최적
 * 배분을 안 바꾼다) 띠를 통째로 평행 이동시킨다. 매물 344장을 세팅 46개에서
 * 다시 재면 3만 번인데, 이렇게 하면 조합 16개만 재면 된다.
 */
export function listingBand(row, bands, comboGain) {
  const band = bands?.bands?.get(row.combo);
  if (!band) return null;
  const extra = row.gain - (comboGain.get(row.combo) ?? 0);
  return { lo: band.lo + extra, hi: band.hi + extra, width: band.width };
}
