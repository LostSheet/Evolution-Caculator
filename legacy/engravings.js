const ENGRAVING_TIERS = [
  { value: "base", label: "기본" },
  { value: "legendary4", label: "전설 4단계" },
  { value: "relic4", label: "유물 4단계" },
];

const ENGRAVING_LIBRARY = [
  engraving("awakening", "각성", "utility", [
    "각성기 쿨감 44% · 횟수 +1",
    "각성기 쿨감 44% · 횟수 +5",
    "각성기 쿨감 50% · 횟수 +5",
  ]),
  engraving("necromancy", "강령술", "utility", [
    "자폭병 · 재사용 21초",
    "자폭병 · 재사용 17초",
    "자폭병 · 재사용 13초",
  ]),
  engraving("fortified-shield", "강화 방패", "utility", [
    "상태이상 면역 · 실드 -64%",
    "상태이상 면역 · 실드 -56%",
    "상태이상 면역 · 실드 -48%",
  ]),
  engraving("master-brawler", "결투의 대가", "damage", [
    "헤드 기준 피해 +16%",
    "헤드 기준 피해 +19.8%",
    "헤드 기준 피해 +22.6%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [16, 19.8, 22.6] },
  ], "headAttack"),
  engraving("drops-of-ether", "구슬동자", "utility", [
    "에테르 · 재사용 16초",
    "에테르 · 재사용 10초",
    "에테르 · 재사용 10초 · 효과 +16%",
  ]),
  engraving("strong-will", "굳은 의지", "utility", [
    "피격 이상 중 받는 피해 -24%",
    "피격 이상 중 받는 피해 -28%",
    "피격 이상 중 받는 피해 -32%",
  ]),
  engraving("vital-point-hit", "급소 타격", "utility", [
    "무력화 +27%",
    "무력화 +32%",
    "무력화 +37%",
  ]),
  engraving("ambush-master", "기습의 대가", "damage", [
    "백어택 기준 피해 +16%",
    "백어택 기준 피해 +19.8%",
    "백어택 기준 피해 +22.6%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [16, 19.8, 22.6] },
  ], "backAttack"),
  engraving("emergency-rescue", "긴급 구조", "utility", [
    "생명력 30% 미만 실드 · 재사용 240초",
    "생명력 30% 미만 실드 · 재사용 200초",
    "생명력 30% 미만 실드 · 재사용 160초",
  ]),
  engraving("masters-tenacity", "달인의 저력", "damage", [
    "주는 피해 +11%",
    "주는 피해 +14%",
    "주는 피해 +17%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 14, 17] },
  ]),
  engraving("raid-captain", "돌격대장", "damage", [
    "이속 증가량의 32%를 피해로 전환",
    "이속 증가량의 40%를 피해로 전환",
    "이속 증가량의 48%를 피해로 전환",
  ], [
    { kind: "special", key: "raidCaptainRate", amounts: [32, 40, 48] },
  ]),
  engraving("magick-stream", "마나의 흐름", "utility", [
    "최대 중첩 쿨감 4%",
    "최대 중첩 쿨감 7%",
    "최대 중첩 쿨감 10%",
  ], [
    { kind: "percent", key: "cooldownReduction", amounts: [4, 7, 10] },
  ]),
  engraving("mp-efficiency-increase", "마나 효율 증가", "damage", [
    "마나 스킬 피해 +11%",
    "마나 스킬 피해 +13%",
    "마나 스킬 피해 +16%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 13, 16], manaOnly: true },
  ]),
  engraving("barricade", "바리케이드", "damage", [
    "실드 중 피해 +11%",
    "실드 중 피해 +14%",
    "실드 중 피해 +17%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 14, 17] },
  ]),
  engraving("lightning-fury", "번개의 분노", "utility", [
    "번개 구체 확률 40%",
    "번개 구체 확률 60%",
    "번개 구체 확률 60% · 시드 추가 피해 140%",
  ]),
  engraving("broken-bone", "부러진 뼈", "damage", [
    "무력화 대상 피해 +32%",
    "무력화 대상 피해 +37%",
    "무력화 대상 피해 +42%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [32, 37, 42] },
  ]),
  engraving("crushing-fist", "분쇄의 주먹", "damage", [
    "공격력 +12% · 대상 피해 +8%",
    "공격력 +18% · 대상 피해 +8%",
    "공격력 +24% · 대상 피해 +8%",
  ], [
    { kind: "damage", key: "공격력", amounts: [12, 18, 24] },
    { kind: "damage", key: "주는 피해", amounts: [8, 8, 8] },
  ]),
  engraving("fortitude", "불굴", "utility", [
    "받는 피해 최대 -24%",
    "받는 피해 최대 -28%",
    "받는 피해 최대 -32%",
  ]),
  engraving("preemptive-strike", "선수필승", "damage", [
    "치적 100% · 추가 치피 +110%",
    "치적 100% · 추가 치피 +140%",
    "치적 100% · 추가 치피 +170%",
  ], [
    { kind: "special", key: "critRateMinimum", amounts: [100, 100, 100] },
    { kind: "percent", key: "critDamage", amounts: [110, 140, 170] },
  ]),
  engraving("all-out-attack", "속전속결", "damage", [
    "홀딩·캐스팅 피해 +16%",
    "홀딩·캐스팅 피해 +18%",
    "홀딩·캐스팅 피해 +21%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [16, 18, 21] },
  ]),
  engraving("super-charge", "슈퍼 차지", "damage", [
    "차지 스킬 피해 +16%",
    "차지 스킬 피해 +18%",
    "차지 스킬 피해 +21%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [16, 18, 21] },
  ]),
  engraving("contender", "승부사", "damage", [
    "최대 중첩 공격력 +13.6%",
    "최대 중첩 공격력 +16.8%",
    "최대 중첩 공격력 +25.2%",
  ], [
    { kind: "damage", key: "공격력", amounts: [13.6, 16.8, 25.2] },
  ]),
  engraving("sight-focus", "시선 집중", "damage", [
    "다음 공격 스킬 피해 +20%",
    "다음 공격 스킬 피해 +25%",
    "다음 공격 스킬 피해 +30%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [20, 25, 30] },
  ]),
  engraving("shield-piercing", "실드 관통", "damage", [
    "실드 피해 +76%",
    "실드 피해 +92%",
    "실드 피해 +108%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [76, 92, 108] },
  ]),
  engraving("adrenaline", "아드레날린", "damage", [
    "공격력 +5.4% · 치적 +8%",
    "공격력 +5.4% · 치적 +14%",
    "공격력 +5.4% · 치적 +20%",
  ], [
    { kind: "damage", key: "공격력", amounts: [5.4, 5.4, 5.4] },
    { kind: "percent", key: "critRate", amounts: [8, 14, 20] },
  ]),
  engraving("stabilized-status", "안정된 상태", "damage", [
    "주는 피해 +11%",
    "주는 피해 +14%",
    "주는 피해 +17%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 14, 17] },
  ]),
  engraving("disrespect", "약자 무시", "damage", [
    "조건부 주는 피해 +27%",
    "조건부 주는 피해 +33%",
    "조건부 주는 피해 +33%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [27, 33, 33] },
  ]),
  engraving("divine-protection", "여신의 가호", "utility", [
    "확률 22% · 받는 피해 -38%",
    "확률 22% · 받는 피해 -46%",
    "확률 30% · 받는 피해 -46%",
  ]),
  engraving("ether-predator", "에테르 포식자", "damage", [
    "최대 중첩 공격력 +12.6%",
    "최대 중첩 공격력 +12.6%",
    "최대 중첩 공격력 +16.2%",
  ], [
    { kind: "damage", key: "공격력", amounts: [12.6, 12.6, 16.2] },
  ]),
  engraving("keen-blunt-weapon", "예리한 둔기", "damage", [
    "치피 +36% · 10% 확률로 피해 -20% · 기대값 0.98배",
    "치피 +44% · 10% 확률로 피해 -20% · 기대값 0.98배",
    "치피 +52% · 10% 확률로 피해 -20% · 기대값 0.98배",
  ], [
    { kind: "percent", key: "critDamage", amounts: [36, 44, 52] },
    { kind: "damage", key: "예리한 둔기 패널티", amounts: [-2, -2, -2] },
  ]),
  engraving("grudge", "원한", "damage", [
    "보스에게 주는 피해 +15%",
    "보스에게 주는 피해 +18%",
    "보스에게 주는 피해 +21%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [15, 18, 21] },
  ]),
  engraving("crisis-evasion", "위기 모면", "utility", [
    "사망 피해 무효 · 재사용 640초",
    "사망 피해 무효 · 재사용 560초",
    "사망 피해 무효 · 재사용 480초",
  ]),
  engraving("cursed-doll", "저주받은 인형", "damage", [
    "주는 피해 +11%",
    "주는 피해 +14%",
    "주는 피해 +17%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 14, 17] },
  ]),
  engraving("expert", "전문의", "utility", [
    "실드·회복 +20% · 저체력 추가 +8%",
    "실드·회복 +24% · 저체력 추가 +8%",
    "실드·회복 +28% · 저체력 추가 +8%",
  ]),
  engraving("spirit-absorption", "정기 흡수", "utility", [
    "공격·이동속도 +10%",
    "공격·이동속도 +13%",
    "공격·이동속도 +16%",
  ], [
    { kind: "percent", key: "attackSpeed", amounts: [10, 13, 16] },
  ]),
  engraving("precise-dagger", "정밀 단도", "damage", [
    "치적 +15% · 치피 -6%",
    "치적 +18% · 치피 -6%",
    "치적 +21% · 치피 -6%",
  ], [
    { kind: "percent", key: "critRate", amounts: [15, 18, 21] },
    { kind: "percent", key: "critDamage", amounts: [-6, -6, -6] },
  ]),
  engraving("heavy-armor", "중갑 착용", "utility", [
    "모든 방어력 +74%",
    "모든 방어력 +90%",
    "모든 방어력 +106%",
  ]),
  engraving("mass-increase", "질량 증가", "damage", [
    "주는 피해 +13% · 공격속도 -10%",
    "주는 피해 +16% · 공격속도 -10%",
    "주는 피해 +19% · 공격속도 -10%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [13, 16, 19] },
    { kind: "percent", key: "attackSpeedOnly", amounts: [-10, -10, -10] },
  ]),
  engraving("max-mp-increase", "최대 마나 증가", "utility", [
    "최대 마나 +24%",
    "최대 마나 +28%",
    "최대 마나 +32%",
  ]),
  engraving("propulsion", "추진력", "damage", [
    "스킬 피해 +11%",
    "스킬 피해 +14%",
    "스킬 피해 +17%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 14, 17] },
  ]),
  engraving("hit-master", "타격의 대가", "damage", [
    "비방향성 공격 피해 +11%",
    "비방향성 공격 피해 +14%",
    "비방향성 공격 피해 +17%",
  ], [
    { kind: "damage", key: "주는 피해", amounts: [11, 14, 17] },
  ], "nonDirectional"),
  engraving("master-of-escape", "탈출의 명수", "utility", [
    "기상기 쿨감 19%",
    "기상기 쿨감 23%",
    "기상기 쿨감 27%",
  ]),
  engraving("explosive-expert", "폭발물 전문가", "damage", [
    "배틀아이템 피해 +80% · 소지 +1",
    "배틀아이템 피해 +80% · 소지 +5",
    "배틀아이템 피해 +80% · 소지 +5 · 미소모 20%",
  ]),
];

function engraving(id, name, section, tierSummaries, effects = [], condition = null) {
  return { id, name, section, tierSummaries, effects, condition };
}

// 조합 탐색에서 기본적으로 '제외'로 두는 각인. 레이드 내내 유지되지 않는 조건에
// 묶여 있어 딜러 기대값 비교에 넣으면 과대평가되는 것들입니다. 직업과 세팅에 따라
// 판단이 갈리므로 탐색 후보 설정에서 언제든 후보로 되돌릴 수 있습니다.
const NON_RAID_ENGRAVINGS = new Map([
  ["preemptive-strike", "선수필승 · 전투 시작 직후 한정"],
  ["contender", "승부사 · 처치 중첩 필요"],
  ["shield-piercing", "실드 관통 · 실드 대상 한정"],
  ["broken-bone", "부러진 뼈 · 무력화 대상 한정"],
  ["disrespect", "약자 무시 · 저체력 대상 한정"],
]);
