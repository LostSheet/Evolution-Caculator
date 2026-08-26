import { NODE_LIBRARY, ARC_PASSIVE_CONSTANTS } from "./core/data.js";
import { ENGRAVING_LIBRARY, ENGRAVING_TIERS } from "./core/engravings.js";
import {
  splitCollectionStats, searchAuction, LostArkError,
  AUCTION_CATEGORY, GRIND_FIRST_OPTION, GRIND_CODE, grindValueCode,
} from "./core/lostark.js";
import {
  ACCESSORY_PARTS, GRADES, comboQuery, readListing, listingKey, partSlots,
} from "./core/accessory.js";
import { getAwakeningNodes, awakeningHeadroom, awakeningDependents } from "./core/awakening.js";
import {
  SYNERGY_UPTIME_FULL, SYNERGY_OWN_ID, SYNERGY_JOBS,
  getSynergyJob, findSynergyChoice, defaultSynergyNodes,
  takenBranch, jobBranches, isGenericSynergyJob,
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
// 어느 축의 어느 탭을 보고 있었는지. 세팅이 아니라 화면 습관이라 따로 둔다.
const VIEW_KEY = "ark-passive-view-v1";
// 각인 후보(고정·후보·제외와 단계)를 캐릭터별로 기억한다.
//
// 이건 빌드가 아니라 탐색 규칙이라 app.character에 못 넣는다 — 넣으면 빌드를
// 맞바꿀 때마다 규칙이 같이 뒤집힌다. 그렇다고 하나로 두면 캐릭터를 갈아탈
// 때마다 앞 캐릭터의 후보가 그대로 남는데, 직업이 다르면 낄 수 없는 각인이다.
// 그래서 캐릭터 이름으로 색인한 별도 저장소를 둔다.
const ENGRAVING_SCOPE_KEY = "ark-passive-engraving-scope-v1";
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
// 지금 낀 악세의 알맹이. 세팅이 아니라 '이 캐릭터가 실제로 끼고 있는 것'이라
// 따로 둔다 — 저장된 세팅을 갈아끼워도 뺄셈의 기준은 인게임이어야 한다.
const WORN_KEY = "ark-passive-worn-v1";
// 경매장 화면에서 마지막으로 보던 부위와 등급. 매물은 안 담는다 — 시세다.
const MARKET_KEY = "ark-passive-market-v2";

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
/**
 * 화면은 둘이다 — 고치는 곳과 굴리는 곳.
 *
 * 예전에는 1~5 번호가 붙은 다섯 쪽이었다. 번호는 "순서대로 하세요"라고
 * 말하는데, 실제 사용은 1→5로 흐르지 않는다. 빌드를 만지고 탐색을 돌리고 다시
 * 빌드로 돌아오는 왕복이라, 축이 둘인 편이 그 왕복을 그대로 담는다.
 *
 * 안쪽 하위 탭은 각 축의 부위다. 빌드 쪽 셋은 전부 "내 빌드를 고친다"로
 * 성격이 같고, 탐색 쪽 둘은 "규칙을 걸고 답을 읽는다"로 같다.
 */
export const PAGES = [
  {
    n: 1, key: "build", label: "빌드",
    tabs: [
      { key: "setup", label: "사전 세팅" },
      { key: "awakening", label: "깨달음" },
      { key: "nodes", label: "진화 노드" },
    ],
  },
  {
    n: 2, key: "search", label: "탐색",
    tabs: [
      { key: "rules", label: "설정" },
      { key: "results", label: "결과" },
    ],
  },
  // 셋째 축은 성격이 다르다. 앞 둘은 가진 것을 어떻게 나눌지 묻고, 이쪽은
  // 무엇을 살지 묻는다 — 답의 단위가 포인트가 아니라 골드다.
  {
    n: 3, key: "market", label: "악세",
    tabs: [{ key: "market", label: "경매장" }],
  },
];

/** 각 축에서 마지막으로 보던 하위 탭. 왕복할 때 자리를 기억한다. */
export const PAGE_TABS = { build: "setup", search: "rules", market: "market" };

export const PAGE = Object.fromEntries(PAGES.map(page => [page.key, page.n]));

/** 하위 탭 이름 → 그 탭이 속한 축. 옛 페이지 이름으로 부르는 곳이 있다. */
export const TAB_PAGE = Object.fromEntries(
  PAGES.flatMap(page => page.tabs.map(tab => [tab.key, page.n])),
);

/** 축과 하위 탭을 한 번에 옮긴다. 탭 이름만 줘도 축이 따라온다. */
export function goTab(key) {
  const n = TAB_PAGE[key];
  if (!n) return;
  const page = PAGES.find(item => item.n === n);
  app.tabs[page.key] = key;
  app.page = n;
  persistView();
}

// 세팅을 먼저 세운다 — 탐색 규칙의 옛 스위치를 옮기려면 지금 무엇을 쓰는지
// 알아야 한다(migrateSearch 참고).
const bootCharacter = migrate(mergeState(DEFAULT_STATE, load(CHARACTER_KEY, {})));

export const app = $state({
  character: bootCharacter,
  search: migrateSearch(load(SEARCH_KEY, {}), bootCharacter),
  // 이름 붙여 저장해 둔 세팅들. 파일 내보내기와 달리 한 번에 갈아끼운다.
  saves: loadSaves(),
  page: PAGE.build,
  // 축마다 마지막으로 보던 하위 탭. 왕복할 때 자리를 기억한다.
  tabs: { ...PAGE_TABS, ...(load(VIEW_KEY, {}).tabs ?? {}) },
  results: null,
  running: false,
  progress: { phase: "", progress: 0, evaluated: 0 },
  status: "아직 탐색하지 않았습니다.",
  selectedId: null,
  // 지금 견주는 하나. { kind: "result" | "tile", id }.
  // 표 줄이든 곡선 점이든 담아 둔 타일이든, 고르면 전부 이 자리로 온다 —
  // 비교는 언제나 '닻 대 초점' 하나뿐이라 화살표가 둘로 갈리지 않는다.
  focus: null,
  view: "pareto",
  // 균형 곡선의 두 축. 무엇을 팔아 무엇을 사는지 직접 고른다.
  chartX: "dpsIndex",
  chartY: "damageIndex",
  // 내 빌드의 이름. 맞바꾸기를 하면 빌드와 함께 자리를 옮긴다.
  buildName: "내 빌드",
  // 지금 보고 있는 캐릭터. 각인 후보를 이 이름으로 색인한다.
  characterName: "",
  // 얼려 둔 비교 대상들. 편집되지 않고 내 빌드 대비 ±%만 든다.
  compare: [],
  // 빌드 서랍. 평소엔 숨어 있고 하단 막대가 손잡이다.
  // resultId가 있으면 탐색 결과를 읽기 전용으로 띄운 것이다.
  drawer: { open: false },
  // 접어 둔 카드. 규칙은 하나다 — 1페이지의 카드는 전부 접을 수 있고,
  // 처음에는 전부 펴져 있고, 접은 것은 기억된다.
  folds: load(FOLDS_KEY, {}),
  // 이름 붙인 각인 슬롯. 원정대 하나가 슬롯 하나다.
  engravingRoster: loadRoster(),
  theme: loadTheme(),
  // 지금 낀 악세의 주스탯과 평면. 등급만으로는 매물과 뺄셈이 안 된다 —
  // 같은 상상 반지라도 주스탯이 1,500 다르면 답이 갈린다.
  worn: load(WORN_KEY, null),
  // 경매장. 부위 하나를 골라 연마 조합 열여섯 가지를 훑고, 나온 매물을
  // 한 목록으로 합쳐 골드당으로 세운다.
  market: {
    ...{ part: "rings", grade: "고대", quality: 70, sort: "perGold", cellView: "median" },
    ...load(MARKET_KEY, {}),
    // 부위마다 따로 담는다 — 부위를 바꿨다고 앞서 훑은 것을 버릴 이유가 없다.
    found: { necklace: null, rings: null },
    // 목록을 좁히는 연마 조건. 각 갈래가 high/mid/low/none/any.
    filter: ["any", "any"],
    running: false,
    done: 0,
    error: "",
  },
  // 로스트아크 API. 키는 이 브라우저에만 남는다 — 서버를 거치지 않는다.
  api: {
    key: loadApiKey(),
    characterName: "",
  },
});


/** auto → light → dark → auto. 한 단추로 도는 게 세 갈래 메뉴보다 빠르다. */
/** 이 카드가 펴져 있나. 처음 보는 카드는 펴 둔다. */
/**
 * 이 카드가 펴져 있나.
 *
 * 기본값은 카드마다 다르다 — 1페이지는 전부 펴 두고 시작하지만, 탐색 설정의
 * 아래층은 접혀 있어야 위층 다섯 줄만 훑는 것이 성립한다.
 */
export function isOpen(key, fallback = true) {
  const at = app.folds[key];
  return at === undefined ? fallback : at !== false;
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

function persistView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ page: app.page, tabs: app.tabs }));
  } catch {
    // 저장이 막혀도 이번 세션은 그대로 굴러간다.
  }
  if (typeof window !== "undefined") window.scrollTo({ top: 0 });
}

export function goPage(page) {
  app.page = clamp(Math.round(page), 1, PAGES.length);
  // 결과는 저장하지 않으므로 새로고침 뒤의 '결과' 탭 기억은 빈 화면을 가리킨다.
  // 보여줄 결과가 없으면 설정에 내려 준다.
  if (app.page === PAGE.search && !app.results && app.tabs.search === "results") {
    app.tabs.search = "rules";
  }
  persistView();
}

/** 지금 축의 하위 탭을 옮긴다. */
export function setTab(key) {
  const page = PAGES.find(item => item.n === app.page);
  if (!page?.tabs.some(tab => tab.key === key)) return;
  app.tabs[page.key] = key;
  persistView();
}

/** 지금 보고 있는 하위 탭 이름. */
export function currentTab() {
  const page = PAGES.find(item => item.n === app.page);
  return page ? app.tabs[page.key] : "";
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

const COMPARE_LIMIT = 5;

/**
 * 내 빌드 하나, 그 옆에 얼린 것들.
 *
 * 예전에는 대등한 슬롯 여럿이 있고 그중 하나가 '활성', 다른 하나가 '기준'이었다.
 * 화살표가 둘이라 각인 하나를 만질 때마다 "지금 뭘 고치고 있나"를 확인해야 했고,
 * 읽기 전용 슬롯을 건드리면 사본이 튀어나왔다.
 *
 * 이제 중심은 하나다.
 *
 *   내 빌드   app.character. 페이지가 고치는 유일한 대상이자 증감의 기준.
 *   비교 대상 app.compare. 얼려 둔 스냅숏. 편집 안 되고 ±%만 든다.
 *
 * 대상을 편집하려면 '내 빌드로' 올린다. 그 순간 지금 내 빌드가 그 자리에
 * 얼려져 들어간다 — 맞바꾸기라 아무것도 안 사라진다.
 */
export function currentBuild() {
  return cloneState(app.character);
}

// 빠진 칸은 기본값으로 채운다. 옛 꼴이 들어와도 여기서 캐릭터 모양이 되므로
// 부르는 쪽이 형태를 안 따져도 된다.
function normalizeBuild(build) {
  return migrate(mergeState(DEFAULT_STATE, build ?? {}));
}

/** 얼린 빌드는 이미 완전한 상태다. 지금 캐릭터를 빌려 오지 않는다. */
export function buildState(build) {
  if (!build) return null;
  return normalizeBuild(build);
}

// --- 전제 -------------------------------------------------------------------
//
// 비교는 같은 전제 위에서만 뜻이 있다.
//
// 불러온 캐릭터는 실물 각인서를 낀다 — 전설 4단계가 섞여 있다. 그런데 탐색은
// 후보에게 전제 단계를 입혀 내놓는다. 전제가 실물보다 높으면 두 세계가 달라서,
// 아무 후보나 집어도 기준보다 세게 나온다. 그 증감은 빌드 차이가 아니라 각인서
// 차이를 재고 있는 것이라, 비교라는 행위 자체가 죽는다.
//
// 그래서 전제가 실물을 넘는 순간 실물은 증감 자격을 잃고, 같은 전제를 입은
// '내 배분'이 그 자리를 잇는다. 실물 숫자는 꼬리표로 남긴다 — 그 차이도
// "각인서를 올리면 이만큼"이라는 답이다.

/** 이 각인이 지금 전제로 쓰는 단계. 안 적었으면 탐색과 같은 기본값(맨 끝). */
function premiseTierIndex(id) {
  const index = getEngravingTierIndex(app.search.engravingTiers?.[id]);
  return index >= 0 ? index : ENGRAVING_TIERS.length - 1;
}

/** 낀 각인 중 하나라도 전제가 실물보다 높은가. */
export function premiseExceeded() {
  const worn = app.character.engravings ?? {};
  return ENGRAVING_LIBRARY.some(item => {
    const real = getEngravingTierIndex(worn[item.id]);
    if (real < 0) return false;
    return premiseTierIndex(item.id) > real;
  });
}

/**
 * 증감의 기준이 되는 상태.
 *
 * 전제를 안 넘으면 내 빌드 그대로다. 넘으면 낀 각인의 단계만 전제로 올린
 * 사본 — 배분도 각인 종류도 그대로라, 후보들과 정확히 같은 세계에 선다.
 */
export function anchorState() {
  if (!premiseExceeded()) return app.character;
  const next = cloneState(app.character);
  const worn = next.engravings ?? {};
  ENGRAVING_LIBRARY.forEach(item => {
    const real = getEngravingTierIndex(worn[item.id]);
    if (real < 0) return;
    const premise = premiseTierIndex(item.id);
    if (premise > real) worn[item.id] = ENGRAVING_TIERS[premise].value;
  });
  return next;
}

function persistCompare() {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify({ name: app.buildName, compare: app.compare }));
  } catch {
    // 저장이 막혀도 이번 세션은 그대로 굴러가야 한다.
  }
}

/** 이름이 겹치지 않게 뒤에 번호를 붙인다. 내 빌드 이름도 같이 센다. */
function freeName(base) {
  const taken = name => app.buildName === name || app.compare.some(item => item.name === name);
  if (!taken(base)) return base;
  for (let n = 2; n < 99; n += 1) {
    if (!taken(`${base} ${n}`)) return `${base} ${n}`;
  }
  return base;
}

/**
 * '탐색 N' 다음 번호.
 *
 * 개수로 세면 안 된다. 담고 빼고를 섞으면 이미 있는 이름과 부딪혀
 * freeName이 '탐색 2 2'를 만든다.
 */
function nextKeptName() {
  const used = app.compare
    .map(item => /^남긴 것 (\d+)$/.exec(item.name ?? ""))
    .filter(Boolean)
    .map(match => Number(match[1]));
  return `남긴 것 ${used.length > 0 ? Math.max(...used) + 1 : 1}`;
}

function nextSearchName() {
  const used = [app.buildName, ...app.compare.map(item => item.name)]
    .map(name => /^탐색 (\d+)$/.exec(name ?? ""))
    .filter(Boolean)
    .map(match => Number(match[1]));
  return `탐색 ${used.length > 0 ? Math.max(...used) + 1 : 1}`;
}

// 빌드 서랍. 접으면 하단 막대, 펼치면 비교표 — 같은 물건의 두 상태다.
export function openDrawer() {
  app.drawer.open = true;
}

export function closeDrawer() {
  app.drawer.open = false;
}

export function toggleDrawer() {
  app.drawer.open = !app.drawer.open;
}

/**
 * 지금 내 빌드를 옆에 얼려 둔다.
 *
 * 팔찌를 바꿔 보기 직전에 누르는 단추다. 누른 뒤에 무엇을 고치든 내 빌드만
 * 움직이고, 얼린 것은 그 자리에 그대로 선다.
 */
export function keepBuild(name) {
  if (app.compare.length >= COMPARE_LIMIT) {
    app.status = `비교함이 ${COMPARE_LIMIT}개로 가득 찼습니다. 하나 빼고 남기세요.`;
    return null;
  }
  // 이름을 안 주면 '남긴 것 N'으로. 내 빌드 이름을 그대로 물려주면
  // '내 빌드 2'가 되어 어느 쪽이 지금 것인지 헷갈린다.
  const entry = {
    id: makeId(),
    name: freeName(String(name ?? "").trim() || nextKeptName()),
    build: currentBuild(),
    savedAt: new Date().toISOString(),
  };
  app.compare.push(entry);
  app.status = `'${entry.name}'을 비교함에 남겼습니다.`;
  persist();
  return entry;
}

/** 얼린 것을 그대로 비교함에 세운다. 탐색 결과 체크가 이 길로 들어온다. */
export function keepSnapshot(name, build) {
  if (app.compare.length >= COMPARE_LIMIT) {
    app.status = `비교함이 ${COMPARE_LIMIT}개로 가득 찼습니다. 하나 빼고 담으세요.`;
    return null;
  }
  const entry = {
    id: makeId(),
    name: freeName(String(name ?? "").trim() || "빌드"),
    build: normalizeBuild(build),
    savedAt: new Date().toISOString(),
  };
  app.compare.push(entry);
  persist();
  return entry;
}

/**
 * 맞바꾸기 — 이 대상을 내 빌드로 올리고, 지금 내 빌드를 그 자리에 얼린다.
 *
 * 덮어쓰기가 아니다. 덮으면 "후보 셋을 놓고 하나씩 굴려 본다"가 성립하지 않는다.
 */
/**
 * 얼릴 때 쓸 이름.
 *
 * 기본 이름 그대로 얼리면 비교함에 '내 빌드'라는 열이 서서, 서랍 머리의
 * "내 빌드 · 탐색 1"과 정면으로 어긋난다. 기본값일 때만 갈아 준다 —
 * 손으로 지은 이름은 그 사람의 것이라 건드리지 않는다.
 */
function freezeName(name) {
  return name === "내 빌드" ? freeName("이전 빌드") : name;
}

/**
 * 조사 — 이름이 숫자로 끝나는 일이 잦아서 규칙이 필요하다.
 *
 * '탐색 4'는 소리로 '사'라 받침이 없다. 그대로 '4으로'라고 적으면 이름이
 * 저절로 만들어졌다는 게 티가 난다.
 */
const DIGIT_CODA = { 0: true, 1: true, 3: true, 6: true, 7: true, 8: true };
function hasCoda(word) {
  const text = String(word ?? "").trim();
  if (!text) return false;
  const last = text[text.length - 1];
  if (/[0-9]/.test(last)) return Boolean(DIGIT_CODA[Number(last)]);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
/** …로 / …으로. ㄹ 받침은 '로'를 쓴다(1·7·8이 그렇다). */
function ro(word) {
  const text = String(word ?? "").trim();
  const last = text[text.length - 1];
  if (/[178]/.test(last)) return "로";
  return hasCoda(text) ? "으로" : "로";
}
/** …을 / …를. */
function eul(word) {
  return hasCoda(word) ? "을" : "를";
}

export function makeMine(id) {
  const at = app.compare.findIndex(item => item.id === id);
  if (at < 0) return false;
  const target = app.compare[at];
  const mineName = freezeName(app.buildName);
  const mineBuild = currentBuild();

  app.character = normalizeBuild(target.build);
  app.buildName = target.name;
  app.compare[at] = { ...target, name: mineName, build: mineBuild };
  // 올라온 것은 이제 내 빌드다 — 초점으로 남겨 두면 자기 자신과 견주게 된다.
  if (app.focus?.kind === "tile" && app.focus.id === id) app.focus = null;

  app.status = `'${target.name}'${eul(target.name)} 내 빌드로 올렸습니다. 쓰던 것은 '${mineName}'${ro(mineName)} 남았습니다.`;
  persist();
  return true;
}

/**
 * 탐색 후보를 내 빌드로 올린다.
 *
 * 맞바꾸기와 같은 규칙이다 — 쓰던 것은 그 자리에 얼려 두므로 아무것도
 * 사라지지 않는다. 다만 후보는 아직 비교함에 없으니 자리를 새로 만든다.
 */
export function adoptResult(entry) {
  if (!entry) return false;
  if (app.compare.length >= COMPARE_LIMIT) {
    app.status = `비교함이 ${COMPARE_LIMIT}개로 가득 찼습니다. 하나 빼고 올리세요.`;
    return false;
  }
  const mineName = freezeName(app.buildName);
  const mineBuild = currentBuild();

  // 이름을 먼저 넘긴다. 쓰던 이름이 아직 내 빌드에 붙어 있는 채로 얼리면
  // 자기 이름과 부딪혀 뒤에 숫자가 하나 더 붙는다 — 남과 겹친 게 아니라
  // 자기 자신과 겹친 것이라, 이름이 "탐색 4 2"처럼 망가진다.
  app.character = normalizeBuild(stateFromResult(entry));
  app.buildName = nextSearchName();
  const kept = keepSnapshot(mineName, mineBuild);
  if (!kept) return false;
  app.focus = null;
  app.status = `후보를 '${app.buildName}'${ro(app.buildName)} 올렸습니다. 쓰던 것은 '${kept.name}'${ro(kept.name)} 남았습니다.`;
  persist();
  return true;
}

// --- 초점 -------------------------------------------------------------------

/** 표 줄·곡선 점을 골랐다. 표의 선택 상태와 초점은 같이 움직인다. */
export function focusResult(entry) {
  const id = entry?.id ?? entry ?? null;
  app.selectedId = id;
  app.focus = id ? { kind: "result", id } : null;
}

/**
 * 지금 초점이 무엇인가 — 이름·상태·임시 여부.
 *
 * 표에서 고른 후보가 이미 비교함에 있으면 타일로 읽는다. 같은 조합이 두 자리에
 * 서면 어느 쪽이 초점인지 모르게 된다.
 */
export function focusView() {
  const focus = app.focus;
  if (!focus) return null;
  if (focus.kind === "tile") {
    const item = app.compare.find(entry => entry.id === focus.id);
    return item ? { id: item.id, name: item.name, build: item.build, temp: false } : null;
  }
  const entry = (app.results ? resultPool() : []).find(item => item.id === focus.id);
  if (!entry) return null;
  const boxed = boxedSlot(entry);
  if (boxed?.mine) return null;
  if (boxed) return { id: boxed.id, name: boxed.name, build: boxed.build, temp: false };
  return { id: entry.id, name: "고른 후보", build: stateFromResult(entry), temp: true, entry };
}

export function dropCompare(id) {
  const at = app.compare.findIndex(item => item.id === id);
  if (at < 0) return false;
  const [gone] = app.compare.splice(at, 1);
  if (app.focus?.kind === "tile" && app.focus.id === id) app.focus = null;
  app.status = `'${gone.name}'을 비교함에서 뺐습니다.`;
  persist();
  return true;
}

export function renameCompare(id, name) {
  const trimmed = String(name ?? "").trim();
  const entry = app.compare.find(item => item.id === id);
  if (!entry || !trimmed) return false;
  entry.name = trimmed;
  persist();
  return true;
}

export function renameBuild(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return false;
  app.buildName = trimmed;
  persist();
  return true;
}

function bootstrapCompare() {
  const saved = load(SLOTS_KEY, null);
  app.buildName = String(saved?.name || "내 빌드");
  app.compare = (saved?.compare ?? [])
    .filter(item => item && item.id)
    .slice(0, COMPARE_LIMIT)
    .map(item => ({
      id: item.id,
      name: String(item.name || "빌드"),
      build: normalizeBuild(item.build),
      savedAt: item.savedAt ?? null,
    }));
}

bootstrapCompare();

// 마지막으로 보던 캐릭터의 각인 후보를 되살린다. 새로고침해도 그대로여야 한다.
{
  const scope = loadEngravingScope();
  app.characterName = scope.current;
  if (scope.current && scope.byName[scope.current]) loadEngravingsFor(scope.current);
}

// --- 탐색에서 고른 후보 ------------------------------------------------------
// 하단 막대와 3페이지가 같은 후보를 봐야 해서 여기 둔다. 양쪽이 각자 계산하면
// 언젠가 서로 다른 빌드를 가리킨다.

// 탐색이 남긴 것 전부. 곡선 둘과 순위표 셋.
//
// 목록을 손으로 늘어놓으면 새 목록이 생길 때마다 빠뜨린다. 실제로 쿨감 곡선과
// 쿨감 순위를 넣었을 때 여기가 안 따라와서, 곡선에서 쿨감 49%짜리를 눌러도
// 상세는 엉뚱한 빌드를 보여줬다 — find가 실패하고 첫 지점으로 떨어졌다.
export const RESULT_LISTS = ["pareto", "cooldownPareto", "damage", "dps", "stagger", "cooldown"];

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
  // 결과가 정하는 것은 노드·각인·펫·음식뿐이고 나머지는 지금 캐릭터 것이다.
  // 납작한 꼴을 그대로 넘기면 buildState가 장비 없는 빈 캐릭터를 만든다.
  return stateFromResult(entry);
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
  localStorage.setItem(CHARACTER_KEY, JSON.stringify(app.character));
  localStorage.setItem(SEARCH_KEY, JSON.stringify(app.search));
  persistCompare();
  persistEngravingScope();
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
  // 직업 없는 줄은 갈래가 없다. 종류 이름이 곧 직업 자리에 들어간다.
  if (isGenericSynergyJob(job)) {
    const synergy = readSynergy();
    synergy.rows.push({ id: makeId(), job, nodes: [], uptime: {} });
    writeSynergy(synergy);
    return;
  }
  const entry = getSynergyJob(job) ?? SYNERGY_JOBS[0];
  const synergy = readSynergy();
  synergy.rows.push({
    id: makeId(), job: entry.job,
    nodes: defaultSynergyNodes(entry.job),
    uptime: {},
  });
  writeSynergy(synergy);
}

/** 그 종류의 일반 줄이 몇이나 있나. 스테퍼가 세는 것은 이것뿐이다. */
export function genericSynergyCount(job) {
  return (app.character.synergy?.rows ?? []).filter(row => row?.job === job).length;
}

/**
 * 스테퍼. +1이 일반 줄 하나를 더하고, −1이 그 종류의 마지막 것을 뺀다.
 *
 * 직업 줄은 세지도 건드리지도 않는다 — 그쪽은 상세 패널의 일이다.
 */
export function setGenericSynergyCount(job, next) {
  const want = clamp(Math.round(readNumber(next)), 0, 3);
  const synergy = readSynergy();
  const mine = synergy.rows.filter(row => row?.job === job);
  if (mine.length === want) return;
  if (mine.length > want) {
    const drop = new Set(mine.slice(want).map(row => row.id));
    synergy.rows = synergy.rows.filter(row => !drop.has(row.id));
  } else {
    for (let i = mine.length; i < want; i += 1) {
      synergy.rows.push({ id: makeId(), job, nodes: [], uptime: {} });
    }
  }
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
function loadEngravingScope() {
  const saved = load(ENGRAVING_SCOPE_KEY, {});
  return {
    current: String(saved?.current ?? ""),
    byName: saved?.byName && typeof saved.byName === "object" ? saved.byName : {},
  };
}

/** 지금 캐릭터의 각인 후보를 적어 둔다. 이름이 없으면 안 적는다. */
function persistEngravingScope() {
  const name = app.characterName;
  try {
    const scope = loadEngravingScope();
    scope.current = name;
    if (name) {
      scope.byName[name] = {
        engravingRoles: { ...app.search.engravingRoles },
        engravingTiers: { ...app.search.engravingTiers },
      };
    }
    localStorage.setItem(ENGRAVING_SCOPE_KEY, JSON.stringify(scope));
  } catch {
    // 저장이 막혀도 이번 세션은 그대로 굴러간다.
  }
}

/**
 * 그 캐릭터의 각인 후보를 꺼내 온다. 없으면 비운다.
 *
 * 비우면 getEngravingRole의 기본값(레이드 기본 + 돌 낀 것은 고정)이 서는데,
 * 새 캐릭터에는 그게 맞는 출발점이다.
 */
function loadEngravingsFor(name) {
  const saved = loadEngravingScope().byName[name];
  app.search.engravingRoles = { ...(saved?.engravingRoles ?? {}) };
  app.search.engravingTiers = { ...(saved?.engravingTiers ?? {}) };
}

/**
 * 낀 각인의 단계를 전제에 적어 둔다.
 *
 * 안 낀 각인은 안 건드린다 — API가 모르는 것이라, 저장해 둔 값이 있으면
 * 그게 유일한 근거다.
 */
function adoptWornTiers() {
  const worn = app.character.engravings ?? {};
  const tiers = { ...app.search.engravingTiers };
  ENGRAVING_LIBRARY.forEach(item => {
    const real = getEngravingTierIndex(worn[item.id]);
    if (real >= 0) tiers[item.id] = ENGRAVING_TIERS[real].value;
  });
  app.search.engravingTiers = tiers;
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
  // 등급 옆에 알맹이도 남긴다 — 주스탯과 평면. 경매장 화면이 매물과 뺄셈을
  // 하려면 이게 있어야 한다. 적용할 때만 쓴다: 미리보기는 $derived 안에서
  // 돌아서 여기서 앱 상태를 건드리면 Svelte가 막는다.
  if (picks.accessories && read?.accessoriesWorn) {
    app.worn = cloneState(read.accessoriesWorn);
    try { localStorage.setItem(WORN_KEY, JSON.stringify(app.worn)); } catch {}
  }
  if (keptBundles.length > 0) {
    app.character.specBundles = keptBundles;
    // 묶음이 있으면 옛 특화 효율 칸은 물러난다 — 같은 것을 두 번 세면 안 된다.
    app.character.base.specDamagePer100 = 0;
  }
  // 불러온 캐릭터도 갈래를 이미 타고 있다. 백헤드·특화 기본값을 같이 얹는다.
  applyBranchDefaults(app.character.awakening?.job ?? 0, app.character.awakening?.nodeLevels ?? {});
  // 캐릭터가 바뀐다. 쓰던 각인 후보는 앞 캐릭터 이름으로 적어 두고,
  // 새 캐릭터의 것을 꺼내 온다 — 처음 보는 캐릭터면 비운 채로 시작한다.
  persistEngravingScope();
  app.characterName = String(read?.profile?.name ?? "").trim();
  loadEngravingsFor(app.characterName);
  // 낀 각인의 단계는 사실이다. 전제의 기본값으로 그대로 얹는다 — 안 그러면
  // 전제가 '전부 유물'로 서서, 실물과 다른 세계의 후보들이 나온다.
  adoptWornTiers();
  app.results = null;
  app.selectedId = null;
  app.focus = null;
  // 비교함도 비운다. 앞 캐릭터의 빌드가 남아 있으면 직업이 달라도 노드가
  // 그대로 남아 비교표가 거짓말을 한다.
  app.buildName = "인게임";
  app.compare = [];
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

  const entry = {
    id: makeId(),
    name: trimmed,
    savedAt: new Date().toISOString(),
    character: cloneState(app.character),
    search: cloneState(app.search),
    buildName: app.buildName,
    compare: cloneState(app.compare),
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
  app.focus = null;
  // 캐릭터를 통째로 갈아끼우므로 비교함도 그 저장본의 것으로 간다.
  app.buildName = String(save.buildName || save.name || "내 빌드");
  app.compare = (save.compare ?? []).filter(item => item && item.id).map(item => cloneState(item));
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
  app.focus = null;
  app.progress = { phase: "준비", progress: 0, evaluated: 0 };
  // 돌리는 순간 결과 화면으로 넘어간다. 진행 막대가 거기 있고,
  // 설정 화면에 남아 있으면 다 돌 때까지 아무 일도 안 일어난 것처럼 보인다.
  goTab("results");

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

  // 돌린 시점의 고정부를 함께 적어 둔다. 나중에 무기나 팔찌를 만지면 이 표는
  // 옛 세상의 숫자가 되는데, 그 사실을 아는 방법이 이것뿐이다.
  app.results = {
    ...result,
    baseline: calculateMetrics(app.character),
    basis: basisSignature(),
    basisName: app.buildName,
  };

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

// 곡선이나 표에서 고르는 것. 고르기는 언제나 초점 하나로 모인다.
export function previewResult(entry) {
  focusResult(entry);
}

/** 곡선에서 고른 지점을 비교함에 담고 서랍을 연다. */
export function confirmResult(entry) {
  if (!entry) return;
  app.selectedId = entry.id;
  const added = keepSnapshot(nextSearchName(), stateFromResult(entry));
  if (added) {
    app.status = `'${added.name}'${ro(added.name)} 담았습니다. 탐색 결과 자체는 안 바뀝니다.`;
    openDrawer();
  }
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

/** 이 후보가 이미 비교함에 있나. 있으면 그 항목. 내 빌드와 같아도 잡는다. */
export function boxedSlot(entry) {
  if (!entry) return null;
  const key = resultKey(entry);
  if (resultKey(app.character) === key) return { id: null, name: app.buildName, mine: true };
  return app.compare.find(item => resultKey(item.build) === key) ?? null;
}

/** 체크 = 담기, 체크 해제 = 빼기. 담아도 내 빌드는 안 바뀐다. */
export function toggleBoxed(entry) {
  if (!entry) return;
  const found = boxedSlot(entry);
  if (found?.mine) {
    // 지금 내 빌드와 같은 것은 뺄 수도 담을 수도 없다 — 이미 기준이다.
    app.status = "내 빌드와 같은 조합입니다.";
    return;
  }
  if (found) {
    dropCompare(found.id);
    return;
  }
  const entryAdded = keepSnapshot(nextSearchName(), stateFromResult(entry));
  if (entryAdded) {
    app.status = `'${entryAdded.name}'${ro(entryAdded.name)} 담았습니다.`;
    // 방금 담은 것이 곧 보고 있던 것이다. 초점을 담긴 쪽으로 넘긴다 —
    // 이름이 '고른 후보'에서 제 이름으로 바뀌고 담기 단추가 물러난다.
    if (app.focus?.kind === "result" && app.focus.id === entry.id) {
      app.focus = { kind: "tile", id: entryAdded.id };
    }
  }
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

/**
 * 고정부의 서명 — 탐색이 깔고 앉는 것들.
 *
 * 탐색이 덮어쓰는 차원(노드·각인·펫·음식)은 뺀다. 그것들은 후보가 정하므로
 * 바뀌어도 결과가 낡지 않는다. 반대로 무기 품질이나 팔찌가 바뀌면 표의 숫자는
 * 전부 옛 세상의 것이 된다 — 그때만 낡았다고 말해야 한다.
 */
export function basisSignature(state = app.character) {
  const rest = cloneState(state);
  delete rest.nodeLevels;
  delete rest.engravings;
  delete rest.engravingStones;
  delete rest.selectedTier;
  delete rest.setupName;
  if (rest.convenience) {
    rest.convenience = { ...rest.convenience };
    delete rest.convenience.petStat;
    delete rest.convenience.food;
  }
  return JSON.stringify(rest);
}

/** 돌린 뒤에 고정부가 바뀌었나. 바뀌었으면 표의 숫자는 그때 기준이다. */
export function basisStale() {
  if (!app.results?.basis) return false;
  return app.results.basis !== basisSignature();
}

/**
 * 기준 카드에 적을 것 — 탐색이 깔고 앉는 것들만.
 *
 * 여기 없는 것(노드·각인·펫·음식)이 곧 "후보가 덮는다"는 표시다.
 */
export function basisSummary() {
  const c = app.character;
  const metrics = calculateMetrics(anchorState());
  const mix = c.convenience?.damageMix ?? {};
  const synergyRows = (c.synergy?.rows ?? []).length;
  return [
    { label: "무기 품질", value: `${readNumber(c.weapon?.quality)}` },
    { label: "보석 쿨감", value: `${readNumber(c.jewel?.cooldown)}%` },
    { label: "치피", value: `${Math.round(readNumber(metrics.critDamage))}%` },
    { label: "딜 비중", value: `${readNumber(mix.manaCooldown)}/${readNumber(mix.plainCooldown)}` },
    { label: "시너지", value: synergyRows === 0 ? "없음" : `${synergyRows}줄` },
    { label: "자버프", value: `${(c.baseEffects ?? []).length}줄` },
  ];
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

// --- 경매장 ------------------------------------------------------------------
//
// 앞 두 축은 "가진 포인트를 어떻게 나눌까"를 묻는다. 이 축은 "무엇을 살까"를
// 묻는다. 답의 단위가 달라서 화면도 따로 섰다 — 여기서는 골드가 자원이다.

/** 지금 고른 부위. */
export function marketPart() {
  return ACCESSORY_PARTS.find(item => item.key === app.market.part) ?? ACCESSORY_PARTS[0];
}

/** 그 자리에 지금 낀 것. 불러오기 전이면 null — 모르면 모른다고 한다. */
export function wornAt(slot) {
  const worn = app.worn;
  if (!worn) return null;
  const found = slot.key === "necklace" ? worn.necklace : worn[slot.key]?.[slot.index];
  return readNumber(found?.mainStat) > 0 ? found : null;
}

/** 지금 부위에 이미 훑어 둔 것이 있나. 상단 단추가 '훑기'냐 '갱신'이냐를 가른다. */
export function marketHasResults() {
  return (app.market.found[app.market.part]?.listings?.length ?? 0) > 0;
}

/** 이 부위에 낀 것들. 화면이 "지금 뭘 끼고 있나"를 적는 데 쓴다. */
export function wornOfPart(part) {
  return partSlots(part).map(slot => ({ slot, worn: wornAt(slot) }));
}

export function setMarket(patch) {
  Object.assign(app.market, patch);
  try {
    localStorage.setItem(MARKET_KEY, JSON.stringify({
      part: app.market.part, grade: app.market.grade,
      quality: app.market.quality, sort: app.market.sort, cellView: app.market.cellView,
    }));
  } catch {}
}

/** 조합 하나의 질의 본문. */
function marketBody(part, combo) {
  const body = {
    CategoryCode: AUCTION_CATEGORY[part.part],
    ItemGrade: app.market.grade,
    EtcOptions: comboQuery(part, combo).map(pick => ({
      FirstOption: GRIND_FIRST_OPTION,
      SecondOption: GRIND_CODE[pick.name],
      MinValue: grindValueCode(pick.value),
      MaxValue: grindValueCode(pick.value),
    })),
  };
  const quality = readNumber(app.market.quality);
  if (quality > 0) body.ItemGradeQuality = quality;
  return body;
}

/**
 * 시장을 훑는다.
 *
 * 조합 열여섯 가지를 각각 최저가 열 장씩 받아 **한 목록으로 합친다**. 조합별로
 * 칸에 가둬 두면 "어느 칸이 싼가"는 보이지만 "지금 살 것은 무엇인가"가 안
 * 보인다 — 답은 1,000골드짜리 치피상 한 장인데 그건 어느 칸의 최저가도 아니다.
 *
 * '무관'이 나머지를 품으므로 같은 매물이 여러 번 잡힌다. 열쇠로 걸러 낸다.
 */
export async function sweepMarket() {
  if (app.market.running) return;
  const part = marketPart();
  const combos = [];
  GRADES.forEach(a => GRADES.forEach(b => combos.push([a, b])));

  const seen = new Set();
  let listings = [];
  setMarket({ running: true, done: 0, error: "" });
  // $state 바깥의 배열에 밀어 넣으면 화면이 못 본다. 조합이 도착할 때마다
  // 새 배열을 꽂아 준다 — 열여섯 번뿐이라 아깝지 않다.
  const publish = () => {
    app.market.found[part.key] = { listings: listings.slice(), quality: readNumber(app.market.quality) };
  };
  publish();

  const queue = combos.slice();
  const worker = async () => {
    while (queue.length > 0 && !app.market.error) {
      const combo = queue.shift();
      try {
        const found = await searchAuction(app.api.key, marketBody(part, combo));
        const fresh = found.items.map(readListing).filter(listing => {
          const key = listingKey(listing);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        listings = [...listings, ...fresh];
        publish();
      } catch (cause) {
        if (cause?.name === "AbortError") return;
        app.market.error = cause instanceof LostArkError ? cause.message : "경매장을 읽지 못했습니다.";
        return;
      }
      app.market.done += 1;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  app.market.running = false;
}
