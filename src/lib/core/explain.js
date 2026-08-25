// 계기판용 출처 분해.
//
// 합계는 만들지 않는다. calculateMetrics가 돌려준 damageGroups·percentBonuses를
// 그대로 쓰고, 여기서는 "그 값이 어느 출처에서 얼마씩 왔는지"만 다시 걷어 모은다.
// 그래서 계기판 머리의 숫자는 계산과 어긋날 수 없다.
//
// 출처를 하나 빠뜨리면 합계와 목록이 안 맞는데, 그 차이는 삼키지 않고 residual로
// 남겨 화면에 "기타"로 드러낸다. scripts/explain.test.mjs가 residual을 0으로 검사한다.
import { NODE_LIBRARY, ARC_PASSIVE_CONSTANTS } from "./data.js";
import {
  ENGRAVING_LIBRARY, ENGRAVING_TIERS, engravingAmount, engravingStoneAmount,
} from "./engravings.js";
import { BRACELET_STAT_FIELDS, BRACELET_EFFECTS, BRACELET_GRADES } from "./bracelets.js";
import {
  CHAOS_CORE_SLOTS, CHAOS_CORES, STANDALONE_SOURCES,
  ARK_GRID_GEM_EFFECTS, arkGridGemDamage, WEAPON_QUALITY_MAX, weaponQualityDamage,
} from "./cores.js";
import {
  DEFAULT_STATE, MULTIPLICATIVE_DAMAGE_GROUPS, SQRT_DAMAGE_GROUPS, damageGroupFactor, calculateMetrics,
  normalizeAccessories, normalizeBracelet, normalizeArkGrid,
  getAccessoryOptionValue, getEngravingTierIndex, getBraceletGradeIndex,
  isDirectionalConditionActive, getManaShareRatio, getStaggerShare, getNodeCost,
  COOLDOWN_GROUP_KEYS, COOLDOWN_GROUP_LABELS,
  normalizeAttack, baseAttackPower, resolveRanchDamage, passionDanceAmount,
} from "./metrics.js";
import { awakeningBonuses } from "./awakening.js";
import { SYNERGY_TYPES, synergyBonuses } from "./synergy.js";
import { readNumber, clamp, formatNumber } from "./util.js";

// 계기판에 이 순서로 세운다. 목록에 없는 그룹(직접 입력 등)은 뒤에 붙는다.
const DAMAGE_GROUP_ORDER = [
  "진화형 피해",
  "추가 피해",
  "주는 피해",
  "헤드어택 피해",
  "특화 효율",
  "공격력",
  "무기 공격력",
  "스킬 피해",
  "보스 피해",
  "무력화 대상 피해",
];

// 노드·각인 이름은 절대 손으로 적지 않는다. 예전에 '레이드 캡틴'(→돌격대장),
// '둔중한 가시'(→뭉툭한 가시)처럼 없는 이름이 계기판에 떠 있었다.
// 라이브러리에서 끌어오면 데이터가 바뀌어도 같이 따라간다.
const nodeName = id => NODE_LIBRARY.find(node => node.id === id)?.name ?? id;
const engravingName = id => ENGRAVING_LIBRARY.find(item => item.id === id)?.name ?? id;

// 이 두 노드는 기본 진피와 전환 진피가 따로 들어온다. 나중에 한 덩어리로
// 묶으려고 전환분에 표식을 달아 둔다.
const BLUNT_THORN_KEY = "__bluntThorn";
const SONIC_KEY = "__sonic";

// 150.00% 같은 표기는 잡음이다. 딱 떨어지면 정수로 쓴다.
const trimPercent = value => `${Math.round(value * 100) / 100}`;

const STAT_FIELDS = [
  { key: "critStat", label: "치명" },
  { key: "specStat", label: "특화" },
  { key: "swiftStat", label: "신속" },
];

function createLedger() {
  const damage = new Map();
  const percent = new Map();
  const stat = new Map();

  const push = (map, key, label, amount) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ label, amount });
  };

  return {
    damage, percent, stat,
    addDamage: (key, label, amount) => push(damage, key, label, amount),
    addPercent: (key, label, amount) => push(percent, key, label, amount),
    addStat: (key, label, amount) => push(stat, key, label, amount),
  };
}

// calculateMetrics와 같은 순서로 같은 출처를 훑는다.
function collectSources(state, metrics) {
  const ledger = createLedger();
  const convenience = { ...DEFAULT_STATE.convenience, ...(state.convenience || {}) };
  const settings = state.settings;
  const manaShare = getManaShareRatio(convenience);

  /**
   * 평면 증가는 이제 퍼센트로 안 바꾼다.
   *
   * 예전에는 기준값으로 나눠 같은 그룹에 퍼센트로 얹었다. 그런데 게임 수식의
   * A·B는 (평면 합) × (1 + 퍼센트 합)이라, 평면을 퍼센트로 바꿔 더하면
   * (1+a)(1+p)와 1+p+a의 차이만큼 어긋난다 — 팔찌 무공 9,000에서 실제로
   * 벌어졌다. 여기서는 평면을 평면대로 적어 두고, 곱은 사슬이 한다.
   */
  const attack = normalizeAttack(state.attack);
  const attackFlats = [];
  const addFlat = (key, label, amount) => {
    const value = readNumber(amount);
    if (value === 0) return;
    attackFlats.push({ key, label, amount: value });
  };

  // 1 · 시작 특성
  STAT_FIELDS.forEach(field => {
    ledger.addStat(field.key, "기본", readNumber(state.base?.[field.key]));
  });

  // 2 · 펫
  if (STAT_FIELDS.some(field => field.key === convenience.petStat)) {
    ledger.addStat(convenience.petStat, "펫 효과", ARC_PASSIVE_CONSTANTS.petStatBonus);
  }

  // 3 · 진화 노드
  NODE_LIBRARY.forEach(node => {
    const level = clamp(Math.round(state.nodeLevels?.[node.id] || 0), 0, node.maxLevel);
    if (level <= 0) return;
    const label = `${node.name} Lv${level}`;
    node.effects.forEach(effect => {
      if (effect.kind === "note" || effect.kind === "special") return;
      // 일격의 치피처럼 효과 하나만 방향성 조건이 붙는 경우가 있다.
      if (!isDirectionalConditionActive(effect.condition, settings)) return;
      const amount = readNumber(effect.amount) * level * (effect.manaOnly ? manaShare : 1);
      if (effect.kind === "stat") ledger.addStat(effect.key, label, amount);
      else if (effect.kind === "damage") ledger.addDamage(effect.key, label, amount);
      else if (effect.kind === "critOnlyDamage") ledger.addPercent("critOnlyDamage", label, amount);
      else ledger.addPercent(effect.key, label, amount);
    });
  });

  // 4 · 직접 입력 효과
  (state.baseEffects || []).forEach(effect => {
    // 식으로 적은 항목은 값이 재료에 달려 있다. metrics가 이미 계산해 둔
    // 결과를 그대로 쓴다 — 여기서 다시 풀면 두 곳이 어긋난다.
    if (typeof effect.formula === "string" && effect.formula.trim()) return;
    // 유효율을 먹인 값으로 적는다. 안 그러면 목록이 합계보다 커진다.
    const rate = effect.uptime === undefined || effect.uptime === null || effect.uptime === ""
      ? 1 : clamp(readNumber(effect.uptime), 0, 100) / 100;
    const amount = readNumber(effect.amount) * rate;
    const label = (effect.label || "직접 입력").trim();
    if (effect.category === "customDamage") {
      ledger.addDamage((effect.customCategory || effect.label || "기타 피해").trim(), label, amount);
    } else if (effect.category?.startsWith("damage:")) {
      ledger.addDamage(effect.category.slice("damage:".length), label, amount);
    } else if (effect.category?.startsWith("flat:")) {
      addFlat(effect.category.slice("flat:".length), label, amount);
    } else {
      ledger.addPercent(effect.category, label, amount);
    }
  });

  // 5 · 악세서리 — 부위별로 세운다
  const accessories = normalizeAccessories(state.accessories);
  ledger.addDamage(
    "추가 피해", "목걸이",
    getAccessoryOptionValue("necklace", "additionalDamage", accessories.necklace.additionalDamage),
  );
  ledger.addDamage(
    "주는 피해", "목걸이",
    getAccessoryOptionValue("necklace", "dealtDamage", accessories.necklace.dealtDamage),
  );
  accessories.earrings.forEach((earring, index) => {
    ledger.addDamage("공격력", `귀걸이 ${index + 1}`, getAccessoryOptionValue("earring", "attackPower", earring.attackPower));
    ledger.addDamage("무기 공격력", `귀걸이 ${index + 1}`, getAccessoryOptionValue("earring", "weaponAttack", earring.weaponAttack));
  });
  accessories.rings.forEach((ring, index) => {
    ledger.addPercent("critRate", `반지 ${index + 1}`, getAccessoryOptionValue("ring", "critRate", ring.critRate));
    ledger.addPercent("critDamage", `반지 ${index + 1}`, getAccessoryOptionValue("ring", "critDamage", ring.critDamage));
  });

  // 6 · 진화 카르마
  const karmaRank = clamp(Math.round(readNumber(convenience.evolutionKarmaRank)), 0, 6);
  ledger.addDamage("진화형 피해", `진화 카르마 ${karmaRank}랭크`, karmaRank);
  // 정열의 춤사위 — 서폿 아크 그리드. 카르마와 같은 그룹이라 여기 나란히 선다.
  const passion = passionDanceAmount(convenience.passionDance);
  ledger.addDamage("진화형 피해", `정열의 춤사위 ${convenience.passionDance}Lv`, passion);

  // 7 · 축복의 여신 · 만찬
  if (convenience.goddessBlessing) {
    const nodeLevel = clamp(Math.round(readNumber(state.nodeLevels?.["e2-goddess-blessing"])), 0, 3);
    ledger.addPercent(
      "attackSpeed", "축복의 여신",
      Math.max(0, ARC_PASSIVE_CONSTANTS.goddessBlessingSpeed - nodeLevel * 3),
    );
  }
  if (convenience.feast) {
    ledger.addPercent("attackSpeed", "만찬", ARC_PASSIVE_CONSTANTS.feastSpeed);
  }

  // 8 · 전투 상황
  if (settings.backAttack) {
    ledger.addPercent("critRate", "백어택", ARC_PASSIVE_CONSTANTS.backAttackCritRate);
    ledger.addDamage("주는 피해", "백어택", ARC_PASSIVE_CONSTANTS.backAttackDamage);
  }
  if (settings.headAttack) {
    ledger.addDamage("헤드어택 피해", "헤드어택", ARC_PASSIVE_CONSTANTS.headAttackDamage);
  }

  // 9 · 아크 그리드 — 코어 하나가 여러 효과를 내므로 코어 이름으로 묶는다
  const grid = normalizeArkGrid(state.arkGrid);
  CHAOS_CORE_SLOTS.forEach(slot => {
    const chosen = grid.cores[slot.key];
    const core = CHAOS_CORES.find(item => item.id === chosen.id);
    if (!core) return;
    const label = `${core.name} ${chosen.points}P`;

    const record = (effect, times) => {
      const raw = Array.isArray(effect.amounts) ? effect.amounts[chosen.stage] : effect.amount;
      const amount = readNumber(raw) * times;
      if (effect.kind === "damage") ledger.addDamage(effect.key, label, amount);
      else if (effect.kind === "critOnlyDamage") ledger.addPercent("critOnlyDamage", label, amount);
      else if (effect.kind === "flat") addFlat(effect.key, label, amount);
      else ledger.addPercent(effect.key, label, amount);
    };

    [10, 14, 17].forEach(threshold => {
      if (chosen.points < threshold) return;
      (core.thresholds[threshold] || []).forEach(effect => record(effect, 1));
    });
    const extra = clamp(chosen.points - 17, 0, 3);
    if (extra > 0) core.perPoint.forEach(effect => record(effect, extra));
  });
  ARK_GRID_GEM_EFFECTS.forEach(effect => {
    const level = grid.gems[effect.key];
    ledger.addDamage(effect.group, `젬 · ${effect.label} Lv${level}`, arkGridGemDamage(effect.key, level));
  });

  // 9.5 · 깨달음 · 도약 — 전역으로 걸리는 것만. 나머지는 계기판이 따로 알린다.
  // 유효율을 먹인 값으로 적는다. 안 그러면 계기판 목록이 합계보다 커진다.
  awakeningBonuses(state.awakening?.job, state.awakening?.nodeLevels, state.awakening?.uptime)
    .applied.forEach(item => {
      if (item.effective === null || item.effective === undefined) return;
      const label = item.uptime === 100
        ? `${item.node} Lv${item.level}`
        : `${item.node} Lv${item.level} · 유효 ${item.uptime}%`;
      if (item.key === "주는 피해" || item.key === "추가 피해") ledger.addDamage(item.key, label, item.effective);
      else ledger.addPercent(item.key, label, item.effective);
    });

  // 9.6 · 파티 시너지 — 누가 줬는지로 적는다. 방깎 24%를 한 줄로 뭉치면
  // 둘이 겹쳐서 24%인지 하나가 24%인지 알 수 없다.
  {
    const synergy = synergyBonuses(state.awakening, state.synergy, settings);
    // 줄이 곧 사람이다. 가동율은 이미 줄에서 먹였으므로 그대로 적으면 된다.
    synergy.rows.forEach(row => {
      const label = `시너지 · ${row.name}`;
      row.parts.forEach(part => {
        const type = SYNERGY_TYPES[part.key];
        // 치명타 시 피해는 계기판이 출처끼리 곱해서 되짚는다. 시너지끼리는
        // 더하는 것이라 따로 적으면 8+8이 16.64%가 된다 — 아래에서 한 줄로 낸다.
        if (!type || type.critOnly) return;
        if (type.percent) ledger.addPercent(type.percent, label, part.amount);
        else ledger.addDamage(type.group, label, part.amount);
      });
    });
    const critOnlyLine = synergy.lines.find(line => SYNERGY_TYPES[line.key]?.critOnly);
    if (critOnlyLine) ledger.addPercent("critOnlyDamage", "파티 시너지", critOnlyLine.amount);
  }

  // 9.7 · 제압 → 무력화 대상 피해. 대난투 비중이 있을 때만 실린다.
  {
    const share = getStaggerShare(convenience);
    if (share > 0) {
      const domination = readNumber(metrics.totalStats?.dominationStat);
      ledger.addDamage(
        "무력화 대상 피해", `제압 ${formatNumber(domination)}`,
        domination * ARC_PASSIVE_CONSTANTS.staggerDamagePerDomination,
      );
    }
  }

  // 10 · 도감 · 물약 · 목장
  const collection = { ...DEFAULT_STATE.collection, ...(state.collection || {}) };
  STAT_FIELDS.forEach(field => {
    ledger.addStat(field.key, "도감 · 물약", readNumber(collection[field.key]));
  });
  // 등급마다 값이 다르고 "자동"은 되짚어서 정한다. 예전에는 켜져 있기만 하면
  // 1%를 적었는데, 0.4%나 0.7%를 골라 두면 계기판만 1%라고 우겼다.
  const ranchPercent = resolveRanchDamage(state.collection);
  if (ranchPercent > 0) {
    ledger.addDamage("추가 피해", `${STANDALONE_SOURCES.ranchCollection.label} ${formatNumber(ranchPercent)}%`, ranchPercent);
  }

  // 11 · 무기 품질
  const quality = clamp(Math.round(readNumber(state.weapon?.quality)), 0, WEAPON_QUALITY_MAX);
  ledger.addDamage("추가 피해", `무기 품질 ${quality}`, weaponQualityDamage(quality));

  // 12 · 팔찌
  const bracelet = normalizeBracelet(state.bracelet);
  BRACELET_STAT_FIELDS.forEach(field => {
    ledger.addStat(field.key, "팔찌", readNumber(bracelet.stats[field.key]));
  });
  // 힘민지는 등급이 아니라 값이라 따로 적는다.
  addFlat("mainStat", "팔찌", readNumber(bracelet.mainStat));
  BRACELET_EFFECTS.forEach(item => {
    const gradeIndex = getBraceletGradeIndex(bracelet.effects[item.id]);
    if (gradeIndex < 0 || !isDirectionalConditionActive(item.condition, settings)) return;
    const label = `팔찌 · ${item.name} ${BRACELET_GRADES[gradeIndex].label}`;
    item.effects.forEach(effect => {
      const amount = readNumber(effect.amounts?.[gradeIndex]);
      if (effect.kind === "damage") ledger.addDamage(effect.key, label, amount);
      else if (effect.kind === "flat") addFlat(effect.key, label, amount);
      else if (effect.kind === "percent") ledger.addPercent(effect.key, label, amount);
    });
  });

  // 13 · 각인
  ENGRAVING_LIBRARY.forEach(item => {
    const tierIndex = getEngravingTierIndex(state.engravings?.[item.id]);
    if (tierIndex < 0 || !isDirectionalConditionActive(item.condition, settings)) return;
    const label = `${item.name} ${ENGRAVING_TIERS[tierIndex].label}`;
    item.effects.forEach(effect => {
      if (effect.kind === "special") return;
      const amount = engravingAmount(effect.amounts, tierIndex) * (effect.manaOnly ? manaShare : 1);
      if (effect.kind === "damage") ledger.addDamage(effect.key, label, amount);
      else if (effect.kind === "percent") ledger.addPercent(effect.key, label, amount);
    });
    // 돌 몫은 줄을 따로 세운다. 단계 값에 섞어 적으면 "원한 유물 3단계가
    // 24%"로 읽혀서, 표를 봐도 어디서 3.75%가 왔는지 알 수가 없다.
    const stoneLevel = readNumber(state.engravingStones?.[item.id]);
    const stone = engravingStoneAmount(item.id, stoneLevel, tierIndex);
    if (stone && stone.kind !== "special") {
      const stoneLabel = `${item.name} · 어빌리티 스톤 Lv.${Math.round(stoneLevel)}`;
      const amount = stone.amount * (stone.manaOnly ? manaShare : 1);
      if (stone.kind === "damage") ledger.addDamage(stone.key, stoneLabel, amount);
      else ledger.addPercent(stone.key, stoneLabel, amount);
    }
  });

  // 14 · 마무리 단계에서 붙는 것들 — 값은 metrics가 이미 계산해 두었다
  ledger.addDamage(
    "특화 효율", "특화 효율 환산",
    (metrics.totalStats.specStat / 100) * readNumber(state.base?.specDamagePer100),
  );
  ledger.addDamage("주는 피해", `${engravingName("raid-captain")} · 이동속도 전환`, metrics.raidCaptainDamage);

  // 식으로 적은 직접 입력 효과. metrics가 이미 확정한 값을 옮겨 적는다.
  (metrics.formulaResults ?? []).forEach(item => {
    const formula = item.capped ? `${item.formula.trim()} → 상한 ${item.cap}` : item.formula.trim();
    const label = `${(item.label || "직접 입력").trim()} · ${item.invalid ? item.reason || "식 오류" : formula}`;
    if (item.category === "customDamage") {
      ledger.addDamage((item.customCategory || item.label || "기타 피해").trim(), label, item.amount);
    } else if (String(item.category).startsWith("damage:")) {
      ledger.addDamage(String(item.category).slice("damage:".length), label, item.amount);
    } else {
      ledger.addPercent(item.category, label, item.amount);
    }
  });
  // 뭉툭한 가시·음속 돌파의 전환분은 아래 buildDamage에서 노드의 기본 진피와
  // 한 덩어리로 묶는다. 둘이 떨어져 있으면 "이 노드가 얼마짜리인지"를 못 읽는다.
  ledger.addDamage("진화형 피해", BLUNT_THORN_KEY, metrics.bluntThornBonus.damage);
  ledger.addDamage("진화형 피해", SONIC_KEY, metrics.sonicBonus);

  // 사슬에 평면으로 들어간 것들. 그룹의 퍼센트와 섞으면 안 되므로 따로 싣는다.
  ledger.attackFlats = attackFlats;
  return ledger;
}

// 곱연산 그룹은 (1+a)들의 곱, 나머지는 단순 합.
function combine(key, sources) {
  if (MULTIPLICATIVE_DAMAGE_GROUPS.has(key)) {
    const product = sources.reduce((acc, item) => acc * (1 + item.amount / 100), 1);
    return (product - 1) * 100;
  }
  return sources.reduce((acc, item) => acc + item.amount, 0);
}

// 한 출처가 같은 그룹에 여러 번 붙는 일이 있다 — 코어 하나가 10P·14P·17P
// 구간마다 같은 이름으로 기여하는 식. 목록에 같은 줄이 세 번 나오면 읽을 수
// 없으니 이름으로 합친다. 곱연산 그룹은 곱해서 합친다.
function mergeByLabel(key, sources) {
  const merged = new Map();
  for (const item of sources) {
    if (!merged.has(item.label)) {
      merged.set(item.label, { label: item.label, amount: item.amount });
      continue;
    }
    const acc = merged.get(item.label);
    acc.amount = MULTIPLICATIVE_DAMAGE_GROUPS.has(key)
      ? ((1 + acc.amount / 100) * (1 + item.amount / 100) - 1) * 100
      : acc.amount + item.amount;
  }
  return [...merged.values()];
}

function orderIndex(key) {
  const index = DAMAGE_GROUP_ORDER.indexOf(key);
  return index < 0 ? DAMAGE_GROUP_ORDER.length : index;
}

// 뭉툭한 가시와 음속 돌파는 노드 하나가 두 갈래로 진피를 준다. 목록에 따로
// 놓이면 "이 노드가 얼마짜리인지"를 못 읽으므로, 노드 이름 밑으로 묶고
// 각 갈래를 하위 줄로 편다. 게임 툴팁이 설명하는 순서 그대로다.
function foldConversions(key, sources, metrics, levels) {
  if (key !== "진화형 피해") return sources;

  const blunt = metrics.bluntThornBonus;
  const sonic = metrics.sonicBreakdown;
  const bluntLevel = levels.blunt;
  const sonicLevel = levels.sonic;

  const out = [];
  let bluntBase = null;

  for (const item of sources) {
    // 노드 효과 목록에서 온 '뭉툭한 가시 LvN'의 기본 진피
    if (bluntLevel > 0 && item.label === `${nodeName("e5-blunt-thorn")} Lv${bluntLevel}`) {
      bluntBase = item;
      continue;
    }
    if (item.label !== BLUNT_THORN_KEY && item.label !== SONIC_KEY) out.push(item);
  }

  const converted = sources.find(item => item.label === BLUNT_THORN_KEY);
  if (bluntLevel > 0 && (bluntBase || converted)) {
    const baseAmount = bluntBase?.amount ?? 0;
    const convertedAmount = converted?.amount ?? 0;
    out.push({
      label: `${nodeName("e5-blunt-thorn")} Lv${bluntLevel}`,
      amount: baseAmount + convertedAmount,
      // 옆 값 칸이 곧 상한값이다. 숫자를 또 적으면 좁은 칸에서 두 줄로 접힌다.
      capNote: blunt.capped ? "상한" : "",
      // 라벨은 '무엇의 몇 %인가'만 말한다. 실제 수치는 오른쪽 값 칸에 이미 있고,
      // 재료값까지 라벨에 넣으면 한 줄이 길어져 읽히지 않는다.
      // raw가 있으면 화면이 `깎이기 전 → 적용값`으로 그린다.
      parts: [
        { label: "기본", amount: baseAmount, raw: null, note: "" },
        {
          label: `초과 치적의 ${trimPercent(blunt.rate * 100)}%`,
          amount: convertedAmount,
          raw: blunt.capped ? blunt.raw : null,
          note: "",
        },
      ],
    });
  }

  const sonicSource = sources.find(item => item.label === SONIC_KEY);
  if (sonicLevel > 0 && sonicSource) {
    const parts = [
      {
        label: `공이속 합의 ${trimPercent(sonic.baseRate * 100)}%`,
        amount: sonic.baseDamage,
        raw: null,
        // note는 늘 문자열이어야 한다 — 쓰는 쪽에서 매번 방어할 이유가 없다.
        note: "",
      },
      {
        label: "공·이속 모두 상한 초과",
        amount: sonic.capBonus,
        raw: null,
        // 이건 상한이 아니라 조건이다. 짧게 한 낱말로만 적는다.
        note: sonic.bothOverCap ? "" : "미달",
      },
      {
        label: `초과분의 ${trimPercent(sonic.excessRate * 100)}%`,
        amount: sonic.excessDamage,
        raw: sonic.capped ? sonic.excessSum * sonic.excessRate : null,
        note: "",
      },
    ];
    out.push({
      label: `${nodeName("e5-sonic-breakthrough")} Lv${sonicLevel}`,
      amount: sonicSource.amount,
      // 노드 자체의 상한. 옆 값 칸이 곧 그 값이라 낱말만 붙인다.
      capNote: sonic.capped ? "상한" : "",
      parts,
    });
  }

  return out;
}

function buildDamage(metrics, ledger, levels) {
  const keys = new Set([...Object.keys(metrics.damageGroups), ...ledger.damage.keys()]);

  return [...keys]
    .map(key => {
      const total = readNumber(metrics.damageGroups[key]);
      const sources = foldConversions(key, mergeByLabel(key, ledger.damage.get(key) ?? []), metrics, levels);
      const multiplicative = MULTIPLICATIVE_DAMAGE_GROUPS.has(key);
      return {
        key,
        total,
        // 무공·힘민지는 제곱근으로 접힌다. 그룹 합계는 +3%인데 배수는 ×1.0149다 —
        // 계기판이 둘을 나란히 보여줘야 왜 3%가 3%가 아닌지 읽힌다.
        multiplier: damageGroupFactor(key, total),
        rooted: SQRT_DAMAGE_GROUPS.has(key),
        multiplicative,
        sources: sources.map(item => ({ ...item, multiplier: 1 + item.amount / 100 })),
        // 목록으로 설명하지 못한 몫. 0이 아니면 화면에 "기타"로 드러낸다.
        residual: total - combine(key, sources),
      };
    })
    .filter(group => group.total !== 0 || group.sources.length > 0)
    .sort((a, b) => orderIndex(a.key) - orderIndex(b.key) || a.key.localeCompare(b.key, "ko"));
}

// 피해 그룹처럼 퍼센트 보너스도 한 출처가 여러 번 붙는다 — 코어 하나가
// 10P·14P·17P 구간마다 같은 이름으로 기여하는 식. 같은 줄이 두 번 나오면
// 읽는 사람이 중복인지 별개인지 알 수 없으므로 이름으로 합친다.
function percentSources(ledger, key) {
  // 치명타 시 주는 피해만 출처끼리 곱한다(addCritOnlyDamage). 같은 이름이
  // 두 번 나올 때도 그 규칙을 따라야 목록의 합이 계기판 머리와 맞는다.
  const multiplicative = key === "critOnlyDamage";
  const merged = new Map();
  for (const item of ledger.percent.get(key) ?? []) {
    const acc = merged.get(item.label);
    if (!acc) { merged.set(item.label, { label: item.label, amount: item.amount }); continue; }
    acc.amount = multiplicative
      ? ((1 + acc.amount / 100) * (1 + item.amount / 100) - 1) * 100
      : acc.amount + item.amount;
  }
  return [...merged.values()];
}

// 쿨감은 피해 그룹과 같은 규칙이다 — 네 그룹이 있고, 그룹 안에서는 더하고
// 그룹끼리는 곱한다. 넷 다 적용되므로 "채택된 갈래" 같은 건 없다.
const COOLDOWN_SOURCE_KEYS = {
  swift: null, // 신속은 특성에서 환산되므로 출처 목록이 따로 없다
  generic: "cooldownReduction",
  mana: "manaCooldownReduction",
  skill: "skillCooldownReduction",
};

function buildCooldown(metrics, ledger) {
  const groups = COOLDOWN_GROUP_KEYS.map(key => {
    const total = readNumber(metrics.cooldownGroups[key]);
    const sourceKey = COOLDOWN_SOURCE_KEYS[key];
    const sources = sourceKey ? percentSources(ledger, sourceKey) : [];
    // 끝마/무마는 마나 스킬에만 붙어서 딜 비중만큼만 굴러간다. 출처들의 합은
    // 깎이기 전 값이므로, 잔차는 그쪽과 맞춰야 한다.
    const scaled = key === "mana" && readNumber(metrics.manaCooldownShare ?? 1) < 1;
    const raw = scaled ? readNumber(metrics.manaCooldownRaw) : total;
    return {
      key,
      label: COOLDOWN_GROUP_LABELS[key],
      total,
      raw,
      scaled,
      share: scaled ? readNumber(metrics.manaCooldownShare) : 1,
      remain: 1 - total / 100,
      sources,
      residual: sourceKey ? raw - sources.reduce((acc, item) => acc + item.amount, 0) : 0,
    };
  }).filter(group => group.total !== 0 || group.raw !== 0);

  return {
    groups,
    final: metrics.cooldownReduction,
    capped: metrics.cooldownReduction > 80,
    increase: metrics.cooldownIncrease,
    factor: metrics.cooldownFactor,
    // 잔여 시간의 곱이 최종 감소율로 되돌아오는지
    residual: metrics.cooldownReduction
      - (1 - groups.reduce((acc, group) => acc * group.remain, 1)) * 100,
  };
}

function buildStats(metrics, ledger) {
  return STAT_FIELDS.map(field => {
    const sources = ledger.stat.get(field.key) ?? [];
    const total = readNumber(metrics.totalStats[field.key]);
    return {
      key: field.key,
      label: field.label,
      total,
      sources,
      residual: total - sources.reduce((acc, item) => acc + item.amount, 0),
    };
  });
}

// 공격 속도와 이동 속도. 둘 다 상한 40%가 있고, 초과분은 버려지는 게 아니라
// 음속 돌파의 재료가 된다. 그래서 초과분을 숫자로 드러내야 한다.
function buildSpeed(metrics, ledger) {
  const shared = [
    { label: "신속 환산", amount: metrics.attackSpeedFromSwift },
    ...percentSources(ledger, "attackSpeed"),
  ];

  const axis = (bonus, applied, excess, total, onlyKey) => {
    const sources = [...shared, ...percentSources(ledger, onlyKey)].filter(item => item.amount !== 0);
    return {
      bonus,
      applied,
      excess,
      total,
      capped: excess > 0,
      sources,
      residual: bonus - sources.reduce((acc, item) => acc + item.amount, 0),
    };
  };

  return {
    cap: 40,
    attack: axis(
      metrics.attackSpeed, metrics.attackMoveSpeed - 100,
      metrics.attackSpeedExcess, metrics.attackMoveSpeed, "attackSpeedOnly",
    ),
    move: axis(
      metrics.moveSpeedBonus, metrics.moveSpeed - 100,
      metrics.moveSpeedExcess, metrics.moveSpeed, "moveSpeedOnly",
    ),
  };
}

function buildCrit(metrics, ledger) {
  return {
    rateRaw: metrics.critRateRaw,
    rateCapped: metrics.critRateCapped,
    capped: metrics.critRateCapped < metrics.critRateRaw,
    // 상한을 넘긴 몫. 뭉툭한 가시가 이걸 진화형 피해로 바꾼다.
    cap: metrics.specials.bluntThorn > 0 ? 80 : 100,
    excess: Math.max(0, metrics.critRateRaw - metrics.critRateCapped),
    bluntThorn: metrics.specials.bluntThorn > 0 ? metrics.bluntThornBonus : null,
    damage: metrics.critDamage,
    critOnly: metrics.critOnlyDamage,
    factor: metrics.critFactor,
    rateSources: [
      { label: "치명 환산", amount: metrics.critRateFromStat },
      ...percentSources(ledger, "critRate"),
    ].filter(item => item.amount !== 0),
    damageSources: [
      { label: "기본", amount: ARC_PASSIVE_CONSTANTS.baseCritDamage },
      ...percentSources(ledger, "critDamage"),
    ].filter(item => item.amount !== 0),
    critOnlySources: percentSources(ledger, "critOnlyDamage"),
  };
}

/**
 * 계기판이 그릴 수 있는 형태로 지표와 근거를 함께 돌려준다.
 * @param {object} state 캐릭터 상태
 * @returns {{metrics: object, stats: object[], damage: object[], damageMultiplier: number,
 *            cooldown: object, crit: object, pointsUsed: number}}
 */
export function explainMetrics(state) {
  const metrics = calculateMetrics(state);
  const ledger = collectSources(state, metrics);
  const levels = {
    blunt: clamp(Math.round(state.nodeLevels?.["e5-blunt-thorn"] || 0), 0, 2),
    sonic: clamp(Math.round(state.nodeLevels?.["e5-sonic-breakthrough"] || 0), 0, 2),
  };

  return {
    metrics,
    stats: buildStats(metrics, ledger),
    damage: buildDamage(metrics, ledger, levels),
    // 공격력 사슬 A~E와, 그 안에 평면으로 들어간 것들.
    attackChain: {
      mainStat: metrics.mainStatTotal,
      weapon: metrics.weaponTotal,
      pure: metrics.pureAttack,
      base: metrics.baseAttack,
      support: metrics.supportAttack,
      final: metrics.finalAttack,
      flats: ledger.attackFlats ?? [],
    },
    damageMultiplier: metrics.damageMultiplier,
    cooldown: buildCooldown(metrics, ledger),
    speed: buildSpeed(metrics, ledger),
    crit: buildCrit(metrics, ledger),
    pointsUsed: metrics.pointsUsed,
    damageIndex: metrics.damageIndex,
    dpsIndex: metrics.dpsIndex,
  };
}

/**
 * 노드를 한 단계 더 올리면 지표가 얼마나 움직이는지.
 * 최대 레벨이거나 포인트가 모자라면 null.
 * @param {object} state 캐릭터 상태
 * @param {object} node NODE_LIBRARY 항목
 * @param {object} metrics 현재 지표 (다시 계산하지 않으려고 받는다)
 * @param {number} budget 진화 포인트 상한
 */
export function marginalGain(state, node, metrics, budget) {
  const level = clamp(Math.round(state.nodeLevels?.[node.id] || 0), 0, node.maxLevel);
  if (level >= node.maxLevel) return null;

  const cost = getNodeCost(node);
  const next = calculateMetrics({
    ...state,
    nodeLevels: { ...state.nodeLevels, [node.id]: level + 1 },
  });

  return {
    cost,
    overBudget: metrics.pointsUsed + cost > budget,
    damage: metrics.damageIndex === 0 ? 0 : (next.damageIndex / metrics.damageIndex - 1) * 100,
    dps: metrics.dpsIndex === 0 ? 0 : (next.dpsIndex / metrics.dpsIndex - 1) * 100,
  };
}

export { DAMAGE_GROUP_ORDER, STAT_FIELDS };

/**
 * 팔찌 효율 — 이 팔찌를 껴서 얼마나 세졌나.
 *
 * 묻는 것이 "이 줄을 올리면 얼마"가 아니라 "지금 이 팔찌가 나에게 무엇을
 * 해주고 있나"다. 그래서 기준은 팔찌를 안 낀 나이고, 줄마다도 그 줄만 뺀
 * 나와 견준다.
 *
 * 줄들의 합이 전체와 딱 맞지는 않는다 — 피해 그룹이 곱으로 얽혀 있어서
 * 그렇다. 그건 오차가 아니라 성질이라 각각 제 기준으로 적는다.
 */
export function braceletValue(state) {
  const now = calculateMetrics(state);
  if (!(now.damageIndex > 0)) return null;
  // 공격력을 모르면 팔찌 평면(무공 +9,000 · 힘민지)이 계산에 안 들어간다.
  // 그 상태로 재면 퍼센트 줄만 값이 있는 반쪽짜리 답이 나오므로 아예 안 잰다.
  if (!(now.finalAttack > 0)) return null;

  // 뺀 상태를 기준으로 지금이 몇 % 위인가.
  const gainOver = without => {
    const base = calculateMetrics(without).damageIndex;
    return base > 0 ? (now.damageIndex / base - 1) * 100 : 0;
  };
  const strip = fn => {
    const next = { ...state, bracelet: { ...normalizeBracelet(state.bracelet) } };
    next.bracelet.stats = { ...next.bracelet.stats };
    next.bracelet.effects = { ...next.bracelet.effects };
    fn(next.bracelet);
    return next;
  };

  const bracelet = normalizeBracelet(state.bracelet);
  const lines = [];
  BRACELET_STAT_FIELDS.forEach(field => {
    const amount = readNumber(bracelet.stats?.[field.key]);
    if (!(amount > 0)) return;
    lines.push({
      key: field.key,
      // 전투 특성은 정수다. +72.00은 잡음이다.
      label: `${field.label} +${Math.round(amount)}`,
      gain: gainOver(strip(b => { b.stats[field.key] = 0; })),
    });
  });
  BRACELET_EFFECTS.forEach(item => {
    const at = getBraceletGradeIndex(bracelet.effects?.[item.id]);
    if (at < 0) return;
    lines.push({
      key: item.id,
      label: `${item.name} ${BRACELET_GRADES[at].label}`,
      gain: gainOver(strip(b => { delete b.effects[item.id]; })),
    });
  });

  lines.sort((a, b) => b.gain - a.gain);
  return {
    total: gainOver(strip(b => { b.stats = {}; b.effects = {}; b.mainStat = 0; })),
    lines,
  };
}
