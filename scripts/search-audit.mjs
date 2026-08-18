// 탐색이 고른 것이 정말 최고인가.
//
//   node scripts/search-audit.mjs 캐릭터이름
//
// 탐색은 빠른 경로(buildEvaluator)로 점수를 매긴다. 그 경로가 본체
// (calculateMetrics)와 어긋나면 탐색은 "실제로는 없는 최고"를 고른다. 화면에
// 뜬 값은 본체로 다시 잰 값이라, 손으로 찍은 게 더 세 보이는 일이 생긴다.
//
// 그래서 여기서는 두 가지를 본다.
//
//   1. 후보 하나하나에 대해 빠른 경로와 본체가 같은 값을 내는가
//   2. 빠른 경로가 고른 1등이 본체 기준으로도 1등인가
//
// 키는 .env.local의 LOSTARK_KEY에서 읽고 아무 데도 출력하지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCharacter, readCharacter, LostArkError } from "../src/lib/core/lostark.js";
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import { SEARCH_DEFAULTS, buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadKey() {
  if (process.env.LOSTARK_KEY) return process.env.LOSTARK_KEY.trim();
  try {
    const text = readFileSync(resolve(HERE, "../.env.local"), "utf8");
    const line = /^\s*(?:VITE_)?LOSTARK_KEY\s*=\s*(.+)$/m.exec(text);
    return line ? line[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

const name = process.argv.slice(2).filter(arg => !arg.startsWith("--")).join(" ").trim();
const cacheAt = resolve(HERE, "../.cache-character.json");

let state;
if (process.argv.includes("--cached")) {
  state = JSON.parse(readFileSync(cacheAt, "utf8"));
} else {
  const key = loadKey();
  if (!key) { console.error("키가 없습니다."); process.exit(1); }
  if (!name) { console.error("사용법: node scripts/search-audit.mjs 캐릭터이름"); process.exit(1); }
  let payload;
  try {
    payload = await fetchCharacter(key, name);
  } catch (error) {
    console.error(error instanceof LostArkError ? error.message : error);
    process.exit(1);
  }
  const read = readCharacter(payload);
  state = mergeState(DEFAULT_STATE, {
    base: { ...DEFAULT_STATE.base },
    attack: read.attack,
    accessories: read.accessories ?? DEFAULT_STATE.accessories,
    bracelet: read.bracelet ?? DEFAULT_STATE.bracelet,
    awakening: read.awakening ?? { job: 0, nodeLevels: {} },
    arkGrid: read.arkGrid ?? DEFAULT_STATE.arkGrid,
    collection: read.collection ?? DEFAULT_STATE.collection,
    weapon: read.weapon ?? DEFAULT_STATE.weapon,
    jewel: read.jewel ?? DEFAULT_STATE.jewel,
    engravings: read.engravings ?? {},
    nodeLevels: read.nodeLevels ?? DEFAULT_STATE.nodeLevels,
    settings: { ...DEFAULT_STATE.settings, pointBudget: 140 },
  });
  writeFileSync(cacheAt, JSON.stringify(state, null, 2));
  console.log(`${read.name ?? name} — 직업 ${state.awakening.job} · 무공 ${state.attack.weaponAttack} · 힘민지 ${state.attack.mainStat}`);
}

// 각인은 "지금 낀 대로"로 못 박는다(engravingSlots: "fixed"). 노드 조합만
// 보려는 것이고, 각인까지 열면 조합이 수백만이 된다.
//
// "0슬롯"으로는 안 된다 — 각인 탐색이 켜져 있으면 모델링된 각인이 전부
// controlledIds에 들어가서, 빠른 경로는 캐릭터가 낀 각인을 기본값으로도 안
// 얹는다. 그러면 두 경로가 다른 캐릭터를 계산하게 된다.
const options = {
  ...SEARCH_DEFAULTS,
  tier1Mode: "step10",
  petRoles: { none: "locked" },
  engravingSlots: "fixed",
  fullBudget: true,
};

const plan = buildSearchPlan(state, options);
const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));

console.log(`\n차원 ${plan.dimensions.map(d => `${d.label} ${d.options.length}`).join(" · ")}`);

// 전수 훑기. 차원이 몇 개 안 되면 그대로 다 돌린다.
const total = plan.dimensions.reduce((n, d) => n * d.options.length, 1);
console.log(`전체 조합 ${total.toLocaleString("ko-KR")}개`);
if (total > 400000) { console.error("너무 많습니다. 조건을 좁히세요."); process.exit(1); }

const picks = new Array(plan.dimensions.length).fill(0);
let worstGap = 0;
let worstAt = null;
let bestFast = null;
let bestTrue = null;
let checked = 0;

function nodeLevelsOf(chosen) {
  const levels = { ...state.nodeLevels };
  for (const id of Object.keys(levels)) levels[id] = 0;
  for (const option of chosen) {
    if (option.kind !== "nodes") continue;
    for (const [id, level] of option.levels) levels[id] = level;
  }
  return levels;
}

function walk(index) {
  if (index === plan.dimensions.length) {
    const chosen = plan.dimensions.map((d, i) => d.options[picks[i]]);
    const fast = evaluate(chosen);
    const slow = calculateMetrics({ ...state, nodeLevels: nodeLevelsOf(chosen) });
    checked += 1;

    const gap = Math.abs(fast.dpsIndex - slow.dpsIndex) / Math.max(1, Math.abs(slow.dpsIndex));
    if (gap > worstGap) { worstGap = gap; worstAt = { chosen, fast: fast.dpsIndex, slow: slow.dpsIndex }; }

    const row = { chosen, fast: fast.dpsIndex, slow: slow.dpsIndex, hit: slow.damageIndex };
    if (!bestFast || row.fast > bestFast.fast) bestFast = row;
    if (!bestTrue || row.slow > bestTrue.slow) bestTrue = row;
    return;
  }
  for (let i = 0; i < plan.dimensions[index].options.length; i += 1) {
    picks[index] = i;
    walk(index + 1);
  }
}
walk(0);

const show = row => plan.dimensions
  .map((d, i) => {
    const option = row.chosen[i];
    if (option.kind !== "nodes") return null;
    return option.levels.filter(([, lv]) => lv > 0).map(([id, lv]) => `${id}=${lv}`).join(",");
  })
  .filter(Boolean)
  .join(" | ");

console.log(`\n검사 ${checked.toLocaleString("ko-KR")}개`);
console.log(`빠른 경로 vs 본체 최대 오차: ${worstGap.toExponential(3)}`);
if (worstGap > 1e-9) {
  console.log(`  어긋난 조합: 빠른 ${worstAt.fast.toFixed(4)} · 본체 ${worstAt.slow.toFixed(4)}`);
  console.log(`  ${show(worstAt)}`);
}

console.log(`\n빠른 경로가 고른 1등: DPS ${bestFast.slow.toFixed(2)} (평가기 ${bestFast.fast.toFixed(2)})`);
console.log(`  ${show(bestFast)}`);
console.log(`본체 기준 진짜 1등:   DPS ${bestTrue.slow.toFixed(2)} (평가기 ${bestTrue.fast.toFixed(2)})`);
console.log(`  ${show(bestTrue)}`);
const loss = (bestTrue.slow - bestFast.slow) / bestTrue.slow * 100;
console.log(`\n놓친 몫: ${loss.toFixed(4)}%`);
