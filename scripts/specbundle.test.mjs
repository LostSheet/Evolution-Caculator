// 특화 묶음 — 아이덴티티류의 특화 가치.
//
//   배율(S) = Π 줄 (1+v(S))/(1+v₀)      쿨감 줄은 (1−v₀)/(1−v(S))
//   총딜   ×= 1 + Σ 비중 × (배율 − 1)
//
// 기준 특화에서 배율이 정확히 1이어야 한다 — 비중을 잰 로그에 효과가 이미
// 켜져 있었으므로, 기준점에서 아무 일도 안 하는 것이 이중계상이 없다는 뜻이다.
import { DEFAULT_STATE, mergeState, calculateMetrics, specBundleBlend } from "../src/lib/core/metrics.js";
import { SEARCH_DEFAULTS, buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

const state = withBundles => mergeState(DEFAULT_STATE, {
  base: { critStat: 300, specStat: 1854, swiftStat: 100, mainStat: 100000, weaponAttack: 50000 },
  specBundles: withBundles,
});

// (a) 서머너꼴 — 피해 225.45 · 수급 159.14를 기준 특화 1854에서 잰 비중 60.
const summoner = [{
  id: "s", name: "고대 정령", share: 60, refSpec: 1854,
  rows: [
    { kind: "damage", base: 0, amount: 225.45 },
    { kind: "gain", base: 0, amount: 159.14 },
  ],
}];

const statsAt = spec => ({ specStat: spec });

{
  const at = spec => specBundleBlend(summoner, statsAt(spec)).blend;
  if (!near(at(1854), 1)) fail(`(a) 기준점 배율 1이어야 하는데 ${at(1854)}`);
  // 손계산: S=2000 → v_d=225.45×2000/1854, v_g=159.14×2000/1854
  const vd = 2.2545 * (2000 / 1854), vg = 1.5914 * (2000 / 1854);
  const m = ((1 + vd) * (1 + vg)) / (3.2545 * 2.5914);
  const want = 1 + 0.6 * (m - 1);
  if (!near(at(2000), want)) fail(`(a) 손계산 ${want} vs ${at(2000)}`);
  if (at(2000) <= 1) fail("(a) 특화를 올렸는데 배율이 안 오름");
  if (at(1700) >= 1) fail("(a) 특화를 내렸는데 배율이 안 내림");
  console.log(`  (a) 서머너꼴: 1854→1.000000 · 2000→${at(2000).toFixed(6)} · 1700→${at(1700).toFixed(6)}`);
}

// (b) 기공사꼴 — 특화 0에서도 있는 기본값 위에 증폭. 쿨감은 1/(1−c)로 실린다.
{
  const bundle = [{
    id: "g", name: "금강선공", share: 100, refSpec: 1805,
    rows: [{ kind: "cooldown", base: 26.6, amount: 36.9 }],
  }];
  const at = spec => specBundleBlend(bundle, statsAt(spec)).blend;
  if (!near(at(1805), 1)) fail(`(b) 기준점 배율 1이어야 하는데 ${at(1805)}`);
  // S=2166(1.2배): v = 26.6 + (36.9−26.6)×1.2 = 38.96 → (1−0.369)/(1−0.3896)
  const want = (1 - 0.369) / (1 - 0.3896);
  if (!near(at(1805 * 1.2), want)) fail(`(b) 손계산 ${want} vs ${at(1805 * 1.2)}`);
  console.log(`  (b) 기공사꼴 쿨감: 기준 1.000000 · ×1.2 → ${at(1805 * 1.2).toFixed(6)}`);
}

// (b2) 수식 줄 — 기공사의 "기본 × 증폭(특화)"를 식으로 직접 적는다.
// 값 두 개짜리 직선과 달리, 툴팁의 숫자(기본 98.4 · 특화당 증폭)를 그대로 쓴다.
{
  // 줄 값의 단위는 %포인트다 — 175.24라고 나와야 +175.24%로 실린다.
  // 툴팁 숫자를 그대로 쓴다: 기본 98.4, 특화 1805에서 증폭 38.73.
  const k = 38.73 / 1805; // 증폭 %p / 특화 1
  const bundle = [{
    id: "f", name: "금강선공", share: 100, refSpec: 1805,
    rows: [{ kind: "damage", base: 0, amount: 0, formula: `(100 + 98.4) * (1 + {{특화}} * ${k}%) - 100` }],
  }];
  const at = spec => specBundleBlend(bundle, statsAt(spec)).blend;
  if (!near(at(1805), 1, 1e-9)) fail(`(b2) 기준점 배율 1이어야 하는데 ${at(1805)}`);
  // 손계산: v(S) = 198.4×(1+kS/100)−100 (%p), 배율 = (1+v(S)/100)/(1+v(S₀)/100)
  const v = spec => 198.4 * (1 + (k * spec) / 100) - 100;
  if (!near(v(1805), 175.24, 0.01)) fail(`(b2) 기준값 검산 175.24 vs ${v(1805)}`);
  const want = (1 + v(2000) / 100) / (1 + v(1805) / 100);
  if (!near(at(2000), want, 1e-9)) fail(`(b2) 손계산 ${want} vs ${at(2000)}`);
  console.log(`  (b2) 수식 줄: 기준(+175.2%) 1.000000 · 2000 → ${at(2000).toFixed(6)}`);
}

// (c) 빈 묶음 · 비중 0 · 줄 없음은 전부 아무 일도 안 한다.
{
  const noop = [
    { id: "x", name: "", share: 0, refSpec: 1000, rows: [{ kind: "damage", base: 0, amount: 50 }] },
    { id: "y", name: "", share: 50, refSpec: 1000, rows: [] },
  ];
  if (!near(specBundleBlend(noop, statsAt(2000)).blend, 1)) fail("(c) 무효 묶음이 딜을 움직임");
  const bare = calculateMetrics(state([]));
  const withNoop = calculateMetrics(state(noop));
  if (!near(bare.damageIndex, withNoop.damageIndex)) fail("(c) 무효 묶음이 damageIndex를 움직임");
  console.log("  (c) 무효 묶음: 0 영향");
}

// (d) 본체 계산에 실린다 — damageIndex가 정확히 배율만큼 갈린다.
{
  const bare = calculateMetrics(state([]));
  const bundled = calculateMetrics(state(summoner));
  const spec = bundled.totalStats.specStat;
  const want = specBundleBlend(summoner, bundled.totalStats).blend;
  const got = bundled.damageIndex / bare.damageIndex;
  if (!near(got, want, 1e-9)) fail(`(d) 본체 반영 ${want} vs ${got}`);
  console.log(`  (d) 본체: 특화 ${spec} → 배율 ${want.toFixed(6)} 그대로 실림`);
}

// (e) 탐색 평가기 == 본체 — 특화가 다른 후보들에서 두 경로가 같은 값을 내야
// 순위표가 거짓말을 안 한다. 1T 특화/치명 노드가 특화를 움직이는 차원이다.
{
  const source = state(summoner);
  const plan = buildSearchPlan(source, {
    ...SEARCH_DEFAULTS, petRoles: { none: "locked" }, engravingSlots: "fixed",
  });
  const evaluate = buildEvaluator(source, new Set(plan.engravings.controlledIds));
  const zero = Object.fromEntries(Object.keys(source.nodeLevels).map(id => [id, 0]));

  let checked = 0, worst = 0;
  const specSeen = new Set();
  const picks = new Array(plan.dimensions.length).fill(0);
  const walk = index => {
    if (index === plan.dimensions.length) {
      const chosen = plan.dimensions.map((d, i) => d.options[picks[i]]);
      const levels = { ...zero };
      let petStat = source.convenience.petStat ?? "none";
      let food = source.convenience.food ?? "none";
      chosen.forEach(option => {
        if (option.kind === "pet") { petStat = option.pet; return; }
        if (option.kind === "food") { food = option.food; return; }
        if (option.kind !== "nodes") return;
        option.levels.forEach(([id, level]) => { levels[id] = level; });
      });
      const fast = evaluate(chosen);
      const slow = calculateMetrics({
        ...source, nodeLevels: levels,
        convenience: { ...source.convenience, petStat, food },
      });
      specSeen.add(slow.totalStats.specStat);
      checked += 1;
      worst = Math.max(worst, Math.abs(fast.dpsIndex - slow.dpsIndex) / Math.max(1, slow.dpsIndex));
      return;
    }
    // 차원마다 셋만 훑되 앞에서 셋이 아니라 고루 집는다. 앞 셋만 보면
    // 1T 갈래가 늘었을 때 특화가 안 움직이는 자리만 골라 보게 된다.
    const options = plan.dimensions[index].options;
    const at = options.length <= 3
      ? options.map((_, i) => i)
      : [0, Math.floor((options.length - 1) / 2), options.length - 1];
    for (const i of at) { picks[index] = i; walk(index + 1); }
  };
  walk(0);

  if (checked < 20) fail(`(e) 훑은 조합이 너무 적음 — ${checked}`);
  if (specSeen.size < 2) fail("(e) 특화가 안 움직였음 — 묶음 배율이 시험되지 않음");
  if (worst >= 1e-9) fail(`(e) 평가기와 본체가 어긋남 — 최악 ${worst.toExponential(3)}`);
  console.log(`  (e) 탐색 평가기 == 본체: ${checked}개 조합 · 특화 ${specSeen.size}가지 · 최악 ${worst.toExponential(2)}`);
}

if (failures > 0) { console.log(`${failures}개 실패.`); process.exit(1); }
console.log("오류 없음.");
