// 치명타 시 주는 피해는 출처끼리 곱한다.
//
// 아크 그리드 '현란한 일격'과 진화 노드 '회심'이 더해지고 있었다. 게임에서는
// 각자의 배수가 곱해지므로 실제보다 낮게 나왔다:
//
//   회심 12% · 현란한 일격 11%
//     곱  ×1.12 × 1.11 = ×1.2432
//     합  ×1.23
//
// 값이 커지는 방향이라 조용히 지나가기 쉽다. 그래서 세 곳을 함께 검사한다 —
// 계산기 본체, 탐색 평가기, 그리고 계기판의 출처 목록.
import { NODE_LIBRARY, EFFECT_CATEGORIES } from "../src/lib/core/data.js";
import { CHAOS_CORES, CHAOS_CORE_SLOTS } from "../src/lib/core/cores.js";
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import { explainMetrics } from "../src/lib/core/explain.js";
import { buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 이 두 가지가 유일한 출처다. 데이터가 바뀌면 검사가 먼저 알아채야 한다.
const heartNode = NODE_LIBRARY.find(node => node.effects.some(e => e.kind === "critOnlyDamage"));
const heartAmount = heartNode?.effects.find(e => e.kind === "critOnlyDamage")?.amount;
const flashyCore = CHAOS_CORES.find(core => (core.thresholds?.[10] ?? []).some(e => e.kind === "critOnlyDamage"));
const flashyAt10 = flashyCore?.thresholds[10].find(e => e.kind === "critOnlyDamage")?.amount;

if (!heartNode || heartAmount == null) fail("(a) 회심 노드를 못 찾음");
if (!flashyCore || flashyAt10 == null) fail("(a) 치명타 시 주는 피해를 주는 코어를 못 찾음");
console.log(`  (a) 출처: ${heartNode?.name} +${heartAmount}% · ${flashyCore?.name} 10P +${flashyAt10}%`);

// --- (b) 본체: 둘을 같이 들면 곱해지는가 -------------------------------------

function stateWith({ heart = 0, corePoints = 0, baseEffects = [] } = {}) {
  const slot = CHAOS_CORE_SLOTS.find(s => flashyCore.slot === s.key) ?? CHAOS_CORE_SLOTS[0];
  const cores = {};
  for (const s of CHAOS_CORE_SLOTS) cores[s.key] = { id: "none", points: 20, stage: 1 };
  if (corePoints > 0) cores[slot.key] = { id: flashyCore.id, points: corePoints, stage: 0 };
  return mergeState(DEFAULT_STATE, {
    nodeLevels: { [heartNode.id]: heart },
    arkGrid: { cores, gems: { attack: 0, additional: 0, boss: 0 } },
    baseEffects,
    settings: { pointBudget: 140, backAttack: false, headAttack: false },
  });
}

{
  const only = calculateMetrics(stateWith({ heart: 1 })).critOnlyDamage;
  const core = calculateMetrics(stateWith({ corePoints: 10 })).critOnlyDamage;
  const both = calculateMetrics(stateWith({ heart: 1, corePoints: 10 })).critOnlyDamage;

  const want = ((1 + only / 100) * (1 + core / 100) - 1) * 100;
  const sumWould = only + core;

  if (!near(only, heartAmount)) fail(`(b) 회심 단독 ${only} != ${heartAmount}`);
  if (!near(core, flashyAt10)) fail(`(b) 코어 단독 ${core} != ${flashyAt10}`);
  if (!near(both, want, 1e-9)) fail(`(b) 둘 다: ${both} != ${want}`);
  if (near(both, sumWould)) fail(`(b) 여전히 합연산이다 (${both})`);
  console.log(`  (b) 본체: ${only}% · ${core}% → ${both.toFixed(4)}% (합이면 ${sumWould})`);
}

// --- (c) 탐색 평가기가 본체와 같은 값을 내는가 --------------------------------
// 탐색은 노드 기여분을 미리 모아 두는 빠른 경로를 쓴다. 규칙이 갈리면
// 탐색이 실제로는 못 나오는 숫자를 내놓는다.

{
  const state = stateWith({ corePoints: 10 });
  const plan = buildSearchPlan(state, { tier1Mode: "fixed", petRoles: { none: "locked" }, engravingSlots: "0" });
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));

  let checked = 0;
  for (const dimension of plan.dimensions) {
    for (const option of dimension.options) {
      if (option.kind !== "nodes") continue;
      const levels = Object.fromEntries(option.levels);
      if (!levels[heartNode.id]) continue;
      const picks = plan.dimensions.map(d => (d === dimension ? option : d.options[0]));
      const fast = evaluate(picks);
      const slow = calculateMetrics({ ...state, nodeLevels: { ...state.nodeLevels, ...levels } });
      checked += 1;
      if (!near(fast.critOnlyDamage, slow.critOnlyDamage, 1e-9)) {
        fail(`(c) 평가기 ${fast.critOnlyDamage} != 본체 ${slow.critOnlyDamage}`);
      }
      if (checked >= 6) break;
    }
    if (checked >= 6) break;
  }
  console.log(`  (c) 탐색 평가기 == 본체: ${checked}개 조합`);
}

// --- (d) 계기판 출처 목록이 머리 숫자로 되돌아오는가 --------------------------

{
  const report = explainMetrics(stateWith({ heart: 1, corePoints: 10 }));
  const sources = report.crit.critOnlySources;
  const rolled = (sources.reduce((acc, s) => acc * (1 + s.amount / 100), 1) - 1) * 100;
  if (sources.length < 2) fail(`(d) 출처가 ${sources.length}개뿐 — 둘 다 들었는데`);
  if (!near(rolled, report.crit.critOnly, 1e-9)) {
    fail(`(d) 출처를 곱한 값 ${rolled} != 계기판 ${report.crit.critOnly}`);
  }
  console.log(`  (d) 출처 ${sources.map(s => `${s.label} ${s.amount}%`).join(" · ")} → ${report.crit.critOnly.toFixed(4)}%`);
}

// --- (e) 직접 입력 효과로도 넣을 수 있는가 ------------------------------------

{
  const category = EFFECT_CATEGORIES.find(item => item.value === "critOnlyDamage");
  if (!category) fail("(e) 직접 입력 목록에 '치명타 시 주는 피해'가 없다");

  const before = calculateMetrics(stateWith({ heart: 1 })).critOnlyDamage;
  const after = calculateMetrics(stateWith({
    heart: 1,
    baseEffects: [{ id: "x", label: "직접", category: "critOnlyDamage", customCategory: "", amount: 20, formula: "", cap: "" }],
  })).critOnlyDamage;
  const want = ((1 + before / 100) * 1.2 - 1) * 100;
  if (!near(after, want, 1e-9)) fail(`(e) 직접 입력이 곱해지지 않는다: ${after} != ${want}`);
  if (near(after, before + 20)) fail("(e) 직접 입력이 합연산이다");
  console.log(`  (e) 직접 입력 ${category?.label} +20% → ${before}% → ${after.toFixed(4)}% (합이면 ${before + 20})`);
}

console.log(failures === 0 ? "critOnly: all checks passed" : `critOnly: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
