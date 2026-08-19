import { NODE_LIBRARY, ARC_PASSIVE_CONSTANTS } from "./core/data.js";
import { ENGRAVING_LIBRARY, ENGRAVING_TIERS } from "./core/engravings.js";
import { splitCollectionStats } from "./core/lostark.js";
import { getAwakeningNodes, awakeningHeadroom, awakeningDependents } from "./core/awakening.js";
import {
  SYNERGY_UPTIME_FULL, SYNERGY_OWN_ID, SYNERGY_JOBS,
  getSynergyJob, findSynergyChoice, defaultSynergyNodes,
  takenBranch, jobBranches,
} from "./core/synergy.js";
import {
  DEFAULT_STATE, mergeState, normalizeNodeLevels, calculateMetrics, emptyNodeLevels,
  getEngravingTierIndex, AVATAR_SLOTS,
} from "./core/metrics.js";
import { SEARCH_DEFAULTS, normalizeSearchFloors, normalizeSearchCeilings, runSearch } from "./core/runner.js";
import { OPTIMIZER_PET_LABELS } from "./core/search.js";
import { ORDER_CORE_SLOTS } from "./core/cores.js";
import { cloneState, makeId, clamp, readNumber } from "./core/util.js";

const CHARACTER_KEY = "ark-passive-character-v5";
const SEARCH_KEY = "ark-passive-search-v2";
const SAVES_KEY = "ark-passive-saves-v1";
// v2에서 슬롯이 드는 것이 통째로 바뀌었다 — 노드·각인·펫·음식 넷에서
// 캐릭터 전체로. 옛 저장본은 이관하지 않고 버린다.
const SLOTS_KEY = "ark-passive-slots-v2";
const THEME_KEY = "ark-passive-theme";
// 각인은 원정대 공유다 — 캐릭터를 갈아타도 같은 각인을 낀다. 그래서 세팅과
// 따로 둔다. 남의 원정대를 대신 굴려 보는 동안 내 각인이 오염되면 안 되므로,
// 저장은 명시적으로 누를 때만 한다.
const ENGRAVING_ROSTER_KEY = "ark-passive-engraving-roster-v1";
// 카드를 접어 둔 상태. 세팅이 아니라 이 사람의 화면 습관이라 따로 둔다 —
// 세팅을 갈아끼워도, 캐릭터를 새로 불러와도 접어 둔 것은 접힌 채여야 한다.
const FOLDS_KEY = "ark-passive-folds-v1";
// API 키는 캐릭터 세팅과 성격이 다르다. 내보내기 파일에 딸려 나가면 안 되고,
// 세팅을 갈아끼워도 그대로 남아 있어야 한다.
const API_KEY = "ark-passive-lostark-key";

// "auto"는 OS 설정을 따른다. 손으로 고르면 그때부터 OS를 무시한다 —
// 밝은 데스크톱에서 이 화면만 어둡게 쓰고 싶은 사람이 있다.
export const THEMES = ["auto", "light", "dark"];

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

function loadApiKey() {
  try {
    return localStorage.getItem(API_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key) {
  const trimmed = String(key ?? "").trim();
  app.api.key = trimmed;
  try {
    if (trimmed) localStorage.setItem(API_KEY, trimmed);
    else localStorage.removeItem(API_KEY);
  } catch {
    // 사생활 보호 모드에서도 이번 세션은 굴러가야 한다.
  }
}

function load(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// 전투 특성 입력은 사라졌다. 특성은 1T 노드 · 팔찌 · 도감/물약 · 펫에서만 온다.
// 예전 저장본에 남은 base.*Stat이 UI 없이 조용히 더해지지 않도록 비운다.
//
// 마나 딜 비중은 슬라이더 하나에서 네 갈래로 갈라졌다. 옛 값은 "마나 스킬 N%,
// 나머지는 끝마/무마를 그대로 받는 무언가"라는 해석이었으므로 나머지를
// '마나 X · 아이덴티티'로 옮겨야 수치가 그대로 보존된다.
function migrate(character) {
  // 직접 입력 효과의 '재료 하나 × 비율 하나'는 식으로 바뀌었다. 그걸로는
  // {{공격속도}} + {{이동속도}} 같은 걸 못 적어서다. 옛 값은 같은 뜻의 식으로 옮긴다.
  const LEGACY_SOURCE_NAMES = { attackSpeed: "공격속도", moveSpeed: "이동속도" };
  // 상한은 식 안의 min()이 아니라 '최대' 칸이 든다. 칸 하나가 읽고 고치기 쉽고,
  // min()이 남아 있으면 조립기가 못 읽어 통째로 읽기 전용이 된다 —
  // 성검 개방이 정확히 그 꼴이었다.
  const MIN_WRAPPER = /^\s*min\s*\(\s*(.+?)\s*,\s*(\d+(?:\.\d+)?)\s*\)\s*$/i;
  const baseEffects = (character.baseEffects || []).map(effect => {
    if (typeof effect.formula === "string") {
      const wrapped = MIN_WRAPPER.exec(effect.formula);
      if (!wrapped) return effect;
      return { ...effect, formula: wrapped[1], cap: effect.cap === "" || effect.cap == null ? wrapped[2] : effect.cap };
    }
    const name = LEGACY_SOURCE_NAMES[effect.source];
    const { source, ratio, ...rest } = effect;
    return { ...rest, formula: name ? `{{${name}}} * ${readNumber(ratio)}%` : "" };
  });

  const convenience = { ...character.convenience };
  // 정열의 춤사위. 칸이 생긴 직후 기본값이 0이었다가 2로 바뀌어서, 그 사이에
  // 저장된 세팅에는 0이 박혀 있다. undefined 검사로는 안 걸린다 —
  // 고른 적 없다는 표식을 따로 두고 한 번만 옮긴다.
  if (!convenience.passionDanceSet) {
    convenience.passionDance = DEFAULT_STATE.convenience.passionDance;
    convenience.passionDanceSet = true;
  }
  if (!convenience.damageMix || typeof convenience.damageMix !== "object") {
    const share = clamp(Math.round(readNumber(convenience.manaShare ?? 100)), 0, 100);
    convenience.damageMix = {
      manaCooldown: share,
      plainCooldown: 0,
      identityPlain: 100 - share,
      identityMana: 0,
      feederMana: true,
    };
  }
  // 질서 코어 칸이 뒤늦게 생겼다. mergeState는 arkGrid를 통째로 갈아끼우므로
  // 옛 저장본에는 order가 아예 없고, 화면이 order.sun을 읽다 터진다.
  // 펫 목장이 한 칸에서 둘로 나뉘었다. 옛 값은 양쪽에 같이 넣는다 —
  // 그때는 실제로 한 값이 둘 다에 걸리고 있었으므로 그게 그 사람의 세팅이다.
  const collection = { ...character.collection };
  if (collection.ranch !== undefined && collection.ranchDamage === undefined) {
    collection.ranchDamage = collection.ranch === true ? 1 : readNumber(collection.ranch);
    collection.ranchMainStat = collection.ranch === true ? 1 : readNumber(collection.ranch);
    delete collection.ranch;
  }

  const arkGrid = {
    ...character.arkGrid,
    order: Object.fromEntries(ORDER_CORE_SLOTS.map(slot => {
      const saved = character.arkGrid?.order?.[slot.key];
      return [slot.key, {
        name: String(saved?.name ?? ""),
        points: clamp(Math.round(readNumber(saved?.points ?? 20)), 10, 20),
        stage: clamp(Math.round(readNumber(saved?.stage ?? 1)), 0, 1),
      }];
    })),
  };

  // 아바타가 퍼센트 한 칸에서 부위 넷으로 바뀌었다. 옛 값은 큰 등급부터
  // 채워 되돌린다 — 8%면 전설 넷, 7%면 전설 셋에 영웅 하나다.
  const attack = { ...character.attack };
  if (!attack.avatars || typeof attack.avatars !== "object") {
    let left = Math.max(0, Math.round(readNumber(attack.avatarPercent)));
    attack.avatars = Object.fromEntries(AVATAR_SLOTS.map(slot => {
      if (left >= 2) { left -= 2; return [slot.key, "legendary"]; }
      if (left >= 1) { left -= 1; return [slot.key, "epic"]; }
      return [slot.key, "none"];
    }));
  }

  return {
    ...character,
    base: { ...character.base, critStat: 0, specStat: 0, swiftStat: 0 },
    attack,
    collection,
    baseEffects,
    convenience,
    arkGrid,
    awakening: migrateAwakening(character.awakening),
  };
}

// 깨달음 배분의 열쇠가 손으로 지은 아이디에서 노드 이름으로 바뀌었다. 구조를
// 인벤 원본에서 받게 되면서 이름이 유일한 열쇠가 됐기 때문이다. 옛 이름을 그냥
// 버리면 불러다 둔 배분이 말없이 사라진다.
const LEGACY_AWAKENING_IDS = {
  "sum-overflow": "넘치는 교감", "sum-master": "상급 소환사", "sum-wisdom": "총명함",
  "sum-focus": "정신 집중", "sum-bond": "교감 강화", "sum-spirit-bond": "정령의 교감",
  "sum-ancient-power": "고대의 힘", "sum-ancient-wind": "고대의 바람",
  "sum-absolute": "절대적인 명령", "sum-rampage": "정령 폭주",
  "sum-ancient-blessing": "고대의 축복", "sum-whisper": "고대의 속삭임",
  "leap-transcend": "초월적인 힘", "leap-charged": "충전된 분노", "leap-amplifier": "각성 증폭기",
  "leap-unleashed": "풀려난 힘", "leap-potential": "잠재력 해방", "leap-instant": "즉각적인 주문",
  "sum-bloom": "개화", "sum-mariposa": "마리포사의 축복", "sum-tame": "길들이기",
  "sum-igna-breath": "이그나 브레스",
};

function migrateAwakening(awakening) {
  const levels = awakening?.nodeLevels;
  if (!levels || typeof levels !== "object") return awakening ?? { job: 0, nodeLevels: {} };
  const nodeLevels = {};
  for (const [key, value] of Object.entries(levels)) {
    nodeLevels[LEGACY_AWAKENING_IDS[key] ?? key] = value;
  }
  return { ...awakening, nodeLevels, uptime: { ...(awakening.uptime ?? {}) } };
}

// 각인은 '탐색 안 함' 모드를 없애고 개수 0~5로 통일했다. 전부 고정하면
// 조합이 하나뿐이라 예전의 고정 모드와 같은 결과가 나온다.
function migrateSearch(search, character) {
  const merged = { ...SEARCH_DEFAULTS, ...search };
  // 각인 슬롯은 게임이 5로 못 박는다 — 고를 것이 아니었다. 옛 저장본에 3이나
  // "fixed"가 남아 있으면 탐색이 조용히 각인을 덜 끼운 채로 돈다.
  merged.engravingSlots = "5";
  // 펫·음식이 켬/끔 스위치에서 고정·후보·제외로 바뀌었다. 꺼 둔 상태는
  // "지금 쓰는 것 하나로"라는 뜻이었으므로 그것을 고정으로 옮긴다.
  if (merged.petSearch === false && !search?.petRoles) {
    merged.petRoles = { [character?.convenience?.petStat || "none"]: "locked" };
  }
  if (merged.foodSearch === false && !search?.foodRoles) {
    merged.foodRoles = { [character?.convenience?.food || "none"]: "locked" };
  }
  delete merged.petSearch;
  delete merged.foodSearch;
  merged.petRoles = { ...(merged.petRoles ?? {}) };
  merged.foodRoles = { ...(merged.foodRoles ?? {}) };
  if (merged.engravingSlots === "fixed") merged.engravingSlots = "5";
  if (!Array.isArray(merged.excludedNodes)) merged.excludedNodes = [];
  // 얕은 전개는 기본값의 객체를 그대로 물려준다. 그 상태로 화면에서 고치면
  // 모듈 상수를 고치는 셈이 되므로 매번 새 객체로 만든다.
  merged.lockedNodes = { ...(merged.lockedNodes ?? {}) };
  merged.floors = normalizeSearchFloors(merged.floors);
  merged.ceilings = normalizeSearchCeilings(merged.ceilings);
  return merged;
}

function loadSaves() {
  const list = load(SAVES_KEY, []);
  return Array.isArray(list) ? list.filter(item => item && item.id && item.character) : [];
}

// 깨달음·도약이 빌드 앞에 있는 이유: 그건 캐릭터에 붙박인 스펙이라 탐색이
// 굴리는 변수가 아니다. 불러온 것을 확인하는 자리가 진화 배분을 만지는 자리보다
// 앞이어야 한다.
export const PAGES = [
  { n: 1, key: "setup", label: "사전 세팅" },
  { n: 2, key: "awakening", label: "깨달음 · 도약" },
  // 빌드는 페이지가 아니라 물건이다 — 서랍으로 언제든 꺼낸다.
  //
  // 설정과 결과는 따로 선다. 한 화면에 두면 "무엇을 굴릴지 정하는 곳"과 "굴린
  // 것을 보는 곳"이 겹쳐서, 곡선을 보다가 하한을 고치고 다시 곡선을 보는 동안
  // 화면이 접혔다 펴졌다 한다. 설정 화면은 지금 빌드와도, 고른 후보와도 상관이
  // 없는 자리다 — 규칙만 산다.
  { n: 3, key: "rules", label: "탐색 설정" },
  // 비교는 페이지가 아니라 비교함이다 — 하단 막대가 접힌 모습이고, 열면
  // 서랍에서 나란히 선다. 페이지로 두면 담으려고 화면을 넘나들어야 했다.
  { n: 4, key: "results", label: "탐색 결과" },
];

// 페이지 번호를 코드에 박아 두면 사이에 하나 끼울 때마다 여기저기가 어긋난다.
// 열쇠로 부른다.
export const PAGE = Object.fromEntries(PAGES.map(page => [page.key, page.n]));

// 세팅을 먼저 세운다 — 탐색 규칙의 옛 스위치를 옮기려면 지금 무엇을 쓰는지
// 알아야 한다(migrateSearch 참고).
const bootCharacter = migrate(mergeState(DEFAULT_STATE, load(CHARACTER_KEY, {})));

export const app = $state({
  character: bootCharacter,
  search: migrateSearch(load(SEARCH_KEY, {}), bootCharacter),
  // 이름 붙여 저장해 둔 세팅들. 파일 내보내기와 달리 한 번에 갈아끼운다.
  saves: loadSaves(),
  page: PAGE.rules,
  results: null,
  running: false,
  progress: { phase: "", progress: 0, evaluated: 0 },
  status: "아직 탐색하지 않았습니다.",
  selectedId: null,
  view: "pareto",
  // 균형 곡선의 두 축. 무엇을 팔아 무엇을 사는지 직접 고른다.
  chartX: "dpsIndex",
  chartY: "damageIndex",
  // 진화 세팅 슬롯. 비교의 단위다 — 슬롯 항목 참고.
  slots: [],
  activeSlotId: null,
  baseSlotId: null,
  // 빌드 서랍. 평소엔 숨어 있고 하단 막대가 손잡이다.
  // resultId가 있으면 탐색 결과를 읽기 전용으로 띄운 것이다.
  drawer: { open: false },
  // 접어 둔 카드. 규칙은 하나다 — 1페이지의 카드는 전부 접을 수 있고,
  // 처음에는 전부 펴져 있고, 접은 것은 기억된다.
  folds: load(FOLDS_KEY, {}),
  // 이름 붙인 각인 슬롯. 원정대 하나가 슬롯 하나다.
  engravingRoster: loadRoster(),
  theme: loadTheme(),
  // 로스트아크 API. 키는 이 브라우저에만 남는다 — 서버를 거치지 않는다.
  api: {
    key: loadApiKey(),
    characterName: "",
  },
});


/** auto → light → dark → auto. 한 단추로 도는 게 세 갈래 메뉴보다 빠르다. */
/** 이 카드가 펴져 있나. 처음 보는 카드는 펴 둔다. */
export function isOpen(key) {
  return app.folds[key] !== false;
}

export function setFold(key, open) {
  app.folds[key] = open;
  try {
    localStorage.setItem(FOLDS_KEY, JSON.stringify(app.folds));
  } catch {
    // 저장이 막혀도 이번 세션은 그대로 굴러가야 한다.
  }
}

// --- 각인 보유 현황 ----------------------------------------------------------
//
// 각인은 원정대 공유다. "내 캐릭터들의 진화 세팅을 굴려 본다"면 이 값은 두고두고
// 쓰는 것이고, 캐릭터를 바꿀 때마다 다시 채울 이유가 없다.
//
// 그런데 남의 원정대를 대신 굴려 보는 일이 생긴다. 그때 각인을 이리저리 바꿔
// 볼 텐데 그게 내 것을 덮으면 안 된다. 그래서 슬롯을 여럿 두고, 저장은 누를
// 때만 한다 — 불러오기는 세팅만 채우고 슬롯은 안 건드린다.
//
// 슬롯 하나 = { id, name, tiers: { 각인id: 단계 }, stones: { 각인id: 레벨 } }

function loadRoster() {
  const list = load(ENGRAVING_ROSTER_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter(item => item && item.id)
    .map(item => ({
      id: item.id,
      name: String(item.name || "원정대"),
      tiers: { ...(item.tiers ?? {}) },
      stones: { ...(item.stones ?? {}) },
      savedAt: item.savedAt ?? null,
    }));
}

function persistRoster() {
  try {
    localStorage.setItem(ENGRAVING_ROSTER_KEY, JSON.stringify(app.engravingRoster));
  } catch {
    // 저장이 막혀도 이번 세션은 그대로 굴러가야 한다.
  }
}

/** 지금 낀 각인을 새 슬롯으로. */
export function saveEngravingSlot(name) {
  const slot = {
    id: makeId(),
    name: String(name || `원정대 ${app.engravingRoster.length + 1}`).trim(),
    tiers: { ...(app.character.engravings ?? {}) },
    stones: { ...(app.character.engravingStones ?? {}) },
    savedAt: new Date().toISOString(),
  };
  app.engravingRoster.push(slot);
  persistRoster();
  return slot;
}

/** 이 슬롯을 지금 세팅에 적용한다. */
export function applyEngravingSlot(id) {
  const slot = app.engravingRoster.find(item => item.id === id);
  if (!slot) return false;
  ensureEditable();
  app.character.engravings = { ...slot.tiers };
  app.character.engravingStones = { ...slot.stones };
  app.status = `'${slot.name}'의 각인을 적용했습니다.`;
  persist();
  return true;
}

/** 지금 낀 각인으로 이 슬롯을 덮는다. */
export function updateEngravingSlot(id) {
  const slot = app.engravingRoster.find(item => item.id === id);
  if (!slot) return false;
  slot.tiers = { ...(app.character.engravings ?? {}) };
  slot.stones = { ...(app.character.engravingStones ?? {}) };
  slot.savedAt = new Date().toISOString();
  persistRoster();
  return true;
}

export function renameEngravingSlot(id, name) {
  const slot = app.engravingRoster.find(item => item.id === id);
  const trimmed = String(name ?? "").trim();
  if (!slot || !trimmed) return false;
  slot.name = trimmed;
  persistRoster();
  return true;
}

export function removeEngravingSlot(id) {
  const at = app.engravingRoster.findIndex(item => item.id === id);
  if (at < 0) return false;
  app.engravingRoster.splice(at, 1);
  persistRoster();
  return true;
}

export function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(app.theme) + 1) % THEMES.length];
  app.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // 사생활 보호 모드 등으로 저장이 막혀도 이번 세션은 그대로 굴러가야 한다.
  }
}

export function goPage(page) {
  app.page = clamp(Math.round(page), 1, PAGES.length);
  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
}

// --- 슬롯 --------------------------------------------------------------------
//
// 이 계산기가 하는 일은 진화 세팅을 나란히 놓고 비교하는 것이다. 그래서 비교의
// 단위를 따로 세운다 — 슬롯.
//
// 슬롯은 빌드 세 가지만 든다: 노드 배분 · 각인 · 펫. 팔찌도 악세도 계산 기준도
// 안 든다. 그것들은 캐릭터에 한 벌뿐이고, 슬롯 전부에 똑같이 걸린다. 그래서
// 팔찌를 바꾸면 슬롯 전부가 새 팔찌 위에서 다시 매겨진다 — 저장해 둔 것이
// 낡지 않는다. 세팅을 통째로 얼려 두면 어제 팔찌 위의 숫자가 나와서, 비교가
// 아니라 시간여행이 된다.
//
// 슬롯마다 원본을 따로 든다. 곡선에서 가져온 값이나 게임에서 읽은 값은
// source에 얼려 두고, 편집은 build만 건드린다. 그래서 미세 조정을 해도
// 결과물이 사라지지 않고, 되돌리기 한 번이면 원래 값으로 온다.
//
// 살아 있는 빌드는 여전히 app.character 하나뿐이다. 슬롯을 갈아끼울 때
// 지금 것을 활성 슬롯에 적어 두고 새 것을 얹는다. 저장할 때마다 적어 두므로
// 새로고침해도 손댄 것이 남는다.

const SLOT_LIMIT = 6;

const SLOT_ORIGINS = {
  ingame: "게임에서 읽음",
  search: "곡선에서",
  manual: "손으로 찍음",
};

export function slotOriginLabel(slot) {
  return SLOT_ORIGINS[slot?.origin] ?? SLOT_ORIGINS.manual;
}

/**
 * 지금 화면이 들고 있는 빌드 — 캐릭터 통째로.
 *
 * 예전에는 노드·각인·펫·음식 넷만 들었다. 그래서 슬롯끼리 장비를 공유했고,
 * 팔찌 하나를 바꾸면 비교함의 모든 열이 같은 값으로 함께 움직였다. "팔찌 A와
 * B 중 뭐가 나은가"를 이 계산기로 물을 수가 없었다는 뜻이다.
 *
 * 탐색 설정(app.search)은 안 든다. 그건 빌드가 아니라 "무엇을 굴릴지"라는
 * 규칙이고, 열마다 다르면 결과 표가 무엇의 결과인지 알 수 없어진다.
 */
export function currentBuild() {
  return cloneState(app.character);
}

/** 이 슬롯을 잴 빌드 — 활성 슬롯이면 산 값, 아니면 담아 둔 값. */
export function slotBuild(slot) {
  return slot.id === app.activeSlotId ? currentBuild() : slot.build;
}

// 빠진 칸은 기본값으로 채운다. 옛 꼴(넷만 든 빌드)이 들어와도 여기서
// 캐릭터 모양이 되므로 부르는 쪽이 형태를 안 따져도 된다.
function normalizeBuild(build) {
  return migrate(mergeState(DEFAULT_STATE, build ?? {}));
}

/** 슬롯이 이미 완전한 상태다. 지금 캐릭터를 빌려 오지 않는다. */
export function buildState(build) {
  if (!build) return null;
  return normalizeBuild(build);
}

function makeSlot(name, origin, build) {
  const next = normalizeBuild(build);
  return { id: makeId(), name, origin, build: next, source: cloneState(next), savedAt: new Date().toISOString() };
}

function persistSlots() {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify({
      slots: app.slots, activeSlotId: app.activeSlotId, baseSlotId: app.baseSlotId,
    }));
  } catch {
    // 저장이 막혀도 이번 세션은 그대로 굴러가야 한다.
  }
}

/** 살아 있는 빌드를 활성 슬롯에 적어 둔다. 저장할 때마다 부른다. */
function captureActive() {
  const slot = app.slots.find(item => item.id === app.activeSlotId);
  if (slot) slot.build = currentBuild();
}

function loadBuild(build) {
  app.character = normalizeBuild(build);
}

function bootstrapSlots() {
  const saved = load(SLOTS_KEY, null);
  const slots = (saved?.slots ?? [])
    .filter(slot => slot && slot.id)
    .map(slot => ({
      id: slot.id,
      name: String(slot.name || "슬롯"),
      origin: SLOT_ORIGINS[slot.origin] ? slot.origin : "manual",
      build: normalizeBuild(slot.build),
      source: normalizeBuild(slot.source ?? slot.build),
      savedAt: slot.savedAt ?? null,
    }));

  if (slots.length === 0) {
    const slot = makeSlot("현재", "manual", currentBuild());
    app.slots = [slot];
    app.activeSlotId = slot.id;
    app.baseSlotId = slot.id;
    return;
  }

  app.slots = slots;
  const has = id => slots.some(slot => slot.id === id);
  app.activeSlotId = has(saved?.activeSlotId) ? saved.activeSlotId : slots[0].id;
  app.baseSlotId = has(saved?.baseSlotId) ? saved.baseSlotId : slots[0].id;
  // 저장해 둔 활성 슬롯을 화면에 올린다. 안 그러면 탭은 A를 가리키는데
  // 노드판은 B를 보여준다.
  loadBuild(app.slots.find(slot => slot.id === app.activeSlotId).build);
}

/**
 * 원본은 안 건드린다.
 *
 * 인게임 슬롯은 "게임에 실제로 있는 것"이고 탐색 결과는 "계산기가 찾아 준 것"이다.
 * 둘 다 손대는 순간 그 사실이 사라지므로 읽기 전용으로 두고, 고치려 하면
 * 사본을 세워 편집을 그쪽으로 넘긴다. 그래야 기준이 흔들리지 않는다.
 */
export function slotReadOnly(slot) {
  return slot?.origin === "ingame";
}

/** 이름이 겹치지 않게 뒤에 번호를 붙인다. */
function freeName(base) {
  if (!app.slots.some(slot => slot.name === base)) return base;
  for (let n = 2; n < 99; n += 1) {
    const name = `${base} ${n}`;
    if (!app.slots.some(slot => slot.name === name)) return name;
  }
  return base;
}

/**
 * '탐색 N' 다음 번호.
 *
 * 개수로 세면 안 된다. 담고 빼고를 섞으면 이미 있는 이름과 부딪혀
 * freeName이 '탐색 2 2'를 만든다 — 담기와 빼기를 번갈아 눌러 실제로 봤다.
 * 지금 붙어 있는 번호 중 가장 큰 것에서 하나 올린다.
 */
function nextSearchName() {
  const used = app.slots
    .map(slot => /^탐색 (\d+)$/.exec(slot.name))
    .filter(Boolean)
    .map(match => Number(match[1]));
  return `탐색 ${used.length > 0 ? Math.max(...used) + 1 : 1}`;
}

/**
 * 편집할 수 있는 자리를 마련한다. 노드·각인·펫·음식을 고치기 직전에 부른다.
 *
 * 인게임 슬롯을 고치려 하면 사본을 세우고 편집을 그쪽으로 넘긴다. 이미 고칠 수
 * 있는 슬롯이면 아무 일도 안 한다 — 부르는 쪽은 매번 불러도 된다.
 */
export function ensureEditable() {
  const current = activeSlot();
  if (!slotReadOnly(current)) return current;
  const slot = addSlot({ name: freeName(`${current.name} 사본`), origin: "manual", build: cloneState(current.build) });
  app.status = `'${current.name}'은 게임에서 읽은 그대로라 '${slot.name}'을 만들어 편집합니다.`;
  return slot;
}

// 빌드 서랍. 페이지가 아니라 물건이라, 어느 화면에서든 꺼냈다 넣는다.
export function openDrawer() {
  app.drawer.open = true;
}

export function closeDrawer() {
  app.drawer.open = false;
}

export function toggleDrawer() {
  app.drawer.open = !app.drawer.open;
}

export function activeSlot() {
  return app.slots.find(slot => slot.id === app.activeSlotId) ?? null;
}

export function baseSlot() {
  return app.slots.find(slot => slot.id === app.baseSlotId) ?? null;
}

/** 담은 뒤로 손댔는지. 되돌리기를 띄울지 여기서 정한다. */
export function slotDirty(slot) {
  if (!slot) return false;
  const build = slot.id === app.activeSlotId ? currentBuild() : slot.build;
  return JSON.stringify(normalizeBuild(build)) !== JSON.stringify(normalizeBuild(slot.source));
}

export function selectSlot(id) {
  if (id === app.activeSlotId) return;
  const slot = app.slots.find(item => item.id === id);
  if (!slot) return;
  captureActive();
  app.activeSlotId = id;
  loadBuild(slot.build);
  persist();
}

export function addSlot({ name, origin = "manual", build = null, select = true } = {}) {
  captureActive();
  // 개수로 이름을 지으면 담고 빼기를 섞을 때 이미 있는 이름과 겹친다 —
  // 실제로 `슬롯 2` 두 개가 나란히 선 적이 있다.
  const slot = makeSlot(freeName(name || `슬롯 ${app.slots.length + 1}`), origin, build ?? currentBuild());

  if (app.slots.length >= SLOT_LIMIT) {
    // 조용히 지우지 않는다. 활성 슬롯 자리를 내주고 그 사실을 적는다.
    const at = Math.max(0, app.slots.findIndex(item => item.id === app.activeSlotId));
    app.status = `슬롯이 ${SLOT_LIMIT}개로 가득 차 '${app.slots[at].name}' 자리에 담았습니다.`;
    if (app.baseSlotId === app.slots[at].id) app.baseSlotId = slot.id;
    app.slots[at] = slot;
  } else {
    app.slots.push(slot);
  }

  if (select) {
    app.activeSlotId = slot.id;
    loadBuild(slot.build);
  }
  persist();
  return slot;
}

export function renameSlot(id, name) {
  const trimmed = String(name ?? "").trim();
  const slot = app.slots.find(item => item.id === id);
  if (!slot || !trimmed) return false;
  slot.name = trimmed;
  persist();
  return true;
}

export function removeSlot(id) {
  if (app.slots.length <= 1) return false;
  const at = app.slots.findIndex(slot => slot.id === id);
  if (at < 0) return false;
  app.slots.splice(at, 1);
  const fallback = app.slots[Math.min(at, app.slots.length - 1)];
  if (app.baseSlotId === id) app.baseSlotId = fallback.id;
  if (app.activeSlotId === id) {
    app.activeSlotId = fallback.id;
    loadBuild(fallback.build);
  }
  persist();
  return true;
}

/** 담았을 때의 값으로. 곡선에서 가져온 것, 게임에서 읽은 것이 여기로 돌아온다. */
export function revertSlot(id) {
  const slot = app.slots.find(item => item.id === id);
  if (!slot) return false;
  slot.build = cloneState(normalizeBuild(slot.source));
  if (slot.id === app.activeSlotId) loadBuild(slot.build);
  persist();
  return true;
}

export function setBaseSlot(id) {
  if (!app.slots.some(slot => slot.id === id)) return false;
  app.baseSlotId = id;
  persist();
  return true;
}

/**
 * 하단 막대가 무엇과 비교할지.
 *
 * 보통은 ★ 슬롯이다. 그런데 지금 만지고 있는 것이 바로 ★ 슬롯이면 편집이
 * 기준까지 같이 끌고 가서 증감이 영영 0이 된다 — 그때는 그 슬롯의 원본과
 * 비교한다. 어느 쪽이든 "손댄 만큼"이 나온다.
 */
export function baselineRef() {
  const base = baseSlot();
  if (!base) return null;
  const own = base.id === app.activeSlotId;
  if (own && !slotDirty(base)) return null;
  return { build: own ? base.source : base.build, label: own ? `${base.name} 원본` : base.name };
}

/** 기준 빌드를 지금 장비·전투 상황 위에 얹은 상태. 없으면 null. */
export function baselineState() {
  return buildState(baselineRef()?.build);
}

// 슬롯이 하나도 없으면 지금 빌드로 하나 만든다. 여기서부터 손댄 만큼만
// 증감으로 나온다 — 예전 '비교 기준'이 하던 일이 슬롯 하나가 된 것이다.
//
// 이 줄은 반드시 위 const들 뒤에 와야 한다. 함수 선언은 끌어올려지지만
// SLOT_ORIGINS 같은 const는 안 그래서, app 정의 바로 밑에 두면 TDZ에 걸린다.
bootstrapSlots();

// --- 탐색에서 고른 후보 ------------------------------------------------------
// 하단 막대와 3페이지가 같은 후보를 봐야 해서 여기 둔다. 양쪽이 각자 계산하면
// 언젠가 서로 다른 빌드를 가리킨다.

// 탐색이 남긴 것 전부. 곡선 둘과 순위표 셋.
//
// 목록을 손으로 늘어놓으면 새 목록이 생길 때마다 빠뜨린다. 실제로 쿨감 곡선과
// 쿨감 순위를 넣었을 때 여기가 안 따라와서, 곡선에서 쿨감 49%짜리를 눌러도
// 상세는 엉뚱한 빌드를 보여줬다 — find가 실패하고 첫 지점으로 떨어졌다.
export const RESULT_LISTS = ["pareto", "cooldownPareto", "damage", "dps", "cooldown"];

/** 중복 없이 하나로. 곡선도 상세도 이 목록만 본다. */
export function resultPool() {
  if (!app.results) return [];
  const seen = new Set();
  const out = [];
  for (const key of RESULT_LISTS) {
    for (const entry of app.results[key] ?? []) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/** 지금 고른 후보. 아무것도 안 골랐으면 곡선의 첫 지점. */
export function selectedResult() {
  if (!app.results) return null;
  return resultPool().find(item => item.id === app.selectedId) ?? app.results.pareto[0] ?? null;
}

/** 후보를 지금 장비·전투 상황 위에 얹은 상태. 슬롯을 재는 방식과 같다. */
export function resultState(entry) {
  if (!entry) return null;
  return buildState({ nodeLevels: entry.nodeLevels, engravings: entry.engravings, pet: entry.pet, food: entry.food });
}

/** 확정하면 무엇이 바뀌는지 — 노드 · 각인 · 펫의 차이만. */
export function resultChanges(entry) {
  if (!entry) return [];
  const next = normalizeNodeLevels(entry.nodeLevels);
  const out = NODE_LIBRARY
    .filter(node => (app.character.nodeLevels[node.id] || 0) !== (next[node.id] || 0))
    .map(node => ({
      name: node.name,
      from: app.character.nodeLevels[node.id] || 0,
      to: next[node.id] || 0,
    }));

  ENGRAVING_LIBRARY.forEach(item => {
    const before = getEngravingTierIndex(app.character.engravings[item.id]);
    const after = getEngravingTierIndex(entry.engravings[item.id]);
    if (before === after) return;
    out.push({
      name: item.name,
      from: before < 0 ? "없음" : ENGRAVING_TIERS[before].label,
      to: after < 0 ? "없음" : ENGRAVING_TIERS[after].label,
    });
  });

  if (entry.pet !== (app.character.convenience.petStat || "none")) {
    out.push({
      name: "펫 효과",
      from: OPTIMIZER_PET_LABELS[app.character.convenience.petStat] ?? "없음",
      to: OPTIMIZER_PET_LABELS[entry.pet] ?? "없음",
    });
  }
  return out;
}

export function persist() {
  // 살아 있는 빌드는 활성 슬롯의 것이다. 저장할 때 같이 적어 둬야
  // 새로고침한 뒤에도 손댄 것이 남는다.
  captureActive();
  localStorage.setItem(CHARACTER_KEY, JSON.stringify(app.character));
  localStorage.setItem(SEARCH_KEY, JSON.stringify(app.search));
  persistSlots();
}

// --- 캐릭터 불러오기 ---------------------------------------------------------
//
// API가 주는 것과 이 계산기가 들고 있는 것이 일대일로 맞지 않는다. 그래서
// 통째로 갈아끼우지 않고 갈래별로 고르게 한다 — 손으로 맞춰 둔 것을 덮어쓰면
// 무엇이 어디서 왔는지 알 수 없게 된다.

export const IMPORT_SECTIONS = [
  { key: "nodes", label: "진화 노드" },
  { key: "awakening", label: "깨달음 · 도약" },
  { key: "engravings", label: "각인" },
  // 진화 배분을 가장 크게 바꾸는 값이라 따로 세운다. 손으로 넣던 것이고,
  // 12배쯤 어긋나 있으면 탐색이 특화 노드를 아예 안 고른다.
  // 읽어서 보여만 준다. 세팅에는 안 넣으므로 고를 것도 없다.
  { key: "specDamage", label: "특화 효율" },
  { key: "attack", label: "공격력" },
  { key: "accessories", label: "악세서리 연마" },
  { key: "bracelet", label: "팔찌" },
  { key: "arkGrid", label: "아크 그리드" },
  { key: "weapon", label: "무기 품질" },
  { key: "jewel", label: "보석 쿨감" },
  { key: "karma", label: "카르마" },
  { key: "stats", label: "전투 특성" },
];

const COLLECTION_STAT_KEYS = ["critStat", "specStat", "swiftStat"];

// 1T 특화를 이만큼 넘게 찍고 왔으면 '특화 30 고정'을 권한다.
const TIER1_SPEC_NODE = "e1-spec";
const SPEC_NUDGE_FLOOR = 20;
const TIER1_SPEC_TARGET = 30;

// --- 파티 시너지 ------------------------------------------------------------
//
// 한 줄이 한 사람이다. 내 줄은 직업과 깨달음이 정하므로 고칠 것이 가동율뿐이고,
// 나머지 줄은 직업 · 갈래 · 가동율을 손으로 적는다.

const readSynergy = () => ({
  rows: [...(app.character.synergy?.rows ?? [])],
  ownUptime: { ...(app.character.synergy?.ownUptime ?? {}) },
});

function writeSynergy(next) {
  app.character.synergy = next;
  persist();
}

/** 줄을 하나 더한다. 흔한 갈래가 미리 켜진 채로 들어온다. */
export function addSynergyRow(job) {
  const entry = getSynergyJob(job) ?? SYNERGY_JOBS[0];
  const synergy = readSynergy();
  synergy.rows.push({
    id: makeId(), job: entry.job,
    nodes: defaultSynergyNodes(entry.job),
    uptime: {},
  });
  writeSynergy(synergy);
}

export function removeSynergyRow(id) {
  const synergy = readSynergy();
  synergy.rows = synergy.rows.filter(row => row.id !== id);
  writeSynergy(synergy);
}

/** 직업을 바꾸면 갈래는 새 직업의 기본값으로 갈아엎는다. 남기면 안 맞는다. */
export function setSynergyRowJob(id, job) {
  const entry = getSynergyJob(job);
  if (!entry) return;
  const synergy = readSynergy();
  synergy.rows = synergy.rows.map(row => (row.id === id
    ? { ...row, job: entry.job, nodes: defaultSynergyNodes(entry.job), uptime: {} }
    : row));
  writeSynergy(synergy);
}

/**
 * 갈래 하나를 켜고 끈다.
 *
 * 같은 묶음 안의 다른 갈래는 자동으로 꺼진다 — 게임에서 서로 배타라 둘 다
 * 찍을 수 없다. 켜져 있던 것을 다시 누르면 아무것도 안 고른 상태가 된다.
 */
export function toggleSynergyChoice(id, node) {
  const synergy = readSynergy();
  synergy.rows = synergy.rows.map(row => {
    if (row.id !== id) return row;
    const entry = getSynergyJob(row.job);
    const found = findSynergyChoice(entry, node);
    if (!found) return row;
    const others = (row.nodes ?? []).filter(name => !found.group.choices.some(choice => choice.node === name));
    const on = (row.nodes ?? []).includes(node);
    return { ...row, nodes: on ? others : [...others, node] };
  });
  writeSynergy(synergy);
}

/**
 * 버프마다의 가동율. 내 줄은 id가 "own", 직업이 그냥 주는 몫은 node가 ""다.
 *
 * 한 줄 안에서도 버프마다 다르다 — 파티의 기상술사는 치명타 적중률을 늘
 * 주지만 질풍노도의 공이속은 껐다 켜서 잠깐만 준다.
 */
export function setSynergyUptime(id, node, value) {
  const synergy = readSynergy();
  const key = node ?? "";
  const amount = clamp(readNumber(value), 0, SYNERGY_UPTIME_FULL);
  const put = uptime => {
    const next = { ...uptime };
    if (amount === SYNERGY_UPTIME_FULL) delete next[key];
    else next[key] = amount;
    return next;
  };
  if (id === SYNERGY_OWN_ID) synergy.ownUptime = put(synergy.ownUptime);
  else synergy.rows = synergy.rows.map(row => (row.id === id ? { ...row, uptime: put(row.uptime) } : row));
  writeSynergy(synergy);
}

/** 탐색이 1T 특화를 30으로 못 박게 한다. 권유 문구에서 바로 켠다. */
export function enableSpecLock() {
  app.search.tier1SpecLock = true;
  persist();
}

// 불러오기가 남기는 것 — 캐릭터와 무관한 것만.
//
// 파티원, 그리고 진화 포인트 예산뿐이다. 계산 기준(특화 효율 · 딜 비중 ·
// 대난투 비중)도 전투 상황도 직업마다 다르므로 전부 기본값으로 되돌린다.
// 앞 캐릭터의 판단이 남아 조용히 딜에 들어가는 편이 더 나쁘다.
const IMPORT_KEEPS = state => ({
  settings: { ...cloneState(DEFAULT_STATE.settings), pointBudget: state.settings.pointBudget },
  // 내 줄은 새 캐릭터가 정한다. 남의 줄만 남긴다.
  synergy: { rows: cloneState(state.synergy?.rows ?? []), ownUptime: {} },
  selectedTier: state.selectedTier,
});

/**
 * 읽어 온 캐릭터로 세팅을 갈아엎는다.
 *
 * **덮어쓰기가 아니라 갈아엎기다.** 예전에는 지금 세팅 위에 읽은 것만 얹었는데,
 * 그러면 새 캐릭터에 없는 것이 남는다 — 팔찌, 아크 그리드, 도감, 무기 품질,
 * 진화 카르마가 앞 캐릭터 것 그대로 남아 조용히 딜에 들어갔다. 어디가 남은
 * 건지 화면만 봐서는 알 수가 없다.
 *
 * 그래서 기본값에서 시작해 읽은 것만 채운다. 안 고른 갈래는 남는 게 아니라
 * 빈다 — 불러오기 화면이 그렇게 적어 둔다.
 *
 * 전투 특성이 까다롭다. API는 합계 하나를 주는데 이 계산기는 출처별로 나눠
 * 들고 있다 — 1T 노드, 팔찌, 펫, 도감·물약. 합계를 그대로 넣으면 노드 몫이
 * 두 번 세어지고, 탐색이 노드를 바꿔도 특성이 안 따라온다.
 *
 * 그래서 노드·팔찌·펫을 먼저 얹고, 그것들이 만들어 낸 특성을 한 번 계산한 뒤,
 * 합계에서 뺀 나머지를 도감·물약 칸에 넣는다. 그 뺄셈은 화면이 그대로 보여준다.
 */
function buildCharacter(read, picks) {
  const keep = IMPORT_KEEPS(app.character);
  const next = { ...cloneState(DEFAULT_STATE), ...keep };
  const changed = [];

  if (picks.nodes) {
    next.nodeLevels = normalizeNodeLevels(read.nodeLevels);
    changed.push(`노드 ${Object.values(next.nodeLevels).filter(level => level > 0).length}개`);
  }
  // 카르마도 같이 온다 — ArkPassive.Points의 Description에 "6랭크 26레벨"로.
  // 진화 랭크는 진화형 피해로, 깨달음 레벨은 무기 공격력으로 간다.
  // 도약은 포인트만 주므로 안 읽는다.
  if (picks.karma && read.karma) {
    const evolution = clamp(Math.round(readNumber(read.karma["진화"]?.rank)), 0, 6);
    const awakeningLevel = Math.max(0, Math.round(readNumber(read.karma["깨달음"]?.level)));
    if (evolution > 0 || awakeningLevel > 0) {
      next.convenience = {
        ...next.convenience,
        evolutionKarmaRank: evolution,
        awakeningKarmaLevel: awakeningLevel,
      };
      changed.push(`카르마 진화 ${evolution}랭크 · 깨달음 ${awakeningLevel}레벨`);
    }
  }
  if (picks.awakening && read.awakening?.job) {
    next.awakening = { job: read.awakening.job, nodeLevels: { ...read.awakening.nodeLevels } };
    const count = Object.keys(next.awakening.nodeLevels).length;
    if (count > 0) changed.push(`깨달음 · 도약 ${count}개`);
  }
  if (picks.engravings) {
    next.engravings = { ...read.engravings };
    // 어빌리티 스톤이 얹은 레벨. 단계와 따로 들고 있어야 탐색이 각인을
    // 갈아끼울 때 돌 몫이 엉뚱한 각인을 따라다니지 않는다.
    next.engravingStones = { ...(read.engravingStones ?? {}) };
    const stoned = Object.keys(next.engravingStones).length;
    changed.push(`각인 ${Object.keys(next.engravings).length}종${stoned > 0 ? ` · 돌 ${stoned}개` : ""}`);
  }
  // 특화 효율은 읽어서 보여만 주고 세팅에는 안 넣는다.
  //
  // 게임이 알려 주는 값은 스킬군마다 다른데, 어느 것을 쓸지는 딜 비중을 알아야
  // 정해진다. 그런데 딜 비중을 정하려면 딜을 알아야 하니 순환이다. 잘못 넣으면
  // 1T 특화의 가치가 통째로 어긋나므로, 손으로 넣을 때까지 건드리지 않는다.
  if (picks.attack) {
    // 읽은 것을 통째로 옮긴다.
    //
    // 예전에는 weaponAttack·mainStat 두 칸만 베꼈는데, 그 둘은 손입력용 대체
    // 칸이라 불러오기가 읽는 값이 아니다(둘 다 0으로 온다). 정작 필요한
    // weaponFlat · mainFlat · avatars · baseAttackPower가 전부 버려져서,
    // 아바타를 8% 읽어 놓고도 화면에는 0%가 떴다.
    next.attack = { ...next.attack, ...read.attack };
    changed.push(`무공 ${readNumber(read.attack.weaponFlat).toLocaleString("ko-KR")} · 힘민지 ${readNumber(read.attack.mainFlat).toLocaleString("ko-KR")}`);
    if (readNumber(read.attack.avatarPercent) > 0) changed.push(`아바타 ${read.attack.avatarPercent}%`);
  }
  if (picks.accessories) {
    next.accessories = cloneState(read.accessories);
    changed.push("악세서리 연마");
  }
  if (picks.bracelet && read.braceletStats) {
    // 기본값에서 시작하므로 병합하지 않는다. 앞 캐릭터의 팔찌가 남으면
    // 특성이 두 번 세어지고, 어디서 온 값인지 화면으로는 알 수 없다.
    next.bracelet = {
      stats: { ...cloneState(DEFAULT_STATE.bracelet.stats), ...read.braceletStats },
      mainStat: readNumber(read.braceletMainStat),
      effects: { ...cloneState(DEFAULT_STATE.bracelet.effects), ...(read.braceletEffects ?? {}) },
    };
    changed.push("팔찌 특성");
  }
  if (picks.arkGrid) {
    // 코어와 젬 레벨이 통째로 들어온다. 젬은 레벨이 원본이고 퍼센트는 파생이라
    // 레벨만 저장한다 — 예전에는 퍼센트를 직접 입력 효과로 밀어 넣어서
    // 레벨을 되돌려 고칠 방법이 없었다.
    next.arkGrid = cloneState(read.arkGrid);
    next.baseEffects = next.baseEffects.filter(effect => !String(effect.id).startsWith("grid-"));
    changed.push("아크 그리드");
  }
  // 직접 입력 효과도 기본값에서 시작한다. 손으로 적어 둔 줄은 대개 불러오기가
  // 채워 줄 것을 미리 메워 둔 것이라, 남기면 카드도 각인도 두 번 세어진다.
  const wiped = app.character.baseEffects?.length ?? 0;
  next.baseEffects = [];
  if (wiped > 0) changed.push(`직접 입력 효과 ${wiped}줄 비움`);

  if (picks.specDamage && readNumber(read.specEfficiency?.best?.per100) > 0) {
    next.base = { ...next.base, specDamagePer100: readNumber(read.specEfficiency.best.per100) };
    changed.push(`특화 효율 ${next.base.specDamagePer100}%/100`);
  }
  if (picks.jewel && read.jewel) {
    next.jewel = { ...next.jewel, cooldown: read.jewel.percent };
    changed.push(`보석 쿨감 ${read.jewel.percent}%`);
  }
  if (picks.weapon && read.weaponQuality !== null && read.weaponQuality !== undefined) {
    next.weapon = { ...next.weapon, quality: read.weaponQuality };
    changed.push(`무기 품질 ${read.weaponQuality}`);
  }

  // 특성은 맨 뒤다. 노드와 팔찌가 자리를 잡은 다음이라야 뺄셈이 맞는다.
  let statLines = [];
  if (picks.stats && read.profile?.combat) {
    // 도감·물약과 펫을 비운 상태로 재서, 지금 세팅이 스스로 만들어 내는 몫을 구한다.
    const probe = mergeState(DEFAULT_STATE, {
      ...next,
      convenience: { ...next.convenience, petStat: "none" },
      collection: { ...next.collection, critStat: 0, specStat: 0, swiftStat: 0 },
    });
    const owned = calculateMetrics(probe).totalStats;
    const split = splitCollectionStats(
      read.profile.combat,
      owned,
      key => COLLECTION_STAT_KEYS.includes(key),
      ARC_PASSIVE_CONSTANTS.petStatBonus,
    );

    for (const line of split.lines) {
      // 제압·인내·숙련은 도감 칸이 없다. 식에서만 쓰이므로 시작값에 둔다.
      if (line.collection) next.collection[line.key] = Math.max(0, line.rest);
      else next.base[line.key] = line.total;
    }
    if (split.petStat) next.convenience = { ...next.convenience, petStat: split.petStat };
    statLines = split.lines;
    changed.push(`전투 특성 ${statLines.length}종`);
  }

  // 1T 특화를 20레벨 넘게 찍고 온 캐릭터는 '특화 30 고정'을 쓰는 편이 낫다.
  //
  // 특화 효율을 안 넣기로 했으므로 탐색은 특화의 값을 낮게 본다. 이미 특화를
  // 깊게 찍은 사람에게는 그게 답이 아니다 — 개발진이 특화 30을 하나의 축으로
  // 놓고 설계했고, 실제 빌드도 거기 몰려 있다.
  // 켜졌는지는 여기서 담지 않는다 — 스냅샷을 들고 있으면 단추를 눌러도
  // 문구가 그대로 남는다. 화면이 app.search를 직접 읽는다.
  const specLevel = readNumber(next.nodeLevels?.[TIER1_SPEC_NODE]);
  const specNudge = picks.nodes && specLevel > SPEC_NUDGE_FLOOR
    ? { level: specLevel, target: TIER1_SPEC_TARGET }
    : null;

  return { next, changed, statLines, specNudge, stale: staleStats(statLines) };
}

/**
 * API가 서로 다른 시점의 데이터를 섞어 준 것을 알아본다.
 *
 * 게임에 접속한 채로 조회하면 노드는 옛것, 전투 특성은 바꾼 것이 오는 일이
 * 있다. 그러면 노드·팔찌가 만들어 내는 특성이 캐릭터 합계보다 커져서, 도감
 * 몫이 음수가 된다 — 있을 수 없는 값이다.
 *
 * 이걸 그대로 적용하면 특성이 통째로 어긋난 빌드가 조용히 만들어진다.
 */
function staleStats(statLines) {
  const bad = statLines.filter(line => line.rest < 0);
  if (bad.length === 0) return null;
  return { keys: bad.map(line => line.key), lines: bad };
}

/** 각인 탐색 설정을 기본값으로. 역할은 레이드 기본, 단계는 전부 유물이다. */
function resetEngravingSearch() {
  app.search.engravingRoles = {};
  app.search.engravingTiers = {};
}

/** 적용하지 않고 결과만 본다. 불러오기 화면이 막을지 말지 여기서 정한다. */
export function previewCharacter(read, picks) {
  return buildCharacter(read, picks);
}

export function applyCharacter(read, picks, force) {
  const built = buildCharacter(read, picks);
  // 어긋난 데이터는 기본적으로 막는다. 다만 팔찌를 못 읽어서 음수가 나는
  // 경우도 있어서, 사용자가 알고 밀어붙이는 길은 남긴다.
  if (built.stale && !force) return { ...built, applied: false };

  // 특화 묶음은 직업 지식이다. 같은 직업을 다시 불러오면 남기고,
  // 직업이 바뀌면 비운다 — 남의 직업 비중이 남으면 조용히 거짓말이 된다.
  const sameJob = readNumber(built.next.awakening?.job) > 0
    && readNumber(built.next.awakening?.job) === readNumber(app.character.awakening?.job);
  const keptBundles = sameJob ? cloneState(app.character.specBundles ?? []) : [];

  app.character = migrate(mergeState(DEFAULT_STATE, built.next));
  if (keptBundles.length > 0) {
    app.character.specBundles = keptBundles;
    // 묶음이 있으면 옛 특화 효율 칸은 물러난다 — 같은 것을 두 번 세면 안 된다.
    app.character.base.specDamagePer100 = 0;
  }
  // 불러온 캐릭터도 갈래를 이미 타고 있다. 백헤드·특화 기본값을 같이 얹는다.
  applyBranchDefaults(app.character.awakening?.job ?? 0, app.character.awakening?.nodeLevels ?? {});
  resetEngravingSearch();
  app.results = null;
  app.selectedId = null;
  // 슬롯도 새 캐릭터의 것으로 갈아엎는다. 앞 캐릭터의 배분이 남아 있으면
  // 직업이 달라도 노드가 그대로 남아 비교표가 거짓말을 한다.
  const slot = makeSlot("인게임", "ingame", currentBuild());
  app.slots = [slot];
  app.activeSlotId = slot.id;
  app.baseSlotId = slot.id;
  persist();
  return { ...built, applied: true };
}

// --- 저장된 세팅 ------------------------------------------------------------
// 파일 내보내기/불러오기는 남겨 둔다. 다른 기기로 옮길 때는 그게 맞다.
// 여기 있는 건 "이 브라우저에서 자주 갈아끼우는 것" — 부캐, 실험용 세팅 같은.

function persistSaves() {
  localStorage.setItem(SAVES_KEY, JSON.stringify(app.saves));
}

/** 한 줄로 요약 — 목록에서 무엇이 담겼는지 알아볼 수 있게. */
export function describeSave(save) {
  const metrics = calculateMetrics(save.character);
  return `한 방 ${Math.round(metrics.damageIndex).toLocaleString("ko-KR")} · DPS ${Math.round(metrics.dpsIndex).toLocaleString("ko-KR")}`;
}

export function saveSetup(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;

  // 손대는 중인 빌드를 활성 슬롯에 먼저 적어야 그것까지 같이 저장된다.
  captureActive();
  const entry = {
    id: makeId(),
    name: trimmed,
    savedAt: new Date().toISOString(),
    character: cloneState(app.character),
    search: cloneState(app.search),
    slots: cloneState(app.slots),
    activeSlotId: app.activeSlotId,
    baseSlotId: app.baseSlotId,
  };

  // 같은 이름이면 덮어쓴다. 목록에 같은 이름이 둘 쌓이면 고를 수가 없다.
  const at = app.saves.findIndex(item => item.name === trimmed);
  if (at >= 0) app.saves[at] = { ...entry, id: app.saves[at].id };
  else app.saves.unshift(entry);

  persistSaves();
  return entry;
}

export function loadSetup(id) {
  const save = app.saves.find(item => item.id === id);
  if (!save) return false;
  app.character = migrate(mergeState(DEFAULT_STATE, cloneState(save.character)));
  app.search = migrateSearch(cloneState(save.search ?? {}));
  app.results = null;
  app.selectedId = null;
  // 캐릭터를 통째로 갈아끼우므로 슬롯도 그 캐릭터의 것으로 간다.
  // 옛 저장본에는 슬롯이 없다 — 그때는 불러온 빌드로 하나 만든다.
  const slots = (save.slots ?? []).filter(item => item && item.id);
  if (slots.length > 0) {
    app.slots = cloneState(slots);
    app.activeSlotId = app.slots.some(item => item.id === save.activeSlotId) ? save.activeSlotId : app.slots[0].id;
    app.baseSlotId = app.slots.some(item => item.id === save.baseSlotId) ? save.baseSlotId : app.slots[0].id;
    loadBuild(app.slots.find(item => item.id === app.activeSlotId).build);
  } else {
    const slot = makeSlot(save.name, "manual", currentBuild());
    app.slots = [slot];
    app.activeSlotId = slot.id;
    app.baseSlotId = slot.id;
  }
  persist();
  return true;
}

export function renameSetup(id, name) {
  const trimmed = String(name ?? "").trim();
  const save = app.saves.find(item => item.id === id);
  if (!save || !trimmed) return false;
  save.name = trimmed;
  persistSaves();
  return true;
}

export function deleteSetup(id) {
  const at = app.saves.findIndex(item => item.id === id);
  if (at < 0) return false;
  app.saves.splice(at, 1);
  persistSaves();
  return true;
}

// currentMetrics / baselineMetrics가 여기 있었다. 둘 다 부르는 곳이 없었고,
// 특히 baselineMetrics는 '노드가 전부 0인 상태'라는 뜻이어서 위쪽 비교 기준의
// baseline과 같은 낱말로 다른 것을 가리키고 있었다. 한 파일에 그런 낱말이
// 둘 있으면 언젠가 잘못 부른다.

export function resetSection(section) {
  if (section === "situation") {
    app.character.settings.backAttack = DEFAULT_STATE.settings.backAttack;
    app.character.settings.headAttack = DEFAULT_STATE.settings.headAttack;
    app.character.convenience.goddessBlessing = DEFAULT_STATE.convenience.goddessBlessing;
    app.character.convenience.feast = DEFAULT_STATE.convenience.feast;
  } else if (section === "criteria") {
    app.character.base.specDamagePer100 = DEFAULT_STATE.base.specDamagePer100;
    app.character.convenience.damageMix = {
      manaCooldown: 100, plainCooldown: 0, identityPlain: 0, identityMana: 0, feederMana: true,
    };
  } else if (section === "searchScope") {
    app.search.engravingSlots = SEARCH_DEFAULTS.engravingSlots;
    app.search.engravingRoles = {};
    app.search.engravingTiers = {};
    app.search.tier1Mode = SEARCH_DEFAULTS.tier1Mode;
    app.search.petRoles = { ...SEARCH_DEFAULTS.petRoles };
    app.search.foodRoles = { ...SEARCH_DEFAULTS.foodRoles };
    app.search.excludedNodes = [];
    app.search.floors = normalizeSearchFloors(SEARCH_DEFAULTS.floors);
    app.search.ceilings = normalizeSearchCeilings(SEARCH_DEFAULTS.ceilings);
  } else if (section === "accessories") {
    app.character.accessories = cloneState(DEFAULT_STATE.accessories);
  } else if (section === "bracelet") {
    app.character.bracelet = cloneState(DEFAULT_STATE.bracelet);
  } else if (section === "gear") {
    app.character.weapon = cloneState(DEFAULT_STATE.weapon);
    app.character.collection = cloneState(DEFAULT_STATE.collection);
  } else if (section === "attack") {
    app.character.attack = cloneState(DEFAULT_STATE.attack);
  } else if (section === "karma") {
    app.character.convenience.evolutionKarmaRank = DEFAULT_STATE.convenience.evolutionKarmaRank;
  } else if (section === "arkGrid") {
    app.character.arkGrid = cloneState(DEFAULT_STATE.arkGrid);
  } else if (section === "synergy") {
    // 내 줄은 직업과 깨달음이 정하므로 지울 것이 없다. 적어 넣은 줄만 비운다.
    app.character.synergy = { rows: [], ownUptime: {} };
  } else if (section === "baseEffects") {
    app.character.baseEffects = DEFAULT_STATE.baseEffects.map(effect => ({ ...cloneState(effect), id: makeId() }));
  } else if (section === "nodes") {
    app.character.nodeLevels = emptyNodeLevels();
  } else if (section === "awakening") {
    // 직업은 남긴다. 배분만 비운다 — 직업을 지우면 트리 자체가 사라져서
    // '비우기'가 아니라 '없애기'가 된다.
    app.character.awakening = { ...app.character.awakening, nodeLevels: {} };
  }
  persist();
}

// --- 깨달음 · 도약 ------------------------------------------------------------
//
// 규칙(선행·배타·관문)은 코어가 상한으로 돌려준다. 여기서는 그 상한 안으로
// 자르기만 한다. 예산 초과는 막지 않는다 — 진화 노드판과 같은 규칙이다.
export function setAwakeningLevel(nodeId, level) {
  const job = app.character.awakening?.job ?? 0;
  if (!job) return;
  const { max } = awakeningHeadroom(job, app.character.awakening.nodeLevels, nodeId);
  const current = readNumber(app.character.awakening.nodeLevels?.[nodeId]);
  // 이미 상한을 넘겨 저장된 배분이라면 내리는 것은 막지 않는다.
  const ceiling = Math.max(max, level < current ? current : 0);
  const next = clamp(Math.round(level), 0, ceiling);
  if (next === current) return;

  const levels = { ...app.character.awakening.nodeLevels };
  if (next === 0) delete levels[nodeId];
  else levels[nodeId] = next;

  // 내리면 뒤에 딸린 노드가 선행을 잃는다. 조용히 두면 게임에 없는 배분이 남는다.
  for (const name of awakeningDependents(job, app.character.awakening.nodeLevels, nodeId, next)) {
    delete levels[name];
  }

  app.character.awakening = { ...app.character.awakening, nodeLevels: levels };
  // 방금 찍은 것이 1티어 갈래면 그 갈래의 성격을 사전 세팅에 얹는다.
  if (next > 0 && jobBranches(job).some(branch => branch.node === nodeId)) {
    applyBranchDefaults(job, levels);
  }
  persist();
}

/**
 * 갈래가 정한 기본값.
 *
 * 직업 관리 툴에서 갈래마다 주력 특성(특화·치신)과 공격 방향(백·헤드·타대)을
 * 적어 둔다. 갈래를 찍는 순간 그걸 세팅에 옮긴다 —
 *   방향  → 2페이지 공격 방향 체크박스
 *   특화  → 탐색 설정의 1T 특화 30 고정
 *
 * 한 번 옮겨 주는 기본값이지 자물쇠가 아니다. 이후 체크박스는 유저 손이 이긴다.
 * 툴에서 안 정한 갈래(빈 문자열)는 아무것도 안 건드린다.
 */
function applyBranchDefaults(job, nodeLevels) {
  const branch = takenBranch(job, nodeLevels);
  if (!branch) return;
  if (branch.direction) {
    app.character.settings.backAttack = branch.direction === "back";
    app.character.settings.headAttack = branch.direction === "head";
  }
  if (branch.stat) {
    app.search.tier1SpecLock = branch.stat === "spec";
  }
}

export function bumpAwakening(nodeId, direction, large = false) {
  const nodes = getAwakeningNodes(app.character.awakening?.job ?? 0);
  const item = nodes.find(node => node.id === nodeId);
  if (!item) return;
  const step = large ? item.maxLevel : 1;
  const current = readNumber(app.character.awakening.nodeLevels?.[nodeId]);
  setAwakeningLevel(nodeId, current + direction * step);
}

// --- 노드 고정 --------------------------------------------------------------
//
// 화면에서는 개념이 하나다: "이 레벨로 못 박는다". 레벨이 0이면 그게 제외다 —
// 탐색 입장에서 '0으로 고정'과 '후보에서 뺌'은 같은 말이다.
//
// 안에서는 둘로 나뉜다. 0은 excludedNodes로, 1 이상은 lockedNodes로 간다.
// 탐색 코드가 이미 그 두 갈래로 검증돼 있어서 굳이 합칠 이유가 없다.
//
// 고정 레벨은 빌드와 아무 관계가 없다. 예전에는 '지금 찍혀 있는 레벨로' 못
// 박았는데, 그러면 슬롯을 갈아끼울 때마다 탐색 규칙이 같이 흔들렸다. 규칙은
// 규칙대로 서 있어야 해서, 레벨을 여기에 직접 적어 둔다.

/**
 * 이 노드가 고정돼 있나. 0 고정(제외)도 고정이다.
 *
 * `Object.hasOwn`으로 물으면 안 된다 — Svelte의 $state 프록시는 속성을 읽을 때
 * 의존성을 잡는데 hasOwn은 그 통로를 안 지나서, 값이 바뀌어도 화면이 안 따라온다.
 * 실제로 자물쇠를 눌러도 테두리가 그대로였다.
 */
export function isNodeLocked(nodeId) {
  return app.search.excludedNodes.includes(nodeId)
    || app.search.lockedNodes?.[nodeId] !== undefined;
}

/** 고정 레벨. 안 고정했으면 null, 0이면 제외. */
export function nodeLockLevel(nodeId) {
  if (app.search.excludedNodes.includes(nodeId)) return 0;
  const level = app.search.lockedNodes?.[nodeId];
  return level === undefined ? null : readNumber(level);
}

/** 이 레벨로 못 박는다. 0은 제외와 같은 말이다. */
export function setNodeLock(nodeId, level) {
  if (!app.search.lockedNodes) app.search.lockedNodes = {};
  const next = Math.max(0, Math.round(readNumber(level)));
  const at = app.search.excludedNodes.indexOf(nodeId);
  if (next > 0) {
    if (at >= 0) app.search.excludedNodes.splice(at, 1);
    app.search.lockedNodes[nodeId] = next;
  } else {
    delete app.search.lockedNodes[nodeId];
    if (at < 0) app.search.excludedNodes.push(nodeId);
  }
  persist();
}

/** 고정을 푼다 — 탐색이 다시 굴린다. */
export function clearNodeLock(nodeId) {
  if (app.search.lockedNodes) delete app.search.lockedNodes[nodeId];
  const at = app.search.excludedNodes.indexOf(nodeId);
  if (at >= 0) app.search.excludedNodes.splice(at, 1);
  persist();
}

/** 고정을 전부 푼다. */
export function clearNodeLocks() {
  app.search.lockedNodes = {};
  app.search.excludedNodes = [];
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
  // 돌리는 순간 결과 화면으로 넘어간다. 진행 막대가 거기 있고,
  // 설정 화면에 남아 있으면 다 돌 때까지 아무 일도 안 일어난 것처럼 보인다.
  goPage(PAGE.results);

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
    app.status = `고정한 각인이 ${result.plan.engravings.locked.length}개인데 슬롯은 ${result.plan.engravings.slots}개뿐입니다. 슬롯을 늘리거나 고정을 줄여 주세요.`;
    return;
  }

  app.results = { ...result, baseline: calculateMetrics(app.character) };

  // 하한을 걸어 두고 결과가 비면 원인이 그것뿐이다. 조합이 없다고만 적으면
  // 탐색이 실패한 줄 알게 되므로, 몇 개를 왜 버렸는지 그 자리에서 밝힌다.
  if (result.pareto.length === 0 && result.rejected > 0) {
    app.status = `하한을 넘긴 조합이 없습니다. 완성된 ${result.rejected.toLocaleString("ko-KR")}개가 전부 걸렸습니다.`;
    return;
  }

  const kept = `${result.exhaustive ? "전수" : "빔"} 탐색 완료 · ${result.evaluated.toLocaleString("ko-KR")}개 평가 · ${(result.elapsedMs / 1000).toFixed(1)}초`;
  app.status = result.rejected > 0
    ? `${kept} · 하한 미달 ${result.rejected.toLocaleString("ko-KR")}개 제외`
    : kept;
}

export function cancelSearch() {
  if (!app.running) return;
  runToken += 1;
  app.running = false;
  app.status = "탐색을 중지했습니다.";
}

// 곡선이나 표에서 고르는 것 — 여기서는 계기판 미리보기만 바뀐다.
export function previewResult(entry) {
  app.selectedId = entry?.id ?? null;
}

/**
 * 곡선에서 고른 지점을 슬롯에 담는다.
 *
 * 예전에는 지금 빌드를 덮어썼다. 그러면 곡선이 찾아 준 것과 손으로 만진 것이
 * 같은 자리에 겹쳐서, 조금 만지는 순간 원래 무엇이었는지 알 수 없게 된다.
 * 새 슬롯으로 담으면 원본이 그대로 남고 되돌리기가 산다.
 */
export function confirmResult(entry) {
  if (!entry) return;
  app.selectedId = entry.id;
  const slot = addSlot({
    name: nextSearchName(),
    origin: "search",
    build: stateFromResult(entry),
  });
  app.status = `'${slot.name}'로 담았습니다. 탐색 결과 자체는 안 바뀝니다.`;
  openDrawer();
}

// --- 비교함 담기 ------------------------------------------------------------
//
// 탐색 결과의 체크가 곧 담기다. 예전에는 줄을 고르고 하단 막대의 단추를
// 눌러야 했는데, 그러면 "지금 고른 것"과 "담은 것"이 다른 개념이 되어
// 여러 개를 견주려면 골랐다 담았다를 번갈아야 했다.
//
// 같은 빌드가 두 번 담기면 안 된다. 이름이 아니라 배분으로 견준다 — 이름은
// 유저가 바꾸고, 탐색 결과는 이름을 안 들고 있다.
function resultKey(build) {
  // 탐색 결과는 pet·food가 납작하게 붙어 있고, 슬롯은 convenience 안에 있다.
  const pet = build?.pet ?? build?.convenience?.petStat ?? "none";
  const food = build?.food ?? build?.convenience?.food ?? "none";
  return [
    Object.entries(normalizeNodeLevels(build?.nodeLevels ?? {})).map(([, v]) => v).join(","),
    pet || "none",
    food || "none",
    Object.entries(build?.engravings ?? {}).sort().map(([k, v]) => `${k}:${v}`).join(","),
  ].join("|");
}

/**
 * 탐색 결과 하나를 슬롯이 들 수 있는 꼴로.
 *
 * 결과가 정하는 것은 노드·각인·펫·음식뿐이다. 나머지(장비·팔찌·깨달음·자버프)는
 * 지금 캐릭터 것을 그대로 얹는다 — 탐색이 그 위에서 돌았으므로 그게 맞는 짝이다.
 */
function stateFromResult(entry) {
  const next = cloneState(app.character);
  next.nodeLevels = { ...entry.nodeLevels };
  next.engravings = { ...entry.engravings };
  next.convenience = { ...next.convenience, petStat: entry.pet || "none", food: entry.food || "none" };
  return next;
}

/** 이 후보가 이미 비교함에 있나. 있으면 그 슬롯. */
export function boxedSlot(entry) {
  if (!entry) return null;
  const key = resultKey(entry);
  return app.slots.find(slot => resultKey(slot.build) === key) ?? null;
}

/** 체크 = 담기, 체크 해제 = 빼기. */
export function toggleBoxed(entry) {
  if (!entry) return;
  const found = boxedSlot(entry);
  if (found) {
    // 마지막 하나는 못 뺀다 — 비교함이 비면 하단 막대가 사라진다.
    if (app.slots.length <= 1) {
      app.status = "비교함에 하나는 남아야 합니다.";
      return;
    }
    removeSlot(found.id);
    app.status = `'${found.name}'을 비교함에서 뺐습니다.`;
    return;
  }
  if (app.slots.length >= SLOT_LIMIT) {
    app.status = `비교함이 ${SLOT_LIMIT}개로 가득 찼습니다. 하나 빼고 담으세요.`;
    return;
  }
  const slot = addSlot({
    name: nextSearchName(),
    origin: "search",
    build: stateFromResult(entry),
    // 담자마자 화면이 그 빌드로 갈아타면 곡선에서 눈이 떨어진다. 담기만 한다.
    select: false,
  });
  app.status = `'${slot.name}'로 담았습니다.`;
}

export function currentSignature() {
  const controlled = app.results?.plan.engravings.controlledIds ?? [];
  return [
    Object.entries(normalizeNodeLevels(app.character.nodeLevels)).map(([, v]) => v).join(","),
    app.character.convenience.petStat || "none",
    app.character.convenience.food || "none",
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
  if (payload.search) app.search = migrateSearch(payload.search);
  app.results = null;
  persist();
}
