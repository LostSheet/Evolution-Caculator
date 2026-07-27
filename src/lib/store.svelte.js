import { DEFAULT_STATE, mergeState, normalizeNodeLevels, calculateMetrics, emptyNodeLevels } from "./core/metrics.js";
import { SEARCH_DEFAULTS, runSearch } from "./core/runner.js";
import { cloneState, makeId } from "./core/util.js";

const CHARACTER_KEY = "ark-passive-character-v5";
const SEARCH_KEY = "ark-passive-search-v2";

function load(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// 진화 노드 0일 때의 내 스펙 = 스냅샷. 출처(젬·코어·카드·악세·팔찌·카르마)를
// 쪼개지 않고 도착지 한 칸씩만 둔다. 게임이 출처를 늘려도 칸은 안 늘어난다.
//
// sheet: 전투 정보 창에 뜨므로 읽어서 넣는 값. 나머지는 합산해서 넣는 값.
export const SNAPSHOT_ROWS = [
  { category: "attackSpeedOnly", label: "공격속도", sheet: true },
  { category: "moveSpeedOnly", label: "이동속도", sheet: true },
  { category: "cooldownReduction", label: "쿨타임 감소", sheet: true },
  { category: "damage:추가 피해", label: "추가 피해" },
  { category: "damage:주는 피해", label: "주는 피해" },
  { category: "damage:공격력", label: "공격력" },
  { category: "damage:진화형 피해", label: "진화형 피해" },
];

// 악세서리·팔찌·카르마 UI를 걷어냈으므로, 남아 있던 값이 조용히 계산에
// 섞이지 않도록 한 번 비운다. 같은 수치는 이제 스냅샷 한 곳으로 들어간다.
function migrate(character) {
  const next = { ...character };
  next.accessories = cloneState(DEFAULT_STATE.accessories);
  next.bracelet = cloneState(DEFAULT_STATE.bracelet);
  next.convenience = { ...next.convenience, evolutionKarmaRank: 0 };

  const effects = Array.isArray(next.baseEffects) ? next.baseEffects.slice() : [];
  for (const row of SNAPSHOT_ROWS) {
    if (!effects.some(effect => effect.category === row.category)) {
      effects.push({ id: makeId(), label: row.label, category: row.category, customCategory: "", amount: 0 });
    }
  }
  next.baseEffects = effects;
  return next;
}

export const app = $state({
  character: migrate(mergeState(DEFAULT_STATE, load(CHARACTER_KEY, {}))),
  search: { ...SEARCH_DEFAULTS, ...load(SEARCH_KEY, {}) },
  results: null,
  running: false,
  progress: { phase: "", progress: 0, evaluated: 0 },
  status: "스냅샷과 그룹 합계는 고정한 채로 노드 · 펫 · 각인만 탐색합니다.",
  selectedId: null,
  view: "pareto",
});

/** 스냅샷 슬롯 하나를 가져온다. 없으면 만들어서 붙인다. */
export function fixedRow(category) {
  let effect = app.character.baseEffects.find(item => item.category === category);
  if (!effect) {
    const known = SNAPSHOT_ROWS.find(row => row.category === category);
    effect = { id: makeId(), label: known?.label ?? category, category, customCategory: "", amount: 0 };
    app.character.baseEffects.push(effect);
  }
  return effect;
}

/** 이름 붙은 슬롯에 없는 그룹만. 사용자가 따로 추가한 행이다. */
export function customRows() {
  return app.character.baseEffects.filter(
    effect => !SNAPSHOT_ROWS.some(row => row.category === effect.category),
  );
}

export function persist() {
  localStorage.setItem(CHARACTER_KEY, JSON.stringify(app.character));
  localStorage.setItem(SEARCH_KEY, JSON.stringify(app.search));
}

export function currentMetrics() {
  return calculateMetrics(app.character);
}

export function baselineMetrics() {
  return calculateMetrics({ ...app.character, nodeLevels: emptyNodeLevels() });
}

export function resetSection(section) {
  if (section === "combat") {
    app.character.base = cloneState(DEFAULT_STATE.base);
    app.character.settings.pointBudget = DEFAULT_STATE.settings.pointBudget;
  } else if (section === "convenience") {
    app.character.convenience = cloneState(DEFAULT_STATE.convenience);
    for (const key of ["includeCooldown", "includeAttackSpeed", "backAttack", "headAttack"]) {
      app.character.settings[key] = DEFAULT_STATE.settings[key];
    }
  } else if (section === "snapshot") {
    app.character.base = cloneState(DEFAULT_STATE.base);
    app.character.baseEffects = SNAPSHOT_ROWS.map(row => ({
      id: makeId(), label: row.label, category: row.category, customCategory: "", amount: 0,
    }));
  } else if (section === "engravings") {
    app.character.engravings = {};
  } else if (section === "nodes") {
    app.character.nodeLevels = emptyNodeLevels();
  }
  persist();
}

let runToken = 0;

export async function startSearch() {
  if (app.running) return;

  runToken += 1;
  const token = runToken;
  app.running = true;
  app.results = null;
  app.selectedId = null;
  app.progress = { phase: "준비", progress: 0, evaluated: 0 };

  const result = await runSearch(
    cloneState(app.character),
    app.search,
    progress => {
      if (token === runToken) app.progress = progress;
    },
    () => token !== runToken,
  );

  if (token !== runToken) return;

  app.running = false;
  app.progress = { phase: "완료", progress: 1, evaluated: result.evaluated };

  if (result.error === "engravingOverflow") {
    app.status = `고정 각인이 ${result.plan.engravings.locked.length}개인데 슬롯은 ${result.plan.engravings.slots}개입니다. 슬롯을 늘리거나 고정을 줄여 주세요.`;
    return;
  }

  app.results = { ...result, baseline: calculateMetrics(app.character) };
  app.status = `${result.exhaustive ? "전수" : "빔"} 탐색 완료 · ${result.evaluated.toLocaleString("ko-KR")}개 평가 · ${(result.elapsedMs / 1000).toFixed(1)}초`;
}

export function cancelSearch() {
  if (!app.running) return;
  runToken += 1;
  app.running = false;
  app.status = "탐색을 중지했습니다.";
}

export function applyResult(entry) {
  if (!entry) return;
  app.character.nodeLevels = normalizeNodeLevels(entry.nodeLevels);
  app.character.convenience.petStat = entry.pet;
  app.character.engravings = { ...entry.engravings };
  app.selectedId = entry.id;
  persist();
}

export function currentSignature() {
  const controlled = app.results?.plan.engravings.controlledIds ?? [];
  return [
    Object.entries(normalizeNodeLevels(app.character.nodeLevels)).map(([, v]) => v).join(","),
    app.character.convenience.petStat || "none",
    controlled.map(id => app.character.engravings[id] || "none").join(","),
  ].join("|");
}

export function exportState() {
  const payload = { exportedAt: new Date().toISOString(), state: app.character, search: app.search };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ark-passive-simulator.json";
  link.click();
  URL.revokeObjectURL(url);
}

export async function importState(file) {
  const payload = JSON.parse(await file.text());
  // Accepts both the new format and the legacy export (workspace-based).
  const source = payload.state ?? payload.workspace?.profiles?.[0]?.state ?? payload;
  app.character = mergeState(DEFAULT_STATE, source);
  if (payload.workspace?.nodePresets?.[0]?.nodeLevels) {
    app.character.nodeLevels = normalizeNodeLevels(payload.workspace.nodePresets[0].nodeLevels);
  }
  if (payload.search) app.search = { ...SEARCH_DEFAULTS, ...payload.search };
  app.results = null;
  persist();
}
