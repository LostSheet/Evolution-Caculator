// 로스트아크 API 응답 파서.
//
// 실제 응답으로는 못 돌린다 — API 키가 있어야 하고, 키는 사람마다 다르다.
// 대신 **진짜 응답을 그대로 본떠** 지어낸 것을 먹인다. 아래 생김새는 전부
// scripts/api-probe.mjs로 실제 캐릭터에서 확인한 것이다. 처음에는 명세만 보고
// 지어냈다가 다섯 군데를 틀렸다.
//
//   · 악세서리가 힘·민첩·지능을 전부 적어 온다 (셋 다 더하면 세 배가 된다)
//   · 각인의 Level은 등급 단계가 아니라 어빌리티 스톤이 얹은 레벨이다
//   · 아크 그리드 슬롯은 여섯이고(질서 셋 + 혼돈 셋) 빈 자리는 0P다
//   · 젬 레벨은 ArmoryGem이 아니라 ArkGrid.Effects에 있다
//   · Stats에는 무기 공격력도 힘민지도 없다
import {
  readApiNumber, readCharacter, parseProfile, parseAccessories,
  parseEngravings, parseArkPassive, parseArkGrid, parseGemLevel, parseEquipmentAttack,
  parseWeaponQuality, parseBracelet, parseCardSets,
  parseSpecEfficiency, parseAttackDetail, parseExpeditionBonus, parseJewelCooldown,
  splitCollectionStats, PET_MIXED_IN_FLOOR,
  fetchCharacter, LostArkError,
} from "../src/lib/core/lostark.js";
import { arkGridGemDamage } from "../src/lib/core/cores.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
  return ok;
};

const partBox = (heading, body) => ({
  type: "ItemPartBox",
  value: { Element_000: `<FONT COLOR='#A9D0F5'>${heading}</FONT>`, Element_001: body },
});

const tooltip = boxes => JSON.stringify(
  Object.fromEntries(boxes.map((box, index) => [`Element_${String(index).padStart(3, "0")}`, box])),
);

// 악세서리는 세 스탯을 다 적어 온다. 캐릭터의 주스탯은 방어구가 하나만
// 적어 오는 것으로 가른다 — 여기서는 지능(서머너)이다.
const ACCESSORY_STATS = "힘 +17,268<BR>민첩 +17,268<BR>지능 +17,268";

const PAYLOAD = {
  ArmoryProfile: {
    CharacterName: "테스트",
    ServerName: "루페온",
    CharacterClassName: "서머너",
    ItemAvgLevel: "1,737.50",
    CombatPower: "3,412.55",
    // 실제 응답에는 무기 공격력도 힘민지도 없다. 있는 것은 이 여덟이다.
    // Tooltip은 오래 안 열어 본 필드다. 손으로 넣던 값들이 여기 다 있었다.
    Stats: [
      {
        Type: "치명", Value: "656",
        Tooltip: [
          "치명타 적중률이 <font>23.47%</font> 증가합니다.",
          "물약 및 원정대 레벨 보상 효과로 <font>32</font>만큼 영구적으로 증가되었습니다.",
          "카드 도감 누적 효과가 반영된 값으로 전투정보실에서는 별도 수치를 표기하지 않습니다.",
        ],
      },
      {
        Type: "특화", Value: "1,823",
        Tooltip: [
          "고대 정령 스킬의 피해량이 <font>221.68%</font> 증가합니다.",
          // 피해가 아닌 줄. 이걸 물면 특화 효율이 엉뚱해진다.
          "고대의 기운 획득량이 <font>156.48%</font> 증가합니다.",
          "각성 스킬의 피해량이 <font>39.85%</font> 증가합니다.",
          "물약 및 원정대 레벨 보상 효과로 <font>32</font>만큼 영구적으로 증가되었습니다.",
        ],
      },
      { Type: "제압", Value: "79", Tooltip: ["물약 및 원정대 레벨 보상 효과로 <font>36</font>만큼 영구적으로 증가되었습니다."] },
      { Type: "신속", Value: "77", Tooltip: ["공격 속도가 <font>1.32%</font> 증가합니다."] },
      { Type: "인내", Value: "71" },
      { Type: "숙련", Value: "75" },
      { Type: "최대 생명력", Value: "302,060" },
      {
        Type: "공격력", Value: "164,609",
        Tooltip: [
          "적에게 주는 피해를 계산할 때 기준이 되는 값입니다.",
          "힘, 민첩, 지능과 무기 공격력을 기반으로 증가한 기본 공격력은 <font>158499</font> 입니다.",
          "공격력 증감 효과로 공격력이 <font>6110</font> 증가되었습니다.",
        ],
      },
    ],
  },
  ArmoryEquipment: [
    {
      Type: "무기",
      Name: "+17 운명의 전율 스태프",
      Tooltip: tooltip([
        partBox("기본 효과", "무기 공격력 +198101"),
        partBox("추가 효과", "추가 피해 +30.00%"),
      ]),
    },
    { Type: "투구", Tooltip: tooltip([partBox("기본 효과", "물리 방어력 +8636<BR>지능 +96801")]) },
    { Type: "상의", Tooltip: tooltip([partBox("기본 효과", "물리 방어력 +12100<BR>지능 +84283")]) },
    { Type: "하의", Tooltip: tooltip([partBox("기본 효과", "물리 방어력 +10555<BR>지능 +83664")]) },
    { Type: "장갑", Tooltip: tooltip([partBox("기본 효과", "물리 방어력 +7676<BR>지능 +116161")]) },
    { Type: "어깨", Tooltip: tooltip([partBox("기본 효과", "물리 방어력 +9595<BR>지능 +103023")]) },
    {
      Type: "목걸이",
      Tooltip: tooltip([
        partBox("기본 효과", ACCESSORY_STATS),
        partBox("연마 효과", "낙인력 +2.15%<BR>상태이상 공격 지속시간 +1.00%<BR>추가 피해 +2.60%"),
      ]),
    },
    {
      Type: "귀걸이",
      Tooltip: tooltip([
        partBox("기본 효과", ACCESSORY_STATS),
        // 평면 +195와 퍼센트를 섞어 온다. 연마 등급은 퍼센트 쪽만이다.
        partBox("연마 효과", "무기 공격력 +195<BR>공격력 +1.55%<BR>최대 생명력 +1300"),
      ]),
    },
    {
      Type: "귀걸이",
      Tooltip: tooltip([
        partBox("기본 효과", ACCESSORY_STATS),
        partBox("연마 효과", "공격력 +0.95%<BR>상태이상 공격 지속시간 +0.50%<BR>무기 공격력 +0.80%"),
      ]),
    },
    {
      Type: "반지",
      Tooltip: tooltip([
        partBox("기본 효과", ACCESSORY_STATS),
        partBox("연마 효과", "치명타 적중률 +1.55%<BR>무기 공격력 +195<BR>공격력 +195"),
      ]),
    },
    {
      Type: "반지",
      Tooltip: tooltip([
        partBox("기본 효과", ACCESSORY_STATS),
        partBox("연마 효과", "치명타 적중률 +0.95%<BR>무기 공격력 +195<BR>공격력 +195"),
      ]),
    },
    {
      Type: "팔찌",
      Tooltip: tooltip([partBox("팔찌 효과", [
        "치명 +80",
        "특화 +88",
        "무기 공격력이 7200 증가한다.",
        // 조건부 중첩. 값이 같은 꼴이어도 이건 안 읽어야 한다.
        "자신의 생명력이 50% 이상일 경우 적에게 공격 적중 시 5초 동안 무기 공격력이 2000 증가한다.",
        "스킬의 재사용 대기 시간이 2% 증가하지만, 적에게 주는 피해가 5% 증가한다.",
      ].join("<BR>"))]),
    },
  ],
  ArmoryEngraving: {
    Engravings: null,
    Effects: null,
    // Level은 등급 단계가 아니다. 실제 수치는 Description에 있다.
    ArkPassiveEffects: [
      { AbilityStoneLevel: 4, Grade: "유물", Level: 3, Name: "원한", Description: "보스 및 레이드 몬스터에게 주는 피해가 <FONT COLOR='#99ff99'>26.25%</FONT> 증가하지만, 받는 피해가 <FONT COLOR='#ff9999'>20.00%</FONT> 증가한다." },
      { AbilityStoneLevel: null, Grade: "유물", Level: 0, Name: "예리한 둔기", Description: "치명타 피해량이 <FONT COLOR='#99ff99'>44.00%</FONT> 증가하지만, 공격 시 일정 확률로 <FONT COLOR='#ff9999'>20.00%</FONT> 감소된 피해를 준다." },
      { AbilityStoneLevel: null, Grade: "유물", Level: 0, Name: "질량 증가", Description: "공격속도가 <FONT COLOR='#ff9999'>10.00%</FONT> 감소하지만, 적에게 주는 피해가 <FONT COLOR='#99ff99'>16.00%</FONT> 증가한다." },
      { AbilityStoneLevel: 1, Grade: "유물", Level: 0, Name: "저주받은 인형", Description: "적에게 주는 피해가 <FONT COLOR='#99ff99'>17.00%</FONT> 증가하지만, 받는 모든 회복 효과가 <FONT COLOR='#ff9999'>25.00%</FONT> 감소한다." },
      { AbilityStoneLevel: null, Grade: "유물", Level: 0, Name: "있을 리 없는 각인", Description: "무언가가 <FONT COLOR='#99ff99'>9.00%</FONT> 증가한다." },
    ],
  },
  ArkPassive: {
    IsArkPassive: true,
    Points: [
      // Description에 카르마 랭크·레벨이 실려 온다.
      { Name: "진화", Value: 140, Description: "6랭크 21레벨" },
      { Name: "깨달음", Value: 101, Description: "6랭크 26레벨" },
      { Name: "도약", Value: 70, Description: "5랭크 25레벨" },
    ],
    Effects: [
      { Name: "진화", Description: "진화 1티어 치명 Lv.10" },
      { Name: "진화", Description: "진화 1티어 특화 Lv.30" },
      { Name: "진화", Description: "진화 2티어 예리한 감각 Lv.1" },
      { Name: "진화", Description: "진화 2티어 한계 돌파 Lv.2" },
      { Name: "깨달음", Description: "깨달음 1티어 상급 소환사 Lv.1" },
      { Name: "도약", Description: "도약 1티어 풀려난 힘 Lv.5" },
    ],
  },
  // 슬롯은 여섯이다. 질서 셋은 이 계산기가 안 다루고, 혼돈 중 빈 자리는 0P다.
  ArkGrid: {
    Slots: [
      { Index: 0, Name: "질서의 해 코어 : 힘의 계승", Point: 17, Grade: "유물", Tooltip: tooltip([partBox("코어 타입", "질서 - 해")]) },
      { Index: 1, Name: "질서의 달 코어 : 힘의 집중", Point: 17, Grade: "유물", Tooltip: tooltip([partBox("코어 타입", "질서 - 달")]) },
      { Index: 2, Name: "질서의 별 코어 : 힘의 균형", Point: 17, Grade: "유물", Tooltip: tooltip([partBox("코어 타입", "질서 - 별")]) },
      { Index: 3, Name: "혼돈의 해 코어 : 현란한 공격", Point: 14, Grade: "전설", Tooltip: tooltip([partBox("코어 타입", "혼돈 - 해")]) },
      { Index: 4, Name: "혼돈의 달 코어 : 흡수의 일격", Point: 0, Grade: "전설", Tooltip: tooltip([partBox("코어 타입", "혼돈 - 달")]) },
      { Index: 5, Name: "혼돈의 별 코어 : 속도", Point: 17, Grade: "유물", Tooltip: tooltip([partBox("코어 타입", "혼돈 - 별")]) },
    ],
    Effects: [
      { Name: "추가 피해", Level: 13, Tooltip: "추가 피해 <font color='#ffd200'>+1.05%</font>" },
      { Name: "보스 피해", Level: 10, Tooltip: "보스 등급 이상 몬스터에게 주는 피해 <font color='#ffd200'>+0.83%</font>" },
      { Name: "공격력", Level: 30, Tooltip: "공격력 <font color='#ffd200'>+1.10%</font>" },
    ],
  },
  // 보석(작열·광휘). 아크 그리드 젬과 다른 물건이라 젬 레벨을 여기서 읽으면 안 된다.
  // 같은 보석이라도 쿨감형과 피해형이 섞인다 — 쿨감형만 세야 한다.
  ArmoryGem: {
    Gems: [
      { Slot: 0, Level: 8 }, { Slot: 1, Level: 8 },
      { Slot: 2, Level: 7 }, { Slot: 3, Level: 7 }, { Slot: 4, Level: 7 },
      { Slot: 5, Level: 10 },
    ],
    Effects: {
      Skills: [
        { GemSlot: 0, Description: "재사용 대기시간 20.00% 감소" },
        { GemSlot: 1, Description: "재사용 대기시간 20.00% 감소" },
        { GemSlot: 2, Description: "재사용 대기시간 18.00% 감소" },
        { GemSlot: 3, Description: "재사용 대기시간 18.00% 감소" },
        { GemSlot: 4, Description: "재사용 대기시간 18.00% 감소" },
        // 피해형. 쿨감에 섞이면 안 된다 — 10레벨이라 섞이면 크게 부푼다.
        { GemSlot: 5, Description: "피해 40.00% 증가" },
      ],
    },
  },
  ArmoryCard: {
    Effects: [{
      Index: 0,
      CardSlots: [0, 1, 2, 3, 4, 5],
      Items: [
        { Name: "세상을 구하는 빛 2세트", Description: "암속성 피해 감소 +10.00%" },
        { Name: "세상을 구하는 빛 6세트 (12각성합계)", Description: "공격 속성을 성속성으로 변환" },
        { Name: "세상을 구하는 빛 6세트 (18각성합계)", Description: "성속성 피해 +7.00%" },
        { Name: "세상을 구하는 빛 6세트 (24각성합계)", Description: "성속성 피해 +4.00%" },
        { Name: "세상을 구하는 빛 6세트 (30각성합계)", Description: "성속성 피해 +4.00%" },
      ],
    }],
  },
};

// --- 숫자 --------------------------------------------------------------------
check("(a) 쉼표 섞인 숫자", readApiNumber("19,248") === 19248);
check("(a) 소수", readApiNumber("1,720.00") === 1720);
check("(a) 빈 값은 0", readApiNumber(null) === 0 && readApiNumber("") === 0 && readApiNumber("없음") === 0);

// --- 프로필 ------------------------------------------------------------------
{
  const profile = parseProfile(PAYLOAD);
  check("(b) 이름·서버·직업", profile.name === "테스트" && profile.server === "루페온" && profile.className === "서머너");
  check("(b) 전투 특성 여섯", Object.keys(profile.combat).length === 6, JSON.stringify(profile.combat));
  check("(b) 치명·특화", profile.combat.critStat === 656 && profile.combat.specStat === 1823, JSON.stringify(profile.combat));
  check("(b) 공격력", profile.attackPower === 164609, String(profile.attackPower));
  // 진짜 응답에는 힘민지도 무기 공격력도 Stats에 없다 — 장비로 넘어가야 한다.
  check("(b) Stats에 없으면 0", profile.mainStat === 0 && profile.weaponAttack === 0);
}

// --- 장비에서 긁기 ------------------------------------------------------------
{
  const attack = parseEquipmentAttack(PAYLOAD);
  check("(c) 주스탯 종류는 방어구가 가른다", attack.mainStatType === "지능", String(attack.mainStatType));
  // 무기 198,101 + 귀걸이·반지 연마의 평면 195×3. 악세 평면을 빼면 실측에서
  // 무공이 모자라 팔찌 평면의 몫이 부풀어 보인다.
  check("(c) 무기 공격력 평면", attack.weaponAttack === 198101 + 195 * 3, String(attack.weaponAttack));
  check("(c) 연마 퍼센트", Math.abs(attack.weaponPercent - 0.8) < 1e-9, String(attack.weaponPercent));
  // 방어구 483,932 + 악세서리 5개 × 17,268 = 570,272.
  // 셋 다 더했다면 악세서리가 세 배가 되어 656,340이 나온다.
  check("(c) 주스탯만 더한다", attack.mainStat === 570272, String(attack.mainStat));
  check("(c) 무기 품질을 되짚는다", parseWeaponQuality(PAYLOAD) === 100, String(parseWeaponQuality(PAYLOAD)));
}

// --- 연마 효과 ----------------------------------------------------------------
{
  const { accessories, notes } = parseAccessories(PAYLOAD);
  check("(d) 목걸이 추피 상", accessories.necklace.additionalDamage === "high");
  check("(d) 목걸이 적주피 없음", accessories.necklace.dealtDamage === "none");
  // 평면 '무기 공격력 +195'를 등급으로 읽으면 안 된다. 퍼센트만이 연마 등급이다.
  check("(d) 귀걸이1 무공 없음", accessories.earrings[0].weaponAttack === "none", accessories.earrings[0].weaponAttack);
  check("(d) 귀걸이1 공격력 상", accessories.earrings[0].attackPower === "high", accessories.earrings[0].attackPower);
  // '무기 공격력 +0.80%'의 뒷동강을 공격력으로 물면 0.80 → 등급 없음이 된다.
  check("(d) 귀걸이2 공격력 중 · 무공 하", accessories.earrings[1].attackPower === "mid" && accessories.earrings[1].weaponAttack === "low", JSON.stringify(accessories.earrings[1]));
  check("(d) 반지1 치적 상 · 치피 없음", accessories.rings[0].critRate === "high" && accessories.rings[0].critDamage === "none");
  check("(d) 반지2 치적 중", accessories.rings[1].critRate === "mid");
  check("(d) 못 읽은 것 없음", notes.length === 0, notes.join(" / "));
}

// --- 각인 --------------------------------------------------------------------
//
// Grade/Level로 정하면 다섯 개가 전부 '기본'으로 떨어진다. Description의 수치가
// 진실이다.
{
  const { engravings, stones, notes } = parseEngravings(PAYLOAD);
  check("(e) 예리한 둔기 44% → 전설 4단계", engravings["keen-blunt-weapon"] === "legendary4", engravings["keen-blunt-weapon"]);
  check("(e) 질량 증가 16% → 전설 4단계", engravings["mass-increase"] === "legendary4", engravings["mass-increase"]);
  // Grade 유물 · Level 0은 아직 유물 계단을 안 밟은 것 — 전설 4단계 값이다.
  check("(e) 유물 Level 0 → 전설 4단계", engravings["cursed-doll"] === "legendary4", engravings["cursed-doll"]);
  // 원한 26.25%는 유물 4단계 21%를 넘는다. 넘친 게 아니라 돌이 얹힌 것이다 —
  // 유물 3단계 20.25 + 스톤 Lv.4 6.00. 퍼센트로 단계를 맞추면 이걸 못 가른다.
  check("(e) 원한은 유물 3단계", engravings.grudge === "relic3", engravings.grudge);
  check("(e) 돌 레벨을 따로 싣는다", stones.grudge === 4 && stones["cursed-doll"] === 1, JSON.stringify(stones));
  // 26.25 = 20.25 + 6.00 이 맞으므로 어긋남 알림이 뜨면 안 된다.
  check("(e) 표와 맞으면 조용하다", !notes.some(n => n.includes("원한") && n.includes("표로는")), notes.join(" / "));
  // '공격속도 10% 감소'처럼 앞에 오는 손해 수치에 끌리면 안 된다.
  check("(e) 손해 수치에 안 끌린다", !notes.some(n => n.includes("질량 증가")), notes.join(" / "));
  check("(e) 모르는 각인은 알린다", notes.some(n => n.includes("있을 리 없는 각인")), notes.join(" / "));
  // 다섯 개가 왔고 그중 하나는 라이브러리에 없다 — 넷만 들어가야 한다.
  check("(e) 모르는 각인은 안 넣는다", Object.keys(engravings).length === 4, JSON.stringify(engravings));
}

// --- 아크 패시브 --------------------------------------------------------------
{
  const { nodeLevels, points, notes } = parseArkPassive(PAYLOAD);
  check("(f) 세 갈래 포인트", points["진화"] === 140 && points["깨달음"] === 101 && points["도약"] === 70);
  // Description은 '진화 1티어 치명 Lv.10' 꼴이다.
  check("(f) 치명 10", nodeLevels["e1-crit"] === 10, JSON.stringify(nodeLevels));
  check("(f) 특화 30", nodeLevels["e1-spec"] === 30);
  check("(f) 예리한 감각 1", nodeLevels["e2-sharp-sense"] === 1);
  check("(f) 한계 돌파 2", nodeLevels["e2-limit-break"] === 2);
  check("(f) 깨달음·도약은 진화 파서가 안 센다", !notes.some(n => n.includes("진화 노드")), notes.join(" / "));

  const closed = parseArkPassive({ ArkPassive: { IsArkPassive: false } });
  check("(f) 아크 패시브 미개방", closed.notes.length === 1 && Object.keys(closed.nodeLevels).length === 0);

  const short = parseArkPassive({ ArkPassive: { IsArkPassive: true, Points: [{ Name: "진화", Value: 138 }], Effects: [] } });
  check("(f) 140이 아니면 알린다", short.notes.some(n => n.includes("138")), short.notes.join(" / "));
}

// --- 아크 그리드 --------------------------------------------------------------
{
  const { cores, order, notes } = parseArkGrid(PAYLOAD);
  check("(g) 혼돈 해 · 전설은 단계 1", cores.sun.id === "sun-brilliant" && cores.sun.points === 14 && cores.sun.stage === 0, JSON.stringify(cores.sun));
  // 0P는 빈 자리다. 10P로 올려 잡으면 없는 효과가 붙는다.
  check("(g) 0P는 없음", cores.moon.id === "none", JSON.stringify(cores.moon));
  // Grade "유물"은 단계 0이다 — 게임의 낱말이 유물/고대고, 고대가 위다.
  check("(g) 혼돈 별 · 유물", cores.star.id === "star-speed" && cores.star.points === 17 && cores.star.stage === 0, JSON.stringify(cores.star));
  check("(g) 질서 코어를 밝힌다", notes.some(n => n.includes("질서 코어 3개")), notes.join(" / "));
  // 질서는 딜에 안 실리지만 이름은 받아 적는다. 예전에는 통째로 버려서,
  // 무엇을 끼고 있었는지가 화면에 아예 없었다.
  check("(g) 질서 이름 · 콜론 뒤만", order.sun.name === "힘의 계승" && order.moon.name === "힘의 집중" && order.star.name === "힘의 균형",
        JSON.stringify(order));
  check("(g) 질서 포인트 · 등급", order.sun.points === 17 && order.sun.stage === 0, JSON.stringify(order.sun));
  // 혼돈 자리에 질서가 앉으면 없는 효과가 붙는다.
  check("(g) 질서는 혼돈을 안 건드린다", cores.sun.id === "sun-brilliant", JSON.stringify(cores.sun));
  // ArmoryGem(7레벨 보석)이 아니라 ArkGrid.Effects(13)를 봐야 한다.
  {
    // 카르마는 사람이 적는 값이 아니다 — 여기 실려 온다. 진화 랭크는 진화형
    // 피해로, 깨달음 레벨은 무기 공격력(레벨당 0.1%)으로 간다.
    const karma = parseArkPassive(PAYLOAD).karma;
    check("(g) 카르마 랭크·레벨", karma["진화"]?.rank === 6 && karma["깨달음"]?.level === 26 && karma["도약"]?.rank === 5, JSON.stringify(karma));
    check("(g) 불러오기가 싣는다", readCharacter(PAYLOAD).karma["깨달음"].level === 26);
  }
  check("(g) 젬 레벨은 그리드에서", parseGemLevel(PAYLOAD).gems.additional === 13, JSON.stringify(parseGemLevel(PAYLOAD).gems));
}

// --- Stats[].Tooltip — 게임이 스스로 밝히는 내역 --------------------------------
{
  const spec = parseSpecEfficiency(PAYLOAD);
  // 1823 특화가 고대 정령 스킬 피해량 221.68% → 100당 12.16%
  check("(m) 특화 효율 주력", spec?.best.per100 === 12.16, JSON.stringify(spec?.best));
  check("(m) 스킬군마다 다르다", spec?.lines.length === 2, JSON.stringify(spec?.lines.map(l => l.per100)));
  check("(m) 각성 스킬은 2.19", spec?.lines[1].per100 === 2.19, String(spec?.lines[1].per100));
  // '고대의 기운 획득량'은 피해가 아니다. 물면 특화 효율이 통째로 틀린다.
  check("(m) 피해 아닌 줄은 뺀다", !spec?.lines.some(l => l.label.includes("기운")), JSON.stringify(spec?.lines.map(l => l.label)));
  check("(m) 큰 것이 앞", spec?.lines[0].percent > spec?.lines[1].percent);

  const attack = parseAttackDetail(PAYLOAD);
  check("(m) 기본 공격력", attack?.baseAttackPower === 158499, JSON.stringify(attack));
  check("(m) 공격력 증감", attack?.delta === 6110, JSON.stringify(attack));
  // 공식 검산: (기본 + 평면) × (1 + 합%) — 실제 응답으로 오차 0을 확인한 형태다.
  check("(m) 기본 + 증감 = 공격력", attack.baseAttackPower + attack.delta === attack.attackPower);

  const expedition = parseExpeditionBonus(PAYLOAD);
  check("(m) 물약·원정대", expedition.critStat === 32 && expedition.dominationStat === 36, JSON.stringify(expedition));
  check("(m) 없는 줄은 안 넣는다", !("enduranceStat" in expedition), JSON.stringify(expedition));

  // 툴팁이 통째로 없어도 안 터진다.
  const bare = { ArmoryProfile: { Stats: [{ Type: "특화", Value: "1000" }] } };
  check("(m) 툴팁 없으면 null", parseSpecEfficiency(bare) === null && parseAttackDetail(bare) === null);
}

// --- 힘민지·무공 조립 ----------------------------------------------------------
//
// 역산을 그만뒀다. 게임이 알려 준 기본 공격력에서 √식을 뒤집으면 실측과 32%
// 어긋난다 — 그 식은 지금 게임을 재현하지 못한다. 대신 장비에서 쌓고 배수는
// 세팅이 곱한다. 실측(수내초우산칼싸움장인)으로 무공은 오차 0.00%, 힘민지는
// 0.40%(장비를 다 벗어도 남는 물약·도감 몫)에서 맞았다.
{
  const read = readCharacter(PAYLOAD);
  const armor = 96801 + 84283 + 83664 + 116161 + 103023;
  check("(n) 힘민지는 장비 평면 그대로", read.attack.mainFlat === armor + 17268 * 5, String(read.attack.mainFlat));
  check("(n) 무공도 평면 그대로", read.attack.weaponFlat === 198101 + 195 * 3, String(read.attack.weaponFlat));
  // 조립은 계산기가 한다 — 목장·카르마가 바뀌면 값이 따라와야 하기 때문이다.
  check("(n) 최종값은 안 얼린다", read.attack.weaponAttack === 0 && read.attack.mainStat === 0);
}

// --- 보석(작열·광휘) 쿨감 ------------------------------------------------------
//
// 쿨감의 DPS 효과가 1/(1−c)라서 퍼센트를 그냥 평균 내면 안 된다. 남은 쿨타임의
// 조화평균을 내야 한다 — c* = 1 − 1/Σ(wᵢ/(1−cᵢ))
{
  const jewel = parseJewelCooldown(PAYLOAD);
  check("(o) 쿨감형만 센다", jewel?.count === 5 && jewel?.total === 6, JSON.stringify(jewel));
  check("(o) 피해형 10레벨은 안 센다", !jewel.levels.includes(10), JSON.stringify(jewel.levels));
  check("(o) 높은 순으로", JSON.stringify(jewel.levels) === JSON.stringify([8, 8, 7, 7, 7]), JSON.stringify(jewel.levels));

  // 손계산: 5개 중 2개가 20%, 3개가 18%
  const want = (1 - 1 / (0.4 / 0.8 + 0.6 / 0.82)) * 100;
  check("(o) 조화 블렌드", Math.abs(jewel.percent - Math.round(want * 100) / 100) < 0.001,
    `${jewel.percent} vs ${want.toFixed(4)}`);
  // 산술평균은 18.8%. 조화 쪽이 미세하게 크다.
  check("(o) 산술평균과 다르다", Math.abs(jewel.percent - 18.8) > 0.0005, String(jewel.percent));
  check("(o) 두 레벨 사이", jewel.percent > 18 && jewel.percent < 20, String(jewel.percent));

  // 전부 같은 레벨이면 그 레벨의 값 그대로.
  const flat = parseJewelCooldown({ ArmoryGem: { Gems: [{ Slot: 0, Level: 7 }, { Slot: 1, Level: 7 }] } });
  check("(o) 단일 레벨은 그대로", flat?.percent === 18, String(flat?.percent));
  check("(o) 보석이 없으면 null", parseJewelCooldown({ ArmoryGem: { Gems: [] } }) === null);
}

// --- 팔찌 --------------------------------------------------------------------
{
  const bracelet = parseBracelet(PAYLOAD);
  check("(k) 특성", bracelet.stats?.critStat === 80 && bracelet.stats?.specStat === 88, JSON.stringify(bracelet.stats));
  check("(k) 무공 7,200 → 하", bracelet.effects?.["weapon-attack"] === "low", JSON.stringify(bracelet.effects));
  // "재사용 대기 시간 2% 증가 / 주는 피해 5% 증가" → 중
  check("(k) 쿨증+주피 → 중", bracelet.effects?.["cooldown-penalty-damage"] === "mid", JSON.stringify(bracelet.effects));
  check("(k) 둘만 읽는다", Object.keys(bracelet.effects ?? {}).length === 2, JSON.stringify(bracelet.effects));
  // 조건부 중첩(생명력 50% 이상 … 2000)을 물면 안 된다.
  check("(k) 조건부는 못 읽은 줄로", bracelet.missed.some(l => l.includes("생명력")), bracelet.missed.join(" / "));
  // 값만 맞추면 툴팁의 잡다한 숫자가 '공격/이동속도 중'으로 읽힌다. 낱말도 봐야 한다.
  check("(k) 낱말 없는 줄은 안 문다", !bracelet.effects?.["attack-move-speed"], JSON.stringify(bracelet.effects));
}

// --- 젬 레벨 · 카드 세트 -------------------------------------------------------
//
// 젬은 레벨이 원본이고 퍼센트는 파생이다. 레벨→퍼센트는 정수 내림 계단이라
// 선형 근사(예전 0.0807%/Lv)로는 안 맞는다.
{
  const { gems, mismatch } = parseGemLevel(PAYLOAD);
  check("(l) 세 갈래 레벨", gems.attack === 30 && gems.additional === 13 && gems.boss === 10, JSON.stringify(gems));
  // 게임이 적어 준 퍼센트와 우리 공식이 맞는지 그 자리에서 대조한다.
  check("(l) 공식이 게임과 맞는다", mismatch.length === 0, mismatch.join(" / "));
  check("(l) floor 계단", arkGridGemDamage("additional", 13) === 1.05 && arkGridGemDamage("attack", 30) === 1.10,
    `${arkGridGemDamage("additional", 13)} / ${arkGridGemDamage("attack", 30)}`);

  // 계수가 바뀌면 알려야 한다.
  const off = parseGemLevel({ ArkGrid: { Effects: [{ Name: "추가 피해", Level: 13, Tooltip: "추가 피해 +9.99%" }] } });
  check("(l) 어긋나면 알린다", off.mismatch.length === 1, JSON.stringify(off.mismatch));

  // 카드 — '추가 피해'라고 적힌 것만 추피. 성속성 피해는 곱연산이다.
  const cards = parseCardSets(PAYLOAD);
  check("(l) 성속성은 주는 피해로", cards.dealt === 15 && cards.additional === 0,
    `추피 ${cards.additional} / 주피 ${cards.dealt}`);
  check("(l) 받는 피해 감소는 뺀다", cards.skipped.some(s => s.includes("암속성")), cards.skipped.join(" / "));
  check("(l) 수치 없는 줄도 뺀다", cards.skipped.some(s => s.includes("변환")), cards.skipped.join(" / "));

  // 진짜 '추가 피해' 줄은 추피로 가야 한다.
  const mixed = parseCardSets({ ArmoryCard: { Effects: [{ Items: [
    { Name: "가", Description: "추가 피해 +5.00%" },
    { Name: "나", Description: "성속성 피해 +7.00%" },
  ] }] } });
  check("(l) 추피와 주피를 가른다", mixed.additional === 5 && mixed.dealt === 7, JSON.stringify(mixed));
}

// --- 코어 등급 — 유물 / 고대 ----------------------------------------------------
{
  // Grade가 '전설'처럼 우리가 안 다루는 값으로 오면 17P 수치로 되짚는다.
  // 안정적인 공격 17P는 유물 1.4%, 고대 2.8%.
  const at = (grade, text) => parseArkGrid({ ArkGrid: { Slots: [{
    Index: 0, Name: "혼돈의 해 코어 : 안정적인 공격", Point: 17, Grade: grade,
    Tooltip: tooltip([partBox("코어 타입", "혼돈 - 해"), partBox("코어 옵션", text)]),
  }] } }).cores.sun.stage;

  check("(p) Grade가 고대면 고대", at("고대", "") === 1);
  check("(p) Grade가 유물이면 유물", at("유물", "") === 0);
  check("(p) 전설 + 17P 2.8% → 고대", at("전설", "[17P] 추가 피해가 2.8% 증가한다.") === 1);
  check("(p) 전설 + 17P 1.4% → 유물", at("전설", "[17P] 추가 피해가 1.4% 증가한다.") === 0);
  // 못 가르면 낮은 쪽. 부풀리는 것보다 낫다.
  check("(p) 못 가르면 유물", at("전설", "") === 0);
}

// --- 한데 모으기 --------------------------------------------------------------
{
  const read = readCharacter(PAYLOAD);
  check("(h) 무공 조각을 싣는다", read.attack.weaponFlat === 198101 + 195 * 3 && Math.abs(read.attack.weaponPercent - 0.8) < 1e-9);
  check("(h) 아바타가 없으면 0%", read.attack.avatarPercent === 0, String(read.attack.avatarPercent));
  check("(h) 주스탯 종류를 밝힌다", read.profile.mainStatType === "지능", String(read.profile.mainStatType));
  check("(h) 게임 공격력을 들고 온다", read.reportedAttackPower === 164609, String(read.reportedAttackPower));
  check("(h) 무기 품질", read.weaponQuality === 100);
  // 젬은 레벨로 들어온다 — 퍼센트를 직접 입력으로 밀어 넣던 길은 없앴다.
  check("(h) 젬 레벨 셋", read.arkGrid.gems.attack === 30 && read.arkGrid.gems.boss === 10, JSON.stringify(read.arkGrid.gems));
  check("(h) 카드는 곱연산으로", read.cards.dealt === 15 && read.cards.additional === 0,
    `추피 ${read.cards.additional} / 주피 ${read.cards.dealt}`);

  // Stats에 실려 오면 그쪽이 이긴다 — 그쪽이 카르마 몫까지 담고 있다.
  const withStats = readCharacter({
    ...PAYLOAD,
    ArmoryProfile: {
      ...PAYLOAD.ArmoryProfile,
      Stats: [...PAYLOAD.ArmoryProfile.Stats, { Type: "무기 공격력", Value: "277,400" }, { Type: "지능", Value: "774,120" }],
    },
  });
  // Stats에 실려 와도 조각은 장비에서 온다. 게임이 주는 그 값은 배수가 이미
  // 곱해진 뒤라, 평면 자리에 넣으면 아바타·카르마가 두 번 곱해진다.
  check("(h) Stats가 있어도 평면은 장비", withStats.attack.mainFlat === read.attack.mainFlat, String(withStats.attack.mainFlat));
}

// --- 빈 응답에도 안 터진다 -----------------------------------------------------
{
  const empty = readCharacter({ ArmoryProfile: {} });
  check("(i) 빈 응답", empty.attack.weaponAttack === 0 && Object.keys(empty.nodeLevels).length === 0);

  const nulls = readCharacter({
    ArmoryProfile: { Stats: null },
    ArmoryEquipment: null,
    ArmoryEngraving: null,
    ArkPassive: null,
    ArkGrid: null,
    ArmoryGem: null,
  });
  check("(i) 배열이 null이어도", nulls.notes.length >= 0 && nulls.arkGrid.gems.additional === 0);

  const broken = readCharacter({
    ArmoryProfile: {},
    ArmoryEquipment: [{ Type: "무기", Tooltip: "이건 JSON이 아니다" }],
  });
  check("(i) 툴팁이 깨져도", broken.attack.weaponAttack === 0);
}

// --- 실패했을 때 무슨 말을 하는가 ---------------------------------------------
//
// 여기가 사람이 실제로 만나는 자리다. "읽지 못했습니다"만 띄우면 키가 틀린 건지
// 이름이 틀린 건지 점검 중인지 알 수가 없어서 할 수 있는 일이 없다.
{
  const real = globalThis.fetch;
  const say = async make => {
    globalThis.fetch = async () => make();
    try {
      await fetchCharacter("key", "아무개");
      return "(안 터짐)";
    } catch (error) {
      return error instanceof LostArkError ? error.message : `(${error.name})`;
    }
  };

  const json = (body, status, headers) => new Response(body, { status, headers });
  const cases = [
    ["401", () => json('{"Message":"denied"}', 401), "키"],
    ["429", () => json("{}", 429, { "X-RateLimit-Reset": "1700000000" }), "100회"],
    ["503", () => json("{}", 503), "점검"],
    ["200 null", () => json("null", 200), "찾지 못했"],
    ["끊김", () => { throw new TypeError("Failed to fetch"); }, "닿지 못했"],
    ["500", () => json("{}", 500), "500"],
  ];

  for (const [label, make, expect] of cases) {
    const message = await say(make);
    check(`(j) ${label}`, message.includes(expect), message);
  }

  globalThis.fetch = real;

  // 키나 이름이 비면 아예 부르지 않는다 — 분당 100회를 헛되이 쓸 이유가 없다.
  let called = false;
  globalThis.fetch = async () => { called = true; return json("{}", 200); };
  await fetchCharacter("", "아무개").catch(() => {});
  await fetchCharacter("key", "  ").catch(() => {});
  check("(j) 빈 입력은 부르지 않는다", !called);

  // 헤더는 ISO-8859-1만 받는다. 한글이 섞인 키를 그대로 보내면 브라우저가
  // "Failed to read the 'headers' property"로 죽고, 그게 통신 오류로 잘못 읽힌다.
  called = false;
  let message = "";
  await fetchCharacter("bearer 한글섞인키", "아무개").catch(error => { message = error.message; });
  check("(j) 한글 키는 안 보낸다", !called, "요청이 나갔습니다");
  check("(j) 한글 키를 짚어 말한다", message.includes("한글"), message);
  globalThis.fetch = real;
}

// --- 도감·물약 몫에서 펫 가려내기 ---------------------------------------------
//
// 응답에는 펫이 켜져 있었는지 적혀 있지 않다. 남은 몫이 100을 넘으면 펫이 섞인
// 것으로 본다 — 도감·물약만으로는 그만큼 안 나온다.
{
  const isCollection = key => ["critStat", "specStat", "swiftStat"].includes(key);
  const PET = 160;

  // 실제로 본 모습. 치명 236은 76 + 펫 160이었다.
  const mixed = splitCollectionStats(
    { critStat: 656, specStat: 1663, swiftStat: 1077, enduranceStat: 40 },
    { critStat: 420, specStat: 1588, swiftStat: 1000 },
    isCollection,
    PET,
  );
  const crit = mixed.lines.find(line => line.key === "critStat");
  check("(k) 펫이 섞인 특성을 짚는다", mixed.petStat === "critStat", mixed.petStat);
  check("(k) 펫을 빼고 남긴다", crit.rest === 76, crit.rest);
  check("(k) 그 줄에 표시가 남는다", crit.withPet === true);
  check(
    "(k) 나머지 줄은 안 건드린다",
    mixed.lines.find(line => line.key === "specStat").rest === 75 &&
    mixed.lines.find(line => line.key === "swiftStat").rest === 77,
  );
  // 도감 칸이 없는 특성은 뺄셈 없이 통째로 간다.
  const endurance = mixed.lines.find(line => line.key === "enduranceStat");
  check("(k) 도감 없는 특성은 그대로", endurance.rest === 40 && endurance.collection === false);

  // 펫이 안 섞였으면 아무것도 빼지 않는다.
  const clean = splitCollectionStats(
    { critStat: 656, specStat: 1663 },
    { critStat: 580, specStat: 1588 },
    isCollection,
    PET,
  );
  check("(k) 안 섞였으면 그대로", clean.petStat === "" && clean.lines[0].rest === 76);

  // 펫은 하나에만 붙는다. 둘이 함께 넘어도 하나만 뺀다 —
  // 둘 다 빼면 있지도 않은 펫을 두 번 세는 셈이다.
  // 고르는 기준은 '남은 몫이 작은 쪽'이다. 열쇠 순서가 아니라.
  const twice = splitCollectionStats(
    { specStat: 1663, critStat: 236 },
    { specStat: 0, critStat: 0 },
    isCollection,
    PET,
  );
  check("(k) 펫은 한 번만 뺀다", twice.lines.filter(line => line.withPet).length === 1);
  check("(k) 남은 몫이 작은 쪽을 고른다", twice.petStat === "critStat", twice.petStat);
  check("(k) 안 고른 줄은 그대로", twice.lines.find(line => line.key === "specStat").rest === 1663);

  // 경계. 100은 그대로 두고 101에서 갈린다.
  const at = splitCollectionStats({ critStat: PET_MIXED_IN_FLOOR }, { critStat: 0 }, isCollection, PET);
  const over = splitCollectionStats({ critStat: PET_MIXED_IN_FLOOR + 1 }, { critStat: 0 }, isCollection, PET);
  check("(k) 100은 펫이 아니다", at.petStat === "");
  check("(k) 101부터 펫이다", over.petStat === "critStat");
}

console.log(failures === 0 ? "lostark: all checks passed" : `lostark: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
