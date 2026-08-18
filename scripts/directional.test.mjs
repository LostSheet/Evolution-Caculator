// 방향성 조건 검사.
//
// 일격은 한 노드 안에서 조건이 갈린다 — 치명타 적중률은 전체 적용, 치명타
// 피해는 방향성 스킬(백어택/헤드어택) 한정. 예전에는 둘 다 무조건 반영해서
// 일격이 과대평가되고 있었다.
//
// legacy vs core 대조만으로는 이걸 못 잡는다. 양쪽을 똑같이 고치면 둘은
// 여전히 일치하기 때문이다. 그래서 "조건이 실제로 값을 바꾸는가"를 직접 잰다.
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import { SEARCH_DEFAULTS, buildEvaluator, buildSearchPlan } from "../src/lib/core/runner.js";
import { NODE_LIBRARY } from "../src/lib/core/data.js";

const EPS = 1e-9;
let failures = 0;
const fail = (label, detail) => { failures += 1; console.error(`  ✗ ${label} — ${detail}`); };

const build = (nodeLevels, settings) => mergeState(DEFAULT_STATE, {
  settings: { ...DEFAULT_STATE.settings, ...settings },
  nodeLevels,
});

// 일격 Lv2를 찍은 것과 안 찍은 것의 차이. 조건에 따라 달라져야 한다.
function singleStrikeDelta(settings) {
  const off = calculateMetrics(build({}, settings));
  const on = calculateMetrics(build({ "e3-single-strike": 2 }, settings));
  return {
    critRate: on.critRateRaw - off.critRateRaw,
    critDamage: on.critDamage - off.critDamage,
    damageIndex: on.damageIndex / off.damageIndex,
  };
}

// --- (a) 치적은 언제나, 치피는 방향성일 때만 ---------------------------------
{
  const before = failures;
  const cases = [
    ["백어택 X · 헤드어택 X", { backAttack: false, headAttack: false }, 20, 0],
    ["백어택 O", { backAttack: true, headAttack: false }, 20, 32],
    ["헤드어택 O", { backAttack: false, headAttack: true }, 20, 32],
    ["둘 다 O", { backAttack: true, headAttack: true }, 20, 32],
  ];
  for (const [label, settings, expectRate, expectDamage] of cases) {
    const delta = singleStrikeDelta(settings);
    // 치명타 적중률은 조건과 무관하게 +10/렙 = +20.
    if (Math.abs(delta.critRate - expectRate) > EPS) {
      fail(label, `치적 증가 ${delta.critRate} != ${expectRate}`);
    }
    // 치명타 피해는 +16/렙 = +32, 단 방향성일 때만.
    if (Math.abs(delta.critDamage - expectDamage) > EPS) {
      fail(label, `치피 증가 ${delta.critDamage} != ${expectDamage}`);
    }
  }
  console.log(`(a) 일격 · 치적 전체 / 치피 방향성 한정: ${failures - before} failures / ${cases.length} cases`);
}

// --- (b) 조건이 실제로 한 방 딜을 갈라야 한다 --------------------------------
// 켜고 끄는 것만으로 값이 안 바뀌면 게이트가 걸려 있지 않은 것이다.
{
  const before = failures;
  const dark = singleStrikeDelta({ backAttack: false, headAttack: false });
  const lit = singleStrikeDelta({ backAttack: true, headAttack: false });
  if (!(lit.damageIndex > dark.damageIndex + 1e-6)) {
    fail("게이트", `방향성을 켜도 일격의 한 방 딜 기여가 그대로다: ${dark.damageIndex} vs ${lit.damageIndex}`);
  }
  console.log(`(b) 방향성을 켜면 일격이 더 세짐: ${failures - before} failures` +
    ` (×${dark.damageIndex.toFixed(4)} → ×${lit.damageIndex.toFixed(4)})`);
}

// --- (c) 탐색 평가기도 같은 규칙을 따르는가 ----------------------------------
// 본체와 탐색이 어긋나면 탐색이 실제로는 못 얻는 이득을 보고 일격을 집는다.
{
  const before = failures;
  for (const settings of [{ backAttack: false, headAttack: false }, { backAttack: true, headAttack: false }]) {
    const state = build({ "e3-single-strike": 2 }, settings);
    // 조합을 다 펼칠 필요는 없다. 여기서 볼 것은 평가기가 조건을 지키는지뿐이다.
    const plan = buildSearchPlan(state, { ...SEARCH_DEFAULTS, tier1Mode: "fixed", engravingSlots: "0", petRoles: { none: "locked" } });
    const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));

    const node = NODE_LIBRARY.find(item => item.id === "e3-single-strike");
    const picks = [{ kind: "nodes", levels: [["e3-single-strike", 2]], points: 2 * 5, goddessLevel: 0 }];
    const searched = evaluate(picks);
    const direct = calculateMetrics(build({ "e3-single-strike": 2 }, settings));

    const label = settings.backAttack ? "백어택 O" : "백어택 X";
    if (Math.abs(searched.critDamage - direct.critDamage) > EPS) {
      fail(`탐색 ${label}`, `치피 ${searched.critDamage} != 본체 ${direct.critDamage}`);
    }
    if (Math.abs(searched.critRateRaw - direct.critRateRaw) > EPS) {
      fail(`탐색 ${label}`, `치적 ${searched.critRateRaw} != 본체 ${direct.critRateRaw}`);
    }
    if (!node) fail("노드", "일격을 못 찾음");
  }
  console.log(`(c) 탐색 평가기 == 계산기 본체: ${failures - before} failures / 2 settings`);
}

// --- (d) 방향성 조건이 붙은 효과는 일격의 치피 하나뿐인가 --------------------
// 새 조건을 데이터에 붙이면 여기서 드러난다. 조용히 늘어나면 안 된다.
{
  const before = failures;
  const conditioned = [];
  NODE_LIBRARY.forEach(node => {
    node.effects.forEach(effect => {
      if (effect.condition) conditioned.push(`${node.name} · ${effect.label}`);
    });
  });
  const expected = ["일격 · 방향성 스킬 치명타 피해"];
  if (JSON.stringify(conditioned) !== JSON.stringify(expected)) {
    fail("조건 목록", `${JSON.stringify(conditioned)} != ${JSON.stringify(expected)}`);
  }
  console.log(`(d) 조건 붙은 노드 효과: ${conditioned.length}개 — ${conditioned.join(", ")}`);
}

if (failures) {
  console.error("directional: FAILED");
  process.exit(1);
}
console.log("directional: all checks passed");
