// 깨달음 · 도약.
//
// 두 층이 있고, 여기서 지키는 것도 둘이다.
//
//   구조 — 인벤 원본에서 뽑은 트리. 30직업 전부. 자리·선행·배타·관문이 성해야
//          찍는 화면이 거짓말을 안 한다.
//   수치 — 손으로 붙인 표. **전체에 상시로 걸리는 것만 센다.** 특정 스킬에만
//          걸리는 것을 전역으로 세면 치적이 부풀고, 그러면 뭉가 80% 상한과
//          최소 치적 하한이 전부 어긋난다 — 판단의 뿌리가 흔들린다.
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import { SEARCH_DEFAULTS, buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";
import {
  getAwakeningNodes, hasAwakeningTree, isAwakeningModeled, awakeningGroupInfo,
  awakeningBonuses, checkAwakening, awakeningHeadroom, awakeningDependents,
} from "../src/lib/core/awakening.js";
import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
import { explainMetrics } from "../src/lib/core/explain.js";
import { parseAwakening, jobCode } from "../src/lib/core/lostark.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
  return ok;
};
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const SUMMONER = 203;
const state = patch => mergeState(DEFAULT_STATE, patch);

// --- (a) 트리 구조 — 30직업 전부 ------------------------------------------------
{
  const codes = Object.keys(ARKPASSIVE_TREE).map(Number);
  check("(a) 30직업", codes.length === 30, String(codes.length));

  const problems = [];
  for (const code of codes) {
    const nodes = getAwakeningNodes(code);
    const names = new Set(nodes.map(item => item.id));
    if (names.size !== nodes.length) problems.push(`${code}: 이름 겹침`);

    for (const item of nodes) {
      // 선행·배타가 실제 노드를 가리켜야 한다. 오타 하나면 영영 못 여는 노드가 생긴다.
      if (item.requires && !names.has(item.requires.name)) {
        problems.push(`${code}/${item.name}: 선행 ${item.requires.name} 없음`);
      }
      if (item.requires && item.requires.level > (nodes.find(n => n.id === item.requires.name)?.maxLevel ?? 0)) {
        problems.push(`${code}/${item.name}: 선행 요구 레벨이 최대보다 큼`);
      }
      for (const name of item.excludes ?? []) {
        if (!names.has(name)) problems.push(`${code}/${item.name}: 배타 ${name} 없음`);
      }
      if (!(item.maxLevel > 0) || !(item.cost > 0)) problems.push(`${code}/${item.name}: 레벨·비용이 0`);
      // 1티어는 관문이 없고, 2티어부터는 있어야 한다.
      const wanted = item.tier > 1;
      if (wanted !== item.gate > 0) problems.push(`${code}/${item.name}: ${item.tier}티어 관문 ${item.gate}`);
    }
  }
  check("(a) 선행·배타·관문이 성하다", problems.length === 0, problems.slice(0, 5).join(" / "));

  // 배타는 서로를 가리켜야 한다. 한쪽만 걸려 있으면 순서에 따라 결과가 달라진다.
  const oneWay = [];
  for (const code of codes) {
    const nodes = getAwakeningNodes(code);
    const byId = new Map(nodes.map(item => [item.id, item]));
    for (const item of nodes) {
      for (const name of item.excludes ?? []) {
        if (!(byId.get(name)?.excludes ?? []).includes(item.id)) oneWay.push(`${code}/${item.name}→${name}`);
      }
    }
  }
  check("(a) 배타가 서로를 가리킨다", oneWay.length === 0, oneWay.slice(0, 5).join(" / "));

  check("(a) 서머너 깨달음 12 · 도약 10",
    getAwakeningNodes(SUMMONER).filter(n => n.group === "깨달음").length === 12
    && getAwakeningNodes(SUMMONER).filter(n => n.group === "도약").length === 10);
  check("(a) 예산 100 / 70",
    awakeningGroupInfo(SUMMONER, "깨달음").budget === 100
    && awakeningGroupInfo(SUMMONER, "도약").budget === 70);
}

// --- (a1) 수치 표 ---------------------------------------------------------------
{
  check("(a1) 서머너는 수치 표가 있다", isAwakeningModeled(SUMMONER) && hasAwakeningTree(SUMMONER));
  // 트리는 있는데 표가 없는 직업 — 이 상태를 화면이 갈라 보여야 한다.
  // 30직업 전부 표를 붙였다. 하나라도 빠지면 그 직업만 조용히 0이 된다.
  const unmodeled = Object.keys(ARKPASSIVE_TREE).map(Number).filter(code => !isAwakeningModeled(code));
  check("(a1) 30직업 전부 수치 표가 있다", unmodeled.length === 0, unmodeled.join(", "));
  check("(a1) 없는 직업", !hasAwakeningTree(999) && getAwakeningNodes(999).length === 0);

  const nodes = getAwakeningNodes(SUMMONER);
  check("(a1) 22개 전부 표가 붙어 있다", nodes.every(n => n.modeled),
    nodes.filter(n => !n.modeled).map(n => n.name).join(", "));

  // 전역으로 올린 것에는 반드시 근거가 남아야 한다 — 조건이 아예 없거나
  // (고대의 바람의 이동 속도), 스킬**군**이거나(소환 스킬 · 명령 스킬).
  // scopeNote에 상태 낱말이 남아 있는 전역은 잘못 올린 것이다.
  const STATE = /상태|효과 중|버프|중첩|게이지|태세|모드|적중 시|사용 시|사용 후|중일 때|동안|초간/;
  const badGlobals = nodes.flatMap(n => n.effects
    .filter(e => e.scope === "global" && e.scopeNote && STATE.test(e.scopeNote))
    .map(e => `${n.name}/${e.key} — ${e.scopeNote}`));
  check("(a1) 상태 조건이 붙은 전역은 없다", badGlobals.length === 0, badGlobals.join(", "));

  // 모든 효과에 scope가 붙어 있어야 한다. 안 붙으면 조용히 안 세어진다.
  const noScope = nodes.flatMap(n => n.effects.filter(e => !e.scope).map(() => n.name));
  check("(a1) scope 없는 효과 없음", noScope.length === 0, noScope.join(", "));

  // branch·replaces가 실제로 있는 노드를 가리켜야 한다. 오타 하나로 조용히 샌다.
  const ids = new Set(nodes.map(n => n.id));
  const dangling = nodes.flatMap(n => n.effects
    .filter(e => (e.scope === "branch" && !ids.has(e.branch)) || (e.kind === "replaces" && !ids.has(e.target)))
    .map(e => `${n.name}→${e.branch ?? e.target}`));
  check("(a1) branch·replaces가 가리키는 노드가 있다", dangling.length === 0, dangling.join(", "));

  // 수치 배열은 최대 레벨만큼 있어야 한다. 짧으면 만렙에서 undefined가 된다.
  const short = nodes.flatMap(n => n.effects
    .filter(e => Array.isArray(e.amounts) && e.amounts.length !== n.maxLevel)
    .map(e => `${n.name}/${e.key} ${e.amounts.length}≠${n.maxLevel}`));
  check("(a1) 수치가 최대 레벨만큼 있다", short.length === 0, short.join(", "));
}

// --- (a2) 갈래 ---------------------------------------------------------------
//
// 1티어 배타 선택이 딜 구조를 가른다. 상급 소환사를 고르면 일반 스킬과
// 고대의 정령 스킬이 딜의 전부이므로, 거기 걸린 치적·피해량이 전역이 된다.
{
  const plain = calculateMetrics(state({}));
  const power = { "고대의 힘": 3 };

  const alone = calculateMetrics(state({ awakening: { job: SUMMONER, nodeLevels: power } }));
  check("(a2) 갈래 없이는 안 센다", close(alone.critRateRaw, plain.critRateRaw), String(alone.critRateRaw));

  const master = calculateMetrics(state({
    awakening: { job: SUMMONER, nodeLevels: { ...power, "상급 소환사": 1 } },
  }));
  check("(a2) 상급 소환사면 치적 +16", close(master.critRateRaw, plain.critRateRaw + 16), String(master.critRateRaw));

  const overflow = calculateMetrics(state({
    awakening: { job: SUMMONER, nodeLevels: { ...power, "넘치는 교감": 3 } },
  }));
  check("(a2) 넘치는 교감이면 안 센다", close(overflow.critRateRaw, plain.critRateRaw), String(overflow.critRateRaw));
}

// --- (a3) 대체 관계 -----------------------------------------------------------
//
// 고대의 축복은 정신 집중의 23%를 47%로 갈아치운다. 더하면 70%가 된다.
{
  const only = calculateMetrics(state({
    awakening: { job: SUMMONER, nodeLevels: { "상급 소환사": 1, "정신 집중": 3 } },
  }));
  const both = calculateMetrics(state({
    awakening: { job: SUMMONER, nodeLevels: { "상급 소환사": 1, "정신 집중": 3, "고대의 힘": 3, "고대의 축복": 3 } },
  }));
  check("(a3) 정신 집중만이면 23%", close(only.damageGroups["주는 피해"], 23), String(only.damageGroups["주는 피해"]));
  check("(a3) 축복이 있으면 47% — 70%가 아니다", close(both.damageGroups["주는 피해"], 47), String(both.damageGroups["주는 피해"]));
  const row = both.awakening.applied.find(item => item.node === "정신 집중");
  check("(a3) 누가 대체했는지 남긴다", row?.replacedBy === "고대의 축복", JSON.stringify(row));
  // 대체했다는 사실 자체도 남는다 — 축복 줄이 아무 말 없이 사라지면 안 된다.
  check("(a3) 대체 사실을 적는다",
    both.awakening.skipped.some(item => item.node === "고대의 축복" && item.scope === "replace"),
    JSON.stringify(both.awakening.skipped));
}

// --- (b) 전역만 센다 -----------------------------------------------------------
{
  // 기준은 같은 직업의 빈 트리다. 직업만 정해도 파티 시너지(서머너 = 방깎)가
  // 붙으므로, 직업 0과 견주면 노드가 아니라 시너지 차이를 재게 된다.
  const plain = calculateMetrics(state({ awakening: { job: SUMMONER, nodeLevels: {} } }));
  const mari = calculateMetrics(state({
    awakening: { job: SUMMONER, nodeLevels: { "상급 소환사": 1, "마리포사의 축복": 3 } },
  }));
  check("(b) 스킬 한정은 갈래와 무관하게 안 센다", close(mari.damageIndex, plain.damageIndex), String(mari.damageIndex));
  check("(b) 안 셌다고 남긴다", mari.awakening.skipped.some(s => s.node === "마리포사의 축복" && s.amount === 96),
    JSON.stringify(mari.awakening.skipped));

  const wind = calculateMetrics(state({ awakening: { job: SUMMONER, nodeLevels: { "고대의 바람": 1 } } }));
  check("(b) 전역 이속은 센다", close(wind.moveSpeedBonus, plain.moveSpeedBonus + 10), String(wind.moveSpeedBonus));
  check("(b) 공속은 안 오른다", close(wind.attackSpeed, plain.attackSpeed), String(wind.attackSpeed));
  check("(b) 적용 목록에 남는다", wind.awakening.applied.length === 1 && wind.awakening.applied[0].amount === 10);

  const wind5 = calculateMetrics(state({ awakening: { job: SUMMONER, nodeLevels: { "고대의 바람": 5 } } }));
  check("(b) 레벨을 올려도 이속은 10%", close(wind5.moveSpeedBonus, wind.moveSpeedBonus), String(wind5.moveSpeedBonus));

  // 개별 스킬만 짚는 노드는 다 찍어도 딜이 안 움직인다. 30직업 공통 도약
  // 1티어가 그렇다 — 전부 초각성기 · 각성기 하나짜리다. 여기가 깨지면
  // 누군가 단일 스킬을 전역으로 올린 것이다.
  const LEAP_SOLO = ["초월적인 힘", "충전된 분노", "각성 증폭기", "풀려난 힘", "잠재력 해방", "즉각적인 주문"];
  const solo = getAwakeningNodes(SUMMONER).filter(item => LEAP_SOLO.includes(item.id));
  const soloGlobals = solo.flatMap(item => item.effects.filter(e => e.scope === "global" || e.scope === "branch"));
  check("(b) 도약 1티어는 전부 단일 스킬", soloGlobals.length === 0, JSON.stringify(soloGlobals));
  const maxed = Object.fromEntries(solo.map(item => [item.id, item.maxLevel]));
  const full = calculateMetrics(state({ awakening: { job: SUMMONER, nodeLevels: maxed } }));
  check("(b) 그래서 다 찍어도 딜이 안 움직인다", close(full.damageIndex, plain.damageIndex), String(full.damageIndex));
}

// --- (c) 안 넣으면 예전 그대로 --------------------------------------------------
{
  const before = calculateMetrics(state({ nodeLevels: { "e1-crit": 10 }, engravings: { grudge: "legendary4" } }));
  const after = calculateMetrics(state({
    nodeLevels: { "e1-crit": 10 }, engravings: { grudge: "legendary4" },
    awakening: { job: 0, nodeLevels: {} },
  }));
  check("(c) 직업 0이면 아무 일도 안 일어난다", close(before.damageIndex, after.damageIndex));

  // 모르는 직업 코드에 아무 배분이나 들어와도 터지지 않고, 아무 일도 안 일어난다.
  const bare = calculateMetrics(state({}));
  const unknown = calculateMetrics(state({ awakening: { job: 999, nodeLevels: { "x": 3 } } }));
  check("(c) 모르는 직업도 안전", close(unknown.damageIndex, bare.damageIndex), String(unknown.damageIndex));
}

// --- (d) 규칙 검사 -------------------------------------------------------------
{
  const ok = checkAwakening(SUMMONER, { "상급 소환사": 1, "정신 집중": 3, "고대의 힘": 3 });
  check("(d) 포인트 합계", ok.spent["깨달음"] === 24 + 24 + 24, JSON.stringify(ok.spent));
  check("(d) 관문 통과", ok.problems.length === 0, ok.problems.join(" / "));

  const noPre = checkAwakening(SUMMONER, { "정신 집중": 3 });
  check("(d) 선행을 잡는다", noPre.problems.some(p => p.includes("상급 소환사")), noPre.problems.join(" / "));
  check("(d) 티어 관문도 잡는다", noPre.problems.some(p => p.includes("1티어")), noPre.problems.join(" / "));

  const both = checkAwakening(SUMMONER, { "상급 소환사": 1, "넘치는 교감": 3 });
  check("(d) 배타를 잡는다", both.problems.some(p => p.includes("동시 선택 불가")), both.problems.join(" / "));

  const leap = checkAwakening(SUMMONER, { "개화": 3, "마리포사의 축복": 3 });
  check("(d) 도약 배타", leap.problems.some(p => p.includes("동시 선택 불가")), leap.problems.join(" / "));

  // 깨달음을 전부 찍으면 232P다. 예산 100을 넘는다.
  const everything = Object.fromEntries(
    getAwakeningNodes(SUMMONER).filter(n => n.group === "깨달음").map(n => [n.id, n.maxLevel]),
  );
  const over = checkAwakening(SUMMONER, everything);
  check("(d) 예산 초과", over.problems.some(p => p.includes("232 / 100")), over.problems.join(" / "));
}

// --- (d2) 얼마까지 올릴 수 있나 -------------------------------------------------
//
// 화면이 클릭을 막으려면 판정이 아니라 상한과 이유가 있어야 한다.
{
  const none = {};
  check("(d2) 1티어는 바로 열려 있다", awakeningHeadroom(SUMMONER, none, "상급 소환사").max === 1);
  const closed = awakeningHeadroom(SUMMONER, none, "정신 집중");
  check("(d2) 선행이 없으면 0", closed.max === 0 && closed.why === "requires" && closed.reason.includes("상급 소환사"), JSON.stringify(closed));

  const master = { "상급 소환사": 1 };
  check("(d2) 선행을 채우면 열린다", awakeningHeadroom(SUMMONER, master, "정신 집중").max === 3);

  // 배타 형제를 찍었으면 닫힌다.
  const blocked = awakeningHeadroom(SUMMONER, master, "넘치는 교감");
  check("(d2) 배타면 0 · 이유를 갈라 준다", blocked.max === 0 && blocked.why === "rival" && blocked.rival === "상급 소환사", JSON.stringify(blocked));

  // 관문만 안 찼을 때. 3티어 자유 노드는 2티어에 24P가 필요하다.
  const gateOnly = awakeningHeadroom(SUMMONER, master, "교감 강화");
  check("(d2) 관문이 모자라면 0", gateOnly.max === 0 && gateOnly.why === "gate" && gateOnly.reason.includes("24P"), JSON.stringify(gateOnly));
  const gateMet = awakeningHeadroom(SUMMONER, { ...master, "정신 집중": 3 }, "교감 강화");
  check("(d2) 관문을 채우면 열린다", gateMet.max === 5, JSON.stringify(gateMet));

  // 내리면 딸린 것이 무너진다 — 막지는 않고 알려만 준다.
  const chain = { "상급 소환사": 1, "정신 집중": 3, "고대의 힘": 3 };
  check("(d2) 딸린 노드를 알려 준다",
    awakeningDependents(SUMMONER, chain, "정신 집중", 2).join() === "고대의 힘",
    JSON.stringify(awakeningDependents(SUMMONER, chain, "정신 집중", 2)));
  check("(d2) 안 무너지면 조용하다", awakeningDependents(SUMMONER, chain, "정신 집중", 3).length === 0);

  // 한 겹이 아니라 끝까지. 정신 집중을 내리면 고대의 힘이 죽고, 그러면
  // 고대의 축복도 선행을 잃는다 — 한 겹만 보면 있을 수 없는 배분이 남는다.
  const deep = { ...chain, "고대의 축복": 3 };
  const fell = awakeningDependents(SUMMONER, deep, "정신 집중", 2);
  check("(d2) 연쇄를 끝까지 따라간다",
    fell.length === 2 && fell.includes("고대의 힘") && fell.includes("고대의 축복"), JSON.stringify(fell));
  // 0으로 내리면 그 갈래가 통째로 무너진다.
  const all = awakeningDependents(SUMMONER, deep, "상급 소환사", 0);
  check("(d2) 뿌리를 뽑으면 갈래가 통째로",
    all.length === 3 && all.includes("정신 집중") && all.includes("고대의 축복"), JSON.stringify(all));
}

// --- (e) 계기판이 같은 수를 말한다 ----------------------------------------------
{
  const source = state({
    awakening: { job: SUMMONER, nodeLevels: { "고대의 바람": 3, "고대의 힘": 3, "정신 집중": 3 } },
    nodeLevels: { "e1-crit": 10, "e1-spec": 30 },
    engravings: { grudge: "legendary4" },
  });
  const report = explainMetrics(source);
  const product = report.damage.reduce((acc, group) => acc * group.multiplier, 1);
  check("(e) 그룹 배수의 곱 == damageMultiplier", close(product, report.metrics.damageMultiplier, 1e-9));

  const residual = report.damage.filter(group => Math.abs(group.residual) > 1e-9);
  check("(e) 설명 못 한 몫 없음", residual.length === 0, residual.map(g => `${g.key} ${g.residual}`).join(", "));

  check("(e) 계기판에 출처가 뜬다", JSON.stringify(report).includes("고대의 바람"));
}

// --- (e2) 탐색 평가기가 깨달음 식을 본다 -----------------------------------------
//
// 탐색은 빠른 경로로 점수를 매긴다. 그 경로가 applyAwakeningEffects에
// conversions를 안 넘기면 기민함 같은 식이 통째로 빠진다 — 계산기 본체는
// 세고 탐색만 못 세니, 탐색이 고른 1등이 손으로 찍은 것보다 약해진다.
// 실제로 기상술사에서 최대 23% 어긋났다.
{
  // 기민함이 공속 → 치피, 이속 → 치적으로 바꾼다. 속도가 있어야 식이 산다.
  const 기상술사 = { job: 603, nodeLevels: { "질풍노도": 1, "기민함": 3 } };
  const base = state({ awakening: 기상술사, nodeLevels: { "e1-swift": 30 } });
  // 각인은 "지금 낀 대로"로 못 박는다. 각인 탐색이 켜지면 빠른 경로가 낀 각인을
  // 기본값으로도 안 얹어서, 비교가 각인 차이에 묻힌다.
  const plan = buildSearchPlan(base, { ...SEARCH_DEFAULTS, tier1Mode: "step10", petRoles: { none: "locked" }, engravingSlots: "fixed" });
  const evaluate = buildEvaluator(base, new Set(plan.engravings.controlledIds));

  const zero = Object.fromEntries(Object.keys(base.nodeLevels).map(id => [id, 0]));
  const picks = new Array(plan.dimensions.length).fill(0);
  let worst = 0;
  let checked = 0;
  let bestFast = null;
  let bestTrue = null;

  // 차원마다 앞의 몇 개만 훑는다. 전수는 6만 개라 검사에 넣기엔 무겁다.
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
      if (!bestFast || fast.dpsIndex > bestFast.fast) bestFast = { fast: fast.dpsIndex, slow: slow.dpsIndex };
      if (!bestTrue || slow.dpsIndex > bestTrue.slow) bestTrue = { fast: fast.dpsIndex, slow: slow.dpsIndex };
      return;
    }
    const options = plan.dimensions[index].options;
    for (let i = 0; i < Math.min(options.length, 4); i += 1) { picks[index] = i; walk(index + 1); }
  };
  walk(0);

  check("(e2) 식이 있는 조합을 훑었다", checked >= 100, String(checked));
  check("(e2) 평가기 == 본체", worst < 1e-9, worst.toExponential(3));
  check("(e2) 평가기의 1등이 진짜 1등", close(bestFast.slow, bestTrue.slow, 1e-9),
    `${bestFast.slow} vs ${bestTrue.slow}`);
  // 식이 정말 실렸는지 — 안 실렸으면 위 검사가 통과해도 의미가 없다.
  const withFormula = calculateMetrics(base).formulaResults.filter(item => item.id.startsWith("awakening:"));
  check("(e2) 깨달음 식이 실제로 있다", withFormula.length === 2, JSON.stringify(withFormula.map(f => f.label)));
}

// --- (f) API에서 읽기 ----------------------------------------------------------
{
  check("(f) 직업 코드", jobCode("서머너") === 203 && jobCode("블레이드") === 402 && jobCode("없는직업") === 0);

  const payload = {
    ArkPassive: {
      IsArkPassive: true,
      Effects: [
        { Name: "진화", Description: "진화 1티어 치명 Lv.10" },
        { Name: "깨달음", Description: "깨달음 3티어 고대의 힘 Lv.3" },
        { Name: "깨달음", Description: "깨달음 3티어 고대의 바람 Lv.1" },
        // '교감 강화'와 '정령의 교감' — 짧은 이름이 긴 것 안에 들어 있지 않은지.
        { Name: "깨달음", Description: "깨달음 3티어 정령의 교감 Lv.3" },
        { Name: "도약", Description: "도약 2티어 마리포사의 축복 Lv.3" },
        { Name: "깨달음", Description: "깨달음 9티어 있을 리 없는 노드 Lv.1" },
      ],
    },
  };
  const read = parseAwakening(payload, "서머너");
  check("(f) 직업", read.job === 203);
  check("(f) 고대의 힘 3", read.nodeLevels["고대의 힘"] === 3, JSON.stringify(read.nodeLevels));
  check("(f) 고대의 바람 1", read.nodeLevels["고대의 바람"] === 1);
  check("(f) 정령의 교감 3", read.nodeLevels["정령의 교감"] === 3, JSON.stringify(read.nodeLevels));
  check("(f) 교감 강화는 안 찍힘", !("교감 강화" in read.nodeLevels), JSON.stringify(read.nodeLevels));
  check("(f) 도약도 읽는다", read.nodeLevels["마리포사의 축복"] === 3);
  check("(f) 진화는 안 건드린다", !Object.keys(read.nodeLevels).some(id => id.startsWith("e1-")));
  check("(f) 모르는 노드를 알린다", read.notes.some(n => n.includes("있을 리 없는")), read.notes.join(" / "));

  // 30직업 전부 표가 있으므로 '아직 반영 안 함' 안내는 이제 안 뜬다.
  const blade = parseAwakening(payload, "블레이드");
  check("(f) 다른 직업도 읽는다", blade.job === 402);
  check("(f) 미반영 안내가 안 뜬다",
    !blade.notes.some(n => n.includes("아직 딜에 반영하지 않는")), blade.notes.join(" / "));

  // 서머너 노드 이름을 블레이드로 보냈으니 하나도 안 맞아야 한다.
  check("(f) 남의 직업 노드는 안 맞춘다", Object.keys(blade.nodeLevels).length === 0,
    JSON.stringify(blade.nodeLevels));

  // 제 직업 노드는 들여온다.
  const bladeNode = getAwakeningNodes(402).find(item => item.group === "깨달음" && item.tier === 1);
  const bladeRead = parseAwakening({
    ArkPassive: { Effects: [{ Name: "깨달음", Description: `깨달음 1티어 ${bladeNode.name} Lv.1` }] },
  }, "블레이드");
  check("(f) 제 직업 배분은 읽는다", bladeRead.nodeLevels[bladeNode.name] === 1,
    JSON.stringify(bladeRead.nodeLevels));
}

console.log(failures === 0 ? "awakening: all checks passed" : `awakening: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
