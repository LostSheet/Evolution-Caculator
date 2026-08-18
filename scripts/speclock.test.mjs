// 1T 특화 30 고정.
//
// 이 고정의 뜻은 "특화의 아이덴티티 수급을 계산기가 모델링 못 하니 손대지
// 말라"다. 그런데 예전 구현은 조합을 다 만든 뒤 특화 30인 것만 걸러 내는
// 방식이라, 특화 효율을 0으로 두면 특화가 애초에 탐색 후보에서 빠져
// 30짜리 조합이 하나도 안 나왔고 필터가 통째로 무시됐다.
//
//   체크는 켜져 있는데 아무 일도 안 일어난다.
//
// 그래서 '특화 효율 0'이 이 검사의 주인공이다.
import { NODE_LIBRARY, EVOLUTION_TIERS } from "../src/lib/core/data.js";
import { DEFAULT_STATE, mergeState } from "../src/lib/core/metrics.js";
import { buildSearchPlan } from "../src/lib/core/runner.js";
import { getModeledStatKeys, isNodeImpactful } from "../src/lib/core/search.js";

const SPEC = "e1-spec";
const LEVEL = 30;

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };

const stateWith = spec => mergeState(DEFAULT_STATE, {
  base: { specDamagePer100: spec },
  settings: { pointBudget: 140 },
});

const planWith = (spec, options) => buildSearchPlan(stateWith(spec), {
  tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "0", fullBudget: true, ...options,
});

const tier1Of = plan => plan.dimensions.find(d => d.key === "tier1");
const specLevel = option => option.levels.find(([id]) => id === SPEC)?.[1] ?? 0;

// --- (a) 특화 효율 0에서도 고정이 걸리는가 ------------------------------------
{
  const keys = getModeledStatKeys(stateWith(0));
  const specNode = NODE_LIBRARY.find(node => node.id === SPEC);
  const impactful = isNodeImpactful(specNode, keys, new Set());
  if (impactful) fail("(a) 특화 효율 0인데 특화가 탐색 대상이다 — 전제가 바뀌었다");

  for (const spec of [0, 3.5]) {
    const dim = tier1Of(planWith(spec, { tier1SpecLock: true }));
    const bad = dim.options.filter(option => specLevel(option) !== LEVEL);
    if (bad.length > 0) {
      fail(`(a) 특화 효율 ${spec}: ${dim.options.length}가지 중 ${bad.length}가지가 특화 ${LEVEL}이 아니다`);
    }
    console.log(`  (a) 특화 효율 ${spec} · 특화 모델링 ${spec === 0 ? "안 됨" : "됨"}`
      + ` → 1T ${dim.options.length}가지 전부 특화 ${LEVEL}`);
  }
}

// --- (b) 남은 포인트를 제대로 쓰는가 ------------------------------------------
// 30을 떼어 놓고 남은 10P로 나머지를 훑어야 한다. 1T는 1P/Lv에 40P다.
{
  const tier = EVOLUTION_TIERS["진화 1"];
  const dim = tier1Of(planWith(0, { tier1SpecLock: true }));
  const over = dim.options.filter(option => option.points > tier.maxPoints);
  if (over.length > 0) fail(`(b) 1T 상한 ${tier.maxPoints}P를 넘는 조합 ${over.length}가지`);

  const best = dim.options.reduce((max, option) => Math.max(max, option.points), 0);
  if (best !== tier.maxPoints) fail(`(b) 1T를 꽉 채우는 조합이 없다 (최대 ${best}P)`);

  // 특화 말고 다른 노드에도 실제로 포인트가 간다 — 고정이 나머지를 막으면 안 된다.
  const spread = dim.options.filter(option => option.levels.length > 1);
  if (spread.length === 0) fail("(b) 특화 말고는 아무 노드에도 안 찍힌다");
  console.log(`  (b) 1T ${dim.options.length}가지 · 최대 ${best}/${tier.maxPoints}P`
    + ` · 특화 외 노드가 있는 조합 ${spread.length}가지`);
}

// --- (c) 끄면 예전처럼 자유롭게 훑는가 ----------------------------------------
{
  const dim = tier1Of(planWith(3.5, { tier1SpecLock: false }));
  const varied = new Set(dim.options.map(specLevel));
  if (varied.size <= 1) fail(`(c) 고정을 껐는데 특화가 ${[...varied]}로 고정돼 있다`);
  console.log(`  (c) 고정 끔 → 특화 레벨 ${[...varied].sort((a, b) => a - b).join("/")}`);
}

// --- (d) 못 거는 경우를 조용히 넘기지 않는가 ----------------------------------
{
  const excluded = buildSearchPlan(stateWith(0), {
    tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "0", fullBudget: true,
    tier1SpecLock: true, excludedNodes: [SPEC],
  });
  if (!excluded.tier1SpecLock.wanted) fail("(d) 켠 사실을 안 들고 있다");
  if (excluded.tier1SpecLock.applied) fail("(d) 특화를 뺐는데 고정이 걸렸다고 한다");

  const fixed = planWith(0, { tier1Mode: "fixed", tier1SpecLock: true });
  if (fixed.tier1SpecLock.applied) fail("(d) 1T가 '현재 배분 고정'인데 고정이 걸렸다고 한다");

  const normal = planWith(0, { tier1SpecLock: true });
  if (!normal.tier1SpecLock.applied) fail("(d) 걸리는 경우인데 안 걸렸다고 한다");
  console.log("  (d) 못 거는 경우(특화 제외 · 1T 현재 배분 고정)를 구분해 알린다");
}

console.log(failures === 0 ? "speclock: all checks passed" : `speclock: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
