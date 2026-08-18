const BRACELET_GRADES = [
  { value: "low", label: "하" },
  { value: "mid", label: "중" },
  { value: "high", label: "상" },
];

const BRACELET_STAT_FIELDS = [
  { key: "critStat", label: "치명" },
  { key: "specStat", label: "특화" },
  { key: "swiftStat", label: "신속" },
];

const BRACELET_EFFECTS = [
  // 무공과 힘민지는 퍼센트가 아니라 숫자로 붙는다. 사전 세팅의 '공격력'에
  // 지금 무공·힘민지를 적어 둬야 몇 퍼센트인지 정해진다 — 안 적으면 안 세고,
  // 계기판이 못 셌다고 알린다.
  braceletEffect("weapon-attack", "무기 공격력", [
    "무기 공격력 +7,200",
    "무기 공격력 +8,100",
    "무기 공격력 +9,000",
  ], [
    { kind: "flat", key: "weaponAttack", amounts: [7200, 8100, 9000] },
  ], "", { avoids: /중첩|생명력|초 동안/ }),
  braceletEffect("attack-move-speed", "공격/이동속도", [
    "공격/이동속도 +4%",
    "공격/이동속도 +5%",
    "공격/이동속도 +6%",
  ], [
    { kind: "percent", key: "attackSpeed", amounts: [4, 5, 6] },
  ]),
  braceletEffect("crit-rate-on-crit-damage", "치적 + 치명타 적중 피해", [
    "치적 +3.4% · 치명타 적중 시 주피 +1.5%",
    "치적 +4.2% · 치명타 적중 시 주피 +1.5%",
    "치적 +5% · 치명타 적중 시 주피 +1.5%",
  ], [
    { kind: "percent", key: "critRate", amounts: [3.4, 4.2, 5] },
    { kind: "damage", key: "주는 피해", amounts: [1.5, 1.5, 1.5] },
  ]),
  braceletEffect("crit-damage-on-crit-damage", "치피 + 치명타 적중 피해", [
    "치피 +6.8% · 치명타 적중 시 주피 +1.5%",
    "치피 +8.4% · 치명타 적중 시 주피 +1.5%",
    "치피 +10% · 치명타 적중 시 주피 +1.5%",
  ], [
    { kind: "percent", key: "critDamage", amounts: [6.8, 8.4, 10] },
    { kind: "damage", key: "주는 피해", amounts: [1.5, 1.5, 1.5] },
  ]),
  braceletEffect("stagger-damage", "무력화 대상 피해", [
    "주피 +2% · 무력화 대상 주피 +4%",
    "주피 +2.5% · 무력화 대상 주피 +4.5%",
    "주피 +3% · 무력화 대상 주피 +5%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [2, 2.5, 3] },
    { kind: "damage", key: "주는 피해", amounts: [4, 4.5, 5] },
  ]),
  braceletEffect("additional-demon-damage", "추가 피해 + 악마 피해", [
    "추가 피해 +2.5% · 악마/대악마 피해 +2.5%",
    "추가 피해 +3% · 악마/대악마 피해 +2.5%",
    "추가 피해 +3.5% · 악마/대악마 피해 +2.5%",
  ], [
    { kind: "damage", key: "추가 피해", amounts: [2.5, 3, 3.5] },
    { kind: "damage", key: "악마/대악마 피해", amounts: [2.5, 2.5, 2.5] },
  ]),
  braceletEffect("cooldown-penalty-damage", "쿨타임 증가 + 주는 피해", [
    "재사용 대기시간 +2% · 주피 +4.5%",
    "재사용 대기시간 +2% · 주피 +5%",
    "재사용 대기시간 +2% · 주피 +5.5%",
  ], [
    { kind: "percent", key: "cooldownIncrease", amounts: [2, 2, 2] },
    { kind: "damage", key: "주는 피해", amounts: [4.5, 5, 5.5] },
  ]),
  braceletEffect("damage", "주는 피해", [
    "주는 피해 +2%",
    "주는 피해 +2.5%",
    "주는 피해 +3%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [2, 2.5, 3] },
  ]),
  braceletEffect("additional-damage", "추가 피해", [
    "추가 피해 +3%",
    "추가 피해 +3.5%",
    "추가 피해 +4%",
  ], [
    { kind: "damage", key: "추가 피해", amounts: [3, 3.5, 4] },
  ]),
  braceletEffect("back-attack-damage", "백어택 피해", [
    "백어택 스킬 주피 +2.5%",
    "백어택 스킬 주피 +3%",
    "백어택 스킬 주피 +3.5%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [2.5, 3, 3.5] },
  ], "backAttack"),
  braceletEffect("head-attack-damage", "헤드어택 피해", [
    "헤드어택 스킬 주피 +2.5%",
    "헤드어택 스킬 주피 +3%",
    "헤드어택 스킬 주피 +3.5%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [2.5, 3, 3.5] },
  ], "headAttack"),
  braceletEffect("non-directional-damage", "비방향성 피해", [
    "비방향성 스킬 주피 +2.5%",
    "비방향성 스킬 주피 +3%",
    "비방향성 스킬 주피 +3.5%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [2.5, 3, 3.5] },
  ], "nonDirectional"),
  braceletEffect("crit-rate", "치명타 적중률", [
    "치적 +3.4%",
    "치적 +4.2%",
    "치적 +5%",
  ], [
    { kind: "percent", key: "critRate", amounts: [3.4, 4.2, 5] },
  ]),
  braceletEffect("crit-damage", "치명타 피해", [
    "치피 +6.8%",
    "치피 +8.4%",
    "치피 +10%",
  ], [
    { kind: "percent", key: "critDamage", amounts: [6.8, 8.4, 10] },
  ]),

  // 중첩·조건부 무공 셋. 값은 **최대 중첩**으로 센다.
  //
  // match는 툴팁에 실제로 적힌 숫자다 — amounts는 중첩을 곱한 뒤라서 줄에
  // 안 나온다. 등급을 되짚을 때는 match를, 계산할 때는 amounts를 쓴다.
  braceletEffect("weapon-attack-stack6", "무기 공격력 · 6중첩", [
    "무공 +6,960 · 공이속 +6%",
    "무공 +7,920 · 공이속 +6%",
    "무공 +8,880 · 공이속 +6%",
  ], [
    { kind: "flat", key: "weaponAttack", amounts: [6960, 7920, 8880], match: [1160, 1320, 1480] },
    { kind: "percent", key: "attackSpeed", amounts: [6, 6, 6], match: [1, 1, 1] },
  ], "", { needs: /매\s*초/ }),
  braceletEffect("weapon-attack-healthy", "무기 공격력 · 생명력 50%", [
    "무공 +9,200",
    "무공 +10,300",
    "무공 +11,400",
  ], [
    { kind: "flat", key: "weaponAttack", amounts: [9200, 10300, 11400], match: [7200, 8100, 9000] },
  ], "", { needs: /생명력/ }),
  braceletEffect("weapon-attack-stack30", "무기 공격력 · 30중첩", [
    "무공 +10,800",
    "무공 +12,000",
    "무공 +13,200",
  ], [
    { kind: "flat", key: "weaponAttack", amounts: [10800, 12000, 13200], match: [6900, 7800, 8700] },
  ], "", { needs: /30\s*초/ }),
];

const BRACELET_UNSUPPORTED_EFFECTS = [
  { name: "체력", summary: "최대 +6,000" },
  { name: "전투자원 회복량", summary: "+8% / +10% / +12%" },
  { name: "경직/피격이상 면역", summary: "재사용 80초 / 70초 / 60초" },
  { name: "방어력 · 생명력 회복", summary: "딜에 안 옴" },
  { name: "시드 등급 이하 몬스터", summary: "레이드 보스에 안 걸림" },
  { name: "서폿 효과", summary: "방깎 · 아군 강화 · 보호는 시너지 칸이 셈" },
];

function braceletEffect(id, name, summaries, effects, condition = "", line = null) {
  return { id, name, summaries, effects, condition, line };
}
