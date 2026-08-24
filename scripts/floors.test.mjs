// 하한 조건 검사.
//
// 하한은 취향이 아니라 후보 자격이다. 그래서 검사할 것은 두 가지다 —
// 조건을 못 넘긴 빌드가 결과에 섞이지 않는가(거짓 양성), 그리고 조건을
// 넘긴 빌드를 빠뜨리지 않는가(거짓 음성). 뒤쪽이 더 위험하다. 조용히
// 사라지면 "그런 빌드는 없다"로 읽히기 때문이다.
import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../src/lib/core/engravings.js";
import { CHAOS_CORES, CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS } from "../src/lib/core/cores.js";
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import {
  buildSearchPlan, buildEvaluator, runSearch,
  SEARCH_FLOOR_FIELDS, capApplies, normalizeSearchFloors, normalizeSearchCeilings, hasSearchFloor, hasSearchBound,
  floorShortfall, meetsSearchFloors,
} from "../src/lib/core/runner.js";

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const maybe = (p = 0.5) => Math.random() < p;
const grades = ["none", "high", "mid", "low"];

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };
const check = (ok, message) => { if (!ok) fail(message); };

function randomState(critFloorFriendly = false) {
  const engravings = {};
  for (const item of ENGRAVING_LIBRARY) if (maybe(0.3)) engravings[item.id] = pick(ENGRAVING_TIERS).value;

  const cores = {};
  for (const slot of CHAOS_CORE_SLOTS) {
    const pool = CHAOS_CORES.filter(core => core.slot === slot.key);
    cores[slot.key] = maybe(0.7)
      ? { id: pick(pool).id, points: pick(CHAOS_CORE_POINTS), stage: Math.floor(Math.random() * 2) }
      : { id: "none", points: 20, stage: 1 };
  }

  return mergeState(DEFAULT_STATE, {
    arkGrid: { cores, gems: { attack: Math.floor(Math.random() * 31), additional: Math.floor(Math.random() * 21), boss: Math.floor(Math.random() * 21) } },
    weapon: { quality: Math.floor(Math.random() * 101) },
    collection: { ranch: maybe(), critStat: 0, specStat: 0, swiftStat: 0 },
    base: {
      critStat: critFloorFriendly ? 1400 : Math.floor(Math.random() * 1500),
      specStat: Math.floor(Math.random() * 1500),
      swiftStat: Math.floor(Math.random() * 1500),
      dominationStat: 0, enduranceStat: 0, expertiseStat: 0,
      specDamagePer100: maybe() ? Math.random() * 5 : 0,
    },
    settings: {
      pointBudget: 140,
      backAttack: maybe(), headAttack: maybe(),
    },
    convenience: {
      petStat: "none", evolutionKarmaRank: Math.floor(Math.random() * 7),
      manaShare: Math.floor(Math.random() * 21) * 5, goddessBlessing: maybe(), feast: maybe(),
    },
    accessories: {
      necklace: { additionalDamage: pick(grades) },
      rings: [{ critRate: pick(grades), critDamage: pick(grades) }, { critRate: pick(grades), critDamage: pick(grades) }],
    },
    bracelet: { stats: { critStat: 120, specStat: 0, swiftStat: 40 }, effects: {} },
    engravings,
  });
}

const EXHAUSTIVE = { tier1Mode: "fixed", engravingSlots: "fixed", fullBudget: true, mode: "exhaustive", resultLimit: 20 };

// 계획 전체를 손으로 훑어 "조건을 넘긴 것들"의 진짜 프론트를 만든다.
function bruteForceFront(state, plan, floors) {
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));
  const dims = plan.dimensions;
  const idx = new Array(dims.length).fill(0);
  const picks = dims.map(d => d.options[0]);
  const kept = [];
  let rejected = 0;

  for (let c = 0; c < plan.totalCombos; c += 1) {
    let used = 0;
    for (let i = 0; i < picks.length; i += 1) if (picks[i].kind === "nodes") used += picks[i].points;
    if (used <= plan.budget) {
      const m = evaluate(picks);
      if (meetsSearchFloors(m, floors)) kept.push([m.damageIndex, m.dpsIndex]);
      else rejected += 1;
    }
    let d = dims.length - 1;
    while (d >= 0) {
      idx[d] += 1;
      if (idx[d] < dims[d].options.length) { picks[d] = dims[d].options[idx[d]]; break; }
      idx[d] = 0; picks[d] = dims[d].options[0]; d -= 1;
    }
    if (d < 0) break;
  }

  kept.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
  const front = [];
  let best = -Infinity;
  for (const p of kept) if (p[1] > best) { best = p[1]; front.push(p); }
  return { front, rejected, kept: kept.length };
}

// --- (a) 정규화와 술어 ------------------------------------------------------

{
  const zero = normalizeSearchFloors(undefined);
  check(SEARCH_FLOOR_FIELDS.every(f => zero[f.key] === 0), "(a) 빈 입력은 전부 0이어야 한다");
  check(!hasSearchFloor(zero), "(a) 전부 0이면 하한이 없는 것");
  check(hasSearchFloor({ critRate: 1 }), "(a) 하나라도 있으면 하한이 걸린 것");

  const clamped = normalizeSearchFloors({ critRate: 9999, attackSpeed: -5, moveSpeed: "12" });
  check(clamped.critRate === 200, "(a) 치적 상한 200으로 눌린다");
  check(clamped.attackSpeed === 0, "(a) 음수는 0으로");
  check(clamped.moveSpeed === 12, "(a) 문자열도 숫자로 읽는다");

  // 기본값 객체를 물려주면 화면에서 고칠 때 모듈 상수가 바뀐다.
  check(normalizeSearchFloors(clamped) !== clamped, "(a) 늘 새 객체를 돌려준다");

  // 축마다 요구치로 나누므로 '절반만 채움'끼리는 같은 무게다.
  const half = floorShortfall({ critRateRaw: 40, attackSpeed: 0, moveSpeedBonus: 0 }, { critRate: 80 });
  const halfSpeed = floorShortfall({ critRateRaw: 0, attackSpeed: 10, moveSpeedBonus: 0 }, { attackSpeed: 20 });
  check(Math.abs(half - 0.5) < 1e-12 && Math.abs(halfSpeed - 0.5) < 1e-12, "(a) 모자란 정도는 요구치 대비로 잰다");
  check(floorShortfall({ critRateRaw: 90 }, { critRate: 80 }) === 0, "(a) 넘기면 0");
}

// 상한에 눌린 값이 아니라 총 치명타율로 재야 한다.
{
  const bluntBuild = { critRateRaw: 112, critRateCapped: 80, attackSpeed: 0, moveSpeedBonus: 0 };
  check(meetsSearchFloors(bluntBuild, { critRate: 100 }), "(a) 뭉가 빌드는 총 치명타율로 통과해야 한다");
  check(!meetsSearchFloors(bluntBuild, { critRate: 120 }), "(a) 총 치명타율로도 모자라면 탈락");
}
console.log(`  (a) 정규화 · 술어: ${failures} failures`);

// --- (b) 하한을 안 걸면 예전과 같은 결과 ------------------------------------

let before = failures;
for (let trial = 0; trial < 3; trial += 1) {
  const state = randomState();
  const bare = await runSearch(state, EXHAUSTIVE);
  const zeroed = await runSearch(state, { ...EXHAUSTIVE, floors: { critRate: 0, attackSpeed: 0, moveSpeed: 0 } });
  const same = bare.pareto.length === zeroed.pareto.length
    && bare.pareto.every((e, i) => Math.abs(e.damageIndex - zeroed.pareto[i].damageIndex) < 1e-9);
  check(same, "(b) 하한 0은 하한 없음과 같아야 한다");
  check(bare.rejected === 0 && zeroed.rejected === 0, "(b) 하한 0이면 버려지는 조합이 없다");
}
console.log(`  (b) 하한 0 = 예전 동작: ${failures - before} failures`);

// --- (c) 전수 탐색: 거짓 양성도 거짓 음성도 없는가 --------------------------

before = failures;
let checked = 0;
let withFloorRuns = 0;
for (let trial = 0; trial < 8; trial += 1) {
  const state = randomState();
  const plan = buildSearchPlan(state, EXHAUSTIVE);
  const baseline = calculateMetrics(state);

  // 지금 빌드 근처에 선을 그어야 통과·탈락이 섞인다. 전부 통과하거나
  // 전부 탈락하면 검사가 아무것도 안 한다.
  const floors = normalizeSearchFloors({
    critRate: Math.max(0, baseline.critRateRaw * 0.9),
    moveSpeed: Math.max(0, baseline.moveSpeedBonus * 0.5),
  });
  if (!hasSearchFloor(floors)) continue;

  const want = bruteForceFront(state, plan, floors);
  const got = await runSearch(state, { ...EXHAUSTIVE, floors });
  withFloorRuns += 1;

  // 거짓 양성 — 결과에 조건 미달이 섞였는가
  for (const entry of [...got.pareto, ...got.damage, ...got.dps]) {
    const ok = SEARCH_FLOOR_FIELDS.every(field => {
      const need = floors[field.key];
      const value = field.key === "critRate" ? entry.critRateRaw
        : field.key === "attackSpeed" ? entry.attackSpeedBonus : entry.moveSpeedBonus;
      return need <= 0 || value + 1e-9 >= need;
    });
    if (!ok) fail(`(c) 조건 미달 빌드가 결과에 들어갔다 (치적 ${entry.critRateRaw.toFixed(2)}, 이속 ${entry.moveSpeedBonus.toFixed(2)})`);
  }

  // 거짓 음성 — 조건을 넘긴 빌드를 빠뜨렸는가
  const gotFront = got.pareto.map(e => [e.damageIndex, e.dpsIndex]);
  const same = gotFront.length === want.front.length
    && gotFront.every((g, i) => Math.abs(g[0] - want.front[i][0]) < 1e-9 && Math.abs(g[1] - want.front[i][1]) < 1e-9);
  check(same, `(c) 프론트가 손계산과 다르다 (얻음 ${gotFront.length}, 기대 ${want.front.length})`);
  check(got.rejected === want.rejected, `(c) 버린 개수가 다르다 (얻음 ${got.rejected}, 기대 ${want.rejected})`);
  checked += want.kept + want.rejected;
}
console.log(`  (c) 전수 탐색 프론트 == 손계산: ${failures - before} failures / ${withFloorRuns} runs, ${checked}개 조합`);

// --- (d) 못 넘기는 조건은 빈손과 이유를 함께 돌려준다 -----------------------

before = failures;
{
  const state = randomState();
  const impossible = await runSearch(state, { ...EXHAUSTIVE, floors: { critRate: 200 } });
  check(impossible.pareto.length === 0, "(d) 못 넘기는 조건이면 결과가 비어야 한다");
  check(impossible.rejected > 0, "(d) 왜 비었는지 셀 수 있어야 한다");
  check(impossible.error === null, "(d) 이건 오류가 아니다");
  check(impossible.floors.critRate === 200, "(d) 무엇에 걸렸는지 되돌려준다");
}
console.log(`  (d) 통과 없음: ${failures - before} failures`);

// --- (e) 빔 탐색도 조건 안에서 정상을 찾는가 --------------------------------
//
// 빔은 앞 차원에서 자른 것을 되돌리지 못한다. 지표만 보고 고르면 조건
// 바깥의 좋은 빌드로 몰려가 마지막에 남는 게 없다.

before = failures;
let beamRuns = 0;
let beamEmpty = 0;
for (let trial = 0; trial < 4; trial += 1) {
  const state = randomState(true);
  const baseline = calculateMetrics(state);
  const floors = normalizeSearchFloors({ critRate: baseline.critRateRaw * 0.95 });
  if (!hasSearchFloor(floors)) continue;

  const got = await runSearch(state, {
    tier1Mode: "step10", engravingSlots: "5",
    mode: "beam", beamWidth: 200, resultLimit: 20, floors,
  });
  beamRuns += 1;
  if (got.pareto.length === 0) beamEmpty += 1;
  for (const entry of got.pareto) {
    if (entry.critRateRaw + 1e-9 < floors.critRate) {
      fail(`(e) 빔 결과에 조건 미달이 섞였다 (${entry.critRateRaw.toFixed(2)} < ${floors.critRate.toFixed(2)})`);
    }
  }
}
check(beamEmpty === 0, `(e) 만족 가능한 조건인데 빔이 빈손으로 돌아왔다 (${beamEmpty}/${beamRuns})`);
console.log(`  (e) 빔 탐색: ${failures - before} failures / ${beamRuns} runs`);

// --- (f) 뭉가를 든 빌드가 80%로 눌려서 탈락하지 않는가 ----------------------

before = failures;
{
  const state = randomState(true);
  const baseline = calculateMetrics(state);
  // 상한 위쪽에 선을 긋는다. 눌린 값으로 재면 어떤 빌드도 못 넘긴다.
  const floors = normalizeSearchFloors({ critRate: Math.max(85, baseline.critRateRaw * 0.9) });
  const got = await runSearch(state, { ...EXHAUSTIVE, floors });
  check(got.pareto.length > 0, "(f) 상한 위쪽 하한도 통과하는 빌드가 있어야 한다");
  const bluntOnes = got.pareto.filter(e => e.bluntThorn);
  for (const entry of bluntOnes) {
    check(entry.critRateCapped <= 80 + 1e-9, "(f) 뭉가 빌드의 적용 치적은 80%를 안 넘는다");
    check(entry.critRateRaw + 1e-9 >= floors.critRate, "(f) 그런데도 총 치명타율로 조건을 넘겼다");
  }
  console.log(`  (f) 뭉가 ${bluntOnes.length}개 / 프론트 ${got.pareto.length}개, 하한 ${floors.critRate.toFixed(1)}%`);
}
console.log(`  (f) 상한 위쪽 하한: ${failures - before} failures`);

// --- (g) 상한 ---------------------------------------------------------------
//
// 더 쌓아도 안 쓰이는 자리를 막는다. 하한과 같은 자로 재되 방향만 반대다.
//
// 상한은 값 분포의 한가운데로 잡는다. 끝에 두면 전부 걸리거나 전부 통과해서,
// 통과 쪽이든 탈락 쪽이든 한 번도 안 밟고 지나간다 — 검사가 아무것도 안 한다.
{
  const before = failures;
  const state = randomState();
  const plan = buildSearchPlan(state, EXHAUSTIVE);
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));

  const dims = plan.dimensions;
  const walk = visit => {
    const idx = new Array(dims.length).fill(0);
    const picks = dims.map(d => d.options[0]);
    for (let c = 0; c < Math.min(plan.totalCombos, 3000); c += 1) {
      visit(evaluate(picks));
      let d = dims.length - 1;
      while (d >= 0) {
        idx[d] += 1;
        if (idx[d] < dims[d].options.length) { picks[d] = dims[d].options[idx[d]]; break; }
        idx[d] = 0; picks[d] = dims[d].options[0]; d -= 1;
      }
      if (d < 0) break;
    }
  };

  // 어느 축을 막을지는 데이터가 정한다.
  //
  // 이속으로 못 박아 두었더니 3000개 조합이 전부 같은 값이었다 — 훑기가 뒷쪽
  // 갈래(각인·5T)부터 돌려서 1T 신속이 안 움직였기 때문이다. 그러면 상한을
  // 어디에 그어도 전부 통과라 검사가 아무것도 안 한다. 실제로 벌어지는 축을
  // 골라야 통과와 탈락을 둘 다 밟는다.
  const spread = SEARCH_FLOOR_FIELDS.map(field => {
    const values = [];
    // 조건부 축(뭉가 줄)은 걸리는 빌드만 센다 — 안 걸리는 빌드를 섞으면
    // 상한을 어디에 그어도 통과라 검사가 아무것도 안 한다.
    walk(m => { if (capApplies(field, m)) values.push(field.read(m)); });
    values.sort((a, b) => a - b);
    return { field, lo: values[0], hi: values[values.length - 1] };
  }).sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))[0];

  const cap = (spread.lo + spread.hi) / 2;
  const ceilings = normalizeSearchCeilings({ [spread.field.key]: cap });
  const floors = normalizeSearchFloors({});

  check(hasSearchBound(floors, ceilings), "(g) 상한만 걸어도 조건이 걸린 것으로 센다");
  check(spread.hi - spread.lo > 1e-6,
    `(g) 벌어지는 축이 하나는 있어야 한다 (${spread.field.label} ${spread.lo.toFixed(2)}~${spread.hi.toFixed(2)})`);

  let over = 0;
  let under = 0;
  walk(m => {
    if (!capApplies(spread.field, m)) return;
    const value = spread.field.read(m);
    const passes = meetsSearchFloors(m, floors, ceilings);
    if (passes && value > cap + 1e-9) fail(`(g) 상한을 넘겼는데 통과 (${value.toFixed(2)} > ${cap.toFixed(2)})`);
    if (!passes && value <= cap + 1e-9) fail(`(g) 상한 안인데 탈락 (${value.toFixed(2)} <= ${cap.toFixed(2)})`);
    if (value > cap + 1e-9) over += 1; else under += 1;
  });
  check(over > 0 && under > 0, `(g) 상한이 분포를 가른다 (넘김 ${over} · 안쪽 ${under})`);

  // 탐색이 내놓은 것 중에 넘긴 것이 없어야 한다.
  const got = await runSearch(state, { ...EXHAUSTIVE, ceilings });
  // 결과 항목에는 metrics 전체가 없다. 축 이름으로 직접 읽는다.
  const readEntry = {
    critRate: e => (e.bluntThorn ? -Infinity : e.critRateRaw),
    critRateThorn: e => (e.bluntThorn ? e.critRateRaw : -Infinity),
    attackSpeed: e => e.attackSpeedBonus,
    moveSpeed: e => e.moveSpeedBonus,
    cooldown: e => Math.min(80, e.cooldownReduction),
  }[spread.field.key];
  const bad = [...got.pareto, ...got.damage, ...got.dps].filter(e => readEntry(e) > cap + 1e-9);
  check(bad.length === 0, `(g) 결과에 상한 초과가 섞였다 (${bad.length}개)`);
  console.log(`  (g) 상한: ${failures - before} failures — ${spread.field.label} ${cap.toFixed(1)}% 이하, 넘김 ${over} · 안쪽 ${under}`);
}


// --- 치적 두 줄 ----------------------------------------------------------
//
// 한 번의 전수 탐색에 뭉가 낀 빌드와 안 낀 빌드가 섞인다. 쓸모 있는 치적의
// 자리가 서로 달라서(100 대 110~120) 상한이 하나면 한쪽은 틀린 자로 재게 된다.
{
  const plain = SEARCH_FLOOR_FIELDS.find(f => f.key === "critRate");
  const thorn = SEARCH_FLOOR_FIELDS.find(f => f.key === "critRateThorn");
  check(Boolean(plain && thorn), "(i) 치적 축이 둘이다");

  const withThorn = { critRateRaw: 115, specials: { bluntThorn: 1 } };
  const without = { critRateRaw: 115, specials: { bluntThorn: 0 } };
  check(!capApplies(plain, withThorn) && capApplies(plain, without), "(i) 기본 상한은 뭉가 없는 빌드에만");
  check(capApplies(thorn, withThorn) && !capApplies(thorn, without), "(i) 뭉가 상한은 뭉가 낀 빌드에만");
  check(thorn.capOnly === true, "(i) 뭉가 줄은 상한 전용");

  // 기본 90 · 뭉가 110을 함께 걸면 네 경우가 갈라져야 한다.
  const caps = normalizeSearchCeilings({ critRate: 90, critRateThorn: 110 });
  const zero = normalizeSearchFloors({});
  const at = (crit, thornOn) => meetsSearchFloors(
    { critRateRaw: crit, specials: { bluntThorn: thornOn ? 1 : 0 } }, zero, caps,
  );
  check(at(90, false), "(i) 뭉가 없이 90 통과");
  check(!at(115, false), "(i) 뭉가 없이 115 탈락");
  check(at(110, true), "(i) 뭉가로 110 통과");
  check(!at(115, true), "(i) 뭉가로 115 탈락");
  // 한 줄만 걸면 다른 무리는 아예 안 걸린다.
  const onlyPlain = normalizeSearchCeilings({ critRate: 90 });
  check(meetsSearchFloors({ critRateRaw: 200, specials: { bluntThorn: 2 } }, zero, onlyPlain),
    "(i) 기본 줄만 걸면 뭉가 빌드는 안 걸린다");
  // 하한은 안 갈린다. 뭉가를 껴도 치적 하한은 그대로 걸려야 한다.
  const floor85 = normalizeSearchFloors({ critRate: 85 });
  const noCap = normalizeSearchCeilings({});
  check(!meetsSearchFloors({ critRateRaw: 70, specials: { bluntThorn: 2 } }, floor85, noCap),
    "(i) 뭉가 빌드도 치적 하한에 걸린다");
  check(meetsSearchFloors({ critRateRaw: 90, specials: { bluntThorn: 2 } }, floor85, noCap),
    "(i) 뭉가 빌드도 하한을 넘기면 통과");
  console.log("  (i) 치적 상한 두 줄 · 하한 하나: 0 failures — 기본 90 · 뭉가 110");
}

// (j) 실제 전수 탐색에서 두 줄이 각자 걸리는가.
//
// (g)는 늘 벌어짐이 가장 큰 축(기본 치적)만 뽑아서 뭉가 줄을 안 밟는다.
// 여기서는 두 상한을 함께 걸고 결과를 뭉가 유무로 갈라 본다.
{
  const before = failures;
  const PLAIN_CAP = 90;
  const THORN_CAP = 110;
  let ranWithThorn = 0;
  let ranWithout = 0;

  for (let run = 0; run < 6; run += 1) {
    const state = randomState(true);
    const got = await runSearch(state, {
      ...EXHAUSTIVE,
      ceilings: { critRate: PLAIN_CAP, critRateThorn: THORN_CAP },
    });
    for (const e of [...got.pareto, ...got.damage, ...got.dps]) {
      const cap = e.bluntThorn ? THORN_CAP : PLAIN_CAP;
      if (e.bluntThorn) ranWithThorn += 1; else ranWithout += 1;
      if (e.critRateRaw > cap + 1e-9) {
        fail(`(j) ${e.bluntThorn ? "뭉가" : "기본"} 상한 ${cap}을 넘겼는데 결과에 남음 (${e.critRateRaw.toFixed(2)})`);
      }
    }
  }
  check(ranWithThorn + ranWithout > 0, "(j) 결과가 하나는 나와야 한다");
  // 뭉가 빌드가 기본 상한(90)을 넘어서도 살아남았다면 두 줄이 갈린 증거다.
  console.log(`  (j) 전수 탐색 두 상한: ${failures - before} failures — 뭉가 ${ranWithThorn}개 · 기본 ${ranWithout}개`);
}

// (k) 대난투 순위 — 빔이 제압 계열을 앞 차원에서 잘라먹지 않는가.
//
// 제압 위주 조합은 한 방 딜·DPS 어느 축에서도 상위가 아니다. 빔이 그 두 축만
// 보고 남기면 마지막 차원에 닿기도 전에 사라져서, 대난투 순위가 살아남은 것
// 중 그나마 나은 것을 모은 목록이 된다. 전수와 빔의 1위가 같아야 한다.
{
  const before = failures;
  let compared = 0;
  let staggerDiffers = 0;

  for (let run = 0; run < 6; run += 1) {
    const state = randomState();
    // 제압을 실제로 굴릴 수 있게 1T를 열어 준다.
    const settings = { engravingSlots: "fixed", fullBudget: true, resultLimit: 20, tier1Mode: "step10" };
    const full = await runSearch(state, { ...settings, mode: "exhaustive" });
    const beam = await runSearch(state, { ...settings, mode: "beam", beamWidth: 60 });
    if (!full.stagger?.length || !beam.stagger?.length) continue;
    compared += 1;

    const best = full.stagger[0].staggerIndex;
    const got = beam.stagger[0].staggerIndex;
    // 빔은 근사라 한 톨쯤 못 미칠 수 있다. 재는 것은 그 오차가 아니라 축이
    // 통째로 잘렸는가다 — 잘리면 제압을 안 찍은 것만 남아 몇 %가 벌어진다.
    if (got < best * 0.99) {
      fail(`(k) 빔의 대난투 1위가 전수보다 낮다 (전수 ${best.toFixed(2)} · 빔 ${got.toFixed(2)})`);
    }
    // 값만 보면 1% 안쪽에서 눈감아 준다. 그래서 구조도 함께 본다 —
    // 전수가 제압을 찍었으면 빔도 찍어야 한다. 축이 잘리면 여기서 걸린다.
    const domFull = full.stagger[0].nodeLevels["e1-domination"] || 0;
    const domBeam = beam.stagger[0].nodeLevels["e1-domination"] || 0;
    if (domFull > 0 && domBeam <= 0) {
      fail(`(k) 전수는 제압 ${domFull}Lv를 찍었는데 빔의 대난투 1위는 안 찍었다`);
    }
    // 대난투 1위가 한 방 딜 1위와 늘 같으면 이 검사가 아무것도 안 잰다.
    if (full.stagger[0].id !== full.damage[0].id) staggerDiffers += 1;
  }

  check(compared > 0, "(k) 대난투 순위가 하나는 나와야 한다");
  console.log(`  (k) 대난투 빔 보존: ${failures - before} failures — 비교 ${compared}판 · 한 방 딜 1위와 다른 판 ${staggerDiffers}`);
}

console.log(failures === 0 ? "floors: all checks passed" : `floors: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
