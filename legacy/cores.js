// 아크 그리드 — 혼돈 코어와 젬, 그리고 목장/도감/물약처럼 단일 출처인 항목들.
//
// 코어는 해/달/별 각 1개만 장착한다. 포인트 구간(10/14/17/18/19/20)은 누적이라
// 17P를 고르면 10P와 14P 효과도 함께 붙는다. 18~20P는 1포인트마다 같은 값이
// 한 번씩 더 붙는 구간이라 별도로 다룬다.
//
// 17P 줄에 값이 둘(예: 1.0/1.5%)인 것은 코어 단계 차이다. 계산기에서는
// `단계 1 / 단계 2`로 고르게 한다.
//
// 딜 기대값에 반영하지 않는 효과는 아예 싣지 않는다 — 받는 피해 감소, 낙인력,
// 아군 공격력/피해량 강화, 아이덴티티, 방어력, 생명력, 무력화, 최대 마나,
// 화상·부위파괴 같은 별도 피해원, 그리고 기준값이 없는 평면 공격력/무기 공격력.

const CHAOS_CORE_POINTS = [10, 14, 17, 18, 19, 20];

const CHAOS_CORE_SLOTS = [
  { key: "sun", label: "해" },
  { key: "moon", label: "달" },
  { key: "star", label: "별" },
];

const CHAOS_CORE_STAGES = [
  { value: 0, label: "단계 1" },
  { value: 1, label: "단계 2" },
];

const CHAOS_CORES = [
  // ── 해 ────────────────────────────────────────────────────────────
  core("sun-brilliant", "sun", "현란한 공격", {
    10: [{ kind: "critOnlyDamage", amount: 0.55 }],
    14: [{ kind: "damage", key: "주는 피해", amount: 0.5 }],
    17: [
      { kind: "damage", key: "주는 피해", amounts: [1.0, 1.5] },
      { kind: "critOnlyDamage", amounts: [0.55, 1.1] },
    ],
    per: [{ kind: "damage", key: "주는 피해", amount: 0.16 }],
  }),
  core("sun-stable", "sun", "안정적인 공격", {
    14: [{ kind: "damage", key: "추가 피해", amount: 0.7 }],
    17: [{ kind: "damage", key: "추가 피해", amounts: [1.4, 2.8] }],
    per: [{ kind: "damage", key: "추가 피해", amount: 0.23 }],
  }, "10P·17P의 받는 피해 감소는 미반영"),
  core("sun-swift", "sun", "재빠른 공격", {
    10: [{ kind: "percent", key: "attackSpeedOnly", amount: 1.0 }],
    14: [{ kind: "percent", key: "critDamage", amount: 1.4 }],
    17: [
      { kind: "percent", key: "attackSpeedOnly", amounts: [2.0, 3.0] },
      { kind: "percent", key: "critDamage", amounts: [2.8, 5.6] },
    ],
    per: [{ kind: "percent", key: "critDamage", amount: 0.45 }],
  }),
  core("sun-faith", "sun", "신념의 강화", {}, "아이덴티티·아군 피해량 강화 전용, 딜 기대값 미반영"),
  core("sun-mana", "sun", "흐르는 마나", {
    14: [{ kind: "percent", key: "skillCooldownReduction", amount: 0.4 }],
    17: [{ kind: "percent", key: "skillCooldownReduction", amounts: [0.8, 1.6] }],
    per: [{ kind: "percent", key: "skillCooldownReduction", amount: 0.13 }],
  }, "최대 마나는 미반영. 쿨감은 최훈/타지 그룹"),
  core("sun-resolve", "sun", "불굴의 강화", {}, "아군 공격력 강화·기상기 쿨감 전용, 딜 기대값 미반영"),

  // ── 달 ────────────────────────────────────────────────────────────
  core("moon-burn", "moon", "불타는 일격", {
    14: [{ kind: "damage", key: "주는 피해", amount: 0.5 }],
    17: [{ kind: "damage", key: "주는 피해", amounts: [1.0, 2.0] }],
    per: [{ kind: "damage", key: "주는 피해", amount: 0.16 }],
  }, "화상 피해는 별도 피해원이라 미반영"),
  core("moon-drain", "moon", "흡수의 일격", {
    14: [{ kind: "damage", key: "주는 피해", amount: 0.5 }],
    17: [{ kind: "damage", key: "주는 피해", amounts: [1.0, 2.0] }],
    per: [{ kind: "damage", key: "주는 피해", amount: 0.16 }],
  }, "생명력 회복은 미반영"),
  core("moon-break", "moon", "부수는 일격", {
    14: [{ kind: "percent", key: "critRate", amount: 0.65 }],
    17: [{ kind: "percent", key: "critRate", amounts: [1.3, 2.6] }],
    per: [{ kind: "percent", key: "critRate", amount: 0.21 }],
  }, "부위 파괴는 미반영"),
  core("moon-brand", "moon", "낙인의 흔적", {}, "낙인력 전용, 딜 기대값 미반영"),
  core("moon-steel", "moon", "강철의 흔적", {}, "방어력 전용, 딜 기대값 미반영"),
  core("moon-lethal", "moon", "치명적인 흔적", {}, "무력화·파티 치피 전용, 딜 기대값 미반영"),

  // ── 별 ────────────────────────────────────────────────────────────
  core("star-attack", "star", "공격", {
    14: [{ kind: "damage", key: "공격력", amount: 0.55 }],
    17: [{ kind: "damage", key: "공격력", amounts: [1.1, 1.65] }],
    per: [{ kind: "damage", key: "공격력", amount: 0.16 }],
  }, "평면 공격력은 기준값이 없어 미반영"),
  core("star-weapon", "star", "무기", {
    14: [{ kind: "damage", key: "무기 공격력", amount: 0.75 }],
    17: [{ kind: "damage", key: "무기 공격력", amounts: [1.5, 2.25] }],
    per: [{ kind: "damage", key: "무기 공격력", amount: 0.23 }],
  }, "평면 무기 공격력은 기준값이 없어 미반영"),
  core("star-salvation", "star", "구원", {}, "아군 회복·보호막 전용, 딜 기대값 미반영"),
  core("star-life", "star", "생명", {}, "체력·생명력 전용, 딜 기대값 미반영"),
  core("star-speed", "star", "속도", {
    10: [{ kind: "percent", key: "attackSpeedOnly", amount: 0.9 }],
    14: [{ kind: "percent", key: "moveSpeedOnly", amount: 0.9 }],
    17: [
      { kind: "percent", key: "attackSpeedOnly", amounts: [1.8, 2.7] },
      { kind: "percent", key: "moveSpeedOnly", amounts: [1.8, 2.7] },
    ],
    per: [
      { kind: "percent", key: "attackSpeedOnly", amount: 0.3 },
      { kind: "percent", key: "moveSpeedOnly", amount: 0.3 },
    ],
  }),
  core("star-defense", "star", "방어", {}, "방어력 전용, 딜 기대값 미반영"),
];

function core(id, slot, name, tiers, note = "") {
  const { per = [], ...thresholds } = tiers;
  return { id, slot, name, thresholds, perPoint: per, note, modeled: Object.keys(thresholds).length > 0 };
}

// 젬의 추가 피해는 툴팁 표기(0.08%/Lv)와 실제 적용값이 다르다.
const GEM_ADDITIONAL_DAMAGE_PER_LEVEL = 0.807;
const GEM_MAX_LEVEL = 10;

// 단일 출처 항목. 켜고 끄거나 수치만 넣으면 되는 것들.
const STANDALONE_SOURCES = {
  ranchCollection: { label: "목장 도감", summary: "추가 피해 +1%", amount: 1 },
};

// 무기 품질 0~100 → 무기 추가 피해 %. y = 0.002x² + 10
// 품질 0에서도 10%이고 100에서 30%다.
const WEAPON_QUALITY_MAX = 100;

function weaponQualityDamage(quality) {
  const q = Math.min(WEAPON_QUALITY_MAX, Math.max(0, Number(quality) || 0));
  return 0.002 * q * q + 10;
}
