// 노드 고정.
//
// 화면에서는 개념이 하나다 — "이 레벨로 못 박는다". 레벨이 0이면 그게 제외다.
// 안에서는 0을 excludedNodes로, 1 이상을 lockedNodes로 나눠 든다.
//
// 여기서 지키려는 것: 고정한 노드는 **모든** 후보에서 그 레벨이어야 한다.
// 조합을 다 만든 뒤 거르는 방식이면 고정한 노드가 후보 풀에서 빠졌을 때
// (효율 0이라 무의미 판정을 받는 등) 그 레벨을 가진 조합이 아예 안 만들어져
// 필터가 통째로 헛돈다. 특화 30 고정이 실제로 그렇게 새어 나갔다.
import { DEFAULT_STATE, mergeState } from "../src/lib/core/metrics.js";
import { SEARCH_DEFAULTS, buildSearchPlan, getLockedNodeLevels, runSearch } from "../src/lib/core/runner.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
  return ok;
};

const state = patch => mergeState(DEFAULT_STATE, patch);
const options = patch => ({ ...SEARCH_DEFAULTS, ...patch });

// --- (a) 목록 정규화 -----------------------------------------------------------
{
  const got = getLockedNodeLevels({ lockedNodes: { "e1-crit": 6, "없는노드": 3, "e1-spec": 999, "e2-limit-break": 0 } });
  check("(a) 있는 노드만", !got.has("없는노드"), [...got.keys()].join(","));
  check("(a) 최대 레벨로 자른다", got.get("e1-spec") === 30, String(got.get("e1-spec")));
  // 0은 제외의 몫이다. 여기서는 안 든다.
  check("(a) 0은 안 든다", !got.has("e2-limit-break"));
  check("(a) 그대로", got.get("e1-crit") === 6);
  check("(a) 없으면 빈 목록", getLockedNodeLevels({}).size === 0 && getLockedNodeLevels(null).size === 0);
}

// --- (b) 조합이 전부 고정을 지킨다 ---------------------------------------------
{
  const plan = buildSearchPlan(state({}), options({
    tier1Mode: "step10",
    lockedNodes: { "e1-crit": 6, "e2-limit-break": 2 },
  }));
  const tier = key => plan.dimensions.find(d => d.key === key);

  const t1 = tier("tier1").options;
  const at = (combo, id) => (combo.levels.find(entry => entry[0] === id) ?? [, 0])[1];
  check("(b) 1T 전부 치명 6", t1.length > 0 && t1.every(c => at(c, "e1-crit") === 6), String(t1.length));

  const t2 = tier("진화 2").options;
  check("(b) 2T 전부 한계 돌파 2", t2.length > 0 && t2.every(c => at(c, "e2-limit-break") === 2), String(t2.length));

  // 고정이 포인트를 먼저 먹으므로 남는 조합이 줄어야 한다.
  const free = buildSearchPlan(state({}), options({ tier1Mode: "step10" }));
  check("(b) 고정하면 조합이 준다",
    t2.length < free.dimensions.find(d => d.key === "진화 2").options.length,
    `${t2.length} vs ${free.dimensions.find(d => d.key === "진화 2").options.length}`);

  // 포인트 회계가 맞아야 한다 — 고정 몫이 combo.points에 들어가 있어야 한다.
  const bad = t2.filter(c => c.points !== c.levels.reduce((sum, [, lv]) => sum + lv * 10, 0));
  check("(b) 포인트 회계", bad.length === 0, JSON.stringify(bad[0] ?? null));
}

// --- (c) 특화 효율이 0이어도 샌 적 없다 ----------------------------------------
//
// 예전 버그: 특화 효율 0 → 특화가 '무의미' 판정 → 후보 풀에서 빠짐 → 특화 30인
// 조합이 아예 안 만들어짐 → 고정이 조용히 무시됨.
{
  for (const per100 of [0, 3.5]) {
    const plan = buildSearchPlan(
      state({ base: { specDamagePer100: per100 } }),
      options({ tier1Mode: "step10", lockedNodes: { "e1-spec": 30 } }),
    );
    const t1 = plan.dimensions.find(d => d.key === "tier1").options;
    const ok = t1.length > 0 && t1.every(c => (c.levels.find(e => e[0] === "e1-spec") ?? [, 0])[1] === 30);
    check(`(c) 특화 효율 ${per100} → 전부 특화 30`, ok, `${t1.length}가지`);
  }
}

// --- (d) 옛 체크박스는 프리셋으로 남는다 ---------------------------------------
{
  const plan = buildSearchPlan(state({}), options({ tier1Mode: "step10", tier1SpecLock: true }));
  const t1 = plan.dimensions.find(d => d.key === "tier1").options;
  check("(d) tier1SpecLock == 특화 30 고정",
    t1.every(c => (c.levels.find(e => e[0] === "e1-spec") ?? [, 0])[1] === 30), String(t1.length));

  // 특화를 뺐으면 고정이 안 걸려야 한다 — 뺀 것과 고정한 것이 부딪히면 뺀 쪽이 이긴다.
  const excluded = buildSearchPlan(state({}), options({
    tier1Mode: "step10", tier1SpecLock: true, excludedNodes: ["e1-spec"],
  }));
  const t1x = excluded.dimensions.find(d => d.key === "tier1").options;
  check("(d) 뺀 노드는 고정 안 됨",
    t1x.every(c => (c.levels.find(e => e[0] === "e1-spec") ?? [, 0])[1] === 0), String(t1x.length));
}

// --- (e) 실제 탐색 결과 --------------------------------------------------------
{
  const result = await runSearch(
    state({ base: { specDamagePer100: 3 }, nodeLevels: { "e1-crit": 6 } }),
    options({
      tier1Mode: "step1", petRoles: { none: "locked" }, engravingSlots: "0",
      lockedNodes: { "e1-crit": 6, "e2-limit-break": 2 },
      excludedNodes: ["e3-single-strike"],
    }),
  );
  const all = [...result.pareto, ...result.damage, ...result.dps];
  check("(e) 후보가 있다", all.length > 0, String(all.length));

  const broke = all.filter(entry => (
    (entry.nodeLevels["e1-crit"] ?? 0) !== 6
    || (entry.nodeLevels["e2-limit-break"] ?? 0) !== 2
    || (entry.nodeLevels["e3-single-strike"] ?? 0) !== 0
  ));
  check("(e) 모든 후보가 고정을 지킨다", broke.length === 0, `${broke.length}개 어김`);

  // 대조군 — 안 고정한 노드는 실제로 갈려야 한다. 안 갈리면 이 검사가 무의미하다.
  const spec = new Set(all.map(entry => entry.nodeLevels["e1-spec"] ?? 0));
  check("(e) 자유 노드는 갈린다", spec.size > 3, `${spec.size}가지`);
}

console.log(failures === 0 ? "nodelock: all checks passed" : `nodelock: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
