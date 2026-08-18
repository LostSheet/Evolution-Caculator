// 대난투 — 무력 게이지를 0으로 만들면 넘어가는 구역.
//
// 그 동안만 세 가지가 실린다: 제압, 부러진 뼈, 무력화 대상 피해.
// 그래서 이 셋은 다른 피해 그룹처럼 전 딜에 곱해지지 않는다:
//
//   총 딜 = 평시 × (1 − 비중 + 비중 × 무력화 배수)
//
// 쿨감의 부분 적용(사이클로 합성)과 다르다. 피해는 시간이 아니라 양이라
// 비중으로 그냥 섞는다.
//
// 비중이 0이면 셋 다 아무 일도 안 해야 한다 — 안 그러면 대난투가 없는 판에서
// 탐색이 제압을 사고, 그건 그냥 딜을 버리는 것이다.
import { DEFAULT_STATE, mergeState, calculateMetrics, STAGGER_DAMAGE_GROUPS, getStaggerShare } from "../src/lib/core/metrics.js";
import { ARC_PASSIVE_CONSTANTS } from "../src/lib/core/data.js";
import { ENGRAVING_LIBRARY } from "../src/lib/core/engravings.js";
import { SEARCH_DEFAULTS, buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";
import { getModeledStatKeys } from "../src/lib/core/search.js";
import { explainMetrics } from "../src/lib/core/explain.js";

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const want = (label, got, expected, tol = 1e-9) => {
  if (near(got, expected, tol)) console.log(`  ${label} = ${got}`);
  else fail(`${label}: ${got} != ${expected}`);
};

const PER = ARC_PASSIVE_CONSTANTS.staggerDamagePerDomination;
const build = (share, extra = {}) => mergeState(DEFAULT_STATE, {
  base: { ...DEFAULT_STATE.base, dominationStat: 79 },
  convenience: { ...DEFAULT_STATE.convenience, staggerShare: share },
  ...extra,
});

// (a) 제압 79 → 5.64%. 사용자가 준 기준점이다.
{
  want("(a) 제압 1당", PER, 0.0713924);
  want("(a) 제압 79", 79 * PER, 5.64, 1e-4);
  want("(a) 비중 0~1 환산", getStaggerShare({ staggerShare: 80 }), 0.8);
  want("(a) 100 넘으면 1", getStaggerShare({ staggerShare: 500 }), 1);
  want("(a) 음수는 0", getStaggerShare({ staggerShare: -20 }), 0);
}

// (b) 비중이 0이면 딜에 아무 영향이 없다.
//
// 그룹 값 자체는 남는다 — 부러진 뼈 42%는 사실이고, 계기판이 "있는데 안
// 실린다"를 보여 주는 편이 낫다. 섞는 항이 0이라 총 배수가 안 움직인다.
{
  const off = calculateMetrics(build(0, { engravings: { "broken-bone": "relic4" } }));
  want("(b) 총 배수 = 평시", off.damageMultiplier, off.plainMultiplier, 1e-12);
  want("(b) 부뼈 값은 남는다", off.damageGroups["무력화 대상 피해"], 42, 1e-9);
}

// (c) 섞는 셈이 정의대로다.
{
  const state = build(80, { engravings: { "broken-bone": "relic4" } });
  const m = calculateMetrics(state);
  // 부러진 뼈 유물 4단계 42% + 제압 79 → 5.64%. 같은 그룹이라 더한다.
  want("(c) 무력화 그룹", m.damageGroups["무력화 대상 피해"], 42 + 79 * PER, 1e-9);
  want("(c) 무력화 배수", m.staggerMultiplier, 1 + (42 + 79 * PER) / 100, 1e-9);
  want("(c) 총 배수", m.damageMultiplier, m.plainMultiplier * (1 - 0.8 + 0.8 * m.staggerMultiplier), 1e-12);
  // 비중을 100으로 올리면 그냥 곱이 된다.
  const full = calculateMetrics({ ...state, convenience: { ...state.convenience, staggerShare: 100 } });
  want("(c) 비중 100이면 곱", full.damageMultiplier, full.plainMultiplier * full.staggerMultiplier, 1e-12);
}

// (d) 부러진 뼈는 제 그룹으로 간다. 주는 피해에 섞이면 대난투 밖에서도 실린다.
{
  const bone = ENGRAVING_LIBRARY.find(item => item.id === "broken-bone");
  const keys = bone.effects.map(effect => effect.key);
  if (!keys.every(key => STAGGER_DAMAGE_GROUPS.has(key))) fail(`(d) 부러진 뼈가 다른 그룹으로 간다: ${keys}`);
  if (!ENGRAVING_LIBRARY.some(item => item.id === "broken-bone")) fail("(d) 부러진 뼈가 목록에 없다");

  // 대난투가 없으면 부러진 뼈는 값이 0이어야 한다.
  const off = calculateMetrics(build(0, { engravings: { "broken-bone": "relic4" } }));
  const on = calculateMetrics(build(0));
  want("(d) 비중 0에서 부뼈는 무해", off.damageIndex, on.damageIndex, 1e-9);
}

// (e) 비중을 적으면 제압이 탐색 후보가 된다.
{
  const off = getModeledStatKeys(build(0));
  const on = getModeledStatKeys(build(50));
  if (off.has("dominationStat")) fail("(e) 비중 0인데 제압을 후보에 넣는다");
  if (!on.has("dominationStat")) fail("(e) 비중이 있는데 제압을 안 넣는다");
}

// (f) 탐색 평가기가 본체와 같은 값을 낸다 — 전수.
{
  const base = build(80, { engravings: { "broken-bone": "relic4" } });
  const plan = buildSearchPlan(base, { ...SEARCH_DEFAULTS, tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "fixed" });
  const evaluate = buildEvaluator(base, new Set(plan.engravings.controlledIds));
  const zero = Object.fromEntries(Object.keys(base.nodeLevels).map(id => [id, 0]));
  const picks = new Array(plan.dimensions.length).fill(0);
  let worst = 0;
  let checked = 0;
  const walk = index => {
    if (index === plan.dimensions.length) {
      const chosen = plan.dimensions.map((d, i) => d.options[picks[i]]);
      const levels = { ...zero };
      let petStat = base.convenience.petStat ?? "none";
      let food = base.convenience.food ?? "none";
      chosen.forEach(option => {
        if (option.kind === "pet") { petStat = option.pet; return; }
        if (option.kind === "food") { food = option.food; return; }
        if (option.kind !== "nodes") return;
        option.levels.forEach(([id, level]) => { levels[id] = level; });
      });
      const fast = evaluate(chosen);
      const slow = calculateMetrics({ ...base, nodeLevels: levels, convenience: { ...base.convenience, petStat, food } });
      checked += 1;
      worst = Math.max(worst, Math.abs(fast.dpsIndex - slow.dpsIndex) / Math.max(1, slow.dpsIndex));
      return;
    }
    const options = plan.dimensions[index].options;
    for (let i = 0; i < Math.min(options.length, 4); i += 1) { picks[index] = i; walk(index + 1); }
  };
  walk(0);
  if (checked < 100) fail(`(f) 훑은 조합이 적다: ${checked}`);
  want(`(f) 평가기 == 본체 (${checked}개 조합)`, worst, 0, 1e-9);
}

// (g) 비중이 크면 탐색이 실제로 제압을 산다.
{
  const bestTier1 = share => {
    const state = build(share, { engravings: { "broken-bone": "relic4" } });
    const plan = buildSearchPlan(state, { ...SEARCH_DEFAULTS, tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "fixed" });
    const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));
    const rest = plan.dimensions.slice(1).map(d => d.options[0]);
    let best = null;
    for (const option of plan.dimensions[0].options) {
      const m = evaluate([option, ...rest]);
      if (!best || m.damageIndex > best.score) {
        best = { score: m.damageIndex, domination: (option.levels.find(([id]) => id === "e1-domination") ?? [, 0])[1] };
      }
    }
    return best.domination;
  };
  const low = bestTier1(0);
  const high = bestTier1(100);
  want("(g) 비중 0에서 제압", low, 0);
  if (!(high > 0)) fail(`(g) 비중 100인데 제압을 안 산다: ${high}`);
  else console.log(`  (g) 비중 100에서 제압 ${high}`);
}

// (h) 계기판이 설명 못 한 몫을 안 남긴다.
{
  const report = explainMetrics(build(80, { engravings: { "broken-bone": "relic4" } }));
  const residual = report.damage.filter(group => Math.abs(group.residual) > 1e-9);
  if (residual.length > 0) fail(`(h) 잔차: ${residual.map(g => `${g.key} ${g.residual}`).join(", ")}`);
  const group = report.damage.find(item => item.key === "무력화 대상 피해");
  const labels = group?.sources.map(source => source.label) ?? [];
  if (!labels.some(label => label.startsWith("제압"))) fail(`(h) 제압 출처가 없다: ${labels}`);
  if (!labels.some(label => label.includes("부러진 뼈"))) fail(`(h) 부러진 뼈 출처가 없다: ${labels}`);
  console.log(`  (h) 계기판 출처 ${labels.join(", ")}`);
}

console.log(failures === 0 ? "stagger: all checks passed" : `stagger: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
