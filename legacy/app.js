const LEGACY_STORAGE_KEY = "ark-passive-simulator-state-v3";
const WORKSPACE_KEY = "ark-passive-simulator-workspace-v4";
const SAVED_KEY = "ark-passive-simulator-saved-v3";

const DEFAULT_STATE = {
  // 전투 특성은 출처별로 받는다 — 악세서리 / 팔찌 / 도감·물약.
  // base.*Stat은 모델의 합산 시작점일 뿐이라 0에서 출발한다.
  base: {
    critStat: 0,
    specStat: 0,
    swiftStat: 0,
    // 카드 · 도감 · 물약을 완성한 기준값. 제압은 대난투에서 피해가 되므로
    // 0으로 두면 대난투 비중을 적어도 아무 값이 안 나온다.
    dominationStat: 79,
    enduranceStat: 0,
    expertiseStat: 0,
    specDamagePer100: 0,
  },
  settings: {
    // 진화 포인트는 140 고정이다.
    pointBudget: 140,
    backAttack: false,
    headAttack: false,
  },
  convenience: {
    petStat: "none",
    // 서포터가 얹어 주는 공격력. 기본 공격력을 안 적으면 내 것을 쓴다 —
    // 레이드는 대개 비슷한 스펙끼리 간다.
    support: { on: false, baseAttackPower: 0, skillLevel: 14, attackBoostPercent: 40 },
    evolutionKarmaRank: 0,
    // 옛 단일 슬라이더. damageMix가 채워지면 더 읽지 않는다.
    manaShare: 100,
    damageMix: null,
    // 대난투 딜 비중(%). 무력화 대상 피해는 이 비중만큼만 실린다.
    staggerShare: 0,
    // 레이드에 들어가면 거의 항상 받는 것들이라 켜 둔 채로 시작한다.
    goddessBlessing: true,
    feast: true,
    // 서포터의 아크 그리드가 딜러에게 주는 진화형 피해. 1Lv 6%, 2Lv 12%.
    // 파티가 깔아 주는 것이라 파티 시너지 칸에 산다. 레이드에서는 거의 항상
    // 2렙이 깔리므로 그것을 기본값으로 둔다.
    passionDance: 2,
    // 사람이 직접 고른 적이 있는가. 기본값이 바뀐 뒤에도 고른 값을 지키려면
    // "안 골랐음"과 "0을 골랐음"을 갈라야 한다.
    passionDanceSet: false,
    // 음식 하나. 탐색 갈래이기도 하다 — FOODS 참고.
    food: "none",
    // 깨달음의 카르마 레벨. 1레벨당 무기 공격력 +0.1%. API에 안 실려 온다.
    awakeningKarmaLevel: 0,
  },
  accessories: {
    necklace: { additionalDamage: "none", dealtDamage: "none" },
    earrings: [
      { attackPower: "none", weaponAttack: "none" },
      { attackPower: "none", weaponAttack: "none" },
    ],
    rings: [
      { critRate: "none", critDamage: "none" },
      { critRate: "none", critDamage: "none" },
    ],
  },
  // 평면 증가를 퍼센트로 환산하는 기준값. 팔찌 무공 +9,000이 몇 %인지는
  // 지금 무공이 얼마인지를 알아야 정해진다 — 그래서 여기가 비어 있는 동안은
  // 평면 항목을 통째로 버려 왔다.
  //
  //   기본 공격력 = √(힘민지 × 무기 공격력 / 6)
  //
  // 셋 다 0이면 예전과 똑같이 굴러간다. 평면 항목만 계속 버려질 뿐이다.
  attack: {
    // 손으로 적는 최종값. 아래 조각이 채워지면 그쪽이 이긴다.
    weaponAttack: 0,
    mainStat: 0,
    flatAttack: 0,
    // 불러오기가 채우는 조각들 — assembleAttack 참고.
    weaponFlat: 0,
    weaponPercent: 0,
    mainFlat: 0,
    // 게임의 기본 공격력에서 되짚은 힘민지 총합. 있으면 이쪽이 이긴다.
    mainTotal: 0,
    // 되짚기 재료 — 게임이 알려 준 기본 공격력 D와 그 위에 곱해진 보석·스톤 %,
    // 그리고 팔찌까지 포함한 무공 평면. assembleAttack이 이걸로 힘민지를 푼다.
    baseAttackPower: 0,
    baseScalePercent: 0,
    // 장비가 평면으로 주는 기본 공격력. 완갑이 +850을 준다.
    //
    // 배수와 만나는 순서가 중요하다 — 순수 공격력에 **먼저 더한 뒤** 배수를
    // 먹는다. 실측: 지능 696,294 · 무공 243,319이면 C = 168,041이고,
    // (168,041 + 850) x 1.081 = 182,571로 게임의 182,568과 3 차이다.
    // 나중에 더하면 182,503으로 65가 어긋난다.
    baseFlat: 0,
    weaponFlatAll: 0,
    // 아바타는 부위별 등급으로 든다. 퍼센트 한 칸이었을 때는 "8%"만 남아서
    // 어느 부위가 비었는지, 영웅을 전설로 갈면 얼마가 오르는지 알 수 없었다.
    avatars: { weapon: "none", head: "none", top: "none", bottom: "none" },
  },
  bracelet: {
    stats: { critStat: 0, specStat: 0, swiftStat: 0 },
    // 힘민지는 등급이 아니라 범위다 — 고대 기준 9,600~16,000 사이의 아무 값.
    // 그래서 값을 그대로 든다.
    mainStat: 0,
    effects: {},
  },
  arkGrid: {
    // 질서 코어. 이름만 적어 두고 딜에는 안 싣는다 — legacy/cores.js 참고.
    order: emptyOrderCores(),
    cores: {
      sun: { id: "none", points: 20, stage: 1 },
      moon: { id: "none", points: 20, stage: 1 },
      star: { id: "none", points: 20, stage: 1 },
    },
    // 젬은 효과마다 레벨 합계가 따로다. 예전에는 추가 피해 하나만 들었다.
    gems: { attack: 0, additional: 0, boss: 0 },
  },
  collection: {
    // 펫 목장은 둘이다. 추가 피해를 주는 목장과 힘민지를 주는 목장이 따로 있고
    // 등급도 따로 매긴다 — 한 칸으로 묶으면 한쪽만 올려 둔 사람이 나머지도
    // 올린 것으로 계산된다.
    //
    // 힘민지 쪽만 되짚을 수 있다("auto"). 기본 공격력에서 푼 총합에 그 몫이
    // 들어 있기 때문이다. 추가 피해 목장은 어디에도 안 드러나서 손으로 고른다.
    // 추가 피해 목장은 되짚을 길이 없다 — 게임이 추가 피해 총합을 어디에도
    // 안 알려 준다. 그래서 손으로 고르는데, 기본을 0으로 두면 목장을 올려 둔
    // 사람의 딜을 0.74% 낮게 잰다. 있는 쪽이 훨씬 흔하므로 1%로 시작한다.
    ranchDamage: 1,
    ranchMainStat: "auto",
    // 원정대 레벨 보상으로 붙는 힘민지. 장비 밖에서 오는 것이라 장비 합에
    // 없고, 그래서 목장을 되짚을 때 잔차에 섞여 목장을 부풀린다.
    // 게임의 원정대 창 '원정대 증가 효과'에 적혀 있는 값이다.
    expeditionMainStat: 1900,
    critStat: 0,
    specStat: 0,
    swiftStat: 0,
  },
  weapon: { quality: 0 },
  // 보석(작열·광휘). 쿨감만 쓴다 — 피해 증가형은 스킬에만 걸려 진화 배분을
  // 안 바꾼다. 레벨이 아니라 퍼센트를 든다: 보석마다 레벨이 달라서 하나로
  // 못 적고, 어느 스킬에 몇 레벨이 박혔는지에 따라 실효값이 달라지기 때문이다.
  jewel: { cooldown: 0 },
  // 깨달음·도약. 직업 코드와 찍은 레벨만 든다 — 수치는 표에 있다.
  // 탐색이 건드리지 않는다. 진화 140포인트와 달리 자주 갈아엎는 것이 아니다.
  // uptime — 줄마다의 유효율(%). 비어 있으면 100으로 읽는다. awakeningUptimeRate 참고.
  awakening: { job: 0, nodeLevels: {}, uptime: {} },
  // 파티 시너지. 내 것은 직업과 깨달음이 정하므로 여기엔 고른 것만 담는다.
  synergy: { rows: [], ownUptime: {} },
  engravings: {},
  // 어빌리티 스톤이 각인마다 얹은 레벨(1~4). 돌은 하나뿐이라 탐색이 안 굴린다.
  engravingStones: {},
  nodeLevels: {},
  baseEffects: [
    { id: makeId(), label: "카드 추가 피해", category: "damage:추가 피해", customCategory: "", amount: 0, formula: "", cap: "" },
    { id: makeId(), label: "각인/시너지 치적", category: "critRate", customCategory: "", amount: 0, formula: "", cap: "" },
    { id: makeId(), label: "추가 치명타 피해", category: "critDamage", customCategory: "", amount: 0, formula: "", cap: "" },
  ],
  // 특화가 미는 스킬 묶음 — 아이덴티티류. 줄은 게임의 특화 툴팁을 그대로 옮긴다.
  specBundles: [],
  selectedTier: "전체",
  setupName: "",
};

/**
 * 음식. 한 번에 하나만 먹는다.
 *
 * 실제로 고민되는 것은 이속 음식과 채끝뿐이다 — 공속 음식은 그게 필요한 직업이
 * 고정으로 쓰고, 나머지 직업은 후보에도 안 올린다. 그런데 이속이냐 채끝이냐는
 * 세팅마다 갈려서 눈으로는 못 정한다. 그래서 탐색 갈래로 둔다.
 *
 * 채끝의 힘민지 12,000은 평면이라 기준값이 있어야 퍼센트가 된다 —
 * assembleAttack이 쌓아 올린 힘민지가 그 기준이다. 기준이 8% 어긋나면 채끝의
 * 값어치도 그만큼 어긋나므로, 여기가 정확해야 와인과의 비교가 산다.
 */
const FOODS = [
  { id: "none", label: "안 먹음", summary: "" },
  { id: "wine", label: "베르닐 와인", summary: "이동 속도 +3%", moveSpeed: 3 },
  { id: "blessing", label: "에아달린의 축복", summary: "공격 속도 +3%", attackSpeed: 3 },
  { id: "skewer", label: "명인의 쫄깃한 꼬치구이", summary: "힘·민첩·지능 +3,000", mainStat: 3000 },
  { id: "steak", label: "거장의 채끝 스테이크", summary: "힘·민첩·지능 +12,000", mainStat: 12000 },
];

const FOOD_BY_ID = new Map(FOODS.map(food => [food.id, food]));

function getFood(id) {
  return FOOD_BY_ID.get(String(id ?? "none")) ?? FOOD_BY_ID.get("none");
}

function applyFoodEffects(id, percentBonuses, flatBonuses) {
  const food = getFood(id);
  if (food.attackSpeed) percentBonuses.attackSpeedOnly = readNumber(percentBonuses.attackSpeedOnly) + food.attackSpeed;
  if (food.moveSpeed) percentBonuses.moveSpeedOnly = readNumber(percentBonuses.moveSpeedOnly) + food.moveSpeed;
  if (food.mainStat) addFlatBonus(flatBonuses, "mainStat", food.mainStat);
  return food;
}

// 펫 목장. 한 등급이 추가 피해와 힘민지에 같은 퍼센트로 붙는다.
//
// 힘민지 쪽은 아바타와 합연산이다 — 전설 4부위(8%)에 목장 1%면 곱하는 값이
// 1.08 × 1.01이 아니라 1.09다. 그래서 여기서 더하지 않고 assembleAttack이
// 아바타 퍼센트와 같이 받아 한 번에 곱한다.
const RANCH_GRADES = [
  { value: 0, label: "없음", amount: 0 },
  { value: 0.4, label: "0.4%", amount: 0.4 },
  { value: 0.7, label: "0.7%", amount: 0.7 },
  { value: 1, label: "1%", amount: 1 },
];

/** 고른 목장 등급의 퍼센트. 옛 저장본의 `ranch: true`는 1%로 읽는다. */
function ranchAmount(grade) {
  if (grade === true) return 1;
  const value = readNumber(grade);
  const hit = RANCH_GRADES.find(item => item.value === value);
  return hit ? hit.amount : 0;
}

// 정열의 춤사위. 서포터의 아크 그리드가 딜러에게 거는 진화형 피해다.
// 깨달음에도 각인에도 없고 파티 구성에 달린 값이라 전투 상황에서 고른다.
const PASSION_DANCE_GRADES = [
  { value: 0, label: "없음", amount: 0 },
  { value: 1, label: "1Lv", amount: 6 },
  { value: 2, label: "2Lv", amount: 12 },
];

function passionDanceAmount(level) {
  const hit = PASSION_DANCE_GRADES.find(item => item.value === Math.round(readNumber(level)));
  return hit ? hit.amount : 0;
}

// 아바타는 네 부위만 힘민지를 준다. 부위마다 하나씩 — 속옷과 겉옷을 다 세면
// 넘친다. 전설 2%, 영웅 1%.
const AVATAR_SLOTS = [
  { key: "weapon", label: "무기" },
  { key: "head", label: "머리" },
  { key: "top", label: "상의" },
  { key: "bottom", label: "하의" },
];

const AVATAR_GRADES = [
  { value: "none", label: "없음", amount: 0 },
  { value: "epic", label: "영웅", amount: 1 },
  { value: "legendary", label: "전설", amount: 2 },
];

function avatarAmount(grade) {
  const hit = AVATAR_GRADES.find(item => item.value === grade);
  return hit ? hit.amount : 0;
}

/** 네 부위 합. 옛 저장본의 avatarPercent 한 칸도 여기서 받아 준다. */
function avatarTotal(attack) {
  const slots = attack?.avatars;
  if (slots && typeof slots === "object") {
    return AVATAR_SLOTS.reduce((sum, slot) => sum + avatarAmount(slots[slot.key]), 0);
  }
  return Math.max(0, readNumber(attack?.avatarPercent));
}

/**
 * 힘민지 목장 되짚기.
 *
 * 게임은 목장을 API로 안 알려 준다. 대신 기본 공격력에서 되짚은 힘민지 총합이
 * 장비 합의 몇 배인지를 보면, 아바타 몫을 뺀 나머지가 힘민지 목장이다.
 *
 * 추가 피해 목장은 이렇게 못 푼다 — 어느 값에도 안 드러난다. 그건 손으로 고른다.
 *
 * 다만 이 나머지에는 도감·물약 힘민지(약 2,400 = 0.4%p)도 섞여 있다. 그게
 * 목장 한 등급과 같은 크기라 한 칸 높게 집을 수 있다 — 그래서 화면에 되짚은
 * 값을 그대로 적어 두고 손으로 덮을 수 있게 둔다.
 */
/**
 * 되짚은 힘민지 총합에서 장비와 아바타를 걷어 낸 나머지.
 *
 * 이 나머지는 목장만이 아니다 — 원정대 보상, 전투 레벨, 카드 도감, 물약이
 * 전부 장비 밖에서 온다. 아는 것부터 빼야 목장이 제 크기로 보인다.
 * 원정대만 빼도 이 캐릭터에서 잔차가 2.52%에서 2.19%로 내려간다.
 */
function ranchResidual(inputState) {
  const source = inputState?.attack || {};
  const mainFlat = Math.max(0, readNumber(source.mainFlat));
  const outside = Math.max(0, readNumber(inputState?.collection?.expeditionMainStat));
  const total = derivedMainTotal(inputState);
  if (!(total > 0) || !(mainFlat > 0)) return null;
  return (total / (mainFlat + outside) - 1) * 100 - avatarTotal(source);
}

/** 장비와 아바타·목장으로 설명되지 않는 힘민지. 화면이 이름을 붙여 주는 데 쓴다. */
function outsideMainStat(inputState) {
  const source = inputState?.attack || {};
  const mainFlat = Math.max(0, readNumber(source.mainFlat));
  const total = derivedMainTotal(inputState);
  if (!(total > 0) || !(mainFlat > 0)) return null;
  const scale = 1 + (avatarTotal(source) + resolveRanchMainStat(inputState)) / 100;
  return total / scale - mainFlat;
}

function autoRanchAmount(inputState) {
  const residual = ranchResidual(inputState);
  if (residual === null) return 0;
  return RANCH_GRADES.reduce(
    (best, grade) => (Math.abs(grade.amount - residual) < Math.abs(best - residual) ? grade.amount : best),
    0,
  );
}

/** 힘민지에 곱해지는 목장 퍼센트. "auto"면 되짚어서 정한다. */
function resolveRanchMainStat(inputState) {
  const source = inputState?.collection ?? {};
  // 둘로 나뉘기 전 저장본은 ranch 한 칸에 둘 다 들어 있었다.
  const grade = source.ranchMainStat ?? source.ranch;
  return grade === "auto" ? autoRanchAmount(inputState) : ranchAmount(grade);
}

/** 추가 피해에 더해지는 목장 퍼센트. 되짚을 길이 없어 손으로 고른 값만 쓴다. */
function resolveRanchDamage(collection) {
  return ranchAmount(collection?.ranchDamage ?? collection?.ranch);
}

const MULTIPLICATIVE_DAMAGE_GROUPS = new Set(["주는 피해"]);

// 제곱근으로 접히는 그룹.
//
// 기본 공격력이 √(힘민지 × 무공 / 6)이므로, 무공이나 힘민지가 x%만큼 오르면
// 공격력은 √(1+x)만큼만 오른다. 무기 공격력 +3%는 공격력 +3%가 아니라 +1.49%다.
// 그룹 안에서 더하는 것은 다른 그룹과 같고, 접는 것은 마지막에 한 번뿐이다.
//
// 이 접기는 기준값과 무관하다. 무공을 안 적어 뒀어도 무공 %는 접힌다.
// 공격력 사슬(A~E)이 삼키는 그룹. 피해 배수에서 또 곱하면 두 번이다.
const ATTACK_CHAIN_GROUPS = new Set(["힘민지", "무기 공격력", "공격력", "시너지 공격력"]);

const SQRT_DAMAGE_GROUPS = new Set(["무기 공격력", "힘민지"]);

// 대난투에서만 걸리는 그룹.
//
// 무력 게이지를 0으로 만들면 별도 구역으로 넘어가고, 그 동안만 무력화 대상
// 피해가 실린다. 그래서 이 그룹은 다른 그룹처럼 전 딜에 곱해지지 않는다 —
// 대난투에서 낸 딜의 비중만큼만 실린다.
//
//   총 딜 = (1 − 비중) × 평시 + 비중 × 평시 × 무력화 배수
//         = 평시 × (1 − 비중 + 비중 × 무력화 배수)
//
// 쿨감의 부분 적용(사이클로 합성)과 다르다. 피해는 시간이 아니라 양이므로
// 비중으로 그냥 섞으면 된다.
const STAGGER_DAMAGE_GROUPS = new Set(["무력화 대상 피해"]);

/** 대난투 딜 비중(0~1). 0이면 무력화 그룹이 아무 일도 안 한다. */
function getStaggerShare(convenience) {
  return clamp(readNumber(convenience?.staggerShare) / 100, 0, 1);
}

// --- 특화 묶음 ---------------------------------------------------------------
//
// 특화가 미는 스킬 묶음 — 서머너의 고대 정령, 만월의 사신화, 기공사의 금강선공.
// "한 방이 세지고 그 한 방을 더 자주 쓰는" 구조라 특화의 가치가 피해 그룹
// 하나로 안 잡힌다. 직업마다 다 달라서 코드가 아는 척하지 않고 유저가 적는다.
//
//   비중       이 묶음이 딜에서 차지하는 몫. 기준 특화에서 잰 값.
//   기준 특화  비중을 잰 시점의 특화.
//   줄         특화 툴팁의 항목 하나. '기준 특화에서의 값'과 '특화 0일 때의
//              값'(기공사처럼 특화가 증폭만 할 때)을 적으면 선형으로 움직인다.
//
//   줄 배율(S) = (1 + v(S)) ÷ (1 + v(S₀))         쿨감 줄은 (1 − v₀) ÷ (1 − v(S))
//   총딜      ×= 1 + Σ 묶음 비중 × (Π 줄 배율 − 1)
//
// 기준 특화로 나누는 분모가 핵심이다 — 비중을 잰 로그에는 이 효과가 이미 켜져
// 있었으므로, 그 몫을 소거해야 이중계상이 안 된다. 기준점에서 배율은 정확히 1이고,
// 탐색이 특화를 움직인 만큼만 갈린다. 섞는 규칙은 무력화 대상 피해와 같다.

const SPEC_BUNDLE_KINDS = [
  { value: "damage", label: "피해" },
  { value: "gain", label: "수급" },
  { value: "speed", label: "공속" },
  { value: "cooldown", label: "쿨감" },
];

function normalizeSpecBundles(list) {
  if (!Array.isArray(list)) return [];
  return list.map(bundle => ({
    id: bundle?.id || makeId(),
    name: typeof bundle?.name === "string" ? bundle.name : "",
    share: readNumber(bundle?.share),
    refSpec: readNumber(bundle?.refSpec),
    rows: (Array.isArray(bundle?.rows) ? bundle.rows : []).map(row => ({
      kind: SPEC_BUNDLE_KINDS.some(kind => kind.value === row?.kind) ? row.kind : "damage",
      base: readNumber(row?.base),
      amount: readNumber(row?.amount),
      // 값 두 개로 못 적는 꼴은 식으로 적는다 — 기공사의 "기본 × 증폭(특화)".
      formula: typeof row?.formula === "string" ? row.formula : "",
    })),
  }));
}

/** 식에 주는 변수. 특화만 기준↔후보로 갈아끼우고 나머지 특성은 지금 값이다. */
function specBundleVariables(stats, spec) {
  return {
    "치명": readNumber(stats?.critStat),
    "특화": spec,
    "신속": readNumber(stats?.swiftStat),
    "제압": readNumber(stats?.dominationStat),
    "인내": readNumber(stats?.enduranceStat),
    "숙련": readNumber(stats?.expertiseStat),
  };
}

/**
 * 줄의 값이 특화 S에서 얼마가 되나.
 *
 * 식이 있으면 식이 이긴다 — {{특화}} 자리에 S를 넣어 계산한다.
 * 없으면 '특화 0'과 '기준에서' 두 값을 잇는 직선이다.
 */
function specBundleValue(row, spec, refSpec, stats) {
  const text = String(row?.formula ?? "").trim();
  if (text) {
    const value = evaluateFormula(text, specBundleVariables(stats, spec));
    return value === null ? 0 : value;
  }
  const base = readNumber(row?.base);
  const at = readNumber(row?.amount);
  if (!(refSpec > 0)) return at;
  return base + (at - base) * (spec / refSpec);
}

function specBundleRowFactor(row, spec, refSpec, stats) {
  const atRef = specBundleValue(row, refSpec, refSpec, stats);
  if (row?.kind === "cooldown") {
    // 쿨감은 시전 횟수 1/(1−c)로 실린다. 모델의 쿨감 상한과 같은 80으로 막는다.
    const now = clamp(specBundleValue(row, spec, refSpec, stats), 0, 80) / 100;
    const ref = clamp(atRef, 0, 80) / 100;
    return (1 - ref) / (1 - now);
  }
  const now = 1 + specBundleValue(row, spec, refSpec, stats) / 100;
  const ref = 1 + atRef / 100;
  if (ref <= 0 || now <= 0) return 1;
  return now / ref;
}

function specBundleBlend(bundles, stats) {
  const spec = readNumber(stats?.specStat);
  let blend = 1;
  const applied = [];
  normalizeSpecBundles(bundles).forEach(bundle => {
    const share = clamp(bundle.share, 0, 100) / 100;
    if (share <= 0 || bundle.rows.length === 0) return;
    const multiplier = bundle.rows.reduce(
      (acc, row) => acc * specBundleRowFactor(row, spec, bundle.refSpec, stats), 1,
    );
    blend += share * (multiplier - 1);
    applied.push({ id: bundle.id, name: bundle.name, share: share * 100, multiplier });
  });
  return { blend: Math.max(0, blend), applied };
}

/** 피해 그룹 하나가 최종 곱에 기여하는 배수. */
function damageGroupFactor(key, value) {
  const ratio = 1 + readNumber(value) / 100;
  if (!SQRT_DAMAGE_GROUPS.has(key)) return ratio;
  return ratio <= 0 ? 0 : Math.sqrt(ratio);
}

// 쿨감 그룹. 그룹 안에서는 더하고, 그룹끼리는 곱한다 — 피해 그룹과 같은 규칙이다.
const COOLDOWN_GROUP_KEYS = ["swift", "generic", "mana", "skill", "jewel"];

const COOLDOWN_GROUP_LABELS = {
  swift: "신속",
  generic: "직접 입력",
  mana: "끝마/무마",
  skill: "최훈/타지",
  jewel: "보석",
};

// 보석 레벨 → 쿨감 퍼센트. 화면과 불러오기가 제안값을 만들 때 쓴다.
// 계산 자체는 state의 퍼센트를 그대로 쓴다 — 섞여 낀 경우를 레벨 하나로 못 적는다.
//
//   쿨감 % = (보석 레벨 + 2) × 2      7레벨 → 18%,  8레벨 → 20%,  10레벨 → 24%
//
// 낀 스킬에만 걸리지만 딜 스킬에 두루 박으므로 전역 쿨감으로 본다. 다른 쿨감과는
// 곱연산이라 별도 그룹으로 둔다 — 신속이나 직접 입력에 더하면 부풀려진다.
const JEWEL_MAX_LEVEL = 10;

function jewelCooldown(level) {
  const value = clamp(Math.round(readNumber(level)), 0, JEWEL_MAX_LEVEL);
  return value <= 0 ? 0 : (value + 2) * 2;
}

// 주력기는 네 갈래다. 마나를 쓰느냐가 마나 전용 피해(마효증 각인 · 마나 용광로 ·
// 금단의 주문 마나 추가분)를 가르고, 자체 쿨이냐 아이덴티티 소모냐가
// 끝마·무마 쿨감을 가른다.
//
//                          마나 전용 피해  끝마/무마
//   마나 O · 자체 쿨              O            O
//   마나 X · 자체 쿨              X            X     ← 둘 다 헛돈다
//   마나 X · 아이덴티티 소모       X            O*    ← 수급기가 마나를 쓸 때만
//   마나 O · 아이덴티티 소모       O            O
//
// 슬라이더 하나로는 2번과 3번을 구분할 수 없었다. 2번은 끝마/무마가 완전히
// 헛돌고, 3번은 자기가 마나를 안 써도 아덴을 채우는 수급기를 통해 그대로 이득이다.
//
// 이 상수들은 여기(파일 상단)에 있어야 한다. 아래쪽 top-level에서 DOM을 만지다
// 예외가 나면 그 뒤의 const는 초기화되지 않아 TDZ로 죽는다.
const DAMAGE_MIX_KEYS = ["manaCooldown", "plainCooldown", "identityPlain", "identityMana"];

const DAMAGE_MIX_LABELS = {
  manaCooldown: "마나 O · 자체 쿨",
  plainCooldown: "마나 X · 자체 쿨",
  identityPlain: "마나 X · 아이덴티티",
  identityMana: "마나 O · 아이덴티티",
};

// 다른 수치를 재료로 삼는 직접 입력 효과.
//
// 처음엔 "재료 하나 × 비율 하나"로 만들었는데 그걸로는 기상술사 정도만 담긴다.
// {{공격속도}} + {{이동속도}} 같은 건 아예 못 쓴다. 그래서 식으로 받는다.
//
//   {{공격속도}} * 120%
//   ({{공격속도}} + {{이동속도}}) * 15%
//   min({{특화}}, 2000) / 100 * 2.5
//
// 재료값은 finalizeMetrics 안에서야 정해지므로 미리 계산하지 않고 담아 두었다가
// 그때 건다. (아래쪽 top-level에서 예외가 나면 그 뒤 const는 초기화되지 않으므로
// 이 상수들은 파일 상단에 있어야 한다.)
// 계층이 있다. 로아에서 공이속은 딜이 되지만 딜은 공이속이 되지 않고,
// 치적은 딜이 되지만 딜은 치적이 되지 않는다. 그래서 아래로 내려가기만 한다.
//
//   1단 · 속도 · 특성   ← 아무것도 못 읽는다. 식의 대상이 될 수도 없다.
//   2단 · 치명타 · 쿨감  ← 1단을 읽는다.   예) 기민함: 공속 %의 120% → 치피
//   3단 · 피해 그룹      ← 1·2단을 읽는다. 예) 성검 개방: 치적 1%당 주피 0.55%
//
// 대상이 어느 단이냐로 읽을 수 있는 변수가 정해지므로 순환이 생길 수 없다.
const FORMULA_VARIABLES = [
  { name: "공격속도", hint: "상한 40% 적용", stage: 1 },
  { name: "이동속도", hint: "상한 40% 적용", stage: 1 },
  { name: "공격속도합", hint: "상한 전", stage: 1 },
  { name: "이동속도합", hint: "상한 전", stage: 1 },
  { name: "치명", hint: "특성 수치", stage: 1 },
  { name: "특화", hint: "특성 수치", stage: 1 },
  { name: "신속", hint: "특성 수치", stage: 1 },
  { name: "제압", hint: "특성 수치", stage: 1 },
  { name: "인내", hint: "특성 수치", stage: 1 },
  { name: "숙련", hint: "특성 수치", stage: 1 },
  { name: "치명타적중률", hint: "상한 적용", stage: 2 },
  { name: "치명타적중률합", hint: "상한 전", stage: 2 },
  { name: "치명타피해", hint: "합계", stage: 2 },
];

// 식의 대상이 몇 단인가. 피해 그룹은 마지막이라 앞 단을 전부 읽을 수 있다.
// 속도는 아무도 대상으로 삼을 수 없다 — 그 순간 순환이 생긴다.
function getFormulaStage(category) {
  const key = String(category);
  if (key === "attackSpeedOnly" || key === "moveSpeedOnly" || key === "attackSpeed") return 0;
  if (key === "customDamage" || key.startsWith("damage:")) return 3;
  return 2;
}

let workspace = loadWorkspace();
let state = composeWorkspaceState(workspace);
let savedSetups = loadSavedSetups();
let lastMetrics = null;
let statusTimer = null;
let nodeTooltip = null;
let activeTooltipNode = null;
let pendingWorkspaceAction = null;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const dom = {
  metricDamage: $("#metricDamage"),
  metricDamageDelta: $("#metricDamageDelta"),
  metricDps: $("#metricDps"),
  metricDpsDelta: $("#metricDpsDelta"),
  metricCritRate: $("#metricCritRate"),
  metricCritTotal: $("#metricCritTotal"),
  metricCritDamage: $("#metricCritDamage"),
  metricAttackSpeed: $("#metricAttackSpeed"),
  metricMoveSpeed: $("#metricMoveSpeed"),
  metricSpeedTotal: $("#metricSpeedTotal"),
  metricSpeedExcess: $("#metricSpeedExcess"),
  metricPoints: $("#metricPoints"),
  metricPointHint: $("#metricPointHint"),
  boardPoints: $("#boardPoints"),
  pointFill: $("#pointFill"),
  tierFilter: $("#tierFilter"),
  nodeGrid: $("#nodeGrid"),
  baseEffectList: $("#baseEffectList"),
  comparisonList: $("#comparisonList"),
  setupName: $("#setupName"),
  autosaveStatus: $("#autosaveStatus"),
  profileSelect: $("#profileSelect"),
  nodePresetSelect: $("#nodePresetSelect"),
  activeContextLabel: $("#activeContextLabel"),
  workspaceActionDialog: $("#workspaceActionDialog"),
  workspaceActionForm: $("#workspaceActionForm"),
  workspaceActionTitle: $("#workspaceActionTitle"),
  workspaceActionMessage: $("#workspaceActionMessage"),
  workspaceNameField: $("#workspaceNameField"),
  workspaceNameInput: $("#workspaceNameInput"),
  workspaceActionConfirm: $("#workspaceActionConfirm"),
  statBreakdown: $("#statBreakdown"),
  damageBreakdown: $("#damageBreakdown"),
  formulaBreakdown: $("#formulaBreakdown"),
  breakdownClamp: $("#breakdownClamp"),
  sourceChip: $("#sourceChip"),
  referenceSource: $("#referenceSource"),
  referenceLink: $("#referenceLink"),
  referenceRules: $("#referenceRules"),
  referenceHighlights: $("#referenceHighlights"),
  referenceWarnings: $("#referenceWarnings"),
  engravingDialog: $("#engravingDialog"),
  engravingCount: $("#engravingCount"),
  damageEngravingList: $("#damageEngravingList"),
  utilityEngravingList: $("#utilityEngravingList"),
  selectedEngravings: $("#selectedEngravings"),
  braceletDialog: $("#braceletDialog"),
  braceletCount: $("#braceletCount"),
  supportedBraceletList: $("#supportedBraceletList"),
  unsupportedBraceletList: $("#unsupportedBraceletList"),
  selectedBracelet: $("#selectedBracelet"),
};

init();

function init() {
  ensureNodeLevelKeys();
  persistState();
  renderReference();
  renderTierFilter();
  renderBraceletLists();
  renderEngravingLists();
  bindStaticEvents();
  render();
}

function bindStaticEvents() {
  dom.profileSelect.addEventListener("change", () => switchWorkspaceSelection("profile", dom.profileSelect.value));
  dom.nodePresetSelect.addEventListener("change", () => switchWorkspaceSelection("nodePreset", dom.nodePresetSelect.value));

  $$('[data-profile-action]').forEach(button => {
    button.addEventListener("click", () => handleWorkspaceAction("profile", button.dataset.profileAction));
  });

  $$('[data-node-preset-action]').forEach(button => {
    button.addEventListener("click", () => handleWorkspaceAction("nodePreset", button.dataset.nodePresetAction));
  });

  dom.workspaceActionForm.addEventListener("submit", event => {
    event.preventDefault();
    completeWorkspaceAction();
  });
  $$('[data-workspace-action-cancel]').forEach(button => {
    button.addEventListener("click", () => dom.workspaceActionDialog.close());
  });
  dom.workspaceActionDialog.addEventListener("close", () => {
    pendingWorkspaceAction = null;
  });

  $$("[data-base]").forEach(input => {
    input.addEventListener("input", () => {
      state.base[input.dataset.base] = readNumber(input.value);
      persistState();
      refreshCalculationsOnly();
    });
    input.addEventListener("blur", () => {
      input.value = formatInputValue(state.base[input.dataset.base]);
    });
  });

  $$("[data-setting]").forEach(input => {
    input.addEventListener("input", () => {
      state.settings[input.dataset.setting] = readNumber(input.value);
      persistState();
      refreshCalculationsOnly();
    });
    input.addEventListener("blur", () => {
      input.value = formatInputValue(state.settings[input.dataset.setting]);
    });
  });

  $$("[data-toggle]").forEach(input => {
    input.addEventListener("change", () => {
      state.settings[input.dataset.toggle] = input.checked;
      commit();
    });
  });

  $$("[data-convenience]").forEach(input => {
    input.addEventListener("change", () => {
      const key = input.dataset.convenience;
      state.convenience[key] = key === "evolutionKarmaRank"
        ? clamp(Math.round(readNumber(input.value)), 0, 6)
        : input.value;
      commit();
    });
  });

  $$("[data-convenience-number]").forEach(input => {
    input.addEventListener("input", () => {
      state.convenience[input.dataset.convenienceNumber] = clamp(Math.round(readNumber(input.value)), 0, 100);
      persistState();
      syncManaShareLabel();
      refreshCalculationsOnly();
    });
  });

  $$("[data-convenience-toggle]").forEach(input => {
    input.addEventListener("change", () => {
      state.convenience[input.dataset.convenienceToggle] = input.checked;
      commit();
    });
  });

  $$("[data-accessory-slot]").forEach(input => {
    input.addEventListener("change", () => {
      const slot = input.dataset.accessorySlot;
      const field = input.dataset.accessoryField;
      if (slot === "necklace") {
        state.accessories.necklace[field] = input.value;
      } else if (slot.startsWith("ring-")) {
        const ringIndex = clamp(Math.round(readNumber(slot.slice(5))), 0, 1);
        state.accessories.rings[ringIndex][field] = input.value;
      }
      commit();
    });
  });

  $$('[data-bracelet-stat]').forEach(input => {
    input.addEventListener("input", () => {
      state.bracelet.stats[input.dataset.braceletStat] = clamp(readNumber(input.value), 0, 120);
      persistState();
      refreshCalculationsOnly();
      renderSelectedBracelet();
    });
    input.addEventListener("blur", () => {
      input.value = formatInputValue(state.bracelet.stats[input.dataset.braceletStat]);
    });
  });

  $("#openBracelet").addEventListener("click", () => {
    if (!dom.braceletDialog.open) dom.braceletDialog.showModal();
  });

  dom.braceletDialog.addEventListener("change", event => {
    const select = event.target.closest("[data-bracelet-effect-id]");
    if (!select) return;
    if (select.value === "none") {
      delete state.bracelet.effects[select.dataset.braceletEffectId];
    } else {
      state.bracelet.effects[select.dataset.braceletEffectId] = select.value;
    }
    commit();
  });

  $("#openEngravings").addEventListener("click", () => {
    if (!dom.engravingDialog.open) dom.engravingDialog.showModal();
  });

  dom.engravingDialog.addEventListener("change", event => {
    const select = event.target.closest("[data-engraving-id]");
    if (!select) return;
    if (select.value === "none") {
      delete state.engravings[select.dataset.engravingId];
    } else {
      state.engravings[select.dataset.engravingId] = select.value;
    }
    commit();
  });

  dom.setupName.addEventListener("input", () => {
    state.setupName = dom.setupName.value;
    commit(false);
  });

  $("#addBaseEffect").addEventListener("click", () => {
    state.baseEffects.push({
      id: makeId(),
      label: "새 효과",
      category: "damage:진화형 피해",
      customCategory: "",
      amount: 0,
    });
    commit();
  });

  $$('[data-reset-section]').forEach(button => {
    button.addEventListener("click", () => resetSection(button.dataset.resetSection));
  });

  $("#resetNodes").addEventListener("click", () => {
    Object.keys(state.nodeLevels).forEach(id => {
      state.nodeLevels[id] = 0;
    });
    commit();
  });

  $("#resetAll").addEventListener("click", () => {
    if (!window.confirm("입력값과 노드 선택을 초기화할까요? 저장된 비교 세팅은 유지됩니다.")) return;
    state = cloneState(DEFAULT_STATE);
    ensureNodeLevelKeys();
    commit();
  });

  $("#saveSetup").addEventListener("click", saveCurrentSetup);
  $("#exportState").addEventListener("click", exportState);
  $("#importState").addEventListener("change", importState);

  dom.nodeGrid.addEventListener("click", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    event.preventDefault();
    changeNodeLevel(nodeControl.dataset.nodeId, getNodeLevelStep(nodeControl.dataset.nodeId, event.shiftKey));
  });

  dom.nodeGrid.addEventListener("contextmenu", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    event.preventDefault();
    changeNodeLevel(nodeControl.dataset.nodeId, -getNodeLevelStep(nodeControl.dataset.nodeId, event.shiftKey));
  });

  dom.nodeGrid.addEventListener("keydown", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    if (!["Enter", " ", "Backspace", "Delete"].includes(event.key)) return;
    event.preventDefault();
    const direction = ["Backspace", "Delete"].includes(event.key) ? -1 : 1;
    changeNodeLevel(nodeControl.dataset.nodeId, direction * getNodeLevelStep(nodeControl.dataset.nodeId, event.shiftKey));
  });

  dom.nodeGrid.addEventListener("mouseover", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl || nodeControl === activeTooltipNode) return;
    showNodeTooltip(nodeControl, event);
  });

  dom.nodeGrid.addEventListener("mousemove", event => {
    if (activeTooltipNode) positionNodeTooltip(event.clientX, event.clientY);
  });

  dom.nodeGrid.addEventListener("mouseout", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    if (event.relatedTarget && nodeControl.contains(event.relatedTarget)) return;
    hideNodeTooltip();
  });

  dom.nodeGrid.addEventListener("focusin", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    const rect = nodeControl.getBoundingClientRect();
    showNodeTooltip(nodeControl, { clientX: rect.right, clientY: rect.top + rect.height / 2 });
  });

  dom.nodeGrid.addEventListener("focusout", hideNodeTooltip);

  dom.baseEffectList.addEventListener("input", updateBaseEffectFromEvent);
  dom.baseEffectList.addEventListener("change", updateBaseEffectFromEvent);
  dom.baseEffectList.addEventListener("click", event => {
    const remove = event.target.closest(".remove-effect");
    if (!remove) return;
    const row = remove.closest("[data-effect-id]");
    state.baseEffects = state.baseEffects.filter(effect => effect.id !== row.dataset.effectId);
    commit();
  });

  dom.comparisonList.addEventListener("click", event => {
    const button = event.target.closest("[data-setup-action]");
    if (!button) return;
    const setupId = button.dataset.setupId;
    const setup = savedSetups.find(item => item.id === setupId);
    if (button.dataset.setupAction === "load" && setup) {
      loadComparisonSetup(setup);
    }
    if (button.dataset.setupAction === "delete") {
      savedSetups = savedSetups.filter(item => item.id !== setupId);
      persistSavedSetups();
      renderComparison();
    }
  });
}

function resetSection(section) {
  let label = "설정";

  if (section === "combat") {
    state.base = cloneState(DEFAULT_STATE.base);
    state.settings.pointBudget = DEFAULT_STATE.settings.pointBudget;
    label = "전투 특성";
  } else if (section === "convenience") {
    state.convenience = cloneState(DEFAULT_STATE.convenience);
    ["backAttack", "headAttack"].forEach(key => {
      state.settings[key] = DEFAULT_STATE.settings[key];
    });
    label = "편의 설정";
  } else if (section === "accessories") {
    state.accessories = cloneState(DEFAULT_STATE.accessories);
    label = "악세서리";
  } else if (section === "bracelet") {
    state.bracelet = cloneState(DEFAULT_STATE.bracelet);
    label = "팔찌";
  } else if (section === "engravings") {
    state.engravings = cloneState(DEFAULT_STATE.engravings);
    label = "각인";
  } else if (section === "baseEffects") {
    state.baseEffects = DEFAULT_STATE.baseEffects.map(effect => ({
      ...cloneState(effect),
      id: makeId(),
    }));
    label = "직접 입력 효과";
  } else {
    return;
  }

  commit();
  updateAutosaveStatus(`${label} 초기화됨`);
}

function renderWorkspaceSelectors() {
  const activeProfile = getActiveProfile();
  const activeNodePreset = getActiveNodePreset();

  dom.profileSelect.replaceChildren(...workspace.profiles.map(profile => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === workspace.activeProfileId;
    return option;
  }));

  dom.nodePresetSelect.replaceChildren(...workspace.nodePresets.map(preset => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === workspace.activeNodePresetId;
    return option;
  }));

  $$('[data-profile-action="delete"]').forEach(button => {
    button.disabled = workspace.profiles.length <= 1;
  });
  $$('[data-node-preset-action="delete"]').forEach(button => {
    button.disabled = workspace.nodePresets.length <= 1;
  });

  if (dom.activeContextLabel) {
    dom.activeContextLabel.textContent = `${activeProfile?.name || "캐릭터"} · ${activeNodePreset?.name || "노드"}`;
  }
}

function switchWorkspaceSelection(kind, id) {
  persistState();
  const collection = kind === "profile" ? workspace.profiles : workspace.nodePresets;
  if (!collection.some(item => item.id === id)) return;

  if (kind === "profile") workspace.activeProfileId = id;
  else workspace.activeNodePresetId = id;
  workspace.setupName = "";
  state = composeWorkspaceState(workspace);
  ensureNodeLevelKeys();
  persistState();
  render();
}

function handleWorkspaceAction(kind, action) {
  persistState();
  const isProfile = kind === "profile";
  const collection = isProfile ? workspace.profiles : workspace.nodePresets;
  const current = isProfile ? getActiveProfile() : getActiveNodePreset();
  if (!current) return;
  if (action === "delete" && collection.length <= 1) return;

  const targetLabel = isProfile ? "캐릭터" : "노드 프리셋";
  const fallbackName = action === "create"
    ? (isProfile ? `캐릭터 ${collection.length + 1}` : `노드 ${collection.length + 1}`)
    : action === "duplicate"
      ? getUniqueWorkspaceName(`${current.name} 복사본`, collection)
      : current.name;

  pendingWorkspaceAction = { kind, action, currentId: current.id, fallbackName };
  dom.workspaceActionTitle.textContent = action === "create"
    ? `새 ${targetLabel}`
    : action === "duplicate"
      ? `${targetLabel} 복제`
      : action === "rename"
        ? `${targetLabel} 이름 변경`
        : `${targetLabel} 삭제`;
  dom.workspaceNameField.hidden = action === "delete";
  dom.workspaceActionMessage.hidden = action !== "delete";
  dom.workspaceActionMessage.textContent = action === "delete"
    ? `'${current.name}'을 삭제합니다. 비교 저장 항목은 유지됩니다.`
    : "";
  dom.workspaceNameInput.value = fallbackName;
  dom.workspaceActionConfirm.textContent = action === "delete" ? "삭제" : "확인";
  dom.workspaceActionConfirm.classList.toggle("danger-button", action === "delete");
  if (!dom.workspaceActionDialog.open) dom.workspaceActionDialog.showModal();
  if (action !== "delete") {
    dom.workspaceNameInput.focus();
    dom.workspaceNameInput.select();
  }
}

function completeWorkspaceAction() {
  if (!pendingWorkspaceAction) return;
  const { kind, action, currentId, fallbackName } = pendingWorkspaceAction;
  const isProfile = kind === "profile";
  const collection = isProfile ? workspace.profiles : workspace.nodePresets;
  const current = collection.find(item => item.id === currentId);
  if (!current) {
    dom.workspaceActionDialog.close();
    return;
  }

  if (action === "create" || action === "duplicate") {
    const requestedName = dom.workspaceNameInput.value.trim().slice(0, 40) || fallbackName;
    const name = getUniqueWorkspaceName(requestedName, collection);
    const item = action === "create"
      ? (isProfile ? createProfile(name, DEFAULT_STATE) : createNodePreset(name, emptyNodeLevels()))
      : (isProfile ? createProfile(name, current.state) : createNodePreset(name, current.nodeLevels));
    collection.push(item);
    if (isProfile) workspace.activeProfileId = item.id;
    else workspace.activeNodePresetId = item.id;
  } else if (action === "rename") {
    const requestedName = dom.workspaceNameInput.value.trim().slice(0, 40) || fallbackName;
    current.name = getUniqueWorkspaceName(requestedName, collection, current.id);
    current.updatedAt = new Date().toISOString();
  } else if (action === "delete") {
    if (collection.length <= 1) {
      dom.workspaceActionDialog.close();
      return;
    }
    const nextCollection = collection.filter(item => item.id !== current.id);
    if (isProfile) {
      workspace.profiles = nextCollection;
      workspace.activeProfileId = nextCollection[0].id;
    } else {
      workspace.nodePresets = nextCollection;
      workspace.activeNodePresetId = nextCollection[0].id;
    }
  } else {
    dom.workspaceActionDialog.close();
    return;
  }

  workspace.setupName = "";
  state = composeWorkspaceState(workspace);
  ensureNodeLevelKeys();
  persistState();
  dom.workspaceActionDialog.close();
  render();
}

function getUniqueWorkspaceName(requestedName, collection, excludedId = "") {
  const baseName = String(requestedName || "이름 없음").trim().slice(0, 40) || "이름 없음";
  const usedNames = new Set(collection.filter(item => item.id !== excludedId).map(item => item.name));
  if (!usedNames.has(baseName)) return baseName;
  let index = 2;
  let candidate = "";
  do {
    const suffix = ` ${index}`;
    candidate = `${baseName.slice(0, 40 - suffix.length)}${suffix}`;
    index += 1;
  } while (usedNames.has(candidate));
  return candidate;
}

function render() {
  renderWorkspaceSelectors();
  syncInputs();
  const metrics = calculateMetrics(state);
  const baseline = calculateMetrics({ ...state, nodeLevels: emptyNodeLevels() });
  lastMetrics = metrics;

  renderMetrics(metrics, baseline);
  renderNodes();
  renderBaseEffects();
  renderSelectedBracelet();
  renderSelectedEngravings();
  renderBreakdowns(metrics);
  renderComparison();
  if (typeof syncOptimizerPanel === "function") syncOptimizerPanel();
  updateAutosaveStatus("저장됨");
}

function syncInputs() {
  $$("[data-base]").forEach(input => {
    input.value = formatInputValue(state.base[input.dataset.base]);
  });
  $$("[data-setting]").forEach(input => {
    input.value = formatInputValue(state.settings[input.dataset.setting]);
  });
  $$("[data-toggle]").forEach(input => {
    input.checked = Boolean(state.settings[input.dataset.toggle]);
  });
  $$("[data-convenience]").forEach(input => {
    input.value = String(state.convenience[input.dataset.convenience] ?? "none");
  });
  $$("[data-convenience-number]").forEach(input => {
    input.value = formatInputValue(state.convenience[input.dataset.convenienceNumber]);
  });
  $$("[data-convenience-toggle]").forEach(input => {
    input.checked = Boolean(state.convenience[input.dataset.convenienceToggle]);
  });
  syncManaShareLabel();
  $$("[data-accessory-slot]").forEach(input => {
    const slot = input.dataset.accessorySlot;
    const field = input.dataset.accessoryField;
    input.value = slot === "necklace"
      ? state.accessories.necklace[field]
      : state.accessories.rings[clamp(Math.round(readNumber(slot.slice(5))), 0, 1)][field];
  });
  $$("[data-bracelet-stat]").forEach(input => {
    input.value = formatInputValue(state.bracelet.stats[input.dataset.braceletStat]);
  });
  $$("[data-bracelet-effect-id]").forEach(select => {
    select.value = state.bracelet.effects[select.dataset.braceletEffectId] || "none";
  });
  $$("[data-engraving-id]").forEach(select => {
    select.value = state.engravings[select.dataset.engravingId] || "none";
  });
  dom.setupName.value = state.setupName || "";
}

function syncManaShareLabel() {
  $$("[data-mana-share-value]").forEach(node => {
    const share = clamp(Math.round(readNumber(state.convenience[node.dataset.manaShareValue])), 0, 100);
    node.textContent = `${share}%`;
    node.classList.toggle("muted-value", share >= 100);
  });
}

function renderTierFilter() {
  if (!dom.tierFilter) return;
  const tiers = ["전체", ...Object.keys(EVOLUTION_TIERS)];
  dom.tierFilter.replaceChildren(...tiers.map(tier => {
    const button = document.createElement("button");
    button.type = "button";
    const usage = tier === "전체" ? null : getTierUsage(tier);
    button.textContent = usage ? `${EVOLUTION_TIERS[tier].label} ${usage.points}/${usage.maxPoints}` : tier;
    button.dataset.tier = tier;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      state.selectedTier = tier;
      commit();
    });
    return button;
  }));
}

function renderBraceletLists() {
  const supportedFragment = document.createDocumentFragment();

  BRACELET_EFFECTS.forEach(braceletEffectItem => {
    const row = document.createElement("div");
    const selectId = `bracelet-${braceletEffectItem.id}`;
    row.className = "engraving-row bracelet-option-row";
    row.dataset.braceletEffectRow = braceletEffectItem.id;
    row.innerHTML = `<label for="${selectId}"><strong>${escapeHtml(braceletEffectItem.name)}</strong></label>`;

    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.braceletEffectId = braceletEffectItem.id;
    select.setAttribute("aria-label", `${braceletEffectItem.name} 단계`);

    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.textContent = "미적용";
    select.appendChild(noneOption);

    BRACELET_GRADES.forEach((grade, gradeIndex) => {
      const option = document.createElement("option");
      const gradeAmounts = braceletEffectItem.effects
        .map(effect => `${formatInputValue(effect.amounts[gradeIndex])}%`)
        .join(" / ");
      option.value = grade.value;
      option.textContent = `${grade.label} · ${gradeAmounts}`;
      select.appendChild(option);
    });
    row.appendChild(select);

    const currentEffect = document.createElement("small");
    currentEffect.className = "engraving-current-effect bracelet-current-effect";
    currentEffect.hidden = true;
    row.appendChild(currentEffect);
    supportedFragment.appendChild(row);
  });

  dom.supportedBraceletList.replaceChildren(supportedFragment);
  dom.unsupportedBraceletList.replaceChildren(...BRACELET_UNSUPPORTED_EFFECTS.map(item => {
    const row = document.createElement("div");
    row.className = "bracelet-unsupported-item";
    row.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.summary)}</span>`;
    return row;
  }));
}

function renderSelectedBracelet() {
  const statSelections = BRACELET_STAT_FIELDS
    .map(item => ({ ...item, amount: clamp(readNumber(state.bracelet.stats[item.key]), 0, 120) }))
    .filter(item => item.amount > 0);
  const effectSelections = BRACELET_EFFECTS
    .map(item => ({ ...item, gradeIndex: getBraceletGradeIndex(state.bracelet.effects[item.id]) }))
    .filter(item => item.gradeIndex >= 0);

  dom.braceletCount.textContent = `${statSelections.length + effectSelections.length}개 선택`;

  $$("[data-bracelet-effect-row]").forEach(row => {
    const item = BRACELET_EFFECTS.find(effect => effect.id === row.dataset.braceletEffectRow);
    const gradeIndex = getBraceletGradeIndex(state.bracelet.effects[item.id]);
    const selected = gradeIndex >= 0;
    const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
    const currentEffect = $(".bracelet-current-effect", row);
    row.classList.toggle("active", selected);
    row.classList.toggle("condition-inactive", selected && !conditionActive);
    currentEffect.hidden = !selected;
    currentEffect.textContent = selected
      ? `${item.summaries[gradeIndex]}${conditionActive ? "" : " · 현재 미적용"}`
      : "";
  });

  const chips = [
    ...statSelections.map(item => {
      const chip = document.createElement("span");
      chip.className = "selected-bracelet";
      chip.textContent = `${item.label} +${formatInteger(item.amount)}`;
      return chip;
    }),
    ...effectSelections.map(item => {
      const chip = document.createElement("span");
      const grade = BRACELET_GRADES[item.gradeIndex];
      const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
      chip.className = "selected-bracelet";
      chip.textContent = `${item.name} · ${grade.label}${conditionActive ? "" : " · 미적용"}`;
      return chip;
    }),
  ];

  if (chips.length === 0) {
    const empty = document.createElement("span");
    empty.className = "selected-bracelet-empty";
    empty.textContent = "선택 없음";
    dom.selectedBracelet.replaceChildren(empty);
    return;
  }

  dom.selectedBracelet.replaceChildren(...chips);
}

function renderEngravingLists() {
  const damageFragment = document.createDocumentFragment();
  const utilityFragment = document.createDocumentFragment();

  ENGRAVING_LIBRARY.forEach(engravingItem => {
    const row = document.createElement("div");
    const selectId = `engraving-${engravingItem.id}`;
    row.className = "engraving-row";
    row.dataset.engravingRow = engravingItem.id;
    row.innerHTML = `<label for="${selectId}"><strong>${escapeHtml(engravingItem.name)}</strong></label>`;

    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.engravingId = engravingItem.id;
    select.setAttribute("aria-label", `${engravingItem.name} 단계`);

    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.textContent = "미적용";
    select.appendChild(noneOption);

    ENGRAVING_TIERS.forEach(tier => {
      const option = document.createElement("option");
      option.value = tier.value;
      option.textContent = tier.label;
      select.appendChild(option);
    });
    row.appendChild(select);

    const currentEffect = document.createElement("small");
    currentEffect.className = "engraving-current-effect";
    currentEffect.hidden = true;
    row.appendChild(currentEffect);

    const target = engravingItem.section === "damage" ? damageFragment : utilityFragment;
    target.appendChild(row);
  });

  dom.damageEngravingList.replaceChildren(damageFragment);
  dom.utilityEngravingList.replaceChildren(utilityFragment);
}

function renderSelectedEngravings() {
  const activeEngravings = ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(state.engravings[item.id]) >= 0);
  dom.engravingCount.textContent = `${activeEngravings.length}개 적용`;

  $$("[data-engraving-row]").forEach(row => {
    const engravingItem = ENGRAVING_LIBRARY.find(item => item.id === row.dataset.engravingRow);
    const tierIndex = getEngravingTierIndex(state.engravings[row.dataset.engravingRow]);
    const conditionActive = isDirectionalConditionActive(engravingItem.condition, state.settings);
    const currentEffect = $(".engraving-current-effect", row);
    row.classList.toggle("active", tierIndex >= 0);
    row.classList.toggle("condition-inactive", tierIndex >= 0 && !conditionActive);
    currentEffect.hidden = tierIndex < 0;
    currentEffect.textContent = tierIndex >= 0
      ? `${engravingItem.tierSummaries[tierIndex]}${conditionActive ? "" : " · 현재 미적용"}`
      : "";
  });

  if (activeEngravings.length === 0) {
    const empty = document.createElement("span");
    empty.className = "selected-engraving-empty";
    empty.textContent = "선택 없음";
    dom.selectedEngravings.replaceChildren(empty);
    return;
  }

  dom.selectedEngravings.replaceChildren(...activeEngravings.map(item => {
    const tier = ENGRAVING_TIERS[getEngravingTierIndex(state.engravings[item.id])];
    const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
    const chip = document.createElement("span");
    chip.className = "selected-engraving";
    chip.textContent = `${item.name} · ${tier.label}${conditionActive ? "" : " · 미적용"}`;
    return chip;
  }));
}

function renderMetrics(metrics, baseline) {
  const damageDelta = percentDelta(metrics.damageIndex, baseline.damageIndex);
  const dpsDelta = percentDelta(metrics.dpsIndex, baseline.dpsIndex);
  const budget = Math.max(0, state.settings.pointBudget || 0);
  const pointRatio = budget > 0 ? clamp(metrics.pointsUsed / budget, 0, 1) : 0;

  dom.metricDamage.textContent = formatNumber(metrics.damageIndex);
  dom.metricDamageDelta.textContent = `노드 전 대비 ${formatSignedPercent(damageDelta)}`;
  dom.metricDps.textContent = formatNumber(metrics.dpsIndex);
  dom.metricDpsDelta.textContent = `노드 전 대비 ${formatSignedPercent(dpsDelta)}`;
  dom.metricCritRate.textContent = `${formatNumber(metrics.critRateCapped)}%`;
  dom.metricCritTotal.textContent = `총 ${formatNumber(metrics.critRateRaw)}%`;
  dom.metricCritDamage.textContent = `${formatNumber(metrics.critDamage)}%`;
  dom.metricAttackSpeed.textContent = `공 ${formatNumber(metrics.attackMoveSpeed)}%`;
  dom.metricMoveSpeed.textContent = `이 ${formatNumber(metrics.moveSpeed)}%`;
  dom.metricSpeedTotal.textContent = `총 공 ${formatNumber(metrics.attackSpeedRaw)}% · 이 ${formatNumber(metrics.moveSpeedRaw)}%`;
  dom.metricSpeedExcess.textContent = `초과 공 ${formatNumber(metrics.attackSpeedExcess)}% · 이 ${formatNumber(metrics.moveSpeedExcess)}%`;
  dom.metricSpeedExcess.hidden = metrics.attackSpeedExcess <= 0 && metrics.moveSpeedExcess <= 0;
  dom.metricPoints.textContent = `${formatInteger(metrics.pointsUsed)} / ${formatInteger(budget)}`;
  if (dom.boardPoints) dom.boardPoints.textContent = `${formatInteger(metrics.pointsUsed)} / ${formatInteger(budget)}`;
  dom.metricPointHint.textContent = metrics.pointsUsed > budget ? `${formatInteger(metrics.pointsUsed - budget)} 초과` : `${formatInteger(budget - metrics.pointsUsed)} 남음`;
  dom.metricPointHint.classList.toggle("over", metrics.pointsUsed > budget);
  dom.pointFill.style.width = `${pointRatio * 100}%`;
  dom.pointFill.classList.toggle("over", metrics.pointsUsed > budget);
}

function renderNodes() {
  hideNodeTooltip();
  if (dom.tierFilter) $$("#tierFilter button").forEach(button => {
    const selected = button.dataset.tier === state.selectedTier;
    const usage = button.dataset.tier === "전체" ? null : getTierUsage(button.dataset.tier);
    if (usage) button.textContent = `${EVOLUTION_TIERS[button.dataset.tier].label} ${usage.points}/${usage.maxPoints}`;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  const fragment = document.createDocumentFragment();
  Object.keys(EVOLUTION_TIERS).forEach(tier => {
    const nodes = NODE_LIBRARY.filter(node => node.tier === tier);
    if (nodes.length > 0) fragment.appendChild(createTierRow(tier, nodes));
  });
  dom.nodeGrid.replaceChildren(fragment);
}

function createTierRow(tier, nodes) {
  const tierInfo = EVOLUTION_TIERS[tier];
  const usage = getTierUsage(tier);
  const row = document.createElement("section");
  row.className = "arc-tier-row";
  row.dataset.tier = tier;
  row.innerHTML = `
    <div class="tier-marker" aria-label="${escapeHtml(tierInfo.label)} ${usage.points}/${usage.maxPoints}">
      <div class="tier-diamond"><span>${escapeHtml(tierInfo.label.replace("T", ""))}</span></div>
      <strong>${formatInteger(usage.points)}/${formatInteger(usage.maxPoints)}</strong>
    </div>
    <div class="tier-nodes"></div>
  `;

  const nodeWrap = $(".tier-nodes", row);
  nodes.forEach(node => nodeWrap.appendChild(createNodeCard(node)));
  return row;
}

function createNodeCard(node) {
  const level = state.nodeLevels[node.id] || 0;
  const cost = getNodeCost(node);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "node-card";
  card.dataset.nodeId = node.id;
  card.classList.toggle("active", level > 0);
  card.classList.toggle("maxed", level >= node.maxLevel);
  card.setAttribute("aria-label", `${node.name} Lv. ${level}/${node.maxLevel}`);

  card.innerHTML = `
    <span class="node-cost">${formatInteger(cost)}P</span>
    <span class="node-icon ${node.icon}" aria-hidden="true">${iconSvg(node.icon)}</span>
    <span class="node-level">Lv. ${formatInteger(level)}/${formatInteger(node.maxLevel)}</span>
  `;
  return card;
}

function renderReference() {
  if (dom.sourceChip) dom.sourceChip.textContent = `${REFERENCE_META.title} 기반`;
  if (
    !dom.referenceSource ||
    !dom.referenceLink ||
    !dom.referenceRules ||
    !dom.referenceWarnings ||
    !dom.referenceHighlights
  ) return;

  dom.referenceSource.textContent = `${REFERENCE_META.title} · 최근 수정 ${REFERENCE_META.updatedAt}`;
  dom.referenceLink.href = REFERENCE_META.sourceUrl;

  dom.referenceRules.replaceChildren(...REFERENCE_RULES.map(text => makeReferenceListItem(text)));
  dom.referenceWarnings.replaceChildren(...REFERENCE_WARNINGS.map(text => makeReferenceListItem(text)));
  dom.referenceHighlights.replaceChildren(...REFERENCE_HIGHLIGHTS.map(item => {
    const block = document.createElement("section");
    block.className = "reference-highlight";
    block.innerHTML = `<strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p>`;
    return block;
  }));
}

function renderBaseEffects() {
  const template = $("#baseEffectTemplate");
  const fragment = document.createDocumentFragment();

  state.baseEffects.forEach(effect => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.effectId = effect.id;
    const label = $('[data-effect-field="label"]', row);
    const category = $('[data-effect-field="category"]', row);
    const custom = $('[data-effect-field="customCategory"]', row);
    const amount = $('[data-effect-field="amount"]', row);

    label.value = effect.label;
    category.replaceChildren(...EFFECT_CATEGORIES.map(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      return option;
    }));
    category.value = effect.category;
    custom.value = effect.customCategory || "";
    amount.value = formatInputValue(effect.amount);
    custom.hidden = effect.category !== "customDamage";
    custom.placeholder = "피해 그룹명";

    fragment.appendChild(row);
  });

  dom.baseEffectList.replaceChildren(fragment);
}

function renderBreakdowns(metrics) {
  dom.breakdownClamp.textContent = metrics.critRateRaw > metrics.critRateCapped
    ? `치명타 확률은 기대값 계산에서 ${formatNumber(metrics.critRateCapped)}%로 제한됨`
    : "";

  const statItems = [
    ["치명", metrics.totalStats.critStat],
    ["특화", metrics.totalStats.specStat],
    ["신속", metrics.totalStats.swiftStat],
    ["제압", metrics.totalStats.dominationStat],
    ["인내", metrics.totalStats.enduranceStat],
    ["숙련", metrics.totalStats.expertiseStat],
    ["총 치명타 확률", `${formatNumber(metrics.critRateRaw)}%`],
    ["적용 치명타 확률", `${formatNumber(metrics.critRateCapped)}%`],
    ["총 공격속도", `${formatNumber(metrics.attackSpeedRaw)}%`],
    ["적용 공격속도", `${formatNumber(metrics.attackMoveSpeed)}%`],
    ["초과 공격속도", `${formatNumber(metrics.attackSpeedExcess)}%`],
    ["총 이동속도", `${formatNumber(metrics.moveSpeedRaw)}%`],
    ["적용 이동속도", `${formatNumber(metrics.moveSpeed)}%`],
    ["초과 이동속도", `${formatNumber(metrics.moveSpeedExcess)}%`],
    ["신속 쿨감", `${formatNumber(metrics.cooldownGroups.swift)}%`],
    ["직접 입력 쿨감", `${formatNumber(metrics.cooldownGroups.generic)}%`],
    ["끝마/무마 쿨감", `${formatNumber(metrics.cooldownGroups.mana)}%`],
    ["최훈/타지 쿨감", `${formatNumber(metrics.cooldownGroups.skill)}%`],
    ["적용 쿨감", `${formatNumber(metrics.cooldownReduction)}%`],
    ["재사용 대기시간 증가", `${formatNumber(metrics.cooldownIncrease)}%`],
  ];
  dom.statBreakdown.replaceChildren(...statItems.map(([label, value]) => makeBreakdownRow(label, value)));

  const damageRows = Object.entries(metrics.damageGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => makeBreakdownRow(label, `${formatNumber(value)}%`, value));
  if (damageRows.length === 0) damageRows.push(makeBreakdownRow("피해 그룹", "0.00%"));
  dom.damageBreakdown.replaceChildren(...damageRows);

  const formulaRows = [
    ["치명 기댓값", `${formatNumber(metrics.critFactor)}x`],
    ["치명 조건 피해", `${formatNumber(metrics.critOnlyDamage)}%`],
    ["뭉툭한 가시 전환", `${formatNumber(metrics.bluntThornBonus.damage)}%`],
    ["음속 돌파 전환", `${formatNumber(metrics.sonicBonus)}%`],
    ["돌격대장 전환", `${formatNumber(metrics.raidCaptainDamage)}%`],
    ["피해 그룹 곱", `${formatNumber(metrics.damageMultiplier)}x`],
    ["쿨감 적용", metrics.cooldownGroupLabel],
    ["쿨감 계수", `${formatNumber(metrics.cooldownFactor)}x`],
    ["공속 계수", `${formatNumber(metrics.attackSpeedFactor)}x`],
  ];
  dom.formulaBreakdown.replaceChildren(...formulaRows.map(([label, value]) => makeFormulaRow(label, value)));
}

function renderComparison() {
  if (savedSetups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "저장된 세팅 없음";
    dom.comparisonList.replaceChildren(empty);
    return;
  }

  const current = lastMetrics || calculateMetrics(state);
  const fragment = document.createDocumentFragment();
  savedSetups.forEach(setup => {
    const metrics = calculateMetrics(setup.state);
    const context = [setup.profileName, setup.nodePresetName].filter(Boolean).join(" · ");
    const item = document.createElement("article");
    item.className = "comparison-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(setup.name)}</strong>
        ${context ? `<small class="comparison-context">${escapeHtml(context)}</small>` : ""}
        <span>${formatNumber(metrics.damageIndex)} / ${formatNumber(metrics.dpsIndex)}</span>
        <small>현재 DPS 대비 ${formatSignedPercent(percentDelta(metrics.dpsIndex, current.dpsIndex))}</small>
      </div>
      <div class="comparison-actions">
        <button class="mini-button" data-setup-action="load" data-setup-id="${setup.id}" type="button">불러오기</button>
        <button class="icon-button small" data-setup-action="delete" data-setup-id="${setup.id}" type="button" aria-label="삭제">${miniIcon("trash")}</button>
      </div>
    `;
    fragment.appendChild(item);
  });
  dom.comparisonList.replaceChildren(fragment);
}

function updateBaseEffectFromEvent(event) {
  const row = event.target.closest("[data-effect-id]");
  const field = event.target.dataset.effectField;
  if (!row || !field) return;
  const effect = state.baseEffects.find(item => item.id === row.dataset.effectId);
  if (!effect) return;

  if (field === "amount") {
    effect.amount = readNumber(event.target.value);
  } else {
    effect[field] = event.target.value;
  }

  if (field === "category") {
    commit();
    return;
  }

  persistState();
  refreshCalculationsOnly();
}

function showNodeTooltip(nodeControl, point) {
  const node = NODE_LIBRARY.find(item => item.id === nodeControl.dataset.nodeId);
  if (!node) return;
  const tooltip = ensureNodeTooltip();
  activeTooltipNode = nodeControl;
  tooltip.innerHTML = formatNodeTooltip(node, state.nodeLevels[node.id] || 0);
  tooltip.hidden = false;
  positionNodeTooltip(point.clientX, point.clientY);
}

function hideNodeTooltip() {
  activeTooltipNode = null;
  if (nodeTooltip) nodeTooltip.hidden = true;
}

function ensureNodeTooltip() {
  if (!nodeTooltip) {
    nodeTooltip = document.createElement("div");
    nodeTooltip.className = "node-tooltip";
    nodeTooltip.setAttribute("role", "tooltip");
    nodeTooltip.hidden = true;
    document.body.appendChild(nodeTooltip);
  }
  return nodeTooltip;
}

function positionNodeTooltip(clientX, clientY) {
  const tooltip = ensureNodeTooltip();
  if (tooltip.hidden) return;
  const margin = 12;
  const gap = 18;
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + gap;
  let top = clientY + gap;

  if (left + rect.width > window.innerWidth - margin) left = clientX - rect.width - gap;
  if (top + rect.height > window.innerHeight - margin) top = clientY - rect.height - gap;

  tooltip.style.left = `${clamp(left, margin, Math.max(margin, window.innerWidth - rect.width - margin))}px`;
  tooltip.style.top = `${clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin))}px`;
}

function formatNodeTooltip(node, level) {
  const cost = getNodeCost(node);
  const effectLines = getTooltipEffectLines(node, level);
  return `
    <strong>${escapeHtml(node.name)}</strong>
    <small>${escapeHtml(node.tier)} · ${formatInteger(cost)}P · Lv. ${formatInteger(level)}/${formatInteger(node.maxLevel)}</small>
    <span class="tooltip-effects">${effectLines.map(line => `<em>${escapeHtml(line)}</em>`).join("")}</span>
  `;
}

function getTooltipEffectLines(node, level) {
  if (node.id === "e5-blunt-thorn") {
    const metrics = lastMetrics || calculateMetrics(state);
    const converted = calculateBluntThornBonus(level, metrics.critRateRaw).damage;
    return [
      ...node.effects.filter(effect => effect.kind === "damage").map(effect => formatEffect(effect, level)),
      "치명타 확률 상한 80%",
      `초과 치적 전환 +${formatNumber(converted)}%`,
    ];
  }

  if (node.id === "e5-sonic-breakthrough") {
    const metrics = lastMetrics || calculateMetrics(state);
    const sonic = calculateSonicBreakthroughBonus(level, metrics.attackSpeed, metrics.moveSpeedBonus);
    return [
      `진화형 피해 +${formatNumber(sonic.damage)}%`,
      `기본 ${formatNumber(sonic.baseDamage)}% · 상한 ${formatNumber(sonic.capBonus)}% · 초과 ${formatNumber(sonic.excessDamage)}%`,
      `총 공속 ${formatNumber(metrics.attackSpeedRaw)}% · 초과 ${formatNumber(metrics.attackSpeedExcess)}%`,
      `총 이속 ${formatNumber(metrics.moveSpeedRaw)}% · 초과 ${formatNumber(metrics.moveSpeedExcess)}%`,
    ];
  }

  const primaryEffects = node.effects.filter(effect => effect.kind !== "note" && effect.kind !== "special");
  const tooltipEffects = primaryEffects.length > 0 ? primaryEffects : node.effects;
  return tooltipEffects.map(effect => formatEffect(effect, level));
}

function changeNodeLevel(id, delta) {
  const node = NODE_LIBRARY.find(item => item.id === id);
  if (!node) return;
  setNodeLevel(id, (state.nodeLevels[id] || 0) + delta);
}

function getNodeLevelStep(id, isLargeStep) {
  const node = NODE_LIBRARY.find(item => item.id === id);
  if (!node) return 1;
  return isLargeStep ? Math.min(10, node.maxLevel) : 1;
}

function setNodeLevel(id, level) {
  const node = NODE_LIBRARY.find(item => item.id === id);
  if (!node) return;
  const cost = getNodeCost(node);
  const tier = EVOLUTION_TIERS[node.tier];
  const usedByOtherNodes = getTierUsage(node.tier, id).points;
  const tierLimitedMax = tier ? Math.floor((tier.maxPoints - usedByOtherNodes) / cost) : node.maxLevel;
  state.nodeLevels[id] = clamp(Math.round(level), 0, Math.min(node.maxLevel, tierLimitedMax));
  commit();
}

function saveCurrentSetup() {
  const metrics = calculateMetrics(state);
  const profile = getActiveProfile();
  const nodePreset = getActiveNodePreset();
  const name = (state.setupName || "").trim() || `${profile.name} · ${nodePreset.name}`;
  savedSetups.unshift({
    id: makeId(),
    name,
    profileId: profile.id,
    profileName: profile.name,
    nodePresetId: nodePreset.id,
    nodePresetName: nodePreset.name,
    createdAt: new Date().toISOString(),
    state: cloneState(state),
    summary: {
      damageIndex: metrics.damageIndex,
      dpsIndex: metrics.dpsIndex,
    },
  });
  savedSetups = savedSetups.slice(0, 20);
  persistSavedSetups();
  updateAutosaveStatus("비교 저장됨");
  renderComparison();
}

function loadComparisonSetup(setup) {
  persistState();
  const snapshotState = mergeState(DEFAULT_STATE, setup.state || DEFAULT_STATE);
  let profile = setup.profileId
    ? workspace.profiles.find(item => item.id === setup.profileId)
    : null;
  let nodePreset = setup.nodePresetId
    ? workspace.nodePresets.find(item => item.id === setup.nodePresetId)
    : null;

  if (!profile) {
    const profileName = getUniqueWorkspaceName(
      setup.profileName || `${setup.name || "비교 세팅"} 캐릭터`,
      workspace.profiles,
    );
    profile = createProfile(profileName, snapshotState);
    workspace.profiles.push(profile);
  } else {
    profile.state = extractProfileState(snapshotState);
    profile.updatedAt = new Date().toISOString();
  }

  if (!nodePreset) {
    const presetName = getUniqueWorkspaceName(
      setup.nodePresetName || `${setup.name || "비교 세팅"} 노드`,
      workspace.nodePresets,
    );
    nodePreset = createNodePreset(presetName, snapshotState.nodeLevels);
    workspace.nodePresets.push(nodePreset);
  } else {
    nodePreset.nodeLevels = normalizeNodeLevels(snapshotState.nodeLevels);
    nodePreset.updatedAt = new Date().toISOString();
  }

  workspace.activeProfileId = profile.id;
  workspace.activeNodePresetId = nodePreset.id;
  workspace.selectedTier = snapshotState.selectedTier || "전체";
  workspace.setupName = "";
  state = composeWorkspaceState(workspace);
  ensureNodeLevelKeys();
  persistState();
  render();
}

// 옛 저장본은 슬라이더 하나만 갖고 있다. 그때의 해석은 "마나 스킬 N%, 나머지는
// 끝마/무마를 그대로 받는 무언가"였으므로 나머지를 3번에 넣어야 값이 보존된다.
function normalizeDamageMix(convenience) {
  const mix = convenience?.damageMix;
  if (mix && typeof mix === "object") {
    const shares = {};
    let total = 0;
    DAMAGE_MIX_KEYS.forEach(key => {
      const value = Math.max(0, readNumber(mix[key]));
      shares[key] = value;
      total += value;
    });
    if (total > 0) return { shares, total, feederMana: mix.feederMana !== false };
  }
  const manaShare = clamp(readNumber(convenience?.manaShare ?? 100), 0, 100);
  return {
    shares: {
      manaCooldown: manaShare,
      plainCooldown: 0,
      identityPlain: 100 - manaShare,
      identityMana: 0,
    },
    total: 100,
    feederMana: true,
  };
}

// 마효증 계열(마나 전용 피해)에 곱할 비중 — 마나를 쓰는 스킬의 딜 비중.
function getManaShareRatio(convenience) {
  const { shares, total } = normalizeDamageMix(convenience);
  return (shares.manaCooldown + shares.identityMana) / total;
}

// 끝마/무마 쿨감이 실제로 사이클을 당겨 주는 딜의 비중.
// 아이덴티티 소모기는 자기가 마나를 안 써도, 아덴을 채우는 수급기가 마나를 쓰면
// 그 쿨이 당겨지는 만큼 같이 빨라진다.
function getManaCooldownShareRatio(convenience) {
  const { shares, total, feederMana } = normalizeDamageMix(convenience);
  const identityPlain = feederMana ? shares.identityPlain : 0;
  return (shares.manaCooldown + shares.identityMana + identityPlain) / total;
}

// 딜의 일부에만 붙는 쿨감의 "남은 시간" 비율.
//
// 딜의 β만 이 쿨감을 받는다면 사이클 단축도 β만큼만 일어난다. 감소율을 그냥
// β배 하는 것은 틀리고, 속도(1/남은시간)를 섞어야 맞는다.
//
//   1/R_eff = (1−β) + β/R    →    R_eff = 1 / ((1−β) + β/R)
//
// β=1이면 R_eff=R, β=0이면 R_eff=1로 자연히 떨어진다.
function blendCooldownRemain(reduction, share) {
  const beta = clamp(readNumber(share), 0, 1);
  if (beta <= 0) return 1;
  const remain = Math.max(0, 1 - readNumber(reduction) / 100);
  if (remain <= 0) return 0;
  return 1 / (1 - beta + beta / remain);
}

function calculateMetrics(inputState) {
  const convenience = { ...DEFAULT_STATE.convenience, ...(inputState.convenience || {}) };
  const manaShare = getManaShareRatio(convenience);
  const accessories = normalizeAccessories(inputState.accessories);
  const bracelet = normalizeBracelet(inputState.bracelet);
  const totalStats = {
    critStat: readNumber(inputState.base.critStat),
    specStat: readNumber(inputState.base.specStat),
    swiftStat: readNumber(inputState.base.swiftStat),
    dominationStat: readNumber(inputState.base.dominationStat),
    enduranceStat: readNumber(inputState.base.enduranceStat),
    expertiseStat: readNumber(inputState.base.expertiseStat),
  };
  if (Object.hasOwn(totalStats, convenience.petStat)) {
    totalStats[convenience.petStat] += ARC_PASSIVE_CONSTANTS.petStatBonus;
  }
  const percentBonuses = {
    critRate: 0,
    critDamage: 0,
    attackSpeed: 0,
    attackSpeedOnly: 0,
    moveSpeedOnly: 0,
    cooldownReduction: 0,
    cooldownIncrease: 0,
    manaCooldownReduction: 0,
    skillCooldownReduction: 0,
    critOnlyDamage: 0,
  };
  const damageGroups = {};
  // 평면 증가는 여기 모아 둔다. 퍼센트로 바꾸려면 기준값이 필요한데,
  // 그 나눗셈은 출처를 다 걷은 뒤 한 번만 하는 편이 읽기 쉽다.
  const flatBonuses = emptyFlatBonuses();
  const specials = {
    bluntThorn: 0,
    sonicBreakthrough: 0,
  };
  let pointsUsed = 0;

  NODE_LIBRARY.forEach(node => {
    const level = clamp(Math.round(inputState.nodeLevels?.[node.id] || 0), 0, node.maxLevel);
    pointsUsed += level * getNodeCost(node);
    node.effects.forEach(effect => {
      applyEffect(effect, level, totalStats, percentBonuses, damageGroups, specials, manaShare, inputState.settings);
    });
  });

  // 속도를 재료로 삼는 항목은 여기서 값을 정할 수 없다. 모아 두었다가
  // finalizeMetrics가 속도를 확정한 뒤에 건다.
  const conversions = [];
  (inputState.baseEffects || []).forEach(effect => {
    applyBaseEffect(effect, percentBonuses, damageGroups, conversions, flatBonuses);
  });

  const accessoryBonuses = calculateAccessoryBonuses(accessories);
  percentBonuses.critRate += accessoryBonuses.critRate;
  percentBonuses.critDamage += accessoryBonuses.critDamage;
  addDamageGroup(damageGroups, "추가 피해", accessoryBonuses.additionalDamage);
  addDamageGroup(damageGroups, "주는 피해", accessoryBonuses.dealtDamage);
  addDamageGroup(damageGroups, "공격력", accessoryBonuses.attackPower);
  addDamageGroup(damageGroups, "무기 공격력", accessoryBonuses.weaponAttack);

  const karmaDamage = clamp(Math.round(readNumber(convenience.evolutionKarmaRank)), 0, 6);
  addDamageGroup(damageGroups, "진화형 피해", karmaDamage);
  // 정열의 춤사위 — 서폿 아크 그리드. 진화 카르마와 같은 그룹이라 합연산이다.
  addDamageGroup(damageGroups, "진화형 피해", passionDanceAmount(convenience.passionDance));

  const goddessNodeLevel = clamp(
    Math.round(readNumber(inputState.nodeLevels?.["e2-goddess-blessing"])),
    0,
    3,
  );
  if (convenience.goddessBlessing) {
    const goddessNodeSpeed = goddessNodeLevel * 3;
    percentBonuses.attackSpeed += Math.max(0, ARC_PASSIVE_CONSTANTS.goddessBlessingSpeed - goddessNodeSpeed);
  }
  if (convenience.feast) {
    percentBonuses.attackSpeed += ARC_PASSIVE_CONSTANTS.feastSpeed;
  }
  applyFoodEffects(convenience.food, percentBonuses, flatBonuses);

  if (inputState.settings.backAttack) {
    percentBonuses.critRate += ARC_PASSIVE_CONSTANTS.backAttackCritRate;
    addDamageGroup(damageGroups, "주는 피해", ARC_PASSIVE_CONSTANTS.backAttackDamage);
  }
  if (inputState.settings.headAttack) {
    addDamageGroup(damageGroups, "헤드어택 피해", ARC_PASSIVE_CONSTANTS.headAttackDamage);
  }

  applyArkGridEffects(inputState.arkGrid, percentBonuses, damageGroups, flatBonuses);
  const awakening = applyAwakeningEffects(inputState.awakening, percentBonuses, damageGroups, conversions);
  const synergy = applySynergyEffects(inputState, percentBonuses, damageGroups);
  applyCollectionEffects(inputState.collection, totalStats, damageGroups);
  applyWeaponEffects(inputState.weapon, damageGroups);
  applyBraceletEffects(bracelet, inputState.settings, totalStats, percentBonuses, damageGroups, flatBonuses);

  const engravingSpecials = applyEngravingEffects(
    inputState.engravings,
    percentBonuses,
    damageGroups,
    manaShare,
    inputState.settings,
    inputState.engravingStones,
  );

  // 걷은 평면 증가를 퍼센트로 바꾼다. 기준값이 비어 있으면 못 센 목록만 남는다.
  const attack = assembleAttack(inputState);
  const droppedFlat = applyFlatAttackBonuses(flatBonuses, attack, damageGroups);

  return finalizeMetrics({
    settings: inputState.settings,
    specDamagePer100: readNumber(inputState.base.specDamagePer100),
    critDamageBonus: 0,
    totalStats,
    percentBonuses,
    damageGroups,
    specials,
    engravingSpecials,
    pointsUsed,
    accessoryBonuses,
    manaCooldownShare: getManaCooldownShareRatio(convenience),
    staggerShareRatio: getStaggerShare(convenience),
    conversions,
    attack,
    flatBonuses,
    droppedFlat,
    awakening,
    synergy,
    jewelCooldownPercent: inputState.jewel?.cooldown,
    specBundles: inputState.specBundles,
    support: inputState?.convenience?.support,
  });
}

// Shared tail of the damage model. `calculateMetrics` and the combination search
// both funnel into this so the two paths can never drift apart.
function finalizeMetrics(context) {
  const {
    settings,
    specDamagePer100,
    critDamageBonus,
    totalStats,
    percentBonuses,
    damageGroups,
    specials,
    engravingSpecials,
    pointsUsed,
    accessoryBonuses,
    manaCooldownShare,
    staggerShareRatio,
    conversions,
    attack,
    flatBonuses,
    droppedFlat,
    awakening,
    synergy,
    jewelCooldownPercent,
    specBundles,
    support,
  } = context;

  const manaCooldownCoverage = clamp(readNumber(manaCooldownShare ?? 1), 0, 1);
  const specDamage = (totalStats.specStat / 100) * readNumber(specDamagePer100);
  if (specDamage !== 0) {
    addDamageGroup(damageGroups, "특화 효율", specDamage);
  }

  const critRateFromStat = totalStats.critStat * ARC_PASSIVE_CONSTANTS.critRatePerCrit;
  const attackSpeedFromSwift = totalStats.swiftStat * ARC_PASSIVE_CONSTANTS.attackSpeedPerSwift;
  const cooldownFromSwift = totalStats.swiftStat * ARC_PASSIVE_CONSTANTS.cooldownPerSwift;
  const sharedSpeedBonus = attackSpeedFromSwift + percentBonuses.attackSpeed;
  const attackSpeed = sharedSpeedBonus + percentBonuses.attackSpeedOnly;
  const moveSpeedBonus = sharedSpeedBonus + percentBonuses.moveSpeedOnly;
  // 2단 — 속도·특성을 읽어 치명타/쿨감을 만드는 식. 치적이 정해지기 전에 건다.
  // 예) 기민함: 기본 공격 속도 증가량 %의 120%만큼 치명타 피해
  const stage1Variables = buildFormulaVariables(attackSpeed, moveSpeedBonus, totalStats, null);
  const stage2Results = applyFormulaEffects(
    conversions, stage1Variables, percentBonuses, damageGroups, 2,
  );

  const critRateRaw = Math.max(
    critRateFromStat + percentBonuses.critRate,
    engravingSpecials.critRateMinimum,
  );
  const attackSpeedRaw = 100 + attackSpeed;
  const moveSpeedRaw = 100 + moveSpeedBonus;
  const attackSpeedExcess = Math.max(0, attackSpeedRaw - 140);
  const moveSpeedExcess = Math.max(0, moveSpeedRaw - 140);
  const appliedAttackSpeedBonus = clamp(attackSpeed, -99, 40);
  const attackMoveSpeed = 100 + appliedAttackSpeedBonus;
  const moveSpeed = 100 + clamp(moveSpeedBonus, -99, 40);
  const raidCaptainDamage = clamp(moveSpeedBonus, 0, 40) * engravingSpecials.raidCaptainRate / 100;
  addDamageGroup(damageGroups, "주는 피해", raidCaptainDamage);
  // 쿨감은 피해 그룹과 같은 규칙이다. 네 그룹이 있고, 그룹 안에서는 더하고
  // 그룹끼리는 곱한다. 넷 다 적용된다 — 어느 하나를 골라 버리지 않는다.
  //   신속 · 직접 입력(일반) · 끝마/무마 · 최훈/타지
  // 끝마/무마만 예외다. 마나를 쓰는 스킬에만 붙으므로, 그 혜택을 받는 딜
  // 비중만큼만 사이클이 당겨진다. 나머지 세 그룹은 전 스킬에 걸린다.
  const manaCooldownRemain = blendCooldownRemain(
    percentBonuses.manaCooldownReduction,
    manaCooldownCoverage,
  );
  const cooldownGroups = {
    swift: cooldownFromSwift,
    generic: percentBonuses.cooldownReduction,
    mana: (1 - manaCooldownRemain) * 100,
    skill: percentBonuses.skillCooldownReduction,
    jewel: clamp(readNumber(jewelCooldownPercent), 0, 100),
  };
  // 곱은 "남은 쿨타임"으로 계산해야 맞는다. 감소율을 더하면 부풀려진다.
  const cooldownRemain = COOLDOWN_GROUP_KEYS.reduce(
    (acc, key) => acc * (1 - readNumber(cooldownGroups[key]) / 100),
    1,
  );
  const cooldownReduction = (1 - cooldownRemain) * 100;
  const cooldownGroupLabel = getCooldownGroupLabel(cooldownGroups);
  const bluntThornBonus = calculateBluntThornBonus(specials.bluntThorn, critRateRaw);
  const sonicBreakdown = calculateSonicBreakthroughBonus(
    specials.sonicBreakthrough,
    attackSpeed,
    moveSpeedBonus,
  );
  const sonicBonus = sonicBreakdown.damage;
  if (bluntThornBonus.damage > 0) {
    addDamageGroup(damageGroups, "진화형 피해", bluntThornBonus.damage);
  }
  if (sonicBonus > 0) {
    addDamageGroup(damageGroups, "진화형 피해", sonicBonus);
  }

  const critCap = specials.bluntThorn > 0 ? 80 : 100;
  const critRateCapped = clamp(critRateRaw, 0, critCap);
  const critDamage = Math.max(
    100,
    ARC_PASSIVE_CONSTANTS.baseCritDamage + readNumber(critDamageBonus) + percentBonuses.critDamage,
  );

  // 3단 — 치명타까지 정해진 뒤에 피해 그룹을 만드는 식.
  // 예) 성검 개방: 모든 치명타 발생 확률 1%당 주는 피해 0.55% (최대 55%)
  const stage2Variables = buildFormulaVariables(attackSpeed, moveSpeedBonus, totalStats, {
    rateCapped: critRateCapped, rateRaw: critRateRaw, damage: critDamage,
  });
  const stage3Results = applyFormulaEffects(
    conversions, stage2Variables, percentBonuses, damageGroups, 3,
  );
  const formulaResults = [...stage2Results, ...stage3Results].filter(Boolean);

  // 제압은 무력화 대상 피해로 바뀐다. 특성이 다 모인 뒤에 한 번 얹는다.
  const staggerShare = clamp(readNumber(staggerShareRatio ?? 0), 0, 1);
  if (staggerShare > 0) {
    addDamageGroup(
      damageGroups, "무력화 대상 피해",
      readNumber(totalStats.dominationStat) * ARC_PASSIVE_CONSTANTS.staggerDamagePerDomination,
    );
  }

  const critChance = critRateCapped / 100;
  const critOnlyMultiplier = 1 + percentBonuses.critOnlyDamage / 100;
  const critFactor = (1 - critChance) + critChance * (critDamage / 100) * critOnlyMultiplier;

  /**
   * 공격력 사슬 — 게임 수식의 A~E.
   *
   *   A 힘민지 = 총합 × (1 + 힘민지 증가율)
   *   B 무공   = 총합 × (1 + 무공 증가율)
   *   C 순수   = √(A × B ÷ 6)
   *   D 기본   = C × (1 + 보석 기본 공격력 + 어빌리티 스톤)
   *   E 최종   = (D + 공격력 평면 + 서폿 공증) × (1 + 공격력 증가율) × (1 + 투지 강화)
   *
   * 한동안 이 사슬이 통째로 없었다. 힘민지·무기 공격력은 '피해 그룹'에 퍼센트로
   * 담고 √를 그룹 배수 쪽에서 흉내 냈고(SQRT_DAMAGE_GROUPS), 절대값은 아예 안
   * 실었다. 진화 배분만 견줄 때는 그래도 됐다 — 공격력이 모든 후보에 똑같이
   * 곱해져 순위를 안 바꾸니까.
   *
   * 그런데 악세를 견주려면 그게 안 된다. 주스탯 11,000을 얹어도 지수가 0.000%
   * 움직이고, 평면 무공을 더하면 오히려 내려갔다(평면을 퍼센트로 바꿀 때 쓰는
   * 분모가 같이 커져서). 사슬을 제대로 세우면 그 둘이 제자리를 찾는다.
   *
   * 비는 그대로다 — C = √(A×B÷6)이 √를 원래대로 처리하므로, 진화 배분끼리의
   * 순위와 증감은 예전과 같다. 달라지는 것은 지수의 눈금뿐이다.
   */
  //
  // 연마 퍼센트는 악세 모델(귀걸이 상중하)이 들고 있다. assembleAttack이 쓰는
  // attack.weaponPercent와 같은 것이라, 둘 다 곱하면 3.6%가 두 번 실린다 —
  // 그래서 여기서는 조립한 값이 아니라 평면(weaponBase)에서 다시 세운다.
  //
  // 기준값을 모르면 사슬은 아예 안 선다.
  //
  // 예전에는 평면만 들고도 값을 만들었다. 사전 세팅에 공격력을 안 적은 채
  // 팔찌 무공 +9,000만 있으면 그게 무공 전부가 되어, 팔찌를 빼면 딜이 0이
  // 되고 "이 팔찌가 +162%"라는 답이 나왔다. 모르는 것은 모른다고 해야 한다 —
  // 그 사실은 droppedFlat이 이미 따로 알린다.
  const mainBase = Math.max(0, readNumber(attack.mainBase));
  const weaponBase = Math.max(0, readNumber(attack.weaponBase));
  const chainKnown = mainBase > 0 && weaponBase > 0;
  const mainFlatSum = chainKnown ? mainBase + readNumber(flatBonuses.mainStat) : 0;
  const mainStatTotal = mainFlatSum
    * (1 + readNumber(attack.mainScalePercent) / 100)
    * (1 + readNumber(damageGroups["힘민지"]) / 100);
  const weaponFlatSum = chainKnown ? weaponBase + readNumber(flatBonuses.weaponAttack) : 0;
  const weaponTotal = weaponFlatSum
    * (1 + (readNumber(attack.karmaWeaponPercent) + readNumber(damageGroups["무기 공격력"])) / 100);
  const pureAttack = Math.sqrt(Math.max(0, mainStatTotal * weaponTotal / 6));
  const baseAttack = (pureAttack + Math.max(0, readNumber(attack?.baseFlat)))
    * (1 + Math.max(0, readNumber(attack?.baseScalePercent)) / 100);
  // 서폿 공증은 퍼센트가 아니라 평면이다 — 버프 시전자의 기본 공격력 × 22% ×
  // (1 + 아군 공격력 강화 효과 증가)가 내 기본 공격력에 더해진다. 괄호 안에
  // 들어가기 때문에 무공·힘민지를 희석한다. 곱연산 그룹으로 두면 그 희석이
  // 일어나지 않아서, 서폿이 붙어도 귀걸이 무공의 값어치가 그대로 나온다.
  const supportAttack = chainKnown ? supportAttackPower(support, baseAttack) : 0;
  const finalAttack = chainKnown
    ? (baseAttack + readNumber(flatBonuses.attackPower) + supportAttack)
      * (1 + readNumber(damageGroups["공격력"]) / 100)
      * (1 + readNumber(damageGroups["시너지 공격력"]) / 100)
    : 0;

  // 위 셋은 사슬이 삼켰다. 피해 배수에서 또 곱하면 두 번이다.

  // 평시 배수와 무력화 배수를 따로 접는다. 무력화 쪽은 대난투 비중만큼만 섞는다.
  // 사슬이 서면 그 넷은 사슬이 삼킨다. 안 서면(공격력을 모르면) 예전처럼
  // 여기서 곱한다 — 안 그러면 귀걸이 연마가 통째로 사라진다.
  const plainMultiplier = Object.entries(damageGroups)
    .filter(([key]) => !STAGGER_DAMAGE_GROUPS.has(key) && !(chainKnown && ATTACK_CHAIN_GROUPS.has(key)))
    .reduce((acc, [key, value]) => acc * damageGroupFactor(key, value), 1);
  const staggerMultiplier = Object.entries(damageGroups)
    .filter(([key]) => STAGGER_DAMAGE_GROUPS.has(key))
    .reduce((acc, [key, value]) => acc * damageGroupFactor(key, value), 1);
  const staggerBlend = 1 - staggerShare + staggerShare * staggerMultiplier;
  // 특화 묶음. 특성 합이 다 선 뒤의 특화로 계산해야 탐색 후보마다 제대로 갈린다.
  const specBundleResult = specBundleBlend(specBundles, totalStats);
  const damageMultiplier = plainMultiplier * staggerBlend * specBundleResult.blend;
  const cooldownIncrease = Math.max(0, percentBonuses.cooldownIncrease);
  // 쿨감은 언제나 DPS에 실린다. 끄는 스위치가 있었는데, 끄면 DPS가 한 방 딜과
  // 같아져서 곡선이 점 하나로 무너진다 — 계산기가 하는 일이 사라진다.
  const cooldownFactor = 1 / ((1 - clamp(cooldownReduction, 0, 80) / 100) * (1 + cooldownIncrease / 100));
  // 공속을 DPS에 곱하지 않는다. 공속이 곧 딜 사이클 단축이라는 근거가 약하고,
  // 공속의 실제 이득은 음속 돌파의 진화형 피해 전환으로만 반영한다.
  const attackSpeedFactor = 1;
  // 지수는 공격력 사슬 위에 선다. 1,000으로 나누는 것은 눈금일 뿐이고 —
  // 공격력을 모르는 상태(불러오기 전)에서는 사슬이 0이라 지수가 통째로 0이
  // 되므로, 그때는 예전처럼 100을 쓴다. 견주는 데는 비만 필요하다.
  const attackScale = finalAttack > 0 ? finalAttack / 1000 : 100;
  const damageIndex = attackScale * critFactor * damageMultiplier;
  const dpsIndex = damageIndex * cooldownFactor * attackSpeedFactor;

  /**
   * 대난투 지수 — 무력화 가중을 100%로 둔 한 방 딜.
   *
   * 사용자의 '대난투 딜 비중'과 무관하게 언제나 잰다. 그 칸은 "내 로테이션에서
   * 대난투가 몇 %냐"를 적는 자리이고, 이 지수는 "대난투만 재면 누가 제일 센가"라
   * 서 묻는 것이 다르다.
   *
   * 비중이 0이면 무력화 그룹이 damageGroups에 아예 안 들어간다. 그 몫을 여기서
   * 따로 얹는다 — damageGroups 자체는 안 건드린다. 계기판이 읽는 것이라,
   * 비중을 0으로 둔 사람에게 없는 줄이 보이면 그게 거짓말이 된다.
   */
  const staggerFullGroups = { ...damageGroups };
  if (!(staggerShare > 0)) {
    addDamageGroup(
      staggerFullGroups, "무력화 대상 피해",
      readNumber(totalStats.dominationStat) * ARC_PASSIVE_CONSTANTS.staggerDamagePerDomination,
    );
  }
  const staggerFullMultiplier = Object.entries(staggerFullGroups)
    .filter(([key]) => STAGGER_DAMAGE_GROUPS.has(key))
    .reduce((acc, [key, value]) => acc * damageGroupFactor(key, value), 1);
  const staggerIndex = 100 * critFactor * plainMultiplier * staggerFullMultiplier * specBundleResult.blend;

  return {
    totalStats,
    percentBonuses,
    damageGroups,
    specials,
    engravingSpecials,
    bluntThornBonus,
    sonicBonus,
    sonicBreakdown,
    pointsUsed,
    critRateFromStat,
    // 신속이 얼마나 속도로 환산됐는지 — 계기판의 공이속 출처 목록에 필요하다.
    attackSpeedFromSwift,
    // 식으로 적은 효과들의 실제 결과. 계기판이 출처로 적는다.
    formulaResults,
    formulaVariables: stage2Variables,
    critRateRaw,
    critRateCapped,
    critDamage,
    attackSpeed,
    attackSpeedRaw,
    attackSpeedExcess,
    attackMoveSpeed,
    moveSpeedBonus,
    moveSpeedRaw,
    moveSpeedExcess,
    moveSpeed,
    raidCaptainDamage,
    accessoryBonuses,
    cooldownGroups,
    cooldownGroupLabel,
    // 끝마/무마의 "깎이기 전" 값과 그 축소 비중 — 계기판이 근거를 보여줘야 한다.
    manaCooldownRaw: readNumber(percentBonuses.manaCooldownReduction),
    manaCooldownShare: manaCooldownCoverage,
    cooldownReduction,
    cooldownIncrease,
    critOnlyDamage: percentBonuses.critOnlyDamage,
    critFactor,
    // 공격력 사슬 — 게임 수식의 A~E. 계기판과 검산이 읽는다.
    mainStatTotal,
    weaponTotal,
    pureAttack,
    baseAttack,
    supportAttack,
    finalAttack,
    damageMultiplier,
    plainMultiplier,
    staggerMultiplier,
    staggerShare,
    specBundleFactor: specBundleResult.blend,
    specBundleResults: specBundleResult.applied,
    cooldownFactor,
    attackSpeedFactor,
    damageIndex,
    dpsIndex,
    staggerIndex,
    // 공격력 축. 지수에는 곱하지 않는다 — 지수는 어디까지나 상대값이고,
    // 절대 데미지를 내려면 스킬 계수가 있어야 하는데 그건 이 계산기 밖이다.
    // 여기 있는 값은 평면 증가를 퍼센트로 바꾸는 데에만 쓰이고, 계기판이
    // 근거로 적는다.
    attack: attack ?? { weaponAttack: 0, mainStat: 0, flatAttack: 0 },
    baseAttackPower: baseAttackPower(attack),
    flatBonuses: flatBonuses ?? emptyFlatBonuses(),
    // 기준값이 없어 버린 평면 증가들. 조용히 빠지면 왜 안 맞는지 모른다.
    droppedFlat: droppedFlat ?? [],
    // 깨달음·도약 — 무엇이 들어갔고 무엇이 안 들어갔는지.
    awakening: awakening ?? { applied: [], skipped: [] },
    synergy: synergy ?? { own: null, rows: [], lines: [], combatCount: 0, over: false },
  };
}

// 치명타 시 주는 피해는 출처끼리 곱한다. 아크 그리드 '현란한 일격'과 진화 노드
// '회심'을 더하면 실제보다 낮게 나온다 — 게임에서는 각자의 배수가 곱해진다.
//
//   회심 12% · 현란한 일격 11%
//     곱  ×1.12 × 1.11 = ×1.2432   ← 맞는 값
//     합  ×1.23                    ← 예전 값
//
// 담기는 자리는 여전히 퍼센트 하나다. 곱한 결과를 퍼센트로 되돌려 넣으면
// 쓰는 쪽(1 + n/100)은 그대로 두고 합치는 규칙만 바뀐다.
function addCritOnlyDamage(percentBonuses, amount) {
  const added = readNumber(amount);
  if (added === 0) return;
  const before = readNumber(percentBonuses.critOnlyDamage);
  percentBonuses.critOnlyDamage = ((1 + before / 100) * (1 + added / 100) - 1) * 100;
}

function applyEffect(effect, level, totalStats, percentBonuses, damageGroups, specials, manaShare, settings) {
  if (effect.kind === "note") return;
  if (effect.kind === "special") {
    if (level > 0) specials[effect.key] = Math.max(specials[effect.key] || 0, level);
    return;
  }
  // 노드 하나 안에서도 효과마다 조건이 다를 수 있다. 일격이 그렇다 —
  // 치적은 전체, 치피는 방향성 스킬 한정.
  if (!isDirectionalConditionActive(effect.condition, settings)) return;

  const amount = readNumber(effect.amount) * level * (effect.manaOnly ? manaShare : 1);
  if (amount === 0) return;

  if (effect.kind === "stat") {
    totalStats[effect.key] = readNumber(totalStats[effect.key]) + amount;
    return;
  }

  if (effect.kind === "damage") {
    addDamageGroup(damageGroups, effect.key, amount);
    return;
  }

  if (effect.kind === "critOnlyDamage") {
    addCritOnlyDamage(percentBonuses, amount);
    return;
  }

  percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
}

// 식을 읽어 숫자 하나를 낸다. eval은 쓰지 않는다 — 저장본에서 온 문자열을
// 그대로 실행하는 셈이 되고, 어차피 필요한 문법은 사칙연산과 괄호뿐이다.
//
// 지원: 숫자 · 120%(=1.2) · {{변수}} · + - * / · 괄호 · 단항 부호 · min/max
// 못 읽으면 null을 돌려준다. 화면이 그걸 보고 "식을 읽을 수 없다"고 알린다.
function evaluateFormula(text, variables) {
  const src = String(text ?? "");
  let at = 0;

  const skip = () => { while (at < src.length && /\s/.test(src[at])) at += 1; };

  function primary() {
    skip();
    if (src[at] === "(") {
      at += 1;
      const value = expression();
      skip();
      if (src[at] !== ")") throw new Error("괄호가 닫히지 않았습니다");
      at += 1;
      return value;
    }
    if (src[at] === "-") { at += 1; return -primary(); }
    if (src[at] === "+") { at += 1; return primary(); }

    if (src.startsWith("{{", at)) {
      const end = src.indexOf("}}", at);
      if (end < 0) throw new Error("변수 괄호가 닫히지 않았습니다");
      const name = src.slice(at + 2, end).trim();
      at = end + 2;
      if (!Object.hasOwn(variables, name)) throw new Error(`모르는 변수: ${name}`);
      return readNumber(variables[name]);
    }

    const fn = /^(min|max)\s*\(/i.exec(src.slice(at));
    if (fn) {
      at += fn[0].length;
      const left = expression();
      skip();
      if (src[at] !== ",") throw new Error("min/max에는 값이 둘 필요합니다");
      at += 1;
      const right = expression();
      skip();
      if (src[at] !== ")") throw new Error("괄호가 닫히지 않았습니다");
      at += 1;
      return fn[1].toLowerCase() === "min" ? Math.min(left, right) : Math.max(left, right);
    }

    // 120% 처럼 퍼센트로 적는 편이 읽기 쉽다. 숫자 뒤에서만 허용한다.
    const number = /^\d+(\.\d+)?%?/.exec(src.slice(at));
    if (number) {
      at += number[0].length;
      const raw = Number(number[0].replace("%", ""));
      return number[0].endsWith("%") ? raw / 100 : raw;
    }
    throw new Error("읽을 수 없는 글자입니다");
  }

  function term() {
    let value = primary();
    for (;;) {
      skip();
      if (src[at] === "*") { at += 1; value *= primary(); continue; }
      if (src[at] === "/") {
        at += 1;
        const divisor = primary();
        value = divisor === 0 ? 0 : value / divisor;
        continue;
      }
      return value;
    }
  }

  function expression() {
    let value = term();
    for (;;) {
      skip();
      if (src[at] === "+") { at += 1; value += term(); continue; }
      if (src[at] === "-") { at += 1; value -= term(); continue; }
      return value;
    }
  }

  try {
    if (!src.trim()) return null;
    const value = expression();
    skip();
    if (at !== src.length) throw new Error("식 뒤에 남은 글자가 있습니다");
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** 손으로 적은 줄의 유효율. 비어 있으면 100 — 안 적은 줄이 조용히 0이 되면 안 된다. */
function effectUptimeRate(effect) {
  const value = effect?.uptime;
  if (value === undefined || value === null || value === "") return 1;
  return clamp(readNumber(value), 0, 100) / 100;
}

function applyBaseEffect(effect, percentBonuses, damageGroups, conversions, flat) {
  const rate = effectUptimeRate(effect);
  if (typeof effect.formula === "string" && effect.formula.trim()) {
    if (Array.isArray(conversions)) {
      conversions.push({
        formula: effect.formula,
        // 게임 노드는 대개 "최대 55%까지" 같은 상한을 함께 갖는다. 식 안에
        // min()을 쓰게 하는 것보다 칸을 하나 두는 편이 읽고 고치기 쉽다.
        cap: effect.cap,
        category: effect.category,
        customCategory: effect.customCategory,
        label: effect.label,
        // 유효율은 식이 낸 결과에 곱한다. 상한은 그대로 둔다 — 상한은 그 값에서
        // 잘린다는 뜻이지 유효율만큼 같이 낮아지는 것이 아니다.
        uptime: rate,
      });
    }
    return;
  }

  const amount = readNumber(effect.amount) * rate;
  if (amount === 0) return;

  if (effect.category === "customDamage") {
    const label = (effect.customCategory || effect.label || "기타 피해").trim();
    addDamageGroup(damageGroups, label, amount);
    return;
  }

  if (effect.category.startsWith("damage:")) {
    const label = effect.category.slice("damage:".length);
    addDamageGroup(damageGroups, label, amount);
    return;
  }

  // 퍼센트가 아니라 숫자로 붙는 것들 — 팔찌 무공 +9,000 같은. 기준값을 만나야
  // 퍼센트가 되므로 여기서는 모으기만 한다.
  if (effect.category.startsWith("flat:")) {
    addFlatBonus(flat, effect.category.slice("flat:".length), amount);
    return;
  }

  if (effect.category === "critOnlyDamage") {
    addCritOnlyDamage(percentBonuses, amount);
    return;
  }

  percentBonuses[effect.category] = readNumber(percentBonuses[effect.category]) + amount;
}

// 재료값이 정해진 뒤에 부른다. 속도는 상한이 걸린 뒤의 값을 기본으로 준다 —
// 돌격대장이 이미 그렇게 동작하므로(clamp(moveSpeedBonus, 0, 40)) 같은 규칙이다.
// 상한 전 값이 필요하면 {{공격속도합}} · {{이동속도합}}으로 따로 받는다.
function buildFormulaVariables(attackSpeed, moveSpeedBonus, totalStats, crit) {
  return {
    "공격속도": clamp(readNumber(attackSpeed), 0, 40),
    "이동속도": clamp(readNumber(moveSpeedBonus), 0, 40),
    "공격속도합": readNumber(attackSpeed),
    "이동속도합": readNumber(moveSpeedBonus),
    "치명": readNumber(totalStats?.critStat),
    "특화": readNumber(totalStats?.specStat),
    "신속": readNumber(totalStats?.swiftStat),
    "제압": readNumber(totalStats?.dominationStat),
    "인내": readNumber(totalStats?.enduranceStat),
    "숙련": readNumber(totalStats?.expertiseStat),
    // 2단. 치명타가 정해지기 전에 부르면 없는 채로 남고, 그 식은 '모르는 변수'로
    // 걸러진다 — 조용히 0이 되지 않는다.
    ...(crit ? {
      "치명타적중률": readNumber(crit.rateCapped),
      "치명타적중률합": readNumber(crit.rateRaw),
      "치명타피해": readNumber(crit.damage),
    } : {}),
  };
}

// stage에 해당하는 식만 건다. 나머지는 다음 단계에서 다시 부를 때 걸린다.
function applyFormulaEffects(conversions, variables, percentBonuses, damageGroups, stage) {
  if (!Array.isArray(conversions)) return [];

  return conversions.map(item => {
    const itemStage = getFormulaStage(item.category);
    // 속도를 대상으로 삼는 식은 아예 걸지 않는다. 속도가 정해진 뒤에 걸리므로
    // 되먹임이 없어 조용히 아무 일도 안 일어난 것처럼 보이기 때문이다.
    if (itemStage === 0) return { ...item, amount: 0, invalid: true, reason: "속도는 대상이 될 수 없습니다" };
    if (itemStage !== stage) return null;

    const value = evaluateFormula(item.formula, variables);
    // 식이 깨졌으면 0으로 두되 그 사실을 남긴다. 조용히 빠지면 왜 안 맞는지 모른다.
    const raw = value === null ? 0 : value;
    const cap = readNumber(item.cap);
    const capped = item.cap !== "" && item.cap !== null && item.cap !== undefined && raw > cap;
    // 상한을 먼저 먹이고 유효율을 곱한다. 게임의 상한은 그 값에서 잘린다는
    // 뜻이지 "실리는 시간만큼 상한도 낮아진다"는 뜻이 아니다.
    const rate = item.uptime === undefined ? 1 : clamp(readNumber(item.uptime), 0, 1);
    const amount = (capped ? cap : raw) * rate;
    const applied = {
      ...item, amount, raw, capped,
      invalid: value === null,
      reason: value === null ? "식을 읽을 수 없습니다" : "",
    };

    if (amount === 0) return applied;
    if (item.category === "customDamage") {
      addDamageGroup(damageGroups, (item.customCategory || item.label || "기타 피해").trim(), amount);
    } else if (String(item.category).startsWith("damage:")) {
      addDamageGroup(damageGroups, String(item.category).slice("damage:".length), amount);
    } else if (item.category === "critOnlyDamage") {
      addCritOnlyDamage(percentBonuses, amount);
    } else {
      percentBonuses[item.category] = readNumber(percentBonuses[item.category]) + amount;
    }
    return applied;
  });
}

function applyEngravingEffects(engravingState, percentBonuses, damageGroups, manaShare, settings, stones) {
  const engravingSpecials = {
    critRateMinimum: 0,
    raidCaptainRate: 0,
  };

  ENGRAVING_LIBRARY.forEach(engravingItem => {
    const tierIndex = getEngravingTierIndex(engravingState?.[engravingItem.id]);
    if (tierIndex < 0) return;
    applyEngravingTier(engravingItem, tierIndex, percentBonuses, damageGroups, engravingSpecials, manaShare, settings, stones?.[engravingItem.id]);
  });

  return engravingSpecials;
}

function applyEngravingTier(engravingItem, tierIndex, percentBonuses, damageGroups, engravingSpecials, manaShare, settings, stoneLevel = 0) {
  // Directional engravings follow the same 백어택/헤드어택 gating as bracelets,
  // so head-attack and back-attack effects can never stack on one hit.
  if (!isDirectionalConditionActive(engravingItem.condition, settings)) return;

  const put = (kind, key, amount) => {
    if (kind === "damage") { addDamageGroup(damageGroups, key, amount); return; }
    if (kind === "percent") { percentBonuses[key] = readNumber(percentBonuses[key]) + amount; return; }
    if (kind === "special") engravingSpecials[key] = Math.max(readNumber(engravingSpecials[key]), amount);
  };

  engravingItem.effects.forEach(effect => {
    const amount = engravingAmount(effect.amounts, tierIndex) * (effect.manaOnly ? manaShare : 1);
    put(effect.kind, effect.key, amount);
  });

  // 어빌리티 스톤이 얹는 몫. 단계 사다리와 따로 더해진다.
  const stone = engravingStoneAmount(engravingItem.id, stoneLevel, tierIndex);
  if (stone) put(stone.kind, stone.key, stone.amount * (stone.manaOnly ? manaShare : 1));
}

function getEngravingTierIndex(value) {
  return ENGRAVING_TIERS.findIndex(tier => tier.value === value);
}

function normalizeBracelet(bracelet) {
  const stats = BRACELET_STAT_FIELDS.reduce((result, item) => {
    result[item.key] = clamp(Math.round(readNumber(bracelet?.stats?.[item.key])), 0, 120);
    return result;
  }, {});
  const effects = {};

  BRACELET_EFFECTS.forEach(item => {
    const grade = bracelet?.effects?.[item.id];
    if (getBraceletGradeIndex(grade) >= 0) effects[item.id] = grade;
  });

  return { stats, mainStat: Math.max(0, Math.round(readNumber(bracelet?.mainStat))), effects };
}

function normalizeArkGrid(arkGrid) {
  const cores = {};
  CHAOS_CORE_SLOTS.forEach(slot => {
    const chosen = arkGrid?.cores?.[slot.key] || {};
    const known = CHAOS_CORES.some(core => core.id === chosen.id);
    cores[slot.key] = {
      id: known ? chosen.id : "none",
      points: CHAOS_CORE_POINTS.includes(Math.round(readNumber(chosen.points)))
        ? Math.round(readNumber(chosen.points))
        : 20,
      stage: clamp(Math.round(readNumber(chosen.stage)), 0, CHAOS_CORE_STAGES.length - 1),
    };
  });
  // 옛 저장본은 gemLevel 하나만 들고 있다. 그건 추가 피해였다.
  const legacyGem = readNumber(arkGrid?.gemLevel);
  const gems = {};
  ARK_GRID_GEM_EFFECTS.forEach(effect => {
    const raw = arkGrid?.gems?.[effect.key] ?? (effect.key === "additional" ? legacyGem : 0);
    gems[effect.key] = clamp(Math.round(readNumber(raw)), 0, GEM_MAX_LEVEL);
  });
  return { cores, gems };
}

function applyCoreEffect(effect, stage, times, percentBonuses, damageGroups, flat) {
  const raw = Array.isArray(effect.amounts) ? effect.amounts[stage] : effect.amount;
  const amount = readNumber(raw) * times;
  if (amount === 0) return;

  if (effect.kind === "damage") {
    addDamageGroup(damageGroups, effect.key, amount);
    return;
  }
  if (effect.kind === "critOnlyDamage") {
    addCritOnlyDamage(percentBonuses, amount);
    return;
  }
  if (effect.kind === "flat") {
    addFlatBonus(flat, effect.key, amount);
    return;
  }
  percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
}

function applyArkGridEffects(arkGrid, percentBonuses, damageGroups, flat) {
  const grid = normalizeArkGrid(arkGrid);

  CHAOS_CORE_SLOTS.forEach(slot => {
    const chosen = grid.cores[slot.key];
    const core = CHAOS_CORES.find(item => item.id === chosen.id);
    if (!core) return;

    // 포인트 구간은 누적이다. 17P를 고르면 10P와 14P 효과도 함께 붙는다.
    [10, 14, 17].forEach(threshold => {
      if (chosen.points < threshold) return;
      (core.thresholds[threshold] || []).forEach(effect => {
        applyCoreEffect(effect, chosen.stage, 1, percentBonuses, damageGroups, flat);
      });
    });

    // 18~20P는 1포인트마다 같은 값이 한 번씩 더 붙는다.
    const extra = clamp(chosen.points - 17, 0, 3);
    if (extra > 0) {
      core.perPoint.forEach(effect => {
        applyCoreEffect(effect, chosen.stage, extra, percentBonuses, damageGroups, flat);
      });
    }
  });

  ARK_GRID_GEM_EFFECTS.forEach(effect => {
    addDamageGroup(damageGroups, effect.group, arkGridGemDamage(effect.key, grid.gems[effect.key]));
  });
}

/**
 * 깨달음·도약이 만드는 전역 보너스를 얹는다.
 *
 * 전체 스킬에 상시로 걸리는 것만 들어온다. 일부 스킬에만 걸리거나 상태에
 * 매인 것은 표가 알고 있고, 여기서는 안 센 목록만 받아 나간다 — 계기판이
 * 그대로 보여줘야 게임 수치와 왜 다른지 알 수 있다.
 */
function applyAwakeningEffects(awakening, percentBonuses, damageGroups, conversions) {
  const result = awakeningBonuses(awakening?.job, awakening?.nodeLevels, awakening?.uptime);
  // 식으로 붙는 것은 여기서 값을 못 낸다 — 재료가 되는 속도·치적이 아직 없다.
  // 직접 입력 효과와 같은 줄에 실어 두면 계산이 제 단계에서 푼다.
  if (Array.isArray(conversions)) conversions.push(...(result.conversions ?? []));
  Object.entries(result.percentBonuses).forEach(([key, amount]) => {
    percentBonuses[key] = readNumber(percentBonuses[key]) + readNumber(amount);
  });
  Object.entries(result.damageGroups).forEach(([key, amount]) => {
    addDamageGroup(damageGroups, key, amount);
  });
  return result;
}

function applyCollectionEffects(collection, totalStats, damageGroups) {
  const source = { ...DEFAULT_STATE.collection, ...(collection || {}) };
  totalStats.critStat = readNumber(totalStats.critStat) + readNumber(source.critStat);
  totalStats.specStat = readNumber(totalStats.specStat) + readNumber(source.specStat);
  totalStats.swiftStat = readNumber(totalStats.swiftStat) + readNumber(source.swiftStat);
  // 추가 피해 목장. 힘민지 목장과 등급이 따로다.
  addDamageGroup(damageGroups, "추가 피해", resolveRanchDamage(collection || {}));
}

// 무기 품질이 주는 추가 피해는 일반 '추가 피해'와 같은 그룹이다 — 합연산이다.
// 예전에는 '무기 추가 피해'라는 별도 그룹으로 두어 곱해 버렸고, 그만큼 부풀었다.
function applyWeaponEffects(weapon, damageGroups) {
  const quality = clamp(Math.round(readNumber(weapon?.quality)), 0, WEAPON_QUALITY_MAX);
  addDamageGroup(damageGroups, "추가 피해", weaponQualityDamage(quality));
}

function applyBraceletEffects(bracelet, settings, totalStats, percentBonuses, damageGroups, flat) {
  BRACELET_STAT_FIELDS.forEach(item => {
    totalStats[item.key] = readNumber(totalStats[item.key]) + readNumber(bracelet.stats[item.key]);
  });
  // 힘민지는 평면으로 붙는다. 기준값(사전 세팅의 공격력)을 만나야 퍼센트가 된다.
  addFlatBonus(flat, "mainStat", readNumber(bracelet.mainStat));

  BRACELET_EFFECTS.forEach(item => {
    const gradeIndex = getBraceletGradeIndex(bracelet.effects[item.id]);
    if (gradeIndex < 0 || !isDirectionalConditionActive(item.condition, settings)) return;

    item.effects.forEach(effect => {
      const amount = readNumber(effect.amounts?.[gradeIndex]);
      if (effect.kind === "damage") {
        addDamageGroup(damageGroups, effect.key, amount);
        return;
      }
      if (effect.kind === "flat") {
        addFlatBonus(flat, effect.key, amount);
        return;
      }
      if (effect.kind === "percent") {
        percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
      }
    });
  });
}

function getBraceletGradeIndex(value) {
  return BRACELET_GRADES.findIndex(grade => grade.value === value);
}

function isDirectionalConditionActive(condition, settings) {
  if (!condition) return true;
  if (condition === "backAttack") return Boolean(settings?.backAttack);
  if (condition === "headAttack") return Boolean(settings?.headAttack);
  // 일격처럼 뒤든 머리든 방향성이기만 하면 되는 것. 백·헤드 중 하나면 붙는다.
  if (condition === "directional") return Boolean(settings?.backAttack) || Boolean(settings?.headAttack);
  if (condition === "nonDirectional") return !settings?.backAttack && !settings?.headAttack;
  return false;
}

function normalizeAccessories(accessories) {
  const nextRings = Array.isArray(accessories?.rings) ? accessories.rings : [];
  const nextEarrings = Array.isArray(accessories?.earrings) ? accessories.earrings : [];
  return {
    necklace: {
      ...DEFAULT_STATE.accessories.necklace,
      ...(accessories?.necklace || {}),
    },
    earrings: DEFAULT_STATE.accessories.earrings.map((earring, index) => ({
      ...earring,
      ...(nextEarrings[index] || {}),
    })),
    rings: DEFAULT_STATE.accessories.rings.map((ring, index) => ({
      ...ring,
      ...(nextRings[index] || {}),
    })),
  };
}

function calculateAccessoryBonuses(accessories) {
  const result = {
    additionalDamage: getAccessoryOptionValue("necklace", "additionalDamage", accessories.necklace.additionalDamage),
    // 목걸이의 '적에게 주는 피해'. 원한과 같은 그룹이라 서로 곱해진다.
    dealtDamage: getAccessoryOptionValue("necklace", "dealtDamage", accessories.necklace.dealtDamage),
    critRate: 0,
    critDamage: 0,
    attackPower: 0,
    weaponAttack: 0,
  };

  accessories.earrings.forEach(earring => {
    result.attackPower += getAccessoryOptionValue("earring", "attackPower", earring.attackPower);
    result.weaponAttack += getAccessoryOptionValue("earring", "weaponAttack", earring.weaponAttack);
  });
  accessories.rings.forEach(ring => {
    result.critRate += getAccessoryOptionValue("ring", "critRate", ring.critRate);
    result.critDamage += getAccessoryOptionValue("ring", "critDamage", ring.critDamage);
  });
  return result;
}

// --- 공격력 기준값 ------------------------------------------------------------
//
// 팔찌 무공 +9,000, 코어의 평면 공격력 같은 것들은 "몇 퍼센트인가"가 캐릭터마다
// 다르다. 지금 무공이 3만이면 +30%고 9만이면 +10%다. 그 나눗셈의 분모가 여기 있다.

/**
 * 무공과 힘민지를 출처에서 쌓아 올린다.
 *
 * 예전에는 게임이 알려 준 기본 공격력에서 √식을 뒤집어 힘민지를 되짚었다.
 * 그 값이 실제와 32% 어긋났다 — 식이 지금 게임을 재현하지 못한다. 실측:
 *
 *   무공   = (무기 208,130 + 악세 585 + 팔찌 9,000) × (1 + 연마 3.6% + 카르마 2.6%)
 *          = 231,213                                        게임 231,213
 *   힘민지 = 장비 598,677 × (1 + 아바타 8% + 목장 1%)
 *          = 652,558                                        게임 655,151
 *
 * 아바타는 부위당 하나만 센다(속옷·겉옷을 다 세면 3.6% 넘친다). 목장과 깨달음
 * 카르마는 API에 안 실려 오므로 사람이 적는다 — 그래서 여기서 합친다. 값을
 * 얼려 두면 목장을 고쳐도 안 따라오기 때문이다.
 *
 * 조각이 없으면(손으로 적은 세팅) 적어 둔 값을 그대로 쓴다.
 */
/**
 * 게임이 알려 준 기본 공격력에서 되짚은 힘민지 총합.
 *
 *   C = D ÷ (1 + 보석% + 스톤%)        힘민지 = 6 × C² ÷ 무공
 *
 * 되짚기는 쓸 때마다 한다 — 불러올 때 미리 셈해 얼려 두면 안 된다. 무공에
 * 깨달음 카르마가 들어가는데 그건 사람이 적는 값이라 불러올 때는 모른다.
 * 카르마 0으로 얼려 두면 나중에 26을 적어도 안 따라와서 힘민지가 7% 부푼다.
 * 팔찌 평면도 같이 넣어야 한다 — weaponFlat은 팔찌를 뺀 값(평면 증가를 나눌
 * 기준)이라 여기 못 쓴다.
 */
function derivedMainTotal(inputState) {
  const source = inputState?.attack || {};
  const karma = Math.max(0, readNumber(inputState?.convenience?.awakeningKarmaLevel))
    * ARC_PASSIVE_CONSTANTS.awakeningKarmaWeaponPerLevel;
  const gameBase = Math.max(0, readNumber(source.baseAttackPower));
  const baseScale = 1 + Math.max(0, readNumber(source.baseScalePercent)) / 100;
  const weaponAll = Math.max(0, readNumber(source.weaponFlatAll));
  if (!(gameBase > 0) || !(weaponAll > 0)) return 0;
  // D = (C + 평면) x 배수 를 뒤집는다. 평면을 안 빼면 C가 850만큼 커지고,
  // 제곱으로 들어가므로 힘민지가 1% 부풀어 나온다.
  const pure = gameBase / baseScale - Math.max(0, readNumber(source.baseFlat));
  if (!(pure > 0)) return 0;
  return 6 * pure ** 2 / (weaponAll * (1 + (readNumber(source.weaponPercent) + karma) / 100));
}

function assembleAttack(inputState) {
  const source = inputState?.attack || {};
  const convenience = inputState?.convenience;
  const weaponFlat = Math.max(0, readNumber(source.weaponFlat));
  const mainFlat = Math.max(0, readNumber(source.mainFlat));
  const karma = Math.max(0, readNumber(convenience?.awakeningKarmaLevel)) * ARC_PASSIVE_CONSTANTS.awakeningKarmaWeaponPerLevel;
  const ranch = resolveRanchMainStat(inputState);

  const weaponAttack = weaponFlat > 0
    ? weaponFlat * (1 + (readNumber(source.weaponPercent) + karma) / 100)
    : Math.max(0, readNumber(source.weaponAttack));

  // 힘민지 총합은 되짚은 값이 이긴다.
  //
  // 장비만 더하면 물약·도감·원정대 몫(약 2,400)이 빠져 0.4% 모자란다. 게임이
  // 알려 준 기본 공격력에는 그게 이미 들어 있으므로, 되짚은 값이 있으면 그것을
  // 총합으로 못 박고 배수는 나누는 쪽으로만 쓴다 — 그래야 목장 등급을 잘못
  // 적어 두어도 총합은 게임과 맞고, 어긋나는 것은 평면을 나눌 기준뿐이다.
  const mainScale = 1 + (avatarTotal(source) + ranch) / 100;
  const derivedTotal = derivedMainTotal(inputState);
  const mainTotal = derivedTotal > 0 ? derivedTotal : Math.max(0, readNumber(source.mainTotal));
  const mainStat = mainTotal > 0
    ? mainTotal
    : (mainFlat > 0 ? mainFlat * mainScale : Math.max(0, readNumber(source.mainStat)));

  return {
    weaponAttack: Math.round(weaponAttack),
    mainStat: Math.round(mainStat),
    flatAttack: Math.max(0, readNumber(source.flatAttack)),
    // 순수 공격력을 기본 공격력으로 부풀리는 배수(보석 + 어빌리티 스톤).
    // 공격력 사슬이 읽는다 — 조립한 값과 같이 다녀야 흩어지지 않는다.
    baseScalePercent: Math.max(0, readNumber(source.baseScalePercent)),
    baseFlat: Math.max(0, readNumber(source.baseFlat)),
    // 사슬이 쓸 조각. 평면과 퍼센트를 갈라 둔다 — 게임 수식의 A·B가
    // (평면 합) × (1 + 퍼센트 합)이라 둘이 한 번만 만나야 하기 때문이다.
    karmaWeaponPercent: karma,
    mainScalePercent: avatarTotal(source) + ranch,
    // 평면 증가를 나눌 기준. 조립한 값이 아니라 **배수 이전**의 합이다.
    //
    //   지능 = (장비 598,677 + 채끝 12,000) × 1.09
    //   채끝의 몫 = (598,677 + 12,000)/598,677 = 1.02004   → 배수가 약분된다
    //
    // 게임에서 잰 값과 정확히 맞는다: 채끝을 먹으면 지능이 655,151 → 668,231,
    // 차이 13,080 = 12,000 × 1.09. 조립한 값(652,558)으로 나누면 1.839%가 나와
    // 채끝을 9% 낮게 본다 — 와인이냐 채끝이냐가 그 차이에서 갈린다.
    //
    // 팔찌 무공 +9,000도 같은 자리다. 그래서 weaponFlat은 팔찌를 안 담는다.
    weaponBase: weaponFlat > 0 ? weaponFlat : Math.max(0, readNumber(source.weaponAttack)),
    mainBase: mainTotal > 0
      ? mainTotal / mainScale
      : (mainFlat > 0 ? mainFlat : Math.max(0, readNumber(source.mainStat))),
  };
}

function normalizeAttack(attack) {
  return {
    weaponAttack: Math.max(0, readNumber(attack?.weaponAttack)),
    mainStat: Math.max(0, readNumber(attack?.mainStat)),
    flatAttack: Math.max(0, readNumber(attack?.flatAttack)),
    // 불러오기가 채우는 조각. 이걸 안 들고 다니면 세팅을 저장했다 열 때마다
    // 조립이 무너져 기준값이 0이 되고, 평면 증가가 통째로 안 세어진다.
    weaponFlat: Math.max(0, readNumber(attack?.weaponFlat)),
    weaponPercent: Math.max(0, readNumber(attack?.weaponPercent)),
    mainFlat: Math.max(0, readNumber(attack?.mainFlat)),
    mainTotal: Math.max(0, readNumber(attack?.mainTotal)),
    baseAttackPower: Math.max(0, readNumber(attack?.baseAttackPower)),
    baseScalePercent: Math.max(0, readNumber(attack?.baseScalePercent)),
    baseFlat: Math.max(0, readNumber(attack?.baseFlat)),
    weaponFlatAll: Math.max(0, readNumber(attack?.weaponFlatAll)),
    avatarPercent: Math.max(0, readNumber(attack?.avatarPercent)),
  };
}

/** 기본 공격력 = √(힘민지 × 무기 공격력 / 6). 둘 중 하나라도 비면 0 — 모른다는 뜻이다. */
function baseAttackPower(attack) {
  const { weaponAttack, mainStat } = normalizeAttack(attack);
  if (weaponAttack <= 0 || mainStat <= 0) return 0;
  return Math.sqrt(mainStat * weaponAttack / 6);
}

function emptyFlatBonuses() {
  return { weaponAttack: 0, mainStat: 0, attackPower: 0 };
}

/**
 * 서폿이 얹어 주는 공격력. 퍼센트가 아니라 평면이다.
 *
 *   서폿 기본 공격력 × 22% × (1 + 아군 공격력 강화 효과 증가)
 *
 * 실측: 154,732 × 0.22 × 1.3544 = 46,105. 이 값이 내 기본 공격력에 더해진다.
 *
 * 서폿을 안 적으면 0이다 — 모르는 것을 짐작해서 넣으면 그게 답인 척한다.
 */
/** 버프 스킬 레벨별 공격력 증가 계수(%). 10레벨부터 14레벨까지. */
const SUPPORT_BUFF_BY_LEVEL = { 10: 21, 11: 21.2, 12: 21.5, 13: 21.7, 14: 22 };

/**
 * 서포터가 얹어 주는 공격력.
 *
 *   서폿 기본 공격력 x 버프 계수 x (1 + 아군 공격력 강화 효과 증가)
 *
 * 실측(도화가 화면): 기본 공격력 159,411 · 아군 공격력 강화 효과 증가 35.44%
 * · 버프 스킬 14레벨 → 159,411 x 0.22 x 1.3544 = 47,499.
 *
 * 이 값은 퍼센트가 아니라 **평면**으로 최종 공격력 괄호 안에 더해진다.
 * 공격력 증가율로 놓으면 무공·힘민지가 같이 부풀어 오른다 — 실제로는
 * 그 반대로, 이 평면이 무공·힘민지의 몫을 희석한다.
 *
 * 기준 공격력을 안 적으면 내 기본 공격력을 쓴다. 레이드는 대개 비슷한
 * 스펙끼리 가므로 그 가정이 맨손보다 낫다.
 */
function supportAttackPower(support, myBase) {
  if (!support || support.on === false) return 0;
  const typed = Math.max(0, readNumber(support.baseAttackPower));
  const base = typed > 0 ? typed : Math.max(0, readNumber(myBase));
  if (!(base > 0)) return 0;
  const level = clamp(Math.round(readNumber(support.skillLevel) || 14), 10, 14);
  const share = (SUPPORT_BUFF_BY_LEVEL[level] ?? 22) / 100;
  const boost = Math.max(0, readNumber(support.attackBoostPercent));
  return base * share * (1 + boost / 100);
}

/**
 * 평면 증가를 퍼센트로 바꿔 피해 그룹에 얹는다.
 *
 * 무공·힘민지는 제곱근 그룹에 들어가므로 √(1 + Y/W) = √((W+Y)/W)로 정확히 맞는다.
 * 평면 공격력은 (기본 × (1+기본%) + 평면) × (1+공격력%) 꼴이라 공격력 %와 곱해진다.
 * 그래서 같은 그룹에 넣지 않고 따로 둔다.
 *
 * 기준값이 없으면 아무 일도 하지 않는다. 무엇을 못 셌는지는 돌려주는 목록에 남는다.
 */
function applyFlatAttackBonuses(flat, attack, damageGroups) {
  // 나누는 값은 배수 이전의 합이다 — assembleAttack의 weaponBase/mainBase 참고.
  // 조립한 값으로 나누면 아바타·목장·카르마만큼 평면 증가가 작아 보인다.
  const base = {
    weaponAttack: Math.max(0, readNumber(attack?.weaponBase ?? attack?.weaponAttack)),
    mainStat: Math.max(0, readNumber(attack?.mainBase ?? attack?.mainStat)),
  };
  const power = baseAttackPower(attack);
  const dropped = [];

  const convert = (amount, divisor, group, label) => {
    const value = readNumber(amount);
    if (value === 0) return;
    if (divisor <= 0) {
      dropped.push({ label, amount: value });
      return;
    }
    addDamageGroup(damageGroups, group, value / divisor * 100);
  };

  // 평면을 퍼센트로 바꾸던 자리였다. 지금은 공격력 사슬이 평면을 평면대로
  // 받으므로 환산이 필요 없다 — 오히려 틀렸다. 게임 수식의 A·B는
  // (평면 합) × (1 + 퍼센트 합)이라 둘이 한 번만 만나는데, 환산하면 팔찌
  // 무공 9,000이 제 몫의 퍼센트가 되어 연마 퍼센트와 한 번 더 곱해졌다.
  //
  // 기준값이 없어 못 세는 것만 여기서 걸러 알린다.
  if (readNumber(flat.weaponAttack) !== 0 && base.weaponAttack <= 0) {
    dropped.push({ label: "평면 무기 공격력", amount: readNumber(flat.weaponAttack) });
  }
  if (readNumber(flat.mainStat) !== 0 && base.mainStat <= 0) {
    dropped.push({ label: "평면 힘민지", amount: readNumber(flat.mainStat) });
  }
  if (readNumber(flat.attackPower) !== 0 && power <= 0) {
    dropped.push({ label: "평면 공격력", amount: readNumber(flat.attackPower) });
  }

  return dropped;
}

function addFlatBonus(flat, key, amount) {
  if (!flat || !Object.hasOwn(flat, key)) return;
  flat[key] = readNumber(flat[key]) + readNumber(amount);
}

function getAccessoryOptionValue(part, field, grade) {
  return readNumber(ACCESSORY_OPTION_VALUES[part]?.[field]?.[grade]);
}

// 파티 시너지. 종류끼리는 피해 그룹이 알아서 곱하고, 같은 종류는 이미 더해져
// 들어온다. 치명타 시 피해 증가만 회심과 곱해야 해서 따로 넘긴다.
function applySynergyEffects(inputState, percentBonuses, damageGroups) {
  const result = synergyBonuses(inputState.awakening, inputState.synergy, inputState.settings);
  Object.entries(result.damageGroups).forEach(([key, amount]) => addDamageGroup(damageGroups, key, amount));
  Object.entries(result.percentBonuses).forEach(([key, amount]) => {
    percentBonuses[key] = readNumber(percentBonuses[key]) + readNumber(amount);
  });
  if (result.critOnly !== 0) addCritOnlyDamage(percentBonuses, result.critOnly);
  return result;
}

function addDamageGroup(damageGroups, key, amount) {
  const value = readNumber(amount);
  if (value === 0) return;

  if (MULTIPLICATIVE_DAMAGE_GROUPS.has(key)) {
    const currentMultiplier = 1 + readNumber(damageGroups[key]) / 100;
    const nextMultiplier = currentMultiplier * (1 + value / 100);
    damageGroups[key] = (nextMultiplier - 1) * 100;
    return;
  }

  damageGroups[key] = readNumber(damageGroups[key]) + value;
}

// 반환값에 근거를 함께 담는다. 계기판이 "왜 이 숫자인가"를 그대로 옮겨 적어야
// 하는데, 밖에서 다시 계산하면 두 곳이 어긋난다.
function calculateBluntThornBonus(level, critRateRaw) {
  if (level <= 0) {
    return { damage: 0, convertedCrit: 0, excessCrit: 0, rate: 0, limit: 0, raw: 0, capped: false };
  }
  const excessCritRate = Math.max(0, readNumber(critRateRaw) - 80);
  const conversionRate = level >= 2 ? 1.5 : 1.25;
  const conversionLimit = level >= 2 ? 60 : 45;
  const raw = excessCritRate * conversionRate;
  return {
    damage: Math.min(raw, conversionLimit),
    convertedCrit: Math.min(excessCritRate, conversionLimit / conversionRate),
    // 상한 80%를 넘긴 치적. 전환의 재료다.
    excessCrit: excessCritRate,
    rate: conversionRate,
    limit: conversionLimit,
    raw,
    capped: raw > conversionLimit,
  };
}

function calculateSonicBreakthroughBonus(level, attackSpeedBonus, moveSpeedBonus) {
  if (level <= 0) {
    return {
      damage: 0, baseDamage: 0, capBonus: 0, excessDamage: 0,
      baseRate: 0, excessRate: 0, fixedCapBonus: 0, maxDamage: 0,
      speedSum: 0, excessSum: 0, bothOverCap: false, capped: false,
    };
  }

  const maxDamage = level >= 2 ? 24 : 12;
  const baseRate = level >= 2 ? 0.1 : 0.05;
  const fixedCapBonus = level >= 2 ? 8 : 4;
  const excessRate = level >= 2 ? 0.3 : 0.15;
  const appliedAttackBonus = clamp(readNumber(attackSpeedBonus), 0, 40);
  const appliedMoveBonus = clamp(readNumber(moveSpeedBonus), 0, 40);
  const attackExcess = Math.max(0, readNumber(attackSpeedBonus) - 40);
  const moveExcess = Math.max(0, readNumber(moveSpeedBonus) - 40);
  const bothOverCap = attackExcess > 0 && moveExcess > 0;
  const baseDamage = (appliedAttackBonus + appliedMoveBonus) * baseRate;
  const capBonus = bothOverCap ? fixedCapBonus : 0;
  const rawExcessDamage = bothOverCap ? (attackExcess + moveExcess) * excessRate : 0;
  const excessDamage = Math.min(rawExcessDamage, Math.max(0, maxDamage - baseDamage - capBonus));

  return {
    damage: baseDamage + capBonus + excessDamage,
    baseDamage,
    capBonus,
    excessDamage,
    // 계기판이 그대로 옮겨 적을 근거들
    baseRate,
    excessRate,
    fixedCapBonus,
    maxDamage,
    speedSum: appliedAttackBonus + appliedMoveBonus,
    excessSum: attackExcess + moveExcess,
    bothOverCap,
    capped: rawExcessDamage > excessDamage,
  };
}

// 네 그룹이 모두 곱해지므로 "어느 쪽이 채택됐나"라는 질문은 없다.
// 실제로 값이 들어간 그룹만 늘어놓는다.
function getCooldownGroupLabel(groups) {
  const labels = COOLDOWN_GROUP_KEYS
    .filter(key => readNumber(groups[key]) !== 0)
    .map(key => COOLDOWN_GROUP_LABELS[key]);
  return labels.length > 0 ? labels.join(" × ") : "없음";
}

function getNodeCost(node) {
  return node.cost || EVOLUTION_TIERS[node.tier]?.cost || 0;
}

function getTierUsage(tier, excludedNodeId = "") {
  const tierInfo = EVOLUTION_TIERS[tier];
  const points = NODE_LIBRARY
    .filter(node => node.tier === tier && node.id !== excludedNodeId)
    .reduce((sum, node) => sum + (state.nodeLevels[node.id] || 0) * getNodeCost(node), 0);
  return {
    points,
    maxPoints: tierInfo?.maxPoints || points,
  };
}

function formatEffect(effect, level) {
  if (effect.kind === "note") return formatLevelAwareNote(effect.text, level);
  if (effect.kind === "special") return `${level > 0 ? "적용" : "미적용"}: ${effect.label}`;
  const total = readNumber(effect.amount) * level;
  const unit = effect.kind === "stat" ? "" : "%";
  const base = `${effect.label} +${formatNumber(total)}${unit}`;
  if (!effect.manaScope) return base;

  const share = getManaShareRatio(state.convenience);
  return `${base} → 마나 딜 비중 ${formatInteger(share * 100)}% 적용 +${formatNumber(total * share)}${unit}`;
}

function formatLevelAwareNote(text, level) {
  if (level <= 0) return text;
  return text.replace(/([+-]?\d+(?:\.\d+)?%?)\/([+-]?\d+(?:\.\d+)?%?)/g, (_match, first, second) => {
    if (level <= 1) return first;
    if (/^[+-]/.test(second) || !/^[+-]/.test(first)) return second;
    return `${first[0]}${second}`;
  });
}

function makeBreakdownRow(label, value, amount = 0) {
  const row = document.createElement("div");
  row.className = "breakdown-row";
  row.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>`;
  if (typeof amount === "number") {
    row.style.setProperty("--bar", `${clamp(amount, 0, 50) * 2}%`);
  }
  return row;
}

function makeFormulaRow(label, value) {
  const row = document.createElement("div");
  row.className = "formula-row";
  row.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return row;
}

function makeReferenceListItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function statusClass(value) {
  if (["미반영", "노트만"].includes(value)) return "muted";
  if (["풀효율", "부분 반영"].includes(value)) return "conditional";
  if (["계산 반영", "특성 반영"].includes(value)) return "modeled";
  if (value.includes("확인")) return "muted";
  return "";
}

function commit(shouldRender = true) {
  persistState();
  updateAutosaveStatus("저장 중");
  if (shouldRender) render();
}

function refreshCalculationsOnly() {
  const metrics = calculateMetrics(state);
  const baseline = calculateMetrics({ ...state, nodeLevels: emptyNodeLevels() });
  lastMetrics = metrics;
  renderMetrics(metrics, baseline);
  renderBreakdowns(metrics);
  renderComparison();
  if (typeof syncOptimizerPanel === "function") syncOptimizerPanel();
  updateAutosaveStatus("저장됨");
}

function persistState() {
  syncWorkspaceFromState();
  persistWorkspace();
}

function persistSavedSetups() {
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedSetups));
}

function persistWorkspace() {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

function loadWorkspace() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
    if (parsed) return normalizeWorkspace(parsed);
  } catch {
    // Fall through to the legacy state migration.
  }

  try {
    const legacyState = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    return createWorkspaceFromState(legacyState || DEFAULT_STATE);
  } catch {
    return createWorkspaceFromState(DEFAULT_STATE);
  }
}

function createWorkspaceFromState(sourceState) {
  const normalizedState = mergeState(DEFAULT_STATE, sourceState || DEFAULT_STATE);
  const profile = createProfile("기본 캐릭터", normalizedState);
  const nodePreset = createNodePreset("현재 노드", normalizedState.nodeLevels);
  return {
    version: 4,
    activeProfileId: profile.id,
    activeNodePresetId: nodePreset.id,
    selectedTier: normalizedState.selectedTier || "전체",
    setupName: normalizedState.setupName || "",
    profiles: [profile],
    nodePresets: [nodePreset],
  };
}

function normalizeWorkspace(source) {
  const sourceProfiles = Array.isArray(source?.profiles) ? source.profiles : [];
  const sourceNodePresets = Array.isArray(source?.nodePresets) ? source.nodePresets : [];
  const profiles = sourceProfiles.map((profile, index) => ({
    id: profile.id || makeId(),
    name: String(profile.name || `캐릭터 ${index + 1}`).slice(0, 40),
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: profile.updatedAt || profile.createdAt || new Date().toISOString(),
    state: extractProfileState(profile.state || profile),
  }));
  const nodePresets = sourceNodePresets.map((preset, index) => ({
    id: preset.id || makeId(),
    name: String(preset.name || `노드 ${index + 1}`).slice(0, 40),
    createdAt: preset.createdAt || new Date().toISOString(),
    updatedAt: preset.updatedAt || preset.createdAt || new Date().toISOString(),
    nodeLevels: normalizeNodeLevels(preset.nodeLevels),
  }));

  if (profiles.length === 0) profiles.push(createProfile("기본 캐릭터", DEFAULT_STATE));
  if (nodePresets.length === 0) nodePresets.push(createNodePreset("현재 노드", emptyNodeLevels()));

  const activeProfileId = profiles.some(item => item.id === source?.activeProfileId)
    ? source.activeProfileId
    : profiles[0].id;
  const activeNodePresetId = nodePresets.some(item => item.id === source?.activeNodePresetId)
    ? source.activeNodePresetId
    : nodePresets[0].id;

  return {
    version: 4,
    activeProfileId,
    activeNodePresetId,
    selectedTier: source?.selectedTier || "전체",
    setupName: source?.setupName || "",
    profiles,
    nodePresets,
  };
}

function createProfile(name, sourceState) {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name,
    createdAt: now,
    updatedAt: now,
    state: extractProfileState(sourceState),
  };
}

function createNodePreset(name, nodeLevels) {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name,
    createdAt: now,
    updatedAt: now,
    nodeLevels: normalizeNodeLevels(nodeLevels),
  };
}

function extractProfileState(sourceState) {
  const normalizedState = mergeState(DEFAULT_STATE, sourceState || DEFAULT_STATE);
  return {
    base: cloneState(normalizedState.base),
    settings: cloneState(normalizedState.settings),
    convenience: cloneState(normalizedState.convenience),
    accessories: cloneState(normalizedState.accessories),
    bracelet: cloneState(normalizedState.bracelet),
    engravings: cloneState(normalizedState.engravings),
    baseEffects: cloneState(normalizedState.baseEffects),
  };
}

function normalizeNodeLevels(nodeLevels) {
  return NODE_LIBRARY.reduce((levels, node) => {
    levels[node.id] = clamp(Math.round(readNumber(nodeLevels?.[node.id])), 0, node.maxLevel);
    return levels;
  }, {});
}

function composeWorkspaceState(sourceWorkspace) {
  const profile = sourceWorkspace.profiles.find(item => item.id === sourceWorkspace.activeProfileId)
    || sourceWorkspace.profiles[0];
  const nodePreset = sourceWorkspace.nodePresets.find(item => item.id === sourceWorkspace.activeNodePresetId)
    || sourceWorkspace.nodePresets[0];
  return mergeState(DEFAULT_STATE, {
    ...cloneState(profile.state),
    nodeLevels: cloneState(nodePreset.nodeLevels),
    selectedTier: sourceWorkspace.selectedTier || "전체",
    setupName: sourceWorkspace.setupName || "",
  });
}

function syncWorkspaceFromState() {
  const profile = getActiveProfile();
  const nodePreset = getActiveNodePreset();
  const now = new Date().toISOString();
  if (profile) {
    profile.state = extractProfileState(state);
    profile.updatedAt = now;
  }
  if (nodePreset) {
    nodePreset.nodeLevels = normalizeNodeLevels(state.nodeLevels);
    nodePreset.updatedAt = now;
  }
  workspace.selectedTier = state.selectedTier || "전체";
  workspace.setupName = state.setupName || "";
}

function getActiveProfile() {
  return workspace.profiles.find(item => item.id === workspace.activeProfileId) || workspace.profiles[0];
}

function getActiveNodePreset() {
  return workspace.nodePresets.find(item => item.id === workspace.activeNodePresetId) || workspace.nodePresets[0];
}

function loadSavedSetups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeState(base, next) {
  // 치적/치피는 출처별 입력으로 갈렸다. 예전 저장본에 남아 있어도 무시한다.
  const nextBase = { ...(next.base || {}) };
  delete nextBase.baseCritDamage;
  delete nextBase.baseCritRate;
  delete nextBase.critDamageBonus;

  const accessories = normalizeAccessories(next.accessories);
  const bracelet = normalizeBracelet(next.bracelet);

  return {
    base: { ...base.base, ...nextBase },
    settings: { ...base.settings, ...(next.settings || {}) },
    convenience: { ...base.convenience, ...(next.convenience || {}) },
    accessories,
    bracelet,
    attack: normalizeAttack(next.attack),
    awakening: {
      job: readNumber(next.awakening?.job),
      nodeLevels: { ...(next.awakening?.nodeLevels || {}) },
      uptime: { ...(next.awakening?.uptime || {}) },
    },
    // 적어 넣은 줄만 담는다. 내 줄은 직업과 깨달음이 정하므로 가동율만 저장한다.
    synergy: normalizeSynergy(next.synergy),
    arkGrid: normalizeArkGrid(next.arkGrid),
    collection: { ...base.collection, ...(next.collection || {}) },
    weapon: { ...base.weapon, ...(next.weapon || {}) },
    jewel: { ...base.jewel, ...(next.jewel || {}) },
    engravings: { ...(next.engravings || {}) },
    engravingStones: { ...(next.engravingStones || {}) },
    nodeLevels: { ...(next.nodeLevels || {}) },
    baseEffects: normalizeBaseEffects(next.baseEffects, base.baseEffects),
    specBundles: normalizeSpecBundles(next.specBundles),
    selectedTier: next.selectedTier || base.selectedTier,
    setupName: next.setupName || "",
  };
}

/**
 * 시너지 상태를 지금 모양으로 맞춘다.
 *
 * 예전에는 `{ picks: ["602:회귀", ...], uptime: { defense: 80 } }`였다 —
 * 종류별 칩을 고르고 가동율도 종류에 붙였다. 지금은 줄이 사람이고 가동율이
 * 줄에 붙는다. 옛 저장본은 직업별로 묶어 줄로 옮긴다. 종류에 붙어 있던
 * 가동율은 옮길 자리가 없어 버린다 — 사람마다 다른 값이라 나눌 수 없다.
 */
function normalizeSynergy(synergy) {
  const rows = Array.isArray(synergy?.rows) ? synergy.rows : legacySynergyRows(synergy?.picks);
  return {
    rows: normalizeSynergyRows(rows).map((row, index) => ({
      ...row, id: row.id || `syn-${index}`,
    })),
    ownUptime: normalizeUptimeMap(synergy?.ownUptime),
  };
}

function legacySynergyRows(picks) {
  const byJob = new Map();
  (Array.isArray(picks) ? picks : []).forEach(id => {
    const [job, node] = String(id).split(":");
    const code = readNumber(job);
    if (!getSynergyJob(code)) return;
    if (!byJob.has(code)) byJob.set(code, { job: code, nodes: [], uptime: {} });
    if (node) byJob.get(code).nodes.push(node);
  });
  return [...byJob.values()];
}

function normalizeBaseEffects(effects, fallbackEffects) {
  const source = Array.isArray(effects) ? effects : cloneState(fallbackEffects);

  return source.flatMap(effect => {
    if (effect.category !== "attackSpeed") return [effect];

    const id = effect.id || makeId();
    const label = String(effect.label || "공격/이동속도").trim();
    const genericLabel = /공격\s*\/?\s*이동속도|공이속/.test(label);
    return [
      {
        ...effect,
        id,
        label: genericLabel ? "공격속도" : `${label} · 공속`,
        category: "attackSpeedOnly",
      },
      {
        ...effect,
        id: `${id}-move`,
        label: genericLabel ? "이동속도" : `${label} · 이속`,
        category: "moveSpeedOnly",
      },
    ];
  });
}

function ensureNodeLevelKeys() {
  NODE_LIBRARY.forEach(node => {
    if (typeof state.nodeLevels[node.id] !== "number") state.nodeLevels[node.id] = 0;
  });
}

function emptyNodeLevels() {
  return NODE_LIBRARY.reduce((levels, node) => {
    levels[node.id] = 0;
    return levels;
  }, {});
}

function exportState() {
  persistState();
  const payload = {
    exportedAt: new Date().toISOString(),
    workspace,
    state,
    savedSetups,
    constants: ARC_PASSIVE_CONSTANTS,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ark-passive-simulator.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importState(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      if (payload.workspace) {
        workspace = normalizeWorkspace(payload.workspace);
      } else if (payload.state) {
        workspace = createWorkspaceFromState(payload.state);
      }
      if (Array.isArray(payload.savedSetups)) savedSetups = payload.savedSetups;
      state = composeWorkspaceState(workspace);
      ensureNodeLevelKeys();
      persistSavedSetups();
      commit();
    } catch {
      window.alert("불러오기 파일을 읽지 못했습니다.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function updateAutosaveStatus(text) {
  clearTimeout(statusTimer);
  dom.autosaveStatus.textContent = text;
  statusTimer = setTimeout(() => {
    dom.autosaveStatus.textContent = "저장됨";
  }, 500);
}

function iconSvg(name) {
  const icons = {
    focus: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/></svg>',
    surge: '<svg viewBox="0 0 24 24"><path d="M5 19 12 3l7 16-7-4-7 4Z"/></svg>',
    wind: '<svg viewBox="0 0 24 24"><path d="M4 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M5 18h7"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>',
    flare: '<svg viewBox="0 0 24 24"><path d="m12 2 2 7 7 3-7 3-2 7-2-7-7-3 7-3 2-7Z"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M13 2 5 14h6l-1 8 9-13h-6l0-7Z"/></svg>',
    blade: '<svg viewBox="0 0 24 24"><path d="M14 3 4 16l4 4L21 10l-7-7Z"/><path d="m4 16-2 6 6-2"/></svg>',
    target: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 8a4 4 0 1 0 4 4"/><path d="M22 2 12 12"/></svg>',
    mark: '<svg viewBox="0 0 24 24"><path d="M12 2 9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7Z"/><path d="M12 8v8"/></svg>',
    cycle: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-13 6"/><path d="M4 12a8 8 0 0 1 13-6"/><path d="M17 3v3h-3M7 21v-3h3"/></svg>',
    crown: '<svg viewBox="0 0 24 24"><path d="M4 18h16l1-10-5 4-4-8-4 8-5-4 1 10Z"/><path d="M5 22h14"/></svg>',
    sigil: '<svg viewBox="0 0 24 24"><path d="m12 2 9 10-9 10-9-10 9-10Z"/><path d="m12 7 4 5-4 5-4-5 4-5Z"/></svg>',
  };
  return icons[name] || icons.sigil;
}

function miniIcon(name) {
  const icons = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14"/></svg>',
  };
  return icons[name];
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return readNumber(value).toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatInteger(value) {
  return Math.round(readNumber(value)).toLocaleString("ko-KR");
}

function formatInputValue(value) {
  return Number.isFinite(Number(value)) ? String(value) : "0";
}

function percentDelta(value, base) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return 0;
  return (value / base - 1) * 100;
}

function formatSignedPercent(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatNumber(value)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId() {
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
