// 악세 갈아끼우기.
//
// 이 파일이 지키는 것은 하나다 — **같은 것으로 갈아끼우면 딜이 안 움직인다.**
//
// 시시해 보이지만 한 번 크게 틀렸던 자리다. 아머리를 불러오면 게임이 알려 준
// 기본 공격력으로 힘민지 총합을 되짚어 못 박는데(derivedMainTotal), 악세를
// 갈 때 그 못을 뽑아 버렸다. 그러면 장비 합(677k)이 되짚은 값(701k)을 대신해
// 딜이 1.7% 먼저 내려앉고, 상상 반지로 바꿔도 손해라고 나온다. 실제로 그
// 화면을 한참 들여다봤다.
import {
  ACCESSORY_SLOTS, readListing, withListing, valueListings, gradeOf, wornCombo,
  cellStats, orderedLines, ACCESSORY_PARTS, priceFrontier, frontierPicks,
  sweepAxes, ENLIGHTEN_FULL, SWEEP_TOTAL,
} from "../src/lib/core/accessory.js";
import { DEFAULT_STATE, mergeState, calculateMetrics, assembleAttack } from "../src/lib/core/metrics.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
  return ok;
};
const close = (a, b, tol) => Math.abs(a - b) <= tol;

// 실제 응답을 본뜬 매물. 세 갈래가 다 들어 있다 — 기본 효과(STAT),
// 연마 효과(ACCESSORY_UPGRADE), 아크 패시브 포인트(ARK_PASSIVE).
const listingItem = (options, { quality = 85, price = 1_700_000, mainStat = 11_736 } = {}) => ({
  Name: "도래한 결전의 반지",
  Grade: "고대",
  GradeQuality: quality,
  AuctionInfo: { BuyPrice: price, StartPrice: price },
  Options: [
    { Type: "ARK_PASSIVE", OptionName: "깨달음", Value: 12, IsValuePercentage: false },
    ...options,
    { Type: "STAT", OptionName: "힘", Value: mainStat, IsValuePercentage: false },
    { Type: "STAT", OptionName: "민첩", Value: mainStat, IsValuePercentage: false },
    { Type: "STAT", OptionName: "지능", Value: mainStat, IsValuePercentage: false },
    { Type: "STAT", OptionName: "체력", Value: 2296, IsValuePercentage: false },
  ],
});
const grind = (name, value, percent = true) =>
  ({ Type: "ACCESSORY_UPGRADE", OptionName: name, Value: value, IsValuePercentage: percent });

// 불러온 캐릭터를 본뜬 상태. 되짚기가 걸리도록 baseAttackPower를 채운다.
const state = mergeState(DEFAULT_STATE, {
  attack: {
    weaponFlat: 208_715, weaponFlatAll: 217_715, weaponPercent: 3.6,
    mainFlat: 627_285, baseAttackPower: 180_266, baseScalePercent: 8.1, avatarPercent: 8,
  },
  convenience: { awakeningKarmaLevel: 26 },
  accessories: { rings: [{ critRate: "mid", critDamage: "mid" }, { critRate: "mid", critDamage: "mid" }] },
});
const ring = ACCESSORY_SLOTS.find(slot => slot.label === "반지 1");
const worn = { mainStat: 11_736, flat: { attackPower: 0, weaponAttack: 195 } };
const now = calculateMetrics(state).damageIndex;

// (a) 매물 읽기 — 퍼센트와 평면이 같은 이름으로 오므로 갈라야 한다.
{
  const read = readListing(listingItem([
    grind("치명타 적중률", 1.55), grind("치명타 피해", 4),
    grind("공격력", 80, false), grind("아군 공격력 강화 효과", 3),
  ]));
  check("(a) 연마 등급", read.options.critRate === "high" && read.options.critDamage === "high",
    JSON.stringify(read.options));
  check("(a) 평면 공격력 80", read.flat.attackPower === 80, String(read.flat.attackPower));
  check("(a) 주스탯 하나만", read.mainStat === 11_736, String(read.mainStat));
  check("(a) 못 세는 줄은 이름을 남긴다", read.unmodeled.length === 1, JSON.stringify(read.unmodeled));
  check("(a) 아크 패시브는 딜이 아니다", !("깨달음" in read.options));
}

// (b) 같은 것으로 갈아끼우면 딜은 제자리다.
//
// 못을 뽑으면 여기서 −1.7%가 뜬다. 이 한 줄이 그 버그를 잡는다.
{
  const same = readListing(listingItem([
    grind("치명타 적중률", 0.95), grind("치명타 피해", 2.4), grind("무기 공격력", 195, false),
  ]));
  const after = calculateMetrics(withListing(state, ring, same, worn)).damageIndex;
  check("(b) 같은 반지 → 0.000%", close(after / now - 1, 0, 1e-9),
    `${((after / now - 1) * 100).toFixed(4)}%`);
}

// (c) 주스탯 차이는 되짚은 총합을 그만큼만 움직인다.
//
// 못을 옮기는 식이 맞는지 본다. 딜을 손으로 다시 세는 대신, 조립된 힘민지
// 총합이 정확히 (주스탯 차이 x 배수)만큼만 움직였는지를 본다 — 못을 뽑으면
// 여기서 24,000쯤(되짚은 값과 장비 합의 차이) 어긋난다.
{
  const richer = readListing(listingItem([
    grind("치명타 적중률", 0.95), grind("치명타 피해", 2.4), grind("무기 공격력", 195, false),
  ], { mainStat: 12_736 }));
  const next = withListing(state, ring, richer, worn);
  const before = assembleAttack(state);
  const after = assembleAttack(next);
  const scale = 1 + before.mainScalePercent / 100;
  check("(c) 힘민지 총합은 주스탯 차이 x 배수만큼만 움직인다",
    close(after.mainStat - before.mainStat, 1_000 * scale, 1),
    `${(after.mainStat - before.mainStat).toFixed(1)} vs ${(1_000 * scale).toFixed(1)}`);
  check("(c) 무공은 그대로", close(after.weaponAttack, before.weaponAttack, 1),
    `${after.weaponAttack} vs ${before.weaponAttack}`);
  const swapped = calculateMetrics(next).damageIndex;
  check("(c) 주스탯이 늘면 딜도 는다", swapped > now, `${((swapped / now - 1) * 100).toFixed(4)}%`);
}

// (d) 골드당은 오르는 매물에만 매긴다. 손해를 '싸게 손해'라고 줄 세우면 안 된다.
{
  const better = listingItem([grind("치명타 적중률", 1.55), grind("치명타 피해", 4)], { price: 1_700_000 });
  const worse = listingItem([grind("치명타 적중률", 0.4)], { price: 10_000 });
  const valued = valueListings(state, ring, [better, worse].map(readListing), worn);
  check("(d) 상상은 오른다", valued[0].gain > 0, `${valued[0].gain.toFixed(3)}%`);
  check("(d) 하옵은 내린다", valued[1].gain < 0, `${valued[1].gain.toFixed(3)}%`);
  check("(d) 손해엔 골드당이 없다", valued[1].perGold === null);
  check("(d) 골드당 = 딜 / 만 골드",
    close(valued[0].perGold, valued[0].gain / 170, 1e-9), String(valued[0].perGold));
}

// (e) 값에서 등급을 되짚는다. 모르는 값은 짐작하지 않는다.
{
  check("(e) 1.55 → 상", gradeOf("critRate", 1.55) === "high");
  check("(e) 2.4 → 중", gradeOf("critDamage", 2.4) === "mid");
  check("(e) 3.3은 아무것도 아니다", gradeOf("critDamage", 3.3) === null);
  check("(e) 낀 자리는 격자의 중·중", wornCombo(state, ring).join(":") === "mid:mid");
}

// (g) 연마 줄은 주요 옵션이 앞이다. 게임은 굴린 순서대로 준다.
{
  const ring = ACCESSORY_PARTS.find(item => item.key === "rings");
  const listing = readListing(listingItem([
    grind("아군 공격력 강화 효과", 3), grind("치명타 적중률", 1.55), grind("치명타 피해", 4),
  ]));
  const names = orderedLines(ring, listing).map(line => line.name);
  check("(g) 치피 · 치적 · 기타", names.join(" ") === "치명타 피해 치명타 적중률 아군 공격력 강화 효과", names.join(" "));
}

// (h) 가성비 경계 — 자기보다 싸면서 더 센 것이 없는 것만 남는다.
{
  const front = priceFrontier([
    { gain: 0.1, price: 1_000 }, { gain: 0.05, price: 5_000 },
    { gain: 0.5, price: 100_000 }, { gain: 0.4, price: 200_000 }, { gain: 1.0, price: 300_000 },
  ]);
  check("(h) 셋만 남는다", front.length === 3, String(front.length));
  check("(h) 가격 오름차순", front.every((row, at) => at === 0 || row.price > front[at - 1].price));
  check("(h) 딜도 오름차순", front.every((row, at) => at === 0 || row.gain > front[at - 1].gain));
}

// (f) 칸의 경향 — 최고값 하나로 칸끼리 견주면 편향이 생긴다.
//
// 아홉 장이 손해인데 한 장만 싸게 올라온 조합은, 최고값으로 보면 1등이고
// 중앙값으로 보면 사면 안 되는 칸이다. 둘이 갈리는 것이 이 기능의 요점이다.
{
  const rows = [
    { gain: 0.04, price: 15_000 },                                   // 만골당 0.0267
    ...Array.from({ length: 9 }, () => ({ gain: -0.07, price: 300_000 })),
  ];
  const stats = cellStats(rows);
  check("(f) 열 장을 다 센다", stats.n === 10, String(stats.n));
  check("(f) 최고는 튄 한 장을 본다", close(stats.best.rate, 0.04 / 1.5, 1e-9), stats.best.rate.toFixed(4));
  check("(f) 중앙값은 나머지 아홉 장을 본다", stats.median.gain < 0, stats.median.gain.toFixed(3));
  check("(f) 그래서 둘이 갈린다", stats.best.rate > 0 && stats.median.rate < 0,
    `${stats.best.rate.toFixed(4)} vs ${stats.median.rate.toFixed(4)}`);
  check("(f) 평균도 아홉 장 쪽이다", stats.mean.gain < 0, stats.mean.gain.toFixed(3));
  check("(f) 빈 칸은 null", cellStats([]) === null);
}

// (i) 답 띠 — 살 이유가 없는 끝은 안 올린다.
//
// 프론티어의 왼쪽 끝은 대개 "3,000골드에 +0.00%"고, 오른쪽 끝은 "0.03%p 더
// 얻자고 219만 더 쓰기"다. 둘 다 정의상 프론티어지만 카드로는 거짓말에 가깝다.
{
  const rows = [
    { gain: 0.002, price: 3_000 }, { gain: 0.14, price: 16_000 },
    { gain: 0.35, price: 250_000 }, { gain: 0.91, price: 2_110_000 }, { gain: 0.94, price: 4_300_000 },
  ];
  const picks = frontierPicks(rows, 3);
  check("(i) 셋", picks.length === 3, String(picks.length));
  check("(i) +0.00%짜리 시작점은 뺀다", picks[0].price === 16_000, String(picks[0].price));
  check("(i) 값 못 하는 끝도 뺀다", picks[picks.length - 1].price === 2_110_000, String(picks[picks.length - 1].price));
  check("(i) 전부 손해면 빈 손", frontierPicks([{ gain: -1, price: 100 }]).length === 0);
}

// (j) 훑기 축 — 주요 두 갈래 x 세 번째 줄.
{
  const ring = ACCESSORY_PARTS.find(item => item.key === "rings");
  const axes = sweepAxes(ring);
  check("(j) 48가지", axes.length === 48 && SWEEP_TOTAL === 48, String(axes.length));
  check("(j) 세 번째 줄을 건 축이 3분의 2",
    axes.filter(a => a.flatName).length === 32, String(axes.filter(a => a.flatName).length));
  check("(j) 무관/무관/무관도 있다",
    axes.some(a => a.picks.length === 0 && !a.flatName));
  check("(j) 깨달음 기준", ENLIGHTEN_FULL.necklace === 13 && ENLIGHTEN_FULL.rings === 12);
}

// (k) 깨달음을 읽는다. 연마 3줄이 아니면 이 값이 모자라고, 그것이 거르는 기준이다.
{
  const read = readListing({
    Name: "x", Grade: "고대", GradeQuality: 82, AuctionInfo: { BuyPrice: 1 },
    Options: [
      { Type: "ARK_PASSIVE", OptionName: "깨달음", Value: 12 },
      { Type: "ACCESSORY_UPGRADE", OptionName: "치명타 적중률", Value: 1.55, IsValuePercentage: true },
      { Type: "STAT", OptionName: "지능", Value: 11736 },
    ],
  });
  check("(k) 깨달음 12", read.enlighten === 12, String(read.enlighten));
  check("(k) 깨달음은 연마 줄이 아니다", read.lines.length === 1, String(read.lines.length));
}

console.log(failures === 0 ? "accessory: all checks passed" : `accessory: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
