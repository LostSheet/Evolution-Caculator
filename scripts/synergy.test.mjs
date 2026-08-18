// 파티 시너지 — 한 줄이 한 사람, 한 칸이 한 버프.
//
// 가동율이 버프에 붙는다는 것이 이 모듈의 핵심이다. 합친 뒤 한 번 곱하면
// 없는 딜이 생긴다 — 치피증 8%짜리 둘 중 하나만 반쯤 들어오는 판에서
// 16%×50%(=8%)와 8%+4%(=12%)는 다른 값이다.
//
// 한 사람 안에서도 버프마다 다르다. 파티의 기상술사는 치명타 적중률을 늘
// 주지만 질풍노도의 공이속은 껐다 켜서 잠깐만 준다.
//
// 딜 시너지 개수는 세기만 하고 막지 않는다. 3딜 1폿이 기본이지만 서폿도 딜
// 시너지를 주므로 넷이 되는 편성이 있고, 서폿 없이 가는 판도 있다.
import {
  SYNERGY_TYPES, SYNERGY_JOBS, SYNERGY_SLOTS, SYNERGY_UPTIME_FULL,
  getSynergyJob, synergyAmount, findSynergyChoice, synergyRowParts,
  defaultSynergyNodes, ownSynergyRow, normalizeSynergyRows, synergyRowUptime,
  defaultChoiceUptime, synergyChoiceNote, findSynergyChoice as choiceOf, synergyBonuses,
} from "../src/lib/core/synergy.js";
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import { buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";
import { explainMetrics } from "../src/lib/core/explain.js";
import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const want = (label, got, expected, tol = 1e-9) => {
  if (near(got, expected, tol)) console.log(`  ${label} = ${got}`);
  else fail(`${label}: ${got} != ${expected}`);
};
// 이름을 비교하는 검사. 숫자 비교에 문자열을 넣으면 NaN이라 늘 통과한다.
const wantText = (label, got, expected) => {
  if (got === expected) console.log(`  ${label} = ${got}`);
  else fail(`${label}: "${got}" != "${expected}"`);
};

const state = patch => mergeState(DEFAULT_STATE, patch);
const row = (job, nodes = [], uptime = {}) => ({ id: `r${job}`, job, nodes, uptime });

// (a) 표가 직업을 빠짐없이 덮는다.
//
// 시너지를 아예 안 주는 직업이 있다 — 차원술사가 그렇다. 그래서 30을 세는
// 대신 트리와 대조해서, 빠진 것이 그것뿐인지 확인한다.
{
  const NO_SYNERGY = ["차원술사"];
  const have = new Set(SYNERGY_JOBS.map(entry => entry.job));
  const missingJobs = Object.entries(ARKPASSIVE_TREE)
    .filter(([job]) => !have.has(Number(job)))
    .map(([, entry]) => entry.name);
  wantText("(a) 시너지가 없는 직업", missingJobs.join(","), NO_SYNERGY.join(","));
  // 이름도 트리와 같아야 한다. 손으로 적으면 개편 때 조용히 어긋난다.
  const wrongName = SYNERGY_JOBS.filter(entry => ARKPASSIVE_TREE[entry.job]?.name !== entry.name);
  if (wrongName.length > 0) fail(`(a) 이름이 트리와 다르다: ${wrongName.map(e => e.name)}`);
  // 갈래 이름도 실제 노드여야 한다.
  const wrongNode = SYNERGY_JOBS.flatMap(entry => (entry.groups ?? []).flatMap(group => group.choices
    .filter(choice => !["깨달음", "도약"].some(branch =>
      ARKPASSIVE_TREE[entry.job][branch].nodes.some(node => node.name === choice.node)))
    .map(choice => `${entry.name}/${choice.node}`)));
  if (wrongNode.length > 0) fail(`(a) 없는 노드를 가리킨다: ${wrongNode}`);
  const dup = SYNERGY_JOBS.map(entry => entry.job).filter((job, i, all) => all.indexOf(job) !== i);
  if (dup.length > 0) fail(`(a) 직업이 겹친다: ${dup}`);
  const empty = SYNERGY_JOBS.filter(entry => (entry.base ?? []).length === 0 && (entry.groups ?? []).length === 0);
  if (empty.length > 0) fail(`(a) 아무것도 안 주는 직업: ${empty.map(e => e.name)}`);
  const badKey = SYNERGY_JOBS.flatMap(entry => [
    ...(entry.base ?? []),
    ...(entry.groups ?? []).flatMap(g => g.choices.flatMap(c => c.types)),
  ]).filter(key => !SYNERGY_TYPES[key]);
  if (badKey.length > 0) fail(`(a) 없는 종류: ${badKey}`);
  // 속도는 표에 값이 없다 — 갈래가 들고 와야 한다.
  const missing = SYNERGY_JOBS.flatMap(entry => (entry.groups ?? []).flatMap(g => g.choices))
    .filter(choice => choice.types.some(key => SYNERGY_TYPES[key].perSource && !choice.amounts?.[key]));
  if (missing.length > 0) fail(`(a) 속도 수치가 빈 갈래: ${missing.map(c => c.node)}`);
}

// (b) 딜 시너지는 직업이 정한다 — 갈래를 안 골라도 붙는다.
{
  // 호크아이는 두 갈래 다 피해 증가를 준다. 그래서 base다.
  want("(b) 호크아이 기본", synergyRowParts(502, []).length, 1);
  want("(b) 호크아이 피증", synergyBonuses(null, { rows: [row(502)] }, {}).damageGroups["시너지 피해 증가"], 6);
  // 이동속도만 두 번째 동료의 몫이다.
  const 두동 = synergyBonuses(null, { rows: [row(502, ["두 번째 동료"])] }, {});
  want("(b) 두 번째 동료 이속", 두동.percentBonuses.moveSpeedOnly, 8);
  want("(b) 두동이어도 피증은 그대로", 두동.damageGroups["시너지 피해 증가"], 6);

  // 기상술사도 마찬가지 — 치적은 늘, 공이속은 질풍노도만.
  // 파티 줄에는 기본 가동율이 붙으므로 상시(100%)를 못 박아 두고 본다.
  want("(b) 기상술사 치적", synergyBonuses(null, { rows: [row(603)] }, {}).percentBonuses.critRate, 10);
  const 질풍 = synergyBonuses(null, { rows: [row(603, ["질풍노도"], { "질풍노도": 100 })] }, {});
  want("(b) 질풍노도 공속", 질풍.percentBonuses.attackSpeedOnly, 12);
  want("(b) 질풍노도 이속", 질풍.percentBonuses.moveSpeedOnly, 12);
}

// (c) 갈래마다 딜 시너지가 다른 직업은 골라야 한다. 흔한 쪽이 미리 켜진다.
{
  wantText("(c) 워로드 기본 갈래", defaultSynergyNodes(104).join(","), "전투 태세");
  const 전투 = synergyBonuses(null, { rows: [row(104, ["전투 태세"])] }, {});
  want("(c) 전투 태세 방깎", 전투.damageGroups["시너지 방어력 감소"], 12);
  want("(c) 전투 태세 백헤드", 전투.damageGroups["시너지 피해 증가"], 4);
  const 고독 = synergyBonuses(null, { rows: [row(104, ["고독한 기사"])] }, {});
  want("(c) 고독한 기사는 방깎 없음", 고독.damageGroups["시너지 방어력 감소"] ?? 0, 0);
  want("(c) 고독한 기사 백헤드", 고독.damageGroups["시너지 피해 증가"], 4);

  // 같은 묶음은 하나만 센다 — 게임에서 서로 배타다.
  const 둘다 = synergyBonuses(null, { rows: [row(104, ["전투 태세", "고독한 기사"])] }, {});
  want("(c) 둘 다 적어도 하나만", 둘다.damageGroups["시너지 피해 증가"], 4);

  // 도화가는 깨달음과 도약이 따로라 같이 붙는다.
  const 도화 = synergyBonuses(null, { rows: [row(602, ["회귀", "승천"])] }, {});
  want("(c) 회귀 방깎", 도화.damageGroups["시너지 방어력 감소"], 12);
  want("(c) 승천 공속", 도화.percentBonuses.attackSpeedOnly, 6);
  want("(c) 승천 이속", 도화.percentBonuses.moveSpeedOnly, 12);
}

// (d) 가동율은 버프마다 붙는다. 합친 뒤 곱하는 것과 값이 다르다.
{
  // 창술사(내 줄, 상시) + 홀나(80%) = 8 + 6.4 = 14.4. 합친 뒤 곱하면 12.8이다.
  const out = synergyBonuses(
    { job: 305, nodeLevels: {} },
    { rows: [row(105, [], { "": 80 })], ownUptime: {} },
    {},
  );
  want("(d) 치피증 8 + 8×80%", out.critOnly, 14.4, 1e-9);
  if (near(out.critOnly, 16 * 0.8)) fail("(d) 합친 뒤 가동율을 곱하고 있다");

  // 한 줄 안에서도 버프마다 다르다 — 파티 기상술사의 치적은 상시, 공이속은 20%.
  const 기상 = synergyBonuses(null,
    { rows: [row(603, ["질풍노도"], { "": 100, "질풍노도": 20 })] }, {});
  want("(d) 치적은 그대로", 기상.percentBonuses.critRate, 10);
  want("(d) 공속 12×20%", 기상.percentBonuses.attackSpeedOnly, 2.4, 1e-9);
  want("(d) 이속 12×20%", 기상.percentBonuses.moveSpeedOnly, 2.4, 1e-9);
  // 같은 버프의 두 종류는 같은 가동율을 쓴다 — 질풍노도는 버프 하나다.
  want("(d) 버프 수", 기상.rows[0].buffs.length, 2);
  want("(d) 질풍노도 가동율", 기상.rows[0].buffs[1].uptime, 20);

  // 내 줄도 버프마다 먹는다.
  const 내줄 = synergyBonuses(
    { job: 603, nodeLevels: { "질풍노도": 1 } },
    { rows: [], ownUptime: { "질풍노도": 50 } },
    {},
  );
  want("(d) 내 줄 치적", 내줄.percentBonuses.critRate, 10);
  want("(d) 내 줄 공속 50%", 내줄.percentBonuses.attackSpeedOnly, 6);

  // 0%면 아예 안 붙고, 안 적으면 상시다.
  want("(d) 0%", synergyBonuses(null, { rows: [row(103, [], { "": 0 })] }, {}).lines.length, 0);
  want("(d) 안 적으면 상시", synergyRowUptime({ uptime: {} }, ""), 100);
  want("(d) 100%", synergyBonuses(null, { rows: [row(103)] }, {}).damageGroups["시너지 방어력 감소"], 12);

  // 범위를 벗어난 값은 잘린다. 숫자 하나짜리 옛 저장본은 직업 몫으로 읽는다.
  want("(d) 200%는 100%로", normalizeSynergyRows([{ job: 103, uptime: { "": 200 } }])[0].uptime[""], 100);
  want("(d) 음수는 0으로", normalizeSynergyRows([{ job: 103, uptime: { "": -5 } }])[0].uptime[""], 0);
  want("(d) 옛 숫자 하나", normalizeSynergyRows([{ job: 103, uptime: 60 }])[0].uptime[""], 60);
}

// (d4) 나에게 걸리는 것과 남에게 주는 것이 다른 버프.
//
// 질풍노도는 자신에게 30초 자버프라 사실상 상시지만, 남에게는 여우비를 켜 둔
// 동안만 깔린다. 한 숫자로 묶으면 내가 기상술사일 때 남에게 주는 유효율이
// 내 딜을 깎는다.
{
  const 내줄 = synergyBonuses({ job: 603, nodeLevels: { "질풍노도": 1 } }, { rows: [] }, {});
  want("(d4) 내 줄은 상시", 내줄.percentBonuses.attackSpeedOnly, 12);

  const 파티 = synergyBonuses(null, { rows: [row(603, ["질풍노도"])] }, {});
  const preset = defaultChoiceUptime(603, "질풍노도", false);
  want("(d4) 파티 줄 기본 가동율", preset, 30);
  want("(d4) 파티 줄 공속", 파티.percentBonuses.attackSpeedOnly, 12 * preset / 100, 1e-9);

  // 적어 넣으면 기본값을 덮는다.
  const 적음 = synergyBonuses(null, { rows: [row(603, ["질풍노도"], { "질풍노도": 60 })] }, {});
  want("(d4) 적으면 그 값", 적음.percentBonuses.attackSpeedOnly, 7.2, 1e-9);

  // 기본 가동율이 나와 남으로 갈린다. 설명 문장은 화면에서 뺐고, 갈리는
  // 사실은 이 두 숫자가 들고 있다.
  want("(d4) 내 줄 기본 가동율", defaultChoiceUptime(603, "질풍노도", true), 100);
  if (defaultChoiceUptime(603, "질풍노도", true) === defaultChoiceUptime(603, "질풍노도", false)) {
    fail("(d4) 내 줄과 파티 줄 기본 가동율이 같다");
  }
  // 안 적은 갈래는 양쪽 다 상시다.
  want("(d4) 안 적은 갈래는 상시", defaultChoiceUptime(602, "회귀", false), 100);
}

// (e) 같은 종류는 더한다. 방깎 둘이면 24%.
{
  const out = synergyBonuses(null, { rows: [row(203), row(103)] }, {});
  want("(e) 방깎 합", out.damageGroups["시너지 방어력 감소"], 24);
  // 배수까지 확인 — 1.24여야 한다.
  const off = calculateMetrics(state({ synergy: { rows: [row(203)] } }));
  const on = calculateMetrics(state({ synergy: { rows: [row(203), row(103)] } }));
  want("(e) 배수 비", on.dpsIndex / off.dpsIndex, 1.24 / 1.12, 1e-9);
}

// (f) 백헤드는 방향을 켜야 9%가 된다.
{
  const 피증 = settings => synergyBonuses(null, { rows: [row(402)] }, settings).damageGroups["시너지 피해 증가"];
  want("(f) 정면", 피증({}), 4);
  want("(f) 백어택", 피증({ backAttack: true }), 9);
  want("(f) 헤드어택", 피증({ headAttack: true }), 9);
}

// (g) 딜 시너지 개수는 세기만 하고 막지 않는다.
{
  const 넷 = synergyBonuses(
    { job: 305, nodeLevels: {} },
    { rows: [row(103), row(203), row(302)] },
    {},
  );
  want("(g) 딜 시너지 수", 넷.combatCount, 4);
  if (!넷.over) fail("(g) 셋을 넘겼는데 표시가 없다");
  want("(g) 넷째도 실제로 붙는다", 넷.percentBonuses.critRate, 10);

  // 속도만 주는 줄은 딜 시너지로 안 센다.
  const 세레나데 = synergyBonuses(null, { rows: [row(204, ["증폭의 세레나데"])] }, {});
  want("(g) 공속만 주는 줄", 세레나데.combatCount, 0);
  want("(g) 그래도 공속은 붙는다", 세레나데.percentBonuses.attackSpeedOnly, 4.5);
  want("(g) 관례는 셋", SYNERGY_SLOTS, 3);
}

// (h) 내 줄은 실제로 찍은 갈래를 읽어 온다.
{
  const 전투 = ownSynergyRow({ job: 104, nodeLevels: { "전투 태세": 3 } }, null);
  wantText("(h) 전투 태세를 읽는다", 전투.nodes.join(","), "전투 태세");
  const 고독 = ownSynergyRow({ job: 104, nodeLevels: { "고독한 기사": 3 } }, null);
  wantText("(h) 고독한 기사를 읽는다", 고독.nodes.join(","), "고독한 기사");
  const 안찍음 = ownSynergyRow({ job: 104, nodeLevels: {} }, null);
  want("(h) 안 찍었으면 빈 채로", 안찍음.nodes.length, 0);
  if (ownSynergyRow({ job: 0, nodeLevels: {} }, null) !== null) fail("(h) 직업 0인데 줄이 생긴다");
  if (!findSynergyChoice(getSynergyJob(104), "전투 태세")) fail("(h) 갈래를 못 찾는다");
  if (findSynergyChoice(getSynergyJob(104), "없는 노드")) fail("(h) 없는 갈래를 찾는다");
}

// (i) 저장본을 믿지 않는다.
{
  const rows = normalizeSynergyRows([
    { job: 999, nodes: [], uptime: 100 },
    { job: 104, nodes: ["없는 노드", "전투 태세"], uptime: 100 },
    null,
  ]);
  want("(i) 남은 줄", rows.length, 1);
  wantText("(i) 없는 갈래는 버린다", rows[0].nodes.join(","), "전투 태세");

  // 옛 저장본(종류별 칩)이 줄로 옮겨진다.
  const moved = mergeState(DEFAULT_STATE, { synergy: { picks: ["602:회귀", "602:승천", "103"] } }).synergy;
  want("(i) 옛 저장본 → 줄 수", moved.rows.length, 2);
  wantText("(i) 도화가 갈래 둘", moved.rows[0].nodes.join(","), "회귀,승천");
}

// (j) 탐색 평가기가 본체와 같은 값을 낸다.
//
// 시너지는 탐색 밖이지만 치명타 시 피해 증가만은 회심과 곱해진다 — 회심은
// 탐색이 찍는 노드다. 평가기가 시너지를 빼먹으면 곱이 안 일어나 순위가 바뀐다.
{
  const base = state({
    awakening: { job: 305, nodeLevels: {} },
    synergy: { rows: [row(105, [], { "": 80 }), row(103)], ownUptime: {} },
  });
  const plan = buildSearchPlan(base, { tier1Mode: "fixed", petRoles: { none: "locked" }, engravingSlots: "0" });
  const evaluate = buildEvaluator(base, new Set(plan.engravings.controlledIds));

  let worst = 0;
  let checked = 0;
  for (const dimension of plan.dimensions) {
    for (const option of dimension.options.slice(0, 4)) {
      if (option.kind !== "nodes") continue;
      const picks = plan.dimensions.map(d => (d === dimension ? option : d.options[0]));
      const fast = evaluate(picks);
      // 고른 갈래만이 아니라 **모든** 갈래를 되돌려 놓는다. 다른 갈래의
      // 첫 선택지가 늘 '아무것도 안 찍음'이라는 보장이 없다 — 예산을 꽉 채우는
      // 모드에서는 첫 선택지도 포인트를 쓴다.
      const levels = { ...base.nodeLevels };
      let petStat = base.convenience.petStat ?? "none";
      let food = base.convenience.food ?? "none";
      picks.forEach(pick => {
        if (pick.kind === "pet") { petStat = pick.pet; return; }
        if (pick.kind === "food") { food = pick.food; return; }
        if (pick.kind !== "nodes") return;
        pick.levels.forEach(([id, level]) => { levels[id] = level; });
      });
      const slow = calculateMetrics({ ...base, nodeLevels: levels, convenience: { ...base.convenience, petStat, food } });
      checked += 1;
      worst = Math.max(
        worst,
        Math.abs(fast.critOnlyDamage - slow.critOnlyDamage),
        Math.abs(fast.dpsIndex - slow.dpsIndex) / Math.max(1, Math.abs(slow.dpsIndex)),
      );
    }
  }
  if (checked === 0) fail("(j) 검사할 조합이 없다");
  want(`(j) 평가기 == 본체 (${checked}개 조합)`, worst, 0, 1e-9);
}

// (k) 계기판이 줄마다 출처로 적는다 — 설명 못 한 몫이 남으면 안 된다.
{
  const report = explainMetrics(state({
    awakening: { job: 305, nodeLevels: {} },
    synergy: { rows: [row(105, [], { "": 80 }), row(602, ["회귀", "승천"])], ownUptime: {} },
  }));
  const residual = report.damage.filter(group => Math.abs(group.residual) > 1e-9);
  if (residual.length > 0) fail(`(k) 설명 못 한 몫: ${residual.map(g => `${g.key} ${g.residual}`).join(", ")}`);
  want("(k) 치명타 시 피해 합", report.crit.critOnly, 14.4, 1e-9);
  const 방깎 = report.damage.find(group => group.key === "시너지 방어력 감소");
  if (방깎?.sources[0]?.label !== "시너지 · 도화가") fail(`(k) 방깎 출처: ${JSON.stringify(방깎?.sources)}`);
  else console.log(`  (k) 계기판 출처 ${방깎.sources.map(s => s.label).join(", ")}`);
}

// (l) 아무도 없으면 아무 일도 안 일어난다.
{
  const out = synergyBonuses({ job: 0, nodeLevels: {} }, { rows: [] }, {});
  want("(l) 줄 수", out.rows.length, 0);
  want("(l) 종류 수", out.lines.length, 0);
  want("(l) 딜 시너지 수", out.combatCount, 0);
  want("(l) 치명타 시 피해", out.critOnly, 0);
  want("(l) 상한 표시", out.over ? 1 : 0, 0);
  want("(l) 가동율 기본", SYNERGY_UPTIME_FULL, 100);
  want("(l) 값 없는 갈래", synergyAmount(null, "moveSpeed"), 0);
}

console.log(failures === 0 ? "synergy: all checks passed" : `synergy: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
