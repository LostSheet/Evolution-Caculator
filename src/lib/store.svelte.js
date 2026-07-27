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

export const app = $state({
  character: mergeState(DEFAULT_STATE, load(CHARACTER_KEY, {})),
  search: { ...SEARCH_DEFAULTS, ...load(SEARCH_KEY, {}) },
  results: null,
  running: false,
  progress: { phase: "", progress: 0, evaluated: 0 },
  status: "전투 특성 · 악세서리 · 팔찌 · 직접 입력 효과는 고정한 채로 탐색합니다.",
  selectedId: null,
  view: "pareto",
});

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
  } else if (section === "accessories") {
    app.character.accessories = cloneState(DEFAULT_STATE.accessories);
  } else if (section === "bracelet") {
    app.character.bracelet = cloneState(DEFAULT_STATE.bracelet);
  } else if (section === "gear") {
    app.character.weapon = cloneState(DEFAULT_STATE.weapon);
    app.character.collection = cloneState(DEFAULT_STATE.collection);
  } else if (section === "engravings") {
    app.character.engravings = {};
  } else if (section === "baseEffects") {
    app.character.baseEffects = DEFAULT_STATE.baseEffects.map(effect => ({ ...cloneState(effect), id: makeId() }));
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
