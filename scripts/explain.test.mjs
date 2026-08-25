// 계기판의 출처 분해가 계산과 어긋나지 않는지 검사한다.
//
// explain.js는 합계를 새로 만들지 않고 calculateMetrics의 값을 그대로 쓴다.
// 위험한 건 반대쪽 — 출처를 빠뜨려도 머리의 숫자는 멀쩡해 보인다는 것이다.
// 그래서 "출처를 합치면 그 숫자가 나오는가"(residual == 0)를 검사한다.
import { NODE_LIBRARY } from "../src/lib/core/data.js";
import { CHAOS_CORES, CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS, weaponQualityDamage } from "../src/lib/core/cores.js";
import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../src/lib/core/engravings.js";
import { BRACELET_EFFECTS, BRACELET_GRADES } from "../src/lib/core/bracelets.js";
import {
  DEFAULT_STATE, mergeState, calculateMetrics, STAGGER_DAMAGE_GROUPS, ATTACK_CHAIN_GROUPS,
} from "../src/lib/core/metrics.js";
import { explainMetrics, marginalGain } from "../src/lib/core/explain.js";
import { readNumber } from "../src/lib/core/util.js";

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const maybe = (p = 0.5) => Math.random() < p;
const grades = ["none", "high", "mid", "low"];
const EPS = 1e-9;

function randomState() {
  const engravings = {};
  for (const item of ENGRAVING_LIBRARY) if (maybe(0.35)) engravings[item.id] = pick(ENGRAVING_TIERS).value;

  const braceletEffects = {};
  for (const item of BRACELET_EFFECTS) if (maybe(0.3)) braceletEffects[item.id] = pick(BRACELET_GRADES).value;

  const cores = {};
  for (const slot of CHAOS_CORE_SLOTS) {
    const pool = CHAOS_CORES.filter(core => core.slot === slot.key);
    cores[slot.key] = maybe(0.75)
      ? { id: pick(pool).id, points: pick(CHAOS_CORE_POINTS), stage: Math.floor(Math.random() * 2) }
      : { id: "none", points: 20, stage: 1 };
  }

  const nodeLevels = {};
  for (const node of NODE_LIBRARY) {
    if (maybe(0.4)) nodeLevels[node.id] = Math.floor(Math.random() * (node.maxLevel + 1));
  }

  const baseEffects = [];
  for (let i = 0; i < Math.floor(Math.random() * 4); i += 1) {
    baseEffects.push({
      id: `t${i}`,
      label: `직접 ${i}`,
      category: pick(["damage:추가 피해", "damage:주는 피해", "critRate", "critDamage", "customDamage"]),
      customCategory: "특수 피해",
      amount: Math.random() * 20 - 5,
    });
  }

  return mergeState(DEFAULT_STATE, {
    nodeLevels,
    baseEffects,
    arkGrid: { cores, gems: { attack: Math.floor(Math.random() * 31), additional: Math.floor(Math.random() * 21), boss: Math.floor(Math.random() * 21) } },
    weapon: { quality: Math.floor(Math.random() * 101) },
    collection: {
      ranch: maybe(),
      critStat: Math.floor(Math.random() * 200),
      specStat: Math.floor(Math.random() * 200),
      swiftStat: Math.floor(Math.random() * 200),
    },
    base: {
      critStat: 0, specStat: 0, swiftStat: 0,
      dominationStat: 0, enduranceStat: 0, expertiseStat: 0,
      specDamagePer100: maybe() ? Math.random() * 5 : 0,
    },
    settings: {
      pointBudget: 140,
      backAttack: maybe(), headAttack: maybe(),
    },
    convenience: {
      petStat: pick(["none", "critStat", "specStat", "swiftStat"]),
      evolutionKarmaRank: Math.floor(Math.random() * 7),
      manaShare: Math.floor(Math.random() * 21) * 5,
      // 끝마/무마가 딜 비중만큼 깎이면 출처 합계는 '깎이기 전' 값과 맞아야 한다.
      // 그 경로를 실제로 밟도록 절반은 네 갈래를 넣는다.
      damageMix: maybe() ? null : {
        manaCooldown: Math.floor(Math.random() * 11) * 10,
        plainCooldown: Math.floor(Math.random() * 11) * 10,
        identityPlain: Math.floor(Math.random() * 11) * 10,
        identityMana: Math.floor(Math.random() * 11) * 10,
        feederMana: maybe(),
      },
      goddessBlessing: maybe(), feast: maybe(),
    },
    accessories: {
      necklace: { additionalDamage: pick(grades) },
      rings: [
        { critRate: pick(grades), critDamage: pick(grades) },
        { critRate: pick(grades), critDamage: pick(grades) },
      ],
    },
    bracelet: {
      stats: {
        critStat: Math.floor(Math.random() * 121),
        specStat: Math.floor(Math.random() * 121),
        swiftStat: Math.floor(Math.random() * 121),
      },
      effects: braceletEffects,
    },
    engravings,
  });
}

// --- (a) 출처를 합치면 계산 결과가 나오는가 ---------------------------------

let failures = 0;
let worst = 0;
let worstWhere = "";
const TRIALS = 600;

for (let trial = 0; trial < TRIALS; trial += 1) {
  const state = randomState();
  const report = explainMetrics(state);

  const check = (where, residual, scale) => {
    const relative = Math.abs(residual) / Math.max(1, Math.abs(scale));
    if (relative > worst) { worst = relative; worstWhere = where; }
    if (relative > EPS) failures += 1;
  };

  for (const group of report.damage) check(`damage:${group.key}`, group.residual, group.total);
  for (const stat of report.stats) check(`stat:${stat.key}`, stat.residual, stat.total);
  for (const group of report.cooldown.groups) check(`cooldown:${group.key}`, group.residual, group.total);
  check("cooldown:total", report.cooldown.residual, report.cooldown.final);

  // 치명타 근거도 합계와 맞아야 한다
  const rateSum = report.crit.rateSources.reduce((acc, item) => acc + item.amount, 0);
  const damageSum = report.crit.damageSources.reduce((acc, item) => acc + item.amount, 0);
  // 치적 하한(각인)과 치피 하한(100)이 걸리면 합계보다 커질 수 있으니 그때는 건너뛴다
  if (report.crit.rateRaw > rateSum + EPS) { /* 각인 치적 하한이 적용된 경우 */ }
  else check("crit:rate", report.crit.rateRaw - rateSum, report.crit.rateRaw);
  if (report.crit.damage > damageSum + EPS) { /* 치피 하한 100이 적용된 경우 */ }
  else check("crit:damage", report.crit.damage - damageSum, report.crit.damage);
}

console.log(
  `(a) 출처 합계 == 계산 결과: ${failures} failures / ${TRIALS} states`
  + ` (worst ${worst.toExponential(2)}${worstWhere ? ` at ${worstWhere}` : ""})`,
);

// --- (b) 피해 배수가 그룹 곱과 맞는가 ---------------------------------------

// 무력화 그룹은 곱이 아니라 섞음이다 — 대난투 딜 비중만큼만 실린다.
//
//   총 배수 = 평시 곱 × (1 − 비중 + 비중 × 무력화 곱)
//
// 그래서 전부 곱하면 안 맞는다. 여기서 그 셈을 그대로 다시 세워 본다.
const readNumberSafe = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

// 공격력 사슬이 삼키는 넷은 빠진다. 그 넷은 A·B·E 안에서 한 번 곱해지므로
// 여기서 또 곱하면 두 번이다.
let mulFailures = 0;
for (let trial = 0; trial < 200; trial += 1) {
  const state = randomState();
  const report = explainMetrics(state);
  const share = readNumberSafe(report.metrics.staggerShare);
  const fold = keep => report.damage
    .filter(group => !ATTACK_CHAIN_GROUPS.has(group.key))
    .filter(group => STAGGER_DAMAGE_GROUPS.has(group.key) === keep)
    .reduce((acc, group) => acc * group.multiplier, 1);
  const product = fold(false) * (1 - share + share * fold(true));
  const relative = Math.abs(product - report.damageMultiplier) / Math.max(1, report.damageMultiplier);
  if (relative > 1e-12) mulFailures += 1;
}
console.log(`(b) 그룹 배수의 곱 == damageMultiplier: ${mulFailures} failures / 200 states`);

// --- (b2) 공격력 사슬이 게임 수식대로 서는가 --------------------------------
//
//   A 힘민지 = (평면 합) × (1 + 증가율 합)
//   B 무공   = (평면 합) × (1 + 증가율 합)
//   C = √(A × B ÷ 6) · D = C × (1 + 기본 배율) · E = (D + 평면 + 서폿) × (1 + 공격력%)
//
// 사슬을 안 세우던 시절에는 주스탯을 만 넘게 얹어도 지수가 0.000% 움직였다.
// 계단마다 정의와 맞는지 본다 — 하나가 어긋나면 그 아래가 전부 어긋난다.
let chainFailures = 0;
let chainSeen = 0;
for (let trial = 0; trial < 200; trial += 1) {
  const state = randomState();
  const m = calculateMetrics(state);
  if (!(m.finalAttack > 0)) continue;
  chainSeen += 1;
  const near = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b)) < 1e-9;
  if (!near(m.pureAttack, Math.sqrt(m.mainStatTotal * m.weaponTotal / 6))) chainFailures += 1;
  if (!near(m.baseAttack, m.pureAttack * (1 + readNumberSafe(state.attack?.baseScalePercent) / 100))) chainFailures += 1;
  // E는 D보다 작을 수 없다 — 괄호 안이 D에 더하기만 하고, 밖은 1 이상이다.
  if (m.finalAttack < m.baseAttack - 1e-6) chainFailures += 1;
  // 지수는 사슬 위에 선다.
  if (!near(m.damageIndex, (m.finalAttack / 1000) * m.critFactor * m.damageMultiplier)) chainFailures += 1;
}
console.log(`(b2) 공격력 사슬 A~E: ${chainFailures} failures / ${chainSeen} states`);


// --- (c) 쿨감 네 그룹의 곱이 최종 감소율인가 --------------------------------
// 네 그룹은 모두 적용된다. 어느 하나를 고르거나 버리지 않는다.

let cdFailures = 0;
for (let trial = 0; trial < 200; trial += 1) {
  const state = randomState();
  const report = explainMetrics(state);
  const remain = report.cooldown.groups.reduce((acc, group) => acc * group.remain, 1);
  const expected = (1 - remain) * 100;
  if (Math.abs(expected - report.cooldown.final) / Math.max(1, Math.abs(expected)) > EPS) cdFailures += 1;

  // 더하기보다 작아야 한다 — 곱연산이 합연산보다 덜 깎는다는 성질
  const summed = report.cooldown.groups.reduce((acc, group) => acc + group.total, 0);
  if (report.cooldown.groups.length > 1 && report.cooldown.final > summed + EPS) cdFailures += 1;
}
console.log(`(c) 쿨감 네 그룹의 곱 == metrics.cooldownReduction: ${cdFailures} failures / 200 states`);

// --- (d) 한계 기여가 실제 재계산과 맞는가 -----------------------------------

let marginFailures = 0;
let marginChecks = 0;
for (let trial = 0; trial < 60; trial += 1) {
  const state = randomState();
  const metrics = calculateMetrics(state);

  for (const node of NODE_LIBRARY.slice(0, 8)) {
    const gain = marginalGain(state, node, metrics, 140);
    if (!gain) continue;
    marginChecks += 1;

    const level = Math.min(node.maxLevel, Math.max(0, Math.round(state.nodeLevels?.[node.id] || 0)));
    const next = calculateMetrics({ ...state, nodeLevels: { ...state.nodeLevels, [node.id]: level + 1 } });
    const expected = (next.damageIndex / metrics.damageIndex - 1) * 100;
    if (Math.abs(gain.damage - expected) > 1e-9) marginFailures += 1;
  }
}
console.log(`(d) 한계 기여 == 재계산: ${marginFailures} failures / ${marginChecks} checks`);

// --- (e) 계기판에 없는 이름이 뜨지 않는가 -----------------------------------
// 손으로 적은 이름은 반드시 어긋난다. '레이드 캡틴'(실제로는 돌격대장),
// '둔중한 가시'(실제로는 뭉툭한 가시)가 계기판에 떠 있었다. 출처 라벨이
// 노드·각인을 가리킨다면 그 이름이 라이브러리에 실제로 있어야 한다.
let nameFailures = 0;
{
  // 전환 효과가 전부 켜지는 상태 — 마무리 단계 라벨을 모두 밟는다.
  // 돌격대장과 음속 돌파는 속도가 있어야 0을 벗어나므로 신속을 크게 준다.
  const state = mergeState(DEFAULT_STATE, {
    base: { ...DEFAULT_STATE.base, specDamagePer100: 2 },
    settings: { ...DEFAULT_STATE.settings, backAttack: true },
    convenience: { ...DEFAULT_STATE.convenience, feast: true },
    bracelet: { stats: { critStat: 0, specStat: 0, swiftStat: 120 }, effects: {} },
    nodeLevels: { "e5-blunt-thorn": 1, "e5-sonic-breakthrough": 2, "e3-all-out-strike": 2, "e1-swift": 30 },
    engravings: { "raid-captain": "relic4" },
  });
  const report = explainMetrics(state);

  const labels = [
    ...report.damage.flatMap(group => group.sources.map(source => source.label)),
    ...report.cooldown.groups.flatMap(group => group.sources.map(source => source.label)),
    ...report.stats.flatMap(stat => stat.sources.map(source => source.label)),
  ];

  const known = new Set([
    ...NODE_LIBRARY.map(node => node.name),
    ...ENGRAVING_LIBRARY.map(item => item.name),
  ]);
  // 라벨은 "이름 Lv2", "이름 유물 3" 또는 "이름 · 설명" 꼴이다. 앞부분만 본다.
  const looksLikeLibraryEntry = label => /[가-힣]/.test(label) && (label.includes(" · ") || / Lv\d/.test(label));

  const checked = [];
  for (const label of labels) {
    if (!looksLikeLibraryEntry(label)) continue;
    const head = label.split(" · ")[0].replace(/ Lv\d+$/, "").trim();
    checked.push(head);
    if (!known.has(head)) {
      nameFailures += 1;
      console.error(`  ✗ 라이브러리에 없는 이름: "${head}"  (라벨 "${label}")`);
    }
  }

  // 문제였던 세 자리가 실제로 검사에 걸렸는지 확인한다. 안 걸렸으면 검사가 헛돈 것이다.
  for (const expected of ["돌격대장", "뭉툭한 가시", "음속 돌파"]) {
    if (!checked.includes(expected)) {
      nameFailures += 1;
      console.error(`  ✗ "${expected}" 라벨이 계기판에 안 나타났다 — 검사가 헛돌고 있다`);
    }
  }
  console.log(`(e) 계기판 라벨 == 라이브러리 이름: ${nameFailures} failures / ${checked.length} labels`);
}

// --- (f) 무기 품질 추피는 일반 추피와 같은 그룹인가 -------------------------
// 별도 그룹이면 곱해져서 부풀고, 같은 그룹이면 더해진다. 예전에는 곱하고 있었다.
let groupFailures = 0;
{
  const at = quality => calculateMetrics(mergeState(DEFAULT_STATE, {
    weapon: { quality },
    // 목걸이 추가 피해 상 — 일반 추피 쪽에 값이 있어야 합·곱이 갈린다.
    accessories: {
      necklace: { additionalDamage: "high" },
      rings: [{ critRate: "none", critDamage: "none" }, { critRate: "none", critDamage: "none" }],
    },
  }));

  const bare = at(0);
  const full = at(100);
  // 품질 0도 추피 10%를 준다(y = 0.002x² + 10). 목걸이 몫만 떼려면 그걸 빼야 한다.
  const base = weaponQualityDamage(0);
  const weapon = weaponQualityDamage(100);
  const necklace = readNumber(bare.damageGroups["추가 피해"]) - base;

  if (bare.damageGroups["무기 추가 피해"] !== undefined || full.damageGroups["무기 추가 피해"] !== undefined) {
    groupFailures += 1;
    console.error("  ✗ '무기 추가 피해' 그룹이 아직 남아 있다");
  }
  // 같은 그룹이면 두 값이 그냥 더해져 있어야 한다.
  const merged = readNumber(full.damageGroups["추가 피해"]);
  if (Math.abs(merged - (necklace + weapon)) > 1e-9) {
    groupFailures += 1;
    console.error(`  ✗ 추피 합계 ${merged} != ${necklace} + ${weapon}`);
  }
  // 합연산이면 배수가 (1+n+w)/(1+n+base), 곱연산이었다면 (1+w)/(1+base)다.
  const ratio = full.damageIndex / bare.damageIndex;
  const additive = (1 + (necklace + weapon) / 100) / (1 + (necklace + base) / 100);
  const multiplicative = (1 + weapon / 100) / (1 + base / 100);
  if (Math.abs(ratio - additive) > 1e-9) {
    groupFailures += 1;
    console.error(`  ✗ 배수 ${ratio} != 합연산 기대 ${additive}`);
  }
  if (Math.abs(ratio - multiplicative) < 1e-9) {
    groupFailures += 1;
    console.error("  ✗ 합연산과 곱연산이 구분되지 않는 상태다 — 검사가 헛돈다");
  }
  console.log(
    `(f) 무기 추피 == 일반 추피 그룹: ${groupFailures} failures` +
    ` (목걸이 ${necklace}% + 무기 ${weapon}% → 합 ×${additive.toFixed(4)}, 곱이었다면 ×${multiplicative.toFixed(4)})`,
  );
}

// --- (g) 뭉툭한 가시 · 음속 돌파의 갈래가 합계와 맞는가 ---------------------
// 게임 툴팁이 못 박은 상한이 있다: 뭉툭한 가시 Lv2는 최대 75%(기본 15 + 전환 60),
// 음속 돌파 Lv2는 최대 24%. 갈래를 다 더하면 그 값이 나와야 한다.
let partFailures = 0;
{
  const state = mergeState(DEFAULT_STATE, {
    settings: { ...DEFAULT_STATE.settings, backAttack: true },
    convenience: { ...DEFAULT_STATE.convenience, feast: true, goddessBlessing: true },
    bracelet: { stats: { critStat: 120, specStat: 0, swiftStat: 120 }, effects: {} },
    accessories: {
      necklace: { additionalDamage: "high" },
      rings: [{ critRate: "high", critDamage: "high" }, { critRate: "high", critDamage: "high" }],
    },
    baseEffects: [
      { id: "t1", label: "각인 치적", category: "critRate", customCategory: "", amount: 28 },
      { id: "t2", label: "파티 이속", category: "moveSpeedOnly", customCategory: "", amount: 12 },
    ],
    nodeLevels: {
      "e5-blunt-thorn": 2, "e5-sonic-breakthrough": 2,
      "e1-crit": 30, "e1-swift": 30, "e3-all-out-strike": 2,
    },
  });
  const report = explainMetrics(state);
  const evo = report.damage.find(group => group.key === "진화형 피해");
  const find = name => evo.sources.find(source => source.label.startsWith(name));

  const blunt = find("뭉툭한 가시");
  const sonic = find("음속 돌파");

  if (!blunt || !blunt.parts) { partFailures += 1; console.error("  ✗ 뭉툭한 가시가 갈래로 묶이지 않았다"); }
  if (!sonic || !sonic.parts) { partFailures += 1; console.error("  ✗ 음속 돌파가 갈래로 묶이지 않았다"); }

  if (blunt?.parts) {
    const sum = blunt.parts.reduce((acc, part) => acc + part.amount, 0);
    if (Math.abs(sum - blunt.amount) > 1e-9) {
      partFailures += 1;
      console.error(`  ✗ 뭉툭한 가시 갈래 합 ${sum} != ${blunt.amount}`);
    }
    // 치적이 충분히 넘쳤다면 게임 상한 75%(15 + 60)에 걸려야 한다.
    if (report.crit.excess * 1.5 > 60 && Math.abs(blunt.amount - 75) > 1e-9) {
      partFailures += 1;
      console.error(`  ✗ 뭉툭한 가시 Lv2 상한 75% != ${blunt.amount}`);
    }
  }

  if (sonic?.parts) {
    const sum = sonic.parts.reduce((acc, part) => acc + part.amount, 0);
    if (Math.abs(sum - sonic.amount) > 1e-9) {
      partFailures += 1;
      console.error(`  ✗ 음속 돌파 갈래 합 ${sum} != ${sonic.amount}`);
    }
    // 상한을 넘지는 않아야 한다. 딱 맞추는 경우는 아래 속도를 더 준 상태에서 본다.
    if (sonic.amount > 24 + 1e-9) {
      partFailures += 1;
      console.error(`  ✗ 음속 돌파 Lv2가 상한 24%를 넘었다: ${sonic.amount}`);
    }
  }

  // 속도를 더 부어 상한에 실제로 닿는지. 안 닿으면 상한 로직이 검사되지 않는다.
  {
    const fast = explainMetrics(mergeState(DEFAULT_STATE, {
      convenience: { ...DEFAULT_STATE.convenience, feast: true, goddessBlessing: true },
      bracelet: { stats: { critStat: 0, specStat: 0, swiftStat: 120 }, effects: {} },
      baseEffects: [
        { id: "f1", label: "공속", category: "attackSpeedOnly", customCategory: "", amount: 40 },
        { id: "f2", label: "이속", category: "moveSpeedOnly", customCategory: "", amount: 40 },
      ],
      nodeLevels: { "e5-sonic-breakthrough": 2, "e1-swift": 30 },
    }));
    const capped = fast.damage.find(g => g.key === "진화형 피해")?.sources.find(s => s.label.startsWith("음속 돌파"));
    if (!capped || Math.abs(capped.amount - 24) > 1e-9) {
      partFailures += 1;
      console.error(`  ✗ 속도를 충분히 줬는데도 음속 돌파가 24%가 아니다: ${capped?.amount}`);
    }
    // 잘렸다는 신호는 part.raw다 — 화면이 `깎이기 전 → 적용값`으로 그린다.
    const cutPart = capped?.parts?.find(part => part.raw !== null && part.raw !== undefined);
    if (!cutPart) {
      partFailures += 1;
      console.error("  ✗ 상한에 걸렸는데 '깎이기 전' 값이 없다");
    } else if (!(cutPart.raw > cutPart.amount)) {
      partFailures += 1;
      console.error(`  ✗ 깎이기 전 ${cutPart.raw}이 적용값 ${cutPart.amount}보다 크지 않다`);
    }
    if (!capped?.capNote) {
      partFailures += 1;
      console.error("  ✗ 상한에 걸렸는데 꼬리표가 없다");
    }
  }

  // 치적 초과분이 곧 뭉툭한 가시의 재료여야 한다.
  const converted = Math.min(report.crit.excess * 1.5, 60);
  if (Math.abs(report.crit.bluntThorn.damage - converted) > 1e-9) {
    partFailures += 1;
    console.error(`  ✗ 초과 치적 ${report.crit.excess}% → ${report.crit.bluntThorn.damage}% (기대 ${converted}%)`);
  }

  // 속도 출처에 같은 이름이 두 번 나오면 안 된다.
  for (const [name, axis] of [["공격", report.speed.attack], ["이동", report.speed.move]]) {
    const labels = axis.sources.map(source => source.label);
    if (new Set(labels).size !== labels.length) {
      partFailures += 1;
      console.error(`  ✗ ${name} 속도 출처에 중복 라벨: ${labels.join(", ")}`);
    }
    if (Math.abs(axis.residual) > 1e-9) {
      partFailures += 1;
      console.error(`  ✗ ${name} 속도 잔차 ${axis.residual}`);
    }
  }

  console.log(
    `(g) 전환 갈래 합계 · 게임 상한: ${partFailures} failures` +
    ` (뭉툭한 가시 ${formatSum(blunt)}, 음속 돌파 ${formatSum(sonic)})`,
  );
}

function formatSum(source) {
  if (!source?.parts) return "—";
  return `${source.parts.map(p => p.amount.toFixed(2)).join(" + ")} = ${source.amount.toFixed(2)}%`;
}

if (failures || mulFailures || chainFailures || cdFailures || marginFailures || nameFailures || groupFailures || partFailures) {
  console.error("explain: FAILED");
  process.exit(1);
}
console.log("explain: all checks passed");
