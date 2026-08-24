// Combination search driver. Hand-written (the legacy version read browser
// globals); the pure helpers it leans on are lifted verbatim in search.js.
// Everything here is UI-free — progress and cancellation come in as callbacks.
import { EVOLUTION_TIERS, NODE_LIBRARY, ARC_PASSIVE_CONSTANTS } from "./data.js";
import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "./engravings.js";
import { readNumber, clamp } from "./util.js";
import {
  DEFAULT_STATE, finalizeMetrics, applyBaseEffect, applyBraceletEffects, applyEngravingTier, addCritOnlyDamage,
  calculateAccessoryBonuses, normalizeAccessories, normalizeBracelet, addDamageGroup,
  getEngravingTierIndex, getManaShareRatio, getManaCooldownShareRatio, getNodeCost, emptyNodeLevels,
  applyArkGridEffects, applyCollectionEffects, applyWeaponEffects, isDirectionalConditionActive,
  getStaggerShare,
  normalizeAttack, assembleAttack, emptyFlatBonuses, applyFlatAttackBonuses, applyAwakeningEffects, applySynergyEffects,
  FOODS, passionDanceAmount,
} from "./metrics.js";
import {
  OPTIMIZER_EXHAUSTIVE_LIMIT, OPTIMIZER_REFINE_ROUNDS, OPTIMIZER_REFINE_SEEDS,
  OPTIMIZER_MAX_EXPANSIONS, OPTIMIZER_REFINE_BUDGET,
  OPTIMIZER_PET_OPTIONS, OPTIMIZER_TIER1_STEPS, OPTIMIZER_ENGRAVING_ROLES,
  getModeledStatKeys, isNodeImpactful, enumerateNodeCombos, keepFullBudgetCombos,
  getModeledEngravings, defaultEngravingRole, enumerateEngravingSets,
  createTopList, createParetoFront, createChunkClock, selectBeam, BEAM_METRICS,
} from "./search.js";

// 1T 특화 노드. 특화 캐릭터는 여기를 30까지 채우는 것이 사실상 전제다.
const TIER1_SPEC_NODE = "e1-spec";
const TIER1_SPEC_LEVEL = 30;

export const SEARCH_DEFAULTS = {
  // 1Lv 단위가 기본이다. 10Lv 단위는 빠르지만 1T가 실제로 갈리는 자리를
  // 건너뛴다 — 치명 27/신속 13 같은 배분이 후보에 아예 안 오른다.
  // 조합이 커지면 mode:"auto"가 빔 탐색으로 넘긴다.
  tier1Mode: "step1",
  tier1SpecLock: false,
  // 사용자가 직접 뺀 노드 id. 노드판에서 0인 노드를 우클릭하면 여기 들어온다.
  excludedNodes: [],
  // 고정한 노드 { id: level }. 탐색이 이 레벨을 그대로 두고 나머지만 짠다.
  lockedNodes: {},
  // 펫과 음식도 각인과 같은 말을 쓴다 — 고정 · 후보 · 제외. 비어 있으면
  // 전부 후보다. pickDimension 참고.
  petRoles: {},
  foodRoles: {},
  engravingSlots: "5",
  engravingRoles: {},
  engravingTiers: {},
  fullBudget: true,
  mode: "auto",
  beamWidth: 600,
  resultLimit: 20,
  // 하한 조건. 0이면 안 건다.
  floors: { critRate: 0, critRateThorn: 0, attackSpeed: 0, moveSpeed: 0, cooldown: 0 },
  // 상한. 0이면 안 건다 — normalizeSearchCeilings 참고.
  ceilings: { critRate: 0, critRateThorn: 0, attackSpeed: 0, moveSpeed: 0, cooldown: 0 },
  // 내 로테이션이 쿨감 몇 %에서 막히나. 탐색은 안 쓰고 대표 카드만 읽는다 —
  // 비워 두면 구간이 가장 넓은 빌드가 선다.
  ceilingGuess: "",
};

// --- 하한 조건 --------------------------------------------------------------
//
// 실전 세팅은 DPS 하나로 정해지지 않는다. 치명타는 일정 수준을 깔아야
// 로테이션이 굴러가고, 이동 속도는 패턴을 피하는 데 필요한 몫이 따로 있다.
// 그래서 "이 밑으로는 아예 후보가 아니다"를 먼저 긋고 그 안에서 고른다.
//
// 치명타는 상한에 눌리기 전 총 치명타율로 잰다. 뭉툭한 가시가 상한을 80%로
// 내려도 초과분은 버려지지 않고 피해로 바뀌므로, 눌린 값으로 재면 실제로
// 확보한 치적을 못 읽는다. 속도도 같은 이유로 상한 전 합으로 잰다.
/**
 * 이 빌드가 뭉툭한 가시를 꼈나.
 *
 * 치적이 어디까지 쓸모 있는지가 여기서 갈린다. 안 꼈으면 상한 100이라 그
 * 위는 그냥 버려지고, 꼈으면 80 위가 피해로 바뀌어 110~120까지 값을 한다.
 * 그래서 한 번의 전수 탐색 안에 기준이 다른 두 무리가 섞인다.
 */
const hasBluntThorn = metrics => readNumber(metrics.specials?.bluntThorn) > 0;

export const SEARCH_FLOOR_FIELDS = [
  // 치적 상한은 두 줄이다. 하나뿐이면 뭉가 낀 빌드와 안 낀 빌드 중 한쪽은
  // 반드시 틀린 자로 재게 된다 — 90을 걸면 뭉가 빌드가 억울하게 잘리고,
  // 110을 걸면 뭉가 없는 빌드가 20%를 버리고도 통과한다.
  //
  // 하한은 안 가른다. "치적 85는 깔아야 로테가 돈다"는 뭉가와 무관하다.
  {
    key: "critRate", label: "치명타 적중률", max: 200,
    read: metrics => readNumber(metrics.critRateRaw),
    capApplies: metrics => !hasBluntThorn(metrics),
  },
  {
    key: "critRateThorn", label: "치명타 적중률 · 뭉가", max: 200,
    read: metrics => readNumber(metrics.critRateRaw),
    // 상한 전용 줄. 하한은 위 줄이 이미 모든 빌드에 걸고 있다.
    capOnly: true,
    capApplies: hasBluntThorn,
  },
  { key: "attackSpeed", label: "공격 속도", max: 100, read: metrics => readNumber(metrics.attackSpeed) },
  { key: "moveSpeed", label: "이동 속도", max: 100, read: metrics => readNumber(metrics.moveSpeedBonus) },
  // 쿨감은 상한에 눌린 뒤의 값으로 잰다. 사이클을 실제로 줄이는 것이 그 값이라,
  // 90%를 쌓아도 80%로 굴러가는 빌드를 "90% 확보"라고 읽으면 안 된다.
  { key: "cooldown", label: "쿨타임 감소", max: 80, read: metrics => Math.min(80, readNumber(metrics.cooldownReduction)) },
];

/** 이 줄의 상한이 이 빌드에 걸리나. capApplies가 없으면 늘 걸린다. */
export const capApplies = (field, metrics) => (field.capApplies ? field.capApplies(metrics) : true);

export function normalizeSearchFloors(floors) {
  const out = {};
  for (const field of SEARCH_FLOOR_FIELDS) {
    out[field.key] = clamp(readNumber(floors?.[field.key]), 0, field.max);
  }
  return out;
}

/**
 * 상한. 하한과 같은 네 축을 위에서 막는다.
 *
 * 왜 필요한가: 더 쌓아 봐야 버려지는 자리가 있다. 이속은 패턴을 피할 만큼만
 * 있으면 그 위는 딜로 안 바뀌고, 쿨감은 80%에서 잘린다. 그런데 탐색은 그런
 * 사정을 모르고 남는 포인트를 거기에 부어 버린다. "여기까지만"을 그어 두면
 * 그 포인트가 딜로 간다.
 *
 * 0은 "안 걺"이다. 상한 0을 실제로 걸고 싶은 축은 없다.
 */
export function normalizeSearchCeilings(ceilings) {
  const out = {};
  for (const field of SEARCH_FLOOR_FIELDS) {
    out[field.key] = clamp(readNumber(ceilings?.[field.key]), 0, field.max);
  }
  return out;
}

export function hasSearchFloor(floors) {
  return SEARCH_FLOOR_FIELDS.some(field => readNumber(floors?.[field.key]) > 0);
}

export function hasSearchBound(floors, ceilings) {
  return hasSearchFloor(floors) || hasSearchFloor(ceilings);
}

// 조건까지 얼마나 모자란가. 0이면 통과. 축마다 요구치로 나눠 더하므로
// "치적을 절반만 채움"과 "이속을 절반만 채움"이 같은 무게로 비교된다.
//
// 상한을 넘긴 것도 같은 자로 잰다 — 넘긴 만큼을 상한으로 나눠 더한다.
// 그래야 빔 탐색이 "조금 넘긴 것"과 "많이 넘긴 것"을 가려 낸다.
export function floorShortfall(metrics, floors, ceilings) {
  let total = 0;
  for (const field of SEARCH_FLOOR_FIELDS) {
    const value = field.read(metrics);
    if (!field.capOnly) {
      const need = readNumber(floors?.[field.key]);
      if (need > 0) total += Math.max(0, need - value) / need;
    }
    // 뭉가 줄의 상한은 뭉가 낀 빌드에만, 기본 줄의 상한은 안 낀 빌드에만 건다.
    if (capApplies(field, metrics)) {
      const cap = readNumber(ceilings?.[field.key]);
      if (cap > 0) total += Math.max(0, value - cap) / cap;
    }
  }
  return total;
}

export function meetsSearchFloors(metrics, floors, ceilings) {
  return floorShortfall(metrics, floors, ceilings) <= 1e-9;
}

// --- 펫 · 음식 갈래 ----------------------------------------------------------
//
// 둘 다 "여럿 중 하나"인 차원이라 각인과 같은 말을 쓴다 — 고정 · 후보 · 제외.
//
//   고정이 하나라도 있으면 그것들만 굴린다("반드시 이 중에서").
//   없으면 제외 안 한 것 전부가 후보다.
//   전부 제외했으면 지금 쓰는 것 하나로 되돌린다 — 갈래가 0이면 조합이 0이 되고,
//   그건 사람이 뜻한 바가 아니라 실수다.
export const PICK_ROLES = ["locked", "candidate", "excluded"];

export function getPickRole(roles, id) {
  const role = roles?.[id];
  return PICK_ROLES.includes(role) ? role : "candidate";
}

export function pickDimension(roles, all, fallback) {
  const locked = all.filter(id => getPickRole(roles, id) === "locked");
  if (locked.length > 0) return locked;
  const open = all.filter(id => getPickRole(roles, id) !== "excluded");
  return open.length > 0 ? open : [fallback];
}

// --- engraving roles --------------------------------------------------------

export function getEngravingRole(item, options, stones) {
  const role = options.engravingRoles?.[item.id];
  if (OPTIMIZER_ENGRAVING_ROLES.includes(role)) return role;
  // 어빌리티 스톤이 얹은 각인은 고정이 기본값이다. 돌은 하나뿐이고 그 돌이
  // 어느 각인에 몇 레벨을 주는지는 이미 정해져 있다 — 탐색이 그 각인을 빼면
  // 돌 몫도 같이 사라지는데, 실제로는 돌을 바꾸지 않는 한 그럴 수 없다.
  if (readNumber(stones?.[item.id]) > 0) return "locked";
  return defaultEngravingRole(item);
}

export function getEngravingSearchTierIndex(item, options) {
  const index = getEngravingTierIndex(options.engravingTiers?.[item.id]);
  return index >= 0 ? index : ENGRAVING_TIERS.length - 1;
}

const toEntry = (item, options) => ({ item, tierIndex: getEngravingSearchTierIndex(item, options) });

function buildEngravingDimensions(options, stones) {
  const empty = { locked: [], candidates: [], slots: 0, pickCount: 0, overflow: false, controlledIds: [], dimensions: [] };
  if (options.engravingSlots === "fixed") return empty;

  const modeled = getModeledEngravings();
  const locked = modeled.filter(item => getEngravingRole(item, options, stones) === "locked").map(item => toEntry(item, options));
  const candidates = modeled.filter(item => getEngravingRole(item, options, stones) === "candidate").map(item => toEntry(item, options));
  // 0슬롯은 "각인 없이"라는 실제 조합이다. 전부 고정하면 후보가 0개가 되어
  // 자연히 현재 각인만 남으므로, 별도의 '탐색 안 함' 모드는 두지 않는다.
  const slots = clamp(Math.round(readNumber(options.engravingSlots)), 0, 5);
  const controlledIds = modeled.map(item => item.id);

  if (locked.length > slots) return { ...empty, locked, candidates, slots, overflow: true, controlledIds };

  const pickCount = Math.min(slots - locked.length, candidates.length);
  return {
    locked,
    candidates,
    slots,
    pickCount,
    overflow: false,
    controlledIds,
    dimensions: [{ key: "engravingSet", label: "각인", options: enumerateEngravingSets(candidates, pickCount, locked) }],
  };
}

// --- plan -------------------------------------------------------------------

export function getExcludedNodeIds(options) {
  return new Set(Array.isArray(options?.excludedNodes) ? options.excludedNodes : []);
}

// --- 노드 고정 --------------------------------------------------------------
//
// 제외가 "이 노드는 쓰지 마라"라면 고정은 "이 레벨로 두고 나머지만 짜라"다.
// 특화 30 고정이 이것의 특수한 경우였다 — 예전에는 1T 특화 하나만 위해 별도
// 코드를 두었는데, 노드 아무거나 고정할 수 있으면 그건 편의 프리셋이 된다.
//
// 왜 필요한가: 특화의 아이덴티티 수급이나 스킬별 효율처럼 이 계산기가 모델링
// 못 하는 이유로 "여기는 이만큼 찍는다"가 이미 정해진 자리가 있다. 그걸
// 탐색에게 설득시키는 대신 그냥 못 박는 편이 정직하다.

/** { nodeId: level } — 실제로 존재하는 노드와 레벨 범위만 남긴다. */
export function getLockedNodeLevels(options) {
  const raw = options?.lockedNodes;
  const out = new Map();
  if (!raw || typeof raw !== "object") return out;
  for (const node of NODE_LIBRARY) {
    if (!Object.hasOwn(raw, node.id)) continue;
    const level = clamp(Math.round(readNumber(raw[node.id])), 0, node.maxLevel);
    if (level > 0) out.set(node.id, level);
  }
  return out;
}

/**
 * 한 티어의 조합을 짠다. 고정된 노드는 미리 떼어 두고 남은 포인트로 훑는다.
 *
 * 조합을 다 만든 뒤 거르는 방식이면 안 된다 — 고정한 노드가 탐색 후보에서
 * 빠져 있으면(효율 0이라 무의미 판정을 받는 등) 그 레벨을 가진 조합이 아예
 * 안 만들어져서 필터가 통째로 헛돈다. 특화 30 고정이 실제로 그렇게 새어 나갔다.
 */
function withLockedNodes(tierNodes, tierInfo, locked, step, useFullTier, buildRest) {
  const lockedHere = tierNodes.filter(node => locked.has(node.id));
  const reserved = lockedHere.reduce((sum, node) => sum + locked.get(node.id) * tierInfo.cost, 0);
  const rest = tierNodes.filter(node => !locked.has(node.id));

  let combos = buildRest(rest, Math.max(0, tierInfo.maxPoints - reserved), step);
  if (lockedHere.length > 0) {
    const levels = lockedHere.map(node => [node.id, locked.get(node.id)]);
    combos = combos.map(combo => ({
      ...combo,
      levels: [...levels, ...combo.levels],
      points: combo.points + reserved,
    }));
  }
  return useFullTier ? keepFullBudgetCombos(combos) : combos;
}

function buildTier1Options(sourceState, options, modeledStatKeys, excluded, locked, useFullTier) {
  const tierInfo = EVOLUTION_TIERS["진화 1"];
  const tierNodes = NODE_LIBRARY.filter(node => node.tier === "진화 1");

  if (options.tier1Mode === "fixed") {
    const levels = tierNodes
      .map(node => [node.id, clamp(Math.round(readNumber(sourceState.nodeLevels?.[node.id])), 0, node.maxLevel)])
      .filter(entry => entry[1] > 0);
    const points = levels.reduce((sum, entry) => sum + entry[1] * tierInfo.cost, 0);
    return [{ kind: "nodes", levels, points, goddessLevel: 0 }];
  }

  const step = OPTIMIZER_TIER1_STEPS[options.tier1Mode] || 10;

  return withLockedNodes(
    tierNodes, tierInfo, locked, step, useFullTier,
    (rest, points, useStep) => enumerateNodeCombos(
      rest.filter(node => isNodeImpactful(node, modeledStatKeys, excluded)),
      tierInfo.cost, points, useStep,
    ),
  );
}

function buildTierOptions(tier, modeledStatKeys, excluded, locked, useFullTier) {
  const tierInfo = EVOLUTION_TIERS[tier];
  const tierNodes = NODE_LIBRARY.filter(node => node.tier === tier);
  return withLockedNodes(
    tierNodes, tierInfo, locked, 1, useFullTier,
    (rest, points) => enumerateNodeCombos(
      rest.filter(node => isNodeImpactful(node, modeledStatKeys, excluded)),
      tierInfo.cost, points, 1,
    ),
  );
}

export function buildSearchPlan(sourceState, rawOptions) {
  // 기본값을 여기서도 채운다. runSearch만 채우고 있었더니, 계획을 직접 세워
  // 대조하는 쪽(테스트·미리보기)은 새로 생긴 갈래를 못 보고 넘어갔다 —
  // 음식 갈래가 붙었을 때 실제로 계획은 1가지, 실행은 4가지를 돌았다.
  const options = { ...SEARCH_DEFAULTS, ...rawOptions };
  const modeledStatKeys = getModeledStatKeys(sourceState);
  const excluded = getExcludedNodeIds(options);
  // 특화 30 고정은 이제 노드 고정의 프리셋일 뿐이다. 옛 체크박스를 켜 두었으면
  // 그 뜻대로 1T 특화 30을 고정 목록에 얹는다.
  const locked = getLockedNodeLevels(options);
  if (options.tier1SpecLock && !excluded.has(TIER1_SPEC_NODE) && !locked.has(TIER1_SPEC_NODE)) {
    locked.set(TIER1_SPEC_NODE, TIER1_SPEC_LEVEL);
  }
  const budget = Math.max(0, readNumber(sourceState.settings.pointBudget));
  const tierMaxTotal = Object.values(EVOLUTION_TIERS).reduce((sum, tier) => sum + tier.maxPoints, 0);
  const useFullTier = Boolean(options.fullBudget) && budget >= tierMaxTotal;
  const engravings = buildEngravingDimensions(options, sourceState.engravingStones);

  const dimensions = [
    { key: "tier1", label: "1T", options: buildTier1Options(sourceState, options, modeledStatKeys, excluded, locked, useFullTier) },
    {
      key: "pet",
      label: "펫",
      options: pickDimension(options.petRoles, OPTIMIZER_PET_OPTIONS, sourceState.convenience?.petStat || "none")
        .map(pet => ({ kind: "pet", pet })),
    },
    {
      key: "food",
      label: "음식",
      options: pickDimension(options.foodRoles, FOODS.map(food => food.id), sourceState.convenience?.food || "none")
        .map(food => ({ kind: "food", food })),
    },
  ];

  ["진화 2", "진화 3", "진화 4", "진화 5"].forEach(tier => {
    dimensions.push({ key: tier, label: EVOLUTION_TIERS[tier].label, options: buildTierOptions(tier, modeledStatKeys, excluded, locked, useFullTier) });
  });

  engravings.dimensions.forEach(dimension => dimensions.push(dimension));

  return {
    dimensions,
    budget,
    useFullTier,
    budgetBelowTierMax: budget < tierMaxTotal,
    engravings,
    // 1T 특화 고정이 실제로 걸렸는가. 켜 두고도 안 걸리는 경우가 있다 —
    // 특화 노드를 직접 빼 두었을 때. 그때는 조용히 지나가지 않고 화면에 적는다.
    tier1SpecLock: {
      wanted: Boolean(options.tier1SpecLock),
      applied: Boolean(options.tier1SpecLock) && options.tier1Mode !== "fixed" && !excluded.has(TIER1_SPEC_NODE),
      level: TIER1_SPEC_LEVEL,
    },
    // 계산기가 못 다루는 노드와 사용자가 뺀 노드는 이유가 달라 따로 센다.
    skippedNodes: NODE_LIBRARY.filter(node => !excluded.has(node.id) && !isNodeImpactful(node, modeledStatKeys)),
    excludedNodes: NODE_LIBRARY.filter(node => excluded.has(node.id)),
    totalCombos: dimensions.reduce((product, dimension) => product * dimension.options.length, 1),
  };
}

// --- evaluator --------------------------------------------------------------

export function buildEvaluator(sourceState, searchedEngravingIds) {
  const convenience = { ...DEFAULT_STATE.convenience, ...(sourceState.convenience || {}) };
  const manaShare = getManaShareRatio(convenience);
  const manaCooldownShare = getManaCooldownShareRatio(convenience);
  const settings = sourceState.settings;
  const specDamagePer100 = readNumber(sourceState.base.specDamagePer100);
  // 특화 묶음은 탐색이 안 바꾼다 — 후보의 특화가 배율만 움직인다.
  const specBundles = sourceState.specBundles;
  const critDamageBonus = 0;
  const accessories = normalizeAccessories(sourceState.accessories);
  const bracelet = normalizeBracelet(sourceState.bracelet);

  const baseStats = {
    critStat: readNumber(sourceState.base.critStat),
    specStat: readNumber(sourceState.base.specStat),
    swiftStat: readNumber(sourceState.base.swiftStat),
    dominationStat: readNumber(sourceState.base.dominationStat),
    enduranceStat: readNumber(sourceState.base.enduranceStat),
    expertiseStat: readNumber(sourceState.base.expertiseStat),
  };
  const basePercent = {
    critRate: 0,
    critDamage: 0, attackSpeed: 0, attackSpeedOnly: 0, moveSpeedOnly: 0,
    cooldownReduction: 0, cooldownIncrease: 0, manaCooldownReduction: 0,
    skillCooldownReduction: 0, critOnlyDamage: 0,
  };
  const baseDamage = {};

  // 음식이 줄 몫. 채끝의 평면 힘민지는 **배수 이전의 합**으로 나눈다 —
  // 조립한 값으로 나누면 아바타·목장만큼 채끝을 낮게 본다.
  const foodBase = assembleAttack(sourceState);
  const foodParts = new Map(FOODS.map(food => {
    const percent = [];
    const damage = [];
    if (food.attackSpeed) percent.push(["attackSpeedOnly", food.attackSpeed]);
    if (food.moveSpeed) percent.push(["moveSpeedOnly", food.moveSpeed]);
    if (food.mainStat && foodBase.mainBase > 0) damage.push(["힘민지", food.mainStat / foodBase.mainBase * 100]);
    return [food.id, { percent, damage }];
  }));
  // 평면 증가는 노드와 무관하다 — 전부 장비에서 온다. 그래서 한 번만 걷어
  // 퍼센트로 바꿔 두면 조합마다 다시 셀 일이 없다.
  const baseFlat = emptyFlatBonuses();

  // 속도 기반 변환은 값이 속도에 달려 있어 여기서 정할 수 없다. finalizeMetrics로 넘긴다.
  const conversions = [];
  (sourceState.baseEffects || []).forEach(effect => applyBaseEffect(effect, basePercent, baseDamage, conversions, baseFlat));

  const accessoryBonuses = calculateAccessoryBonuses(accessories);
  basePercent.critRate += accessoryBonuses.critRate;
  basePercent.critDamage += accessoryBonuses.critDamage;
  addDamageGroup(baseDamage, "추가 피해", accessoryBonuses.additionalDamage);
  addDamageGroup(baseDamage, "주는 피해", accessoryBonuses.dealtDamage);
  addDamageGroup(baseDamage, "공격력", accessoryBonuses.attackPower);
  addDamageGroup(baseDamage, "무기 공격력", accessoryBonuses.weaponAttack);
  addDamageGroup(baseDamage, "진화형 피해", clamp(Math.round(readNumber(convenience.evolutionKarmaRank)), 0, 6));
  // 정열의 춤사위도 같은 그룹이다. 탐색이 안 굴리는 값이라 여기서 한 번만 얹는다.
  addDamageGroup(baseDamage, "진화형 피해", passionDanceAmount(convenience.passionDance));

  if (convenience.feast) basePercent.attackSpeed += ARC_PASSIVE_CONSTANTS.feastSpeed;
  if (settings.backAttack) {
    basePercent.critRate += ARC_PASSIVE_CONSTANTS.backAttackCritRate;
    addDamageGroup(baseDamage, "주는 피해", ARC_PASSIVE_CONSTANTS.backAttackDamage);
  }
  if (settings.headAttack) addDamageGroup(baseDamage, "헤드어택 피해", ARC_PASSIVE_CONSTANTS.headAttackDamage);

  applyArkGridEffects(sourceState.arkGrid, basePercent, baseDamage, baseFlat);
  // 깨달음은 탐색이 안 건드린다. 한 번만 얹으면 조합마다 다시 셀 일이 없다.
  // conversions를 반드시 넘긴다. 기민함처럼 속도를 치명타로 바꾸는 식이
  // 여기 담기는데, 안 넘기면 탐색만 그 몫을 못 보고 화면은 보게 된다 —
  // 탐색이 고른 1등이 손으로 찍은 것보다 약한 일이 실제로 그래서 났다.
  const awakening = applyAwakeningEffects(sourceState.awakening, basePercent, baseDamage, conversions);
  // 파티 시너지도 탐색 밖이다. 치명타 시 피해 증가만 회심과 곱해지는데,
  // 곱은 순서를 안 가리므로 여기서 미리 얹어도 조합마다 같은 값이 나온다.
  const synergy = applySynergyEffects(sourceState, basePercent, baseDamage);
  applyCollectionEffects(sourceState.collection, baseStats, baseDamage);
  applyWeaponEffects(sourceState.weapon, baseDamage);
  applyBraceletEffects(bracelet, settings, baseStats, basePercent, baseDamage, baseFlat);

  // 조립한 공격력이어야 한다. normalizeAttack은 불러오기가 채운 원본 꼴이라
  // weaponAttack·mainStat이 0이고, 그러면 평면 증가를 퍼센트로 바꿀 나눗셈의
  // 분모가 없어 통째로 버려진다 — 평면 무기 공격력 9000이 조용히 사라졌다.
  const attack = assembleAttack(sourceState);
  const droppedFlat = applyFlatAttackBonuses(baseFlat, attack, baseDamage);

  // 어빌리티 스톤이 얹은 레벨. 돌은 하나뿐이고 탐색이 안 굴리므로 그대로 실린다.
  // 예전에는 이 인자를 안 넘겨서 탐색 쪽 딜만 스톤 몫 없이 낮게 나왔다 —
  // 같은 빌드인데 표와 비교함의 숫자가 달랐던 이유다.
  const stones = sourceState.engravingStones ?? {};
  const baseEngravingSpecials = { critRateMinimum: 0, raidCaptainRate: 0 };
  ENGRAVING_LIBRARY.forEach(item => {
    if (searchedEngravingIds.has(item.id)) return;
    const tierIndex = getEngravingTierIndex(sourceState.engravings?.[item.id]);
    if (tierIndex < 0) return;
    applyEngravingTier(item, tierIndex, basePercent, baseDamage, baseEngravingSpecials, manaShare, settings, readNumber(stones[item.id]));
  });

  const contributions = new Map();
  NODE_LIBRARY.forEach(node => {
    const contribution = { cost: getNodeCost(node), stats: [], percent: [], damage: [], critOnly: 0, specials: [] };
    node.effects.forEach(effect => {
      if (effect.kind === "note") return;
      if (effect.kind === "special") { contribution.specials.push(effect.key); return; }
      // 효과별 방향성 조건. 계산기 본체와 같은 규칙이어야 탐색이 딴소리를 안 한다.
      if (!isDirectionalConditionActive(effect.condition, settings)) return;
      const amount = readNumber(effect.amount) * (effect.manaOnly ? manaShare : 1);
      if (amount === 0) return;
      if (effect.kind === "stat") contribution.stats.push([effect.key, amount]);
      else if (effect.kind === "damage") contribution.damage.push([effect.key, amount]);
      else if (effect.kind === "critOnlyDamage") contribution.critOnly += amount;
      else contribution.percent.push([effect.key, amount]);
    });
    contributions.set(node.id, contribution);
  });

  return function evaluate(picks) {
    const totalStats = { ...baseStats };
    const percentBonuses = { ...basePercent };
    const damageGroups = { ...baseDamage };
    const specials = { bluntThorn: 0, sonicBreakthrough: 0 };
    const engravingSpecials = { ...baseEngravingSpecials };
    let pointsUsed = 0;
    let goddessLevel = 0;

    for (let i = 0; i < picks.length; i += 1) {
      const pick = picks[i];
      if (!pick) continue;

      if (pick.kind === "pet") {
        if (Object.hasOwn(totalStats, pick.pet)) totalStats[pick.pet] += ARC_PASSIVE_CONSTANTS.petStatBonus;
        continue;
      }

      if (pick.kind === "food") {
        const parts = foodParts.get(pick.food);
        if (parts) {
          for (let j = 0; j < parts.percent.length; j += 1) percentBonuses[parts.percent[j][0]] += parts.percent[j][1];
          for (let j = 0; j < parts.damage.length; j += 1) addDamageGroup(damageGroups, parts.damage[j][0], parts.damage[j][1]);
        }
        continue;
      }

      if (pick.kind === "engravingSet") {
        for (let j = 0; j < pick.active.length; j += 1) {
          const entry = pick.active[j];
          applyEngravingTier(entry.item, entry.tierIndex, percentBonuses, damageGroups, engravingSpecials, manaShare, settings, readNumber(stones[entry.item.id]));
        }
        continue;
      }

      pointsUsed += pick.points;
      goddessLevel += pick.goddessLevel;
      for (let j = 0; j < pick.levels.length; j += 1) {
        const [nodeId, level] = pick.levels[j];
        const contribution = contributions.get(nodeId);
        for (let k = 0; k < contribution.stats.length; k += 1) {
          const [key, amount] = contribution.stats[k];
          totalStats[key] = readNumber(totalStats[key]) + amount * level;
        }
        for (let k = 0; k < contribution.percent.length; k += 1) {
          const [key, amount] = contribution.percent[k];
          percentBonuses[key] = readNumber(percentBonuses[key]) + amount * level;
        }
        for (let k = 0; k < contribution.damage.length; k += 1) {
          const [key, amount] = contribution.damage[k];
          addDamageGroup(damageGroups, key, amount * level);
        }
        // 치명타 시 주는 피해는 출처끼리 곱한다. 한 노드 안에서는 레벨을 곱해
        // 한 번에 넣는다 — 게임이 한 줄로 "+aN%"라고 적는 것과 같고,
        // 본체의 applyEffect도 amount × level을 한 번 적용한다.
        if (contribution.critOnly !== 0) {
          addCritOnlyDamage(percentBonuses, contribution.critOnly * level);
        }
        for (let k = 0; k < contribution.specials.length; k += 1) {
          const key = contribution.specials[k];
          specials[key] = Math.max(specials[key] || 0, level);
        }
      }
    }

    if (convenience.goddessBlessing) {
      percentBonuses.attackSpeed += Math.max(0, ARC_PASSIVE_CONSTANTS.goddessBlessingSpeed - goddessLevel * 3);
    }

    return finalizeMetrics({
      settings, specDamagePer100, critDamageBonus,
      totalStats, percentBonuses, damageGroups, specials, engravingSpecials,
      pointsUsed, accessoryBonuses, manaCooldownShare, conversions,
      staggerShareRatio: getStaggerShare(convenience),
      attack, flatBonuses: baseFlat, droppedFlat, awakening, synergy,
      // 보석은 탐색이 안 건드린다 — 낀 대로 간다.
      jewelCooldownPercent: sourceState.jewel?.cooldown,
      specBundles,
    });
  };
}

// --- result snapshots -------------------------------------------------------

function buildResultEntry(picks, metrics, plan, baseEngravings) {
  const nodeLevels = emptyNodeLevels();
  const engravings = { ...baseEngravings };
  let pet = "none";
  let food = "none";

  picks.forEach(pick => {
    if (!pick) return;
    if (pick.kind === "pet") { pet = pick.pet; return; }
    if (pick.kind === "food") { food = pick.food; return; }
    if (pick.kind === "engravingSet") {
      plan.engravings.controlledIds.forEach(id => delete engravings[id]);
      pick.active.forEach(entry => { engravings[entry.item.id] = ENGRAVING_TIERS[entry.tierIndex].value; });
      return;
    }
    pick.levels.forEach(([nodeId, level]) => { nodeLevels[nodeId] = level; });
  });

  const signature = [
    NODE_LIBRARY.map(node => nodeLevels[node.id]).join(","),
    pet,
    food,
    plan.engravings.controlledIds.map(id => engravings[id] || "none").join(","),
  ].join("|");

  return {
    id: signature, signature, nodeLevels, pet, food, engravings,
    damageIndex: metrics.damageIndex,
    dpsIndex: metrics.dpsIndex,
    // 무력화 가중 100%일 때의 한 방 딜. 대난투 비중 설정과는 무관하다.
    staggerIndex: metrics.staggerIndex,
    pointsUsed: metrics.pointsUsed,
    critRateCapped: metrics.critRateCapped,
    // 뭉툭한 가시는 치명타 상한을 80%로 내리고 초과분을 피해로 바꾼다.
    // 표에서 80%가 왜 80%인지 알 수 있어야 한다.
    bluntThorn: metrics.specials.bluntThorn > 0,
    critDamage: metrics.critDamage,
    cooldownReduction: metrics.cooldownReduction,
    attackMoveSpeed: metrics.attackMoveSpeed,
    // 하한을 잰 값들. 상한에 눌리기 전이라 표의 80%와 다를 수 있다.
    critRateRaw: metrics.critRateRaw,
    attackSpeedBonus: metrics.attackSpeed,
    moveSpeedBonus: metrics.moveSpeedBonus,
  };
}

function offerResult(context, picks, metrics) {
  // 하한에 못 미치면 순위에도 프론트에도 넣지 않는다. 조건은 취향이 아니라
  // 후보 자격이므로, 좋은 값을 냈더라도 여기서 걸러야 결과가 거짓말을 안 한다.
  if (context.floored && !meetsSearchFloors(metrics, context.floors, context.ceilings)) {
    context.rejected += 1;
    return;
  }

  const wantedByRanking = context.damageTop.wants(metrics.damageIndex)
    || context.dpsTop.wants(metrics.dpsIndex)
    || context.staggerTop.wants(metrics.staggerIndex)
    || context.cooldownTop.wants(metrics.cooldownReduction, metrics.damageIndex);
  const wantedByPareto = context.pareto.accepts(metrics.damageIndex, metrics.dpsIndex)
    || context.cooldownPareto.accepts(metrics.damageIndex, metrics.cooldownReduction);
  if (!wantedByRanking && !wantedByPareto) return;

  const entry = buildResultEntry(picks, metrics, context.plan, context.baseEngravings);
  if (wantedByRanking) {
    context.damageTop.offer(entry);
    context.dpsTop.offer(entry);
    context.staggerTop.offer(entry);
    context.cooldownTop.offer(entry);
  }
  if (wantedByPareto) {
    context.pareto.offer(entry);
    context.cooldownPareto.offer(entry);
  }
}

// --- drivers ----------------------------------------------------------------

// setTimeout is throttled to ~1s in a background tab, which stretches a 3s
// search into 20s+ the moment the user switches away. MessageChannel is not
// throttled, so it stays responsive either way.
const yieldChannel = typeof MessageChannel === "function" ? new MessageChannel() : null;
let yieldQueue = [];

// Node에서는 열어 둔 포트 하나가 이벤트 루프를 붙잡아 프로세스가 안 끝난다.
// 그래서 기다리는 것이 없을 때만 놓아 준다 — 통째로 놓아 버리면 탐색 도중에
// Node가 할 일이 없다고 판단하고 나가 버려서, 탐색이 끝나기도 전에 프로세스가
// 조용히 종료된다(그리고 테스트는 아무것도 안 재고 통과한 것처럼 보인다).
// 브라우저에는 unref가 없으므로 아무 일도 일어나지 않는다.
const holdLoop = on => {
  if (on) { yieldChannel.port1.ref?.(); yieldChannel.port2.ref?.(); }
  else { yieldChannel.port1.unref?.(); yieldChannel.port2.unref?.(); }
};

if (yieldChannel) {
  yieldChannel.port1.onmessage = () => {
    const pending = yieldQueue;
    yieldQueue = [];
    for (const resolve of pending) resolve();
    if (yieldQueue.length === 0) holdLoop(false);
  };
  holdLoop(false);
}

function nextTick() {
  if (!yieldChannel) return new Promise(resolve => setTimeout(resolve, 0));
  return new Promise(resolve => {
    yieldQueue.push(resolve);
    holdLoop(true);
    yieldChannel.port2.postMessage(null);
  });
}

async function runExhaustive(context, report, isCancelled) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  const indexes = new Array(dimensions.length).fill(0);
  const picks = dimensions.map(dimension => dimension.options[0]);
  const total = plan.totalCombos;
  const clock = createChunkClock();

  for (let counter = 0; counter < total; counter += 1) {
    let points = 0;
    for (let i = 0; i < picks.length; i += 1) if (picks[i].kind === "nodes") points += picks[i].points;

    if (points <= plan.budget) {
      const metrics = evaluate(picks);
      context.evaluated += 1;
      offerResult(context, picks, metrics);
    }

    if (clock.expired()) {
      report({ phase: "전수 탐색", progress: counter / total, evaluated: context.evaluated });
      await nextTick();
      if (isCancelled()) return;
      clock.reset();
    }

    let dimension = dimensions.length - 1;
    while (dimension >= 0) {
      indexes[dimension] += 1;
      if (indexes[dimension] < dimensions[dimension].options.length) {
        picks[dimension] = dimensions[dimension].options[indexes[dimension]];
        break;
      }
      indexes[dimension] = 0;
      picks[dimension] = dimensions[dimension].options[0];
      dimension -= 1;
    }
    if (dimension < 0) break;
  }
}

async function runBeam(context, report, isCancelled, beamWidth) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  let beam = [{ indexes: [], points: 0 }];

  for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
    const dimension = dimensions[dimensionIndex];
    const candidates = [];
    const clock = createChunkClock();
    const stepBeam = Math.max(20, Math.floor(OPTIMIZER_MAX_EXPANSIONS / dimension.options.length));
    const sources = beam.length > stepBeam ? beam.slice(0, stepBeam) : beam;

    for (let beamIndex = 0; beamIndex < sources.length; beamIndex += 1) {
      const item = sources[beamIndex];
      for (let optionIndex = 0; optionIndex < dimension.options.length; optionIndex += 1) {
        const option = dimension.options[optionIndex];
        const points = item.points + (option.kind === "nodes" ? option.points : 0);
        if (points > plan.budget) continue;

        const indexes = item.indexes.concat(optionIndex);
        const picks = indexes.map((index, i) => dimensions[i].options[index]);
        const metrics = evaluate(picks);
        context.evaluated += 1;
        candidates.push({
          indexes, points,
          damageIndex: metrics.damageIndex,
          dpsIndex: metrics.dpsIndex,
          // 빔이 이 축에서도 상위를 남긴다. 없으면 제압 계열이 앞 차원에서 잘려
          // 대난투 순위가 차선만 모은 목록이 된다.
          staggerIndex: metrics.staggerIndex,
          // 빔이 조건을 채운 갈래를 먼저 남기도록. 하한이 없으면 늘 0이다.
          shortfall: context.floored ? floorShortfall(metrics, context.floors, context.ceilings) : 0,
        });
        if (dimensionIndex === dimensions.length - 1) offerResult(context, picks, metrics);

        if (clock.expired()) {
          report({ phase: `빔 탐색 ${dimension.label}`, progress: dimensionIndex / (dimensions.length + 1), evaluated: context.evaluated });
          await nextTick();
          if (isCancelled()) return;
          clock.reset();
        }
      }
    }

    if (candidates.length === 0) return;

    beam = selectBeam(candidates, beamWidth);
    report({ phase: `빔 탐색 ${dimension.label}`, progress: (dimensionIndex + 1) / (dimensions.length + 1), evaluated: context.evaluated });
    await nextTick();
    if (isCancelled()) return;
  }

  await refine(context, beam, report, isCancelled);
}

// 언덕오르기의 비교자. 하한이 걸리면 '조건을 채웠는가'가 지표보다 먼저다 —
// 못 채운 자리에서 지표만 보고 오르면 조건 바깥에서 정상을 찾고 끝난다.
function climbScore(context, metrics, metricKey) {
  return {
    short: context.floored ? floorShortfall(metrics, context.floors, context.ceilings) : 0,
    value: readNumber(metrics[metricKey]),
  };
}

const climbsBetter = (next, best) => (
  next.short < best.short - 1e-12
  || (next.short <= best.short + 1e-12 && next.value > best.value)
);

// Beam search commits to prefixes before later tiers are known, so walk the best
// finishers back through every dimension until no single swap helps.
async function refine(context, beam, report, isCancelled) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  // 씨앗도 조건을 채운 갈래를 먼저 집는다. 빔과 같은 이유다.
  const rank = key => (a, b) => (a.shortfall ?? 0) - (b.shortfall ?? 0) || b[key] - a[key];
  const seeds = BEAM_METRICS.flatMap(
    key => beam.slice().sort(rank(key)).slice(0, OPTIMIZER_REFINE_SEEDS),
  );
  const ceiling = context.evaluated + OPTIMIZER_REFINE_BUDGET;
  const clock = createChunkClock();

  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    if (context.evaluated >= ceiling) return;

    for (const metricKey of BEAM_METRICS) {
      const indexes = seeds[seedIndex].indexes.slice();
      let best = climbScore(context, evaluate(indexes.map((index, i) => dimensions[i].options[index])), metricKey);
      context.evaluated += 1;

      for (let round = 0; round < OPTIMIZER_REFINE_ROUNDS; round += 1) {
        let improved = false;

        for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
          const dimension = dimensions[dimensionIndex];
          const original = indexes[dimensionIndex];
          let bestOption = original;

          for (let optionIndex = 0; optionIndex < dimension.options.length; optionIndex += 1) {
            if (optionIndex === original) continue;
            indexes[dimensionIndex] = optionIndex;
            const picks = indexes.map((index, i) => dimensions[i].options[index]);
            const points = picks.reduce((sum, pick) => sum + (pick.kind === "nodes" ? pick.points : 0), 0);
            if (points > plan.budget) continue;

            const metrics = evaluate(picks);
            context.evaluated += 1;
            offerResult(context, picks, metrics);
            const score = climbScore(context, metrics, metricKey);
            if (climbsBetter(score, best)) {
              best = score;
              bestOption = optionIndex;
              improved = true;
            }

            if (clock.expired()) {
              report({ phase: "정밀 보정", progress: 0.9, evaluated: context.evaluated });
              await nextTick();
              if (isCancelled()) return;
              clock.reset();
            }
          }
          indexes[dimensionIndex] = bestOption;
        }
        if (!improved) break;
      }

      const finalPicks = indexes.map((index, i) => dimensions[i].options[index]);
      context.evaluated += 1;
      offerResult(context, finalPicks, evaluate(finalPicks));
    }
  }
}

/**
 * Runs the combination search.
 * @param {object} sourceState fixed character state
 * @param {object} options search scope (see SEARCH_DEFAULTS)
 * @param {(p: {phase: string, progress: number, evaluated: number}) => void} [onProgress]
 * @param {() => boolean} [isCancelled]
 */
export async function runSearch(sourceState, options, onProgress = () => {}, isCancelled = () => false) {
  const settings = { ...SEARCH_DEFAULTS, ...options };
  const plan = buildSearchPlan(sourceState, settings);
  const floors = normalizeSearchFloors(settings.floors);
  const ceilings = normalizeSearchCeilings(settings.ceilings);

  if (plan.engravings.overflow) {
    return {
      error: "engravingOverflow", plan, floors, ceilings,
      damage: [], dps: [], stagger: [], cooldown: [], pareto: [], cooldownPareto: [],
      evaluated: 0, rejected: 0, exhaustive: false,
    };
  }

  const limit = clamp(Math.round(readNumber(settings.resultLimit)), 1, 50);
  const context = {
    plan,
    evaluate: buildEvaluator(sourceState, new Set(plan.engravings.controlledIds)),
    baseEngravings: sourceState.engravings || {},
    damageTop: createTopList(limit, "damageIndex"),
    dpsTop: createTopList(limit, "dpsIndex"),
    staggerTop: createTopList(limit, "staggerIndex"),
    // 쿨감 순위. 절대 쿨감이 먼저인 직업은 이 줄부터 읽고 그 안에서 딜을 고른다.
    cooldownTop: createTopList(limit, "cooldownReduction", "damageIndex"),
    pareto: createParetoFront(),
    // 쿨감을 세로축에 둔 같은 곡선. "쿨감을 더 사려면 한 방 딜을 얼마나 내주나".
    cooldownPareto: createParetoFront("damageIndex", "cooldownReduction"),
    evaluated: 0,
    floors,
    ceilings,
    floored: hasSearchBound(floors, ceilings),
    // 하한에 걸려 버려진 조합 수. 결과가 비었을 때 이유가 되어야 한다.
    rejected: 0,
  };

  const exhaustive = settings.mode === "exhaustive"
    || (settings.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT);

  const startedAt = Date.now();
  if (exhaustive) await runExhaustive(context, onProgress, isCancelled);
  else await runBeam(context, onProgress, isCancelled, clamp(Math.round(readNumber(settings.beamWidth)), 10, 5000));

  return {
    error: null,
    plan,
    exhaustive,
    floors,
    ceilings,
    rejected: context.rejected,
    evaluated: context.evaluated,
    elapsedMs: Date.now() - startedAt,
    cancelled: isCancelled(),
    damage: context.damageTop.items.slice(),
    dps: context.dpsTop.items.slice(),
    // 대난투 순위. 무력화 가중 100%로 잰 한 방 딜 기준이다.
    stagger: context.staggerTop.items.slice(),
    cooldown: context.cooldownTop.items.slice(),
    // 곡선 위의 점들. 어느 점이 언제 1등인지는 ceiling.js의 한계 스윕이 정한다.
    pareto: context.pareto.items.slice(),
    cooldownPareto: context.cooldownPareto.items.slice(),
  };
}
