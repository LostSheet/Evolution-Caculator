// 식으로 적는 직접 입력 효과 검사.
//
// 기상술사처럼 "공격속도의 120%를 치명타 피해로" 받는 직업이 있다. 재료 하나 ×
// 비율 하나로는 {{공격속도}} + {{이동속도}} 같은 걸 못 적어서 식으로 받는다.
// eval을 쓰지 않으므로 파서가 맞는지부터 검사한다.
import {
  DEFAULT_STATE, mergeState, calculateMetrics,
  evaluateFormula, buildFormulaVariables, FORMULA_VARIABLES, getFormulaStage,
} from "../src/lib/core/metrics.js";
import { explainMetrics } from "../src/lib/core/explain.js";
import { SEARCH_DEFAULTS, buildEvaluator, buildSearchPlan } from "../src/lib/core/runner.js";

const EPS = 1e-9;
let failures = 0;
const fail = (label, detail) => { failures += 1; console.error(`  ✗ ${label} — ${detail}`); };

const build = (effects, extra = {}) => mergeState(DEFAULT_STATE, {
  convenience: { ...DEFAULT_STATE.convenience, feast: true },
  bracelet: { stats: { critStat: 0, specStat: 0, swiftStat: 100 }, effects: {} },
  baseEffects: effects,
  ...extra,
});

const fx = (id, label, category, formula, cap = "") =>
  ({ id, label, category, customCategory: "", amount: 0, formula, cap });

// --- (a) 파서 -------------------------------------------------------------
{
  const before = failures;
  const vars = { "공격속도": 40, "이동속도": 30, "특화": 1823 };
  const cases = [
    ["12", 12],
    ["12.5", 12.5],
    ["120%", 1.2],
    ["{{공격속도}}", 40],
    ["{{공격속도}} * 120%", 48],
    ["{{공격속도}} + {{이동속도}}", 70],
    ["({{공격속도}} + {{이동속도}}) * 15%", 10.5],
    ["{{특화}} / 100 * 2.5", 45.575],
    ["min({{특화}}, 2000) / 100", 18.23],
    ["max({{공격속도}}, {{이동속도}})", 40],
    ["-{{이동속도}} + 50", 20],
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["  {{공격속도}}   *   2  ", 80],
    ["10 / 0", 0],            // 0으로 나누면 0. 터지지 않아야 한다.
  ];
  for (const [text, expected] of cases) {
    const got = evaluateFormula(text, vars);
    if (got === null || Math.abs(got - expected) > 1e-9) fail(`"${text}"`, `${got} != ${expected}`);
  }

  // 못 읽는 식은 null. 예외로 터지면 안 된다.
  const broken = [
    "", "   ", "{{없는변수}}", "{{공격속도", "2 +", "* 3", "(2 + 3",
    "2 3", "min({{공격속도}})", "alert(1)", "1; 2", "{{공격속도}} $ 2",
  ];
  for (const text of broken) {
    const got = evaluateFormula(text, vars);
    if (got !== null) fail(`깨진 식 "${text}"`, `null이 아니라 ${got}`);
  }
  console.log(`(a) 파서: ${failures - before} failures / ${cases.length + broken.length} cases`);
}

// --- (b) 변수 목록이 실제로 다 채워지는가 -----------------------------------
{
  const before = failures;
  const metrics = calculateMetrics(build([]));
  const vars = buildFormulaVariables(metrics.attackSpeed, metrics.moveSpeedBonus, metrics.totalStats, {
    rateCapped: metrics.critRateCapped, rateRaw: metrics.critRateRaw, damage: metrics.critDamage,
  });
  for (const variable of FORMULA_VARIABLES) {
    if (!Object.hasOwn(vars, variable.name)) fail("변수", `${variable.name}이 표에 없다`);
    else if (!Number.isFinite(vars[variable.name])) fail("변수", `${variable.name}이 숫자가 아니다`);
  }
  // 화면이 칩으로 보여 주는 목록과 실제 표의 키가 어긋나면 안 된다.
  if (Object.keys(vars).length !== FORMULA_VARIABLES.length) {
    fail("변수", `표 ${Object.keys(vars).length}개 != 목록 ${FORMULA_VARIABLES.length}개`);
  }
  // 상한 값과 상한 전 값이 실제로 갈리는지
  if (!(vars["공격속도"] <= 40 + EPS)) fail("상한", `공격속도 ${vars["공격속도"]}가 40을 넘는다`);
  console.log(`(b) 변수 ${FORMULA_VARIABLES.length}개: ${failures - before} failures`);
}

// --- (c) 재료는 상한 40%가 걸린 뒤의 속도인가 -------------------------------
{
  const before = failures;
  const plain = calculateMetrics(build([]));
  const metrics = calculateMetrics(build([
    fx("c1", "기상 · 치피", "critDamage", "{{공격속도}} * 120%"),
    fx("c2", "기상 · 치적", "critRate", "{{이동속도}} * 30%"),
  ]));

  const appliedAttack = Math.min(Math.max(plain.attackSpeed, 0), 40);
  const appliedMove = Math.min(Math.max(plain.moveSpeedBonus, 0), 40);
  const gotDamage = metrics.critDamage - plain.critDamage;
  const gotRate = metrics.critRateRaw - plain.critRateRaw;

  if (Math.abs(gotDamage - appliedAttack * 1.2) > EPS) {
    fail("치피", `${gotDamage} != 공속 ${appliedAttack} × 120%`);
  }
  if (Math.abs(gotRate - appliedMove * 0.3) > EPS) {
    fail("치적", `${gotRate} != 이속 ${appliedMove} × 30%`);
  }
  if (!(gotDamage > 0 && gotRate > 0)) fail("적용", "식이 아예 안 걸렸다");
  console.log(
    `(c) 상한 뒤 속도를 재료로: ${failures - before} failures` +
    ` (공속 ${appliedAttack.toFixed(2)}% → 치피 +${gotDamage.toFixed(2)})`,
  );
}

// --- (d) 순서 — 식이 치적/치피를 지나 한 방 딜까지 실리는가 -----------------
{
  const before = failures;
  const none = calculateMetrics(build([]));
  const withFx = calculateMetrics(build([fx("c1", "치적 변환", "critRate", "{{이동속도}} * 50%")]));
  const asFixed = calculateMetrics(build([
    { id: "f1", label: "치적 고정", category: "critRate", customCategory: "",
      amount: withFx.critRateRaw - none.critRateRaw, formula: "" },
  ]));
  if (Math.abs(withFx.damageIndex - asFixed.damageIndex) > 1e-6) {
    fail("순서", `식 ${withFx.damageIndex} != 같은 값 고정 입력 ${asFixed.damageIndex}`);
  }
  console.log(`(e) 식이 치적을 지나 한 방 딜까지 실림: ${failures - before} failures`);
}

// --- (e) 계기판이 출처로 잡는가 (잔차 0) ------------------------------------
{
  const before = failures;
  const report = explainMetrics(build([
    fx("c1", "기상 · 치피", "critDamage", "{{공격속도}} * 120%"),
    fx("c2", "기상 · 추피", "damage:추가 피해", "({{공격속도}} + {{이동속도}}) * 20%"),
    fx("c3", "깨진 식", "critRate", "{{없는변수}} * 2"),
  ]));

  const extra = report.damage.find(group => group.key === "추가 피해");
  if (Math.abs(extra.residual) > 1e-9) fail("잔차", `추가 피해 잔차 ${extra.residual}`);
  if (!extra.sources.some(source => source.label.includes("{{공격속도}}"))) {
    fail("출처", `추가 피해 출처에 식이 없다: ${extra.sources.map(s => s.label).join(" / ")}`);
  }
  if (!report.crit.damageSources.some(source => source.label.includes("{{공격속도}} * 120%"))) {
    fail("출처", `치피 출처에 식이 없다: ${report.crit.damageSources.map(s => s.label).join(" / ")}`);
  }
  // 깨진 식은 0으로 빠지되, 다른 값을 망가뜨리면 안 된다.
  const clean = calculateMetrics(build([
    fx("c1", "기상 · 치피", "critDamage", "{{공격속도}} * 120%"),
    fx("c2", "기상 · 추피", "damage:추가 피해", "({{공격속도}} + {{이동속도}}) * 20%"),
  ]));
  if (Math.abs(report.damageIndex - clean.damageIndex) > 1e-9) {
    fail("깨진 식", `깨진 줄이 값을 바꿨다: ${report.damageIndex} != ${clean.damageIndex}`);
  }
  console.log(`(f) 계기판 출처 · 잔차 0 · 깨진 식 무해: ${failures - before} failures`);
}

// --- (f) 탐색 평가기도 같은 값을 내는가 -------------------------------------
{
  const before = failures;
  const state = build([
    fx("c1", "기상 · 치피", "critDamage", "{{공격속도}} * 120%"),
    fx("c2", "기상 · 치적", "critRate", "{{이동속도}} * 30%"),
  ], { nodeLevels: { "e3-all-out-strike": 2 } });

  const plan = buildSearchPlan(state, { ...SEARCH_DEFAULTS, tier1Mode: "fixed", engravingSlots: "0", petRoles: { none: "locked" } });
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));
  const searched = evaluate([{ kind: "nodes", levels: [["e3-all-out-strike", 2]], points: 20, goddessLevel: 0 }]);
  const direct = calculateMetrics(state);

  for (const field of ["critRateRaw", "critDamage", "damageIndex", "dpsIndex"]) {
    if (Math.abs(searched[field] - direct[field]) > 1e-9 * Math.max(1, Math.abs(direct[field]))) {
      fail("탐색", `${field} ${searched[field]} != ${direct[field]}`);
    }
  }
  console.log(`(g) 탐색 평가기 == 계산기 본체: ${failures - before} failures`);
}

// --- (g) 식이 비면 예전처럼 고정 수치를 쓴다 --------------------------------
{
  const before = failures;
  const none = calculateMetrics(build([]));
  const fixed = calculateMetrics(build([
    { id: "p1", label: "고정", category: "critDamage", customCategory: "", amount: 20, formula: "" },
  ]));
  if (Math.abs(fixed.critDamage - none.critDamage - 20) > EPS) {
    fail("고정 입력", `치피 증가 ${fixed.critDamage - none.critDamage} != 20`);
  }
  console.log(`(h) 식이 비면 고정 수치 유지: ${failures - before} failures`);
}

// --- (i) 계층 — 게임의 실제 두 노드 -----------------------------------------
// 기민함: 공격 속도 증가량 %의 120% → 치명타 피해 / 이동 속도의 30% → 치명타 적중률
// 성검 개방: 모든 치명타 발생 확률 1%당 주는 피해 0.55%, 최대 55%
//
// 앞은 속도를 읽어 치명타를 만들고, 뒤는 치명타를 읽어 피해를 만든다. 순서가
// 틀리면 뒤쪽이 치명타를 못 읽거나 옛 값을 읽는다.
{
  const before = failures;
  const state = build([
    fx("agile-d", "기민함 · 치피", "critDamage", "{{공격속도}} * 120%"),
    fx("agile-r", "기민함 · 치적", "critRate", "{{이동속도}} * 30%"),
    // 상한은 식 안의 min()이 아니라 별도 칸으로 받는다.
    fx("holy", "성검 개방", "damage:주는 피해", "{{치명타적중률}} * 0.55", 55),
  ], { bracelet: { stats: { critStat: 900, specStat: 0, swiftStat: 100 }, effects: {} } });

  const metrics = calculateMetrics(state);
  const vars = buildFormulaVariables(metrics.attackSpeed, metrics.moveSpeedBonus, metrics.totalStats, {
    rateCapped: metrics.critRateCapped, rateRaw: metrics.critRateRaw, damage: metrics.critDamage,
  });

  // 성검 개방이 읽은 치적은 기민함이 더해 준 뒤의 값이어야 한다.
  const expectedGiven = Math.min(metrics.critRateCapped * 0.55, 55);
  const given = readNumberSafe(metrics.damageGroups["주는 피해"]);
  if (Math.abs(given - expectedGiven) > 1e-9) {
    fail("계층", `주는 피해 ${given} != 치적 ${metrics.critRateCapped.toFixed(3)} × 0.55 = ${expectedGiven.toFixed(3)}`);
  }

  // 기민함을 빼면 치적이 내려가고, 성검 개방의 결과도 따라 내려가야 한다.
  const without = calculateMetrics(build([
    fx("holy", "성검 개방", "damage:주는 피해", "{{치명타적중률}} * 0.55", 55),
  ], { bracelet: { stats: { critStat: 900, specStat: 0, swiftStat: 100 }, effects: {} } }));
  if (!(metrics.critRateCapped > without.critRateCapped + 1e-9)) {
    fail("계층", "기민함이 치적을 못 올렸다");
  }
  if (!(given > readNumberSafe(without.damageGroups["주는 피해"]) + 1e-9)) {
    fail("계층", "치적이 올랐는데 성검 개방이 안 따라 올랐다");
  }
  console.log(
    `(i) 속도 → 치명타 → 피해: ${failures - before} failures` +
    ` (치적 ${without.critRateCapped.toFixed(2)} → ${metrics.critRateCapped.toFixed(2)}, 주피 ${given.toFixed(2)}%)`,
  );
}

// --- (j) 순환은 막혀 있는가 -------------------------------------------------
{
  const before = failures;
  // 속도는 어떤 식의 대상도 될 수 없다.
  for (const category of ["attackSpeedOnly", "moveSpeedOnly"]) {
    if (getFormulaStage(category) !== 0) fail("계층", `${category}가 대상이 될 수 있다`);
  }
  // 치명타를 만드는 식은 치명타를 읽을 수 없다 — 읽으려 하면 '모르는 변수'가 된다.
  const bad = calculateMetrics(build([fx("x", "순환", "critRate", "{{치명타적중률}} * 50%")]));
  const clean = calculateMetrics(build([]));
  if (Math.abs(bad.critRateRaw - clean.critRateRaw) > 1e-9) {
    fail("순환", "치적이 자기 자신을 읽고 값이 바뀌었다");
  }
  const looped = bad.formulaResults.find(item => item.label === "순환");
  if (!looped?.invalid) fail("순환", "치적을 읽는 치적 식이 오류로 안 잡혔다");

  // 속도를 대상으로 삼은 식도 오류로 잡혀야 한다.
  const speedTarget = calculateMetrics(build([fx("s", "속도 대상", "attackSpeedOnly", "{{치명}} * 1%")]));
  const flagged = speedTarget.formulaResults.find(item => item.label === "속도 대상");
  if (!flagged?.invalid) fail("순환", "속도를 대상으로 삼은 식이 오류로 안 잡혔다");
  if (Math.abs(speedTarget.attackSpeed - clean.attackSpeed) > 1e-9) fail("순환", "속도가 바뀌었다");

  console.log(`(j) 순환 차단: ${failures - before} failures`);
}

// --- (k) 상한 칸 -----------------------------------------------------------
// 성검 개방의 "최대 55%"처럼 게임 노드는 대개 상한을 함께 갖는다.
{
  const before = failures;
  // 팔찌 특성은 0~120으로 잘리므로 치적은 노드로 올린다.
  const big = {
    bracelet: { stats: { critStat: 120, specStat: 0, swiftStat: 100 }, effects: {} },
    nodeLevels: { "e1-crit": 30, "e3-all-out-strike": 2 },
  };
  const uncapped = calculateMetrics(build([fx("h", "성검", "damage:주는 피해", "{{치명타적중률}} * 0.55")], big));
  const capped = calculateMetrics(build([fx("h", "성검", "damage:주는 피해", "{{치명타적중률}} * 0.55", 5)], big));

  const rawGiven = readNumberSafe(uncapped.damageGroups["주는 피해"]);
  const cappedGiven = readNumberSafe(capped.damageGroups["주는 피해"]);
  if (!(rawGiven > 5)) fail("상한", `상한 검사를 하려면 원래 값이 5보다 커야 하는데 ${rawGiven}`);
  if (Math.abs(cappedGiven - 5) > 1e-9) fail("상한", `${cappedGiven} != 5`);

  const item = capped.formulaResults.find(entry => entry.label === "성검");
  if (!item?.capped) fail("상한", "잘렸다는 표시가 없다");
  if (Math.abs(item.raw - rawGiven) > 1e-9) fail("상한", `깎이기 전 ${item.raw} != ${rawGiven}`);

  // 상한이 비어 있으면 아무 일도 없어야 한다.
  const none = calculateMetrics(build([fx("h", "성검", "damage:주는 피해", "{{치명타적중률}} * 0.55", "")], big));
  if (Math.abs(readNumberSafe(none.damageGroups["주는 피해"]) - rawGiven) > 1e-9) {
    fail("상한", "빈 상한이 값을 잘랐다");
  }
  console.log(`(k) 상한 칸: ${failures - before} failures (${rawGiven.toFixed(2)} → ${cappedGiven.toFixed(2)})`);
}

// --- (l) 특성을 재료로 하는 피해 그룹 ----------------------------------------
//
// 서머너 교감이 '신속 1당 주는 피해 0.15%'를 준다. 이건 어느 배분에나 똑같이
// 곱해지는 값이 아니다 — 신속을 얼마나 사느냐가 그 값을 정한다. 그래서
//
//   1. 탐색이 조합마다 식을 다시 풀어야 하고(안 그러면 신속의 값을 낮게 본다),
//   2. 계기판이 그 그룹을 접어 두면 안 된다('진화 배분과 무관'이 아니다).
{
  const before = failures;
  const swiftDealt = ratio => ({
    id: "gyogam", label: "교감", category: "damage:주는 피해",
    amount: 0, customCategory: "", formula: `{{신속}} * ${ratio}%`, cap: "",
  });
  const base = ratio => mergeState(DEFAULT_STATE, {
    awakening: { job: 203, nodeLevels: {} },
    baseEffects: ratio > 0 ? [swiftDealt(ratio)] : [],
  });

  // 1. 신속이 오르면 값도 오른다 — 신속 500당 0.75%.
  for (const [swift, want] of [[0, 0], [10, 0.75], [20, 1.5], [30, 2.25]]) {
    const m = calculateMetrics({ ...base(0.15), nodeLevels: { "e1-swift": swift } });
    if (Math.abs(readNumberSafe(m.damageGroups["주는 피해"]) - want) > 1e-9) {
      fail("(l) 신속을 재료로 한 주는 피해", `신속 ${swift}: ${m.damageGroups["주는 피해"]} != ${want}`);
    }
  }

  // 2. 탐색 평가기가 조합마다 다시 푼다. 안 풀면 전수에서 오차가 난다.
  const state = base(0.15);
  const plan = buildSearchPlan(state, { ...SEARCH_DEFAULTS, tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "fixed" });
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));
  const zero = Object.fromEntries(Object.keys(state.nodeLevels).map(id => [id, 0]));
  const picks = new Array(plan.dimensions.length).fill(0);
  let worst = 0;
  let checked = 0;
  const walk = index => {
    if (index === plan.dimensions.length) {
      const chosen = plan.dimensions.map((d, i) => d.options[picks[i]]);
      const levels = { ...zero };
      let petStat = state.convenience.petStat ?? "none";
      let food = state.convenience.food ?? "none";
      chosen.forEach(option => {
        if (option.kind === "pet") { petStat = option.pet; return; }
        if (option.kind === "food") { food = option.food; return; }
        if (option.kind !== "nodes") return;
        option.levels.forEach(([id, level]) => { levels[id] = level; });
      });
      const fast = evaluate(chosen);
      const slow = calculateMetrics({ ...state, nodeLevels: levels });
      checked += 1;
      worst = Math.max(worst,
        Math.abs(readNumberSafe(fast.damageGroups["주는 피해"]) - readNumberSafe(slow.damageGroups["주는 피해"])),
        Math.abs(fast.dpsIndex - slow.dpsIndex) / Math.max(1, slow.dpsIndex));
      return;
    }
    const options = plan.dimensions[index].options;
    for (let i = 0; i < Math.min(options.length, 4); i += 1) { picks[index] = i; walk(index + 1); }
  };
  walk(0);
  if (checked < 100) fail("(l) 훑은 조합", `${checked}개뿐`);
  if (worst > 1e-9) fail("(l) 평가기가 식을 다시 안 푼다", `오차 ${worst.toExponential(3)}`);

  // 3. 비율이 크면 탐색이 실제로 신속 쪽으로 옮긴다 — 식이 최적화에 들어갔다는 뜻.
  const bestTier1 = ratio => {
    const st = base(ratio);
    const pl = buildSearchPlan(st, { ...SEARCH_DEFAULTS, tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "fixed" });
    const ev = buildEvaluator(st, new Set(pl.engravings.controlledIds));
    const rest = pl.dimensions.slice(1).map(d => d.options[0]);
    let best = null;
    for (const option of pl.dimensions[0].options) {
      const m = ev([option, ...rest]);
      if (!best || m.damageIndex > best.score) {
        best = { score: m.damageIndex, swift: (option.levels.find(([id]) => id === "e1-swift") ?? [, 0])[1] };
      }
    }
    return best.swift;
  };
  const low = bestTier1(0);
  const high = bestTier1(4);
  if (!(high > low)) fail("(l) 비율을 올려도 신속을 안 산다", `${low} → ${high}`);
  console.log(`(l) 특성 재료 피해 그룹: ${failures - before} failures (전수 ${checked}개 · 신속 ${low} → ${high})`);
}

function readNumberSafe(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

if (failures) {
  console.error("conversion: FAILED");
  process.exit(1);
}
console.log("conversion: all checks passed");
