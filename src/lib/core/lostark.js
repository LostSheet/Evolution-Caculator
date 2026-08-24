// 로스트아크 오픈 API — 캐릭터를 읽어 이 계산기의 상태로 옮긴다.
//
// 명세는 docs/lostark-api.md. 여기서 지켜야 할 것 셋:
//
//   1. 응답은 어디든 null일 수 있다. 캐릭터가 없거나, 전투 정보를 비공개로
//      뒀거나, 아크 패시브를 안 열었으면 통째로 null이다. 배열도 null로 온다.
//   2. 숫자가 문자열로 온다. "19,248" 처럼 쉼표가 섞인다.
//   3. 툴팁은 문자열 안에 JSON이고, 그 안은 다시 HTML이다. 게다가 상자 번호가
//      아이템마다 달라서 위치로 찾으면 안 된다 — 내용으로 찾아야 한다.
//
// 못 읽은 것은 조용히 넘기지 않는다. notes에 남겨 화면이 그대로 보여준다.

import { NODE_LIBRARY, EVOLUTION_TIERS } from "./data.js";
import {
  ENGRAVING_LIBRARY, ENGRAVING_TIERS, engravingAmount, engravingStoneAmount,
} from "./engravings.js";
import {
  CHAOS_CORES, CHAOS_CORE_SLOTS, emptyOrderCores, GEM_MAX_LEVEL, ARK_GRID_GEM_EFFECTS, arkGridGemDamage,
} from "./cores.js";
import { JEWEL_MAX_LEVEL, jewelCooldown } from "./metrics.js";
import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS } from "./bracelets.js";
import { getAwakeningNodes, hasAwakeningTree, isAwakeningModeled } from "./awakening.js";
import { clamp, readNumber } from "./util.js";

const BASE_URL = "https://developer-lostark.game.onstove.com";

// --- 호출 --------------------------------------------------------------------

/** 쉼표 섞인 문자열도 읽는다. "19,248" → 19248 */
export function readApiNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "").replace(/[,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class LostArkError extends Error {
  constructor(message, { status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.name = "LostArkError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * 캐릭터 하나를 통째로 읽는다.
 *
 * 부위별 엔드포인트가 따로 있지만 부르지 않는다 — 분당 100회 제한이 있고,
 * 통합 엔드포인트 한 번이면 필요한 게 다 온다.
 */
export async function fetchCharacter(apiKey, characterName, { signal } = {}) {
  const key = String(apiKey ?? "").trim();
  const name = String(characterName ?? "").trim();
  if (!key) throw new LostArkError("API 키가 없습니다.");
  if (!name) throw new LostArkError("캐릭터 이름을 적어 주세요.");
  // 헤더에는 ISO-8859-1만 넣을 수 있다. 한글이나 전각 문자가 섞이면 fetch가
  // 던지는 예외가 "Failed to read the 'headers' property"라서, 그대로 두면
  // 통신 오류로 잘못 알린다. 키를 잘못 붙여 넣은 것이 훨씬 흔하다.
  if (!/^[\x20-\x7E]+$/.test(key)) {
    throw new LostArkError("API 키에 한글이나 특수문자가 섞여 있습니다. 발급받은 문자열만 붙여 넣어 주세요.");
  }

  const url = `${BASE_URL}/armories/characters/${encodeURIComponent(name)}`;
  let response;
  try {
    response = await fetch(url, {
      signal,
      headers: {
        // "bearer " 의 공백까지 정확해야 한다. 꺾쇠나 중괄호를 같이 붙이면 거부된다.
        authorization: `bearer ${key}`,
        accept: "application/json",
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new LostArkError("서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new LostArkError("API 키가 거부됐습니다. 발급받은 키를 다시 확인해 주세요.", { status: response.status });
  }
  if (response.status === 429) {
    // X-RateLimit-* 는 브라우저에서 못 읽는다 — 서버가 Access-Control-Expose-Headers로
    // 열어 주지 않아서다. 그래서 남은 횟수를 세어 보여 줄 방법이 없다.
    throw new LostArkError("분당 100회를 넘겼습니다. 1분 뒤에 다시 시도해 주세요.", { status: 429 });
  }
  if (response.status === 503) {
    throw new LostArkError("점검 중이라 API가 닫혀 있습니다.", { status: 503 });
  }
  if (!response.ok) {
    throw new LostArkError(`서버가 ${response.status}로 답했습니다.`, { status: response.status });
  }

  const payload = await response.json();
  // 없는 캐릭터는 404가 아니라 200에 본문 null이다.
  if (!payload || !payload.ArmoryProfile) {
    throw new LostArkError(`'${name}' 을(를) 찾지 못했습니다. 이름과 전투 정보 공개 설정을 확인해 주세요.`);
  }
  return payload;
}

// --- 툴팁 --------------------------------------------------------------------

/** <BR>, <FONT ...> 같은 태그를 걷어낸다. 줄바꿈은 공백 하나로 눌러 둔다. */
function stripTags(text) {
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** 문자열 안에 든 JSON을 편다. 이미 객체면 그대로. 못 읽으면 null. */
function parseTooltip(tooltip) {
  if (!tooltip) return null;
  if (typeof tooltip === "object") return tooltip;
  try {
    return JSON.parse(tooltip);
  } catch {
    return null;
  }
}

/**
 * 툴팁의 상자들을 { 머리말, 본문 } 목록으로 편다.
 *
 * 상자 번호(Element_005 …)는 아이템마다 달라서 위치로 못 찾는다. 대신 상자
 * 하나의 문자열을 전부 이어 붙여 두고, 나중에 '기본 효과'나 '연마 효과'가
 * 들어 있는 상자를 내용으로 골라낸다.
 */
function tooltipSections(tooltip) {
  const parsed = parseTooltip(tooltip);
  if (!parsed) return [];

  const sections = [];
  const walk = node => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== "object") return;

    if (node.type === "ItemPartBox" || node.type === "SingleTextBox" || node.type === "ItemTitle") {
      const text = collectText(node.value);
      if (text) sections.push(text);
    }
    Object.values(node).forEach(walk);
  };
  walk(parsed);
  return sections;
}

function collectText(node) {
  if (node == null) return "";
  if (typeof node === "string") return stripTags(node);
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).filter(Boolean).join("\n");
  if (typeof node !== "object") return "";
  return Object.values(node).map(collectText).filter(Boolean).join("\n");
}

/** 머리말이 들어 있는 상자만 골라 이어 붙인다. 없으면 빈 문자열. */
function sectionWith(tooltip, ...headings) {
  return tooltipSections(tooltip)
    .filter(text => headings.some(heading => text.includes(heading)))
    .join("\n");
}

/** "무기 공격력 +19,248" 에서 19248을 꺼낸다. 여러 번 나오면 다 더한다. */
function sumMatches(text, pattern) {
  let total = 0;
  let found = false;
  for (const match of String(text ?? "").matchAll(pattern)) {
    total += readApiNumber(match[match.length - 1]);
    found = true;
  }
  return found ? total : null;
}

// --- 프로필 ------------------------------------------------------------------

const STAT_TYPE_TO_KEY = {
  "치명": "critStat",
  "특화": "specStat",
  "제압": "dominationStat",
  "신속": "swiftStat",
  "인내": "enduranceStat",
  "숙련": "expertiseStat",
};

const MAIN_STAT_TYPES = ["힘", "민첩", "지능"];

// 방어구는 캐릭터의 주스탯 하나만 적어 온다("지능 +96,801"). 악세서리는 셋을
// 전부 적어 오므로("힘 +17,268 / 민첩 +17,268 / 지능 +17,268") 그걸로는 못 가른다.
// 이걸 안 가르고 다 더하면 악세서리 몫이 세 배가 된다.
const ARMOR_TYPES = new Set(["투구", "상의", "하의", "장갑", "어깨"]);

function detectMainStatType(equipment) {
  const counts = new Map();
  equipment.forEach(item => {
    if (!ARMOR_TYPES.has(String(item?.Type ?? ""))) return;
    const basic = sectionWith(item?.Tooltip, "기본 효과");
    MAIN_STAT_TYPES.forEach(type => {
      if (new RegExp(`^\\s*${type}\\s*\\+`, "m").test(basic)) counts.set(type, (counts.get(type) ?? 0) + 1);
    });
  });
  let best = null;
  for (const [type, count] of counts) {
    if (!best || count > best.count) best = { type, count };
  }
  return best?.type ?? null;
}

/**
 * 전투 특성 합계와 공격력 축.
 *
 * 힘민지·무기 공격력이 Stats에 실려 오면 그걸 쓰고, 없으면 장비 툴팁을 훑는다.
 * 어느 쪽으로 구했는지는 화면이 밝혀야 한다 — 툴팁 합산은 카르마나 각인 몫을
 * 놓칠 수 있어서 그대로 믿으면 안 된다.
 */
export function parseProfile(payload) {
  const profile = payload?.ArmoryProfile ?? {};
  const stats = Array.isArray(profile.Stats) ? profile.Stats : [];
  const byType = new Map(stats.map(item => [String(item?.Type ?? "").trim(), item?.Value]));

  const combat = {};
  for (const [type, key] of Object.entries(STAT_TYPE_TO_KEY)) {
    if (byType.has(type)) combat[key] = readApiNumber(byType.get(type));
  }

  // 실제 응답의 Stats에는 치명·특화·제압·신속·인내·숙련·최대 생명력·공격력만
  // 온다. 힘민지와 무기 공격력은 없다 — 그래서 장비 툴팁을 훑는다.
  const mainStatType = MAIN_STAT_TYPES.find(type => byType.has(type)) ?? null;
  const fromStats = {
    mainStat: mainStatType ? readApiNumber(byType.get(mainStatType)) : 0,
    weaponAttack: byType.has("무기 공격력") ? readApiNumber(byType.get("무기 공격력")) : 0,
    // 게임이 말하는 공격력. 계산 결과와 맞춰 보는 데 쓴다 — 어긋나면 무공이나
    // 힘민지가 실제보다 낮게 잡혔다는 뜻이다.
    attackPower: byType.has("공격력") ? readApiNumber(byType.get("공격력")) : 0,
  };

  return {
    name: profile.CharacterName ?? "",
    server: profile.ServerName ?? "",
    className: profile.CharacterClassName ?? "",
    itemLevel: profile.ItemAvgLevel ?? "",
    combatPower: profile.CombatPower ?? "",
    image: profile.CharacterImage ?? "",
    combat,
    mainStatType,
    ...fromStats,
  };
}

/**
 * 장비 툴팁에서 무기 공격력과 힘민지를 긁는다. Stats가 안 실어 줄 때의 대비책.
 *
 * 부위마다 '기본 효과' 상자를 보고, 무기에서 무공을, 나머지에서 힘민지를 더한다.
 * 스탯 창 값과는 다를 수 있다 — 카르마·각인·영지 몫이 여기 안 들어오기 때문이다.
 */
// 무공을 '연마 효과'로 주는 부위들. 기본 효과에서 또 세면 두 번이 된다.
const ACCESSORY_SLOTS = new Set(["목걸이", "귀걸이", "반지", "어빌리티 스톤", "팔찌"]);

export function parseEquipmentAttack(payload) {
  const equipment = Array.isArray(payload?.ArmoryEquipment) ? payload.ArmoryEquipment : [];
  const mainStatType = detectMainStatType(equipment);
  let weaponAttack = 0;
  let weaponPercent = 0;
  let mainStat = 0;
  // 팔찌 평면은 따로 센다. 피해 계산에는 팔찌 효과가 따로 들어가므로 합에서
  // 빼야 하지만, 힘민지를 되짚을 때 쓰는 무공에는 들어가야 한다.
  let braceletWeapon = 0;

  equipment.forEach(item => {
    const type = String(item?.Type ?? "");
    const basic = sectionWith(item?.Tooltip, "기본 효과", "추가 효과");
    if (type === "팔찌") {
      const text = sectionWith(item?.Tooltip, "팔찌 효과");
      // 팔찌는 '무기 공격력 +9000'과 '무기 공격력이 7200 증가한다' 두 꼴로 온다.
      // 조건부 줄("~일 경우 …")은 상시가 아니므로 안 센다.
      text.split("\n").forEach(line => {
        if (/경우|이상|이하|적중 시|초 동안/.test(line)) return;
        const hit = /무기\s*공격력\s*(?:이)?\s*\+?\s*([\d,]+)/.exec(line);
        if (hit) braceletWeapon += readApiNumber(hit[1]);
      });
      return;
    }
    if (basic) {
      // 무공을 무기만 준다고 봤었다. 특수 장비(완갑)도 준다 —
      // '+8 운명의 전율 완갑'이 무기 공격력 +10,969을 얹는데 그게 통째로
      // 빠져서 무공이 11% 낮게 잡혔다(게임 242,862 vs 계산기 216,229).
      //
      // 악세·팔찌·스톤은 뺀다. 그쪽 무공은 연마 효과 상자에 있고 아래에서
      // 따로 세므로, 여기서 또 세면 두 번이 된다.
      if (!ACCESSORY_SLOTS.has(type)) {
        weaponAttack += sumMatches(basic, /^\s*무기\s*공격력\s*\+\s*([\d,]+)\s*$/gm) ?? 0;
      }
      // 주스탯 하나만 더한다. 악세서리가 셋을 다 적어 오므로 안 가르면 세 배가 된다.
      if (mainStatType) {
        mainStat += sumMatches(basic, new RegExp(`^\\s*${mainStatType}\\s*\\+\\s*([\\d,]+)\\s*$`, "gm")) ?? 0;
      }
    }
    // 악세서리 연마의 평면 무공(+195)과 퍼센트 무공(+1.80%)은 다른 상자에 있다.
    const grind = sectionWith(item?.Tooltip, "연마 효과");
    if (grind) {
      weaponAttack += sumMatches(grind, /^\s*무기\s*공격력\s*\+\s*([\d,]+)\s*$/gm) ?? 0;
      weaponPercent += sumMatches(grind, /^\s*무기\s*공격력\s*\+\s*([\d.]+)\s*%/gm) ?? 0;
    }
  });

  // 여기까지가 배수 이전의 합이다. 아바타·목장·카르마는 따로 받아 곱한다 —
  // assembleAttack 참고. 실측으로 이 합에 그 배수를 곱하면 게임 값과 맞는다.
  return { weaponAttack, weaponPercent, braceletWeapon, mainStat, mainStatType };
}

/**
 * 순수 공격력(C)을 기본 공격력(D)으로 부풀리는 배수들.
 *
 *   D = C × (1 + 광휘·작열 보석의 기본 공격력 증가율 합 + 어빌리티 스톤 레벨 보너스)
 *
 * 게임 툴팁이 "기본 공격력"이라고 적어 주는 것은 C가 아니라 D다. 이걸 C로 알고
 * √식을 뒤집으면 힘민지가 17% 부풀어 나온다 — 한동안 그러고 있었다.
 *
 * 실측: 보석 11개 × 0.60% + 스톤 1.50% = 8.10%.
 */
export function parseBaseAttackScaling(payload) {
  let gems = 0;
  (payload?.ArmoryGem?.Gems ?? []).forEach(gem => {
    const text = collectText(parseTooltip(gem?.Tooltip));
    const hit = /기본\s*공격력\s*([\d.]+)\s*%\s*증가/.exec(text);
    if (hit) gems += Number.parseFloat(hit[1]) || 0;
  });

  const stoneItem = (payload?.ArmoryEquipment ?? []).find(item => String(item?.Type ?? "").includes("스톤"));
  const stoneText = collectText(parseTooltip(stoneItem?.Tooltip));
  const stoneHit = /레벨\s*보너스\]?\s*기본\s*공격력\s*\+?\s*([\d.]+)\s*%/.exec(stoneText);
  const stone = stoneHit ? Number.parseFloat(stoneHit[1]) || 0 : 0;

  return { gems: Math.round(gems * 100) / 100, stone, percent: Math.round((gems + stone) * 100) / 100 };
}

/**
 * 힘민지 총합을 게임이 알려 준 기본 공격력에서 되짚는다.
 *
 *   C = D ÷ (1 + 보석% + 스톤%)      힘민지 = 6 × C² ÷ 무공
 *
 * 장비만 더하면 물약·도감·원정대 몫(약 2,400)이 빠져 0.4% 모자란다. 그 2,400을
 * 사람이 적게 하는 대신 여기서 되짚는다 — 게임이 이미 다 합쳐서 알려 주고 있다.
 * 실측 오차 0.001%.
 *
 * 무공이 정확해야 성립한다. 무공은 장비에서 그대로 쌓아 오차 0.00%로 맞는다.
 */
export function deriveMainStat(payload, weaponAttack) {
  const detail = parseAttackDetail(payload);
  const scaling = parseBaseAttackScaling(payload);
  const base = readNumber(detail?.baseAttackPower);
  if (!(base > 0) || !(weaponAttack > 0)) return { total: 0, scaling };
  const pure = base / (1 + scaling.percent / 100);
  return { total: Math.round(6 * pure * pure / weaponAttack), pure: Math.round(pure), scaling };
}

/**
 * 아바타가 주는 힘민지 퍼센트.
 *
 * 부위마다 하나만 센다. 속옷과 겉옷을 다 세면 실측보다 3.6% 넘친다 —
 * 전설 4부위(8%)만 세고 목장 1%를 더해 장비 합에 곱하면 게임 값과 0.4% 안에서
 * 맞는다(남는 0.4%는 장비를 다 벗어도 남는 물약·도감 몫이라 안 센다).
 */
// '무기 아바타'처럼 부위 이름이 곧 열쇠다. 딜에 오는 것은 이 넷뿐 —
// 악기·얼굴은 힘민지를 안 준다.
const AVATAR_SLOT_KEYS = { 무기: "weapon", 머리: "head", 상의: "top", 하의: "bottom" };

// 툴팁의 퍼센트로 등급을 되짚는다. Grade 칸을 믿지 않는 이유는 각인에서 이미
// 겪었다 — 그 칸은 아이템 등급일 뿐 효과의 크기가 아니다.
function avatarGradeFromAmount(amount) {
  if (amount >= 2) return "legendary";
  if (amount >= 1) return "epic";
  return "none";
}

export function parseAvatars(payload, mainStatType) {
  const list = Array.isArray(payload?.ArmoryAvatars) ? payload.ArmoryAvatars : [];
  const stat = mainStatType ?? "지능";
  const best = new Map();

  list.forEach(avatar => {
    const text = collectText(parseTooltip(avatar?.Tooltip));
    const match = new RegExp(`${stat}\\s*\\+\\s*([\\d.]+)\\s*%`).exec(text);
    if (!match) return;
    const amount = Number.parseFloat(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // 속옷과 겉옷을 한 자리로 묶는다. 둘 다 세면 실측보다 3.6% 넘친다.
    const part = String(avatar?.Type ?? "").replace(/\s*아바타\s*$/, "").trim();
    const key = AVATAR_SLOT_KEYS[part];
    if (!key) return;
    if (!best.has(key) || best.get(key) < amount) best.set(key, amount);
  });

  const slots = { weapon: "none", head: "none", top: "none", bottom: "none" };
  for (const [key, amount] of best) slots[key] = avatarGradeFromAmount(amount);
  const percent = [...best.values()].reduce((sum, amount) => sum + amount, 0);

  return {
    slots,
    percent: Math.round(percent * 100) / 100,
    notes: [...best.entries()].map(([key, amount]) => `${
      Object.entries(AVATAR_SLOT_KEYS).find(([, value]) => value === key)?.[0] ?? key
    } ${amount}%`),
  };
}

/**
 * 무기 품질. 게임이 추가 피해 퍼센트로 적어 주므로 품질을 되짚는다.
 *
 *   추가 피해 = 0.002 × 품질² + 10   →   품질 = √((추가 피해 − 10) / 0.002)
 */
export function parseWeaponQuality(payload) {
  const equipment = Array.isArray(payload?.ArmoryEquipment) ? payload.ArmoryEquipment : [];
  const weapon = equipment.find(item => String(item?.Type ?? "") === "무기");
  if (!weapon) return null;
  const extra = sectionWith(weapon.Tooltip, "추가 효과");
  const match = /^\s*추가\s*피해\s*\+\s*([\d.]+)\s*%/m.exec(extra);
  if (!match) return null;
  const damage = Number.parseFloat(match[1]);
  if (!Number.isFinite(damage) || damage < 10) return null;
  return clamp(Math.round(Math.sqrt((damage - 10) / 0.002)), 0, 100);
}

// --- Stats[].Tooltip — 게임이 스스로 밝히는 내역 -------------------------------
//
// 이 필드를 오래 안 열어 봤다. 열어 보니 손으로 넣던 값들이 다 적혀 있었다.
//
//   공격력  "…기반으로 증가한 기본 공격력은 158499 입니다."
//           "공격력 증감 효과로 공격력이 6110 증가되었습니다."
//   특화    "고대 정령 스킬의 피해량이 221.68% 증가합니다."
//   치명    "물약 및 원정대 레벨 보상 효과로 32만큼 영구적으로 증가되었습니다."
//
// 특히 특화가 크다. 이 계산기는 '특화 효율 %/100'을 사람이 치는데, 서머너는
// 12.16이다. 1을 넣어 두면 특화 노드가 12배 싸게 평가되어 탐색이 특화를
// 안 고른다 — 1T 특화 30을 강제하는 체크박스가 필요했던 이유가 이것이다.

function statTooltipLines(stat) {
  return (Array.isArray(stat?.Tooltip) ? stat.Tooltip : [])
    .flatMap(line => stripTags(line).split("\n"))
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * 특화가 실제로 몇 %의 피해를 만드는가.
 *
 * 직업마다 다르고 스킬군마다도 다르다. 서머너는 고대 정령 스킬 12.16%/100,
 * 각성 스킬 2.19%/100처럼 갈린다. 가장 큰 것을 주력으로 보되 나머지도 돌려줘
 * 사람이 고를 수 있게 한다.
 */
export function parseSpecEfficiency(payload) {
  const stats = Array.isArray(payload?.ArmoryProfile?.Stats) ? payload.ArmoryProfile.Stats : [];
  const stat = stats.find(item => String(item?.Type ?? "").trim() === "특화");
  const value = readApiNumber(stat?.Value);
  if (!stat || value <= 0) return null;

  const lines = statTooltipLines(stat)
    // '고대의 기운 획득량', '물약 및 원정대' 같은 줄은 피해가 아니다.
    .filter(line => /피해량이\s*[\d.]+\s*%\s*증가/.test(line))
    .map(line => {
      const percent = Number.parseFloat(/([\d.]+)\s*%/.exec(line)?.[1] ?? "");
      return {
        label: line.replace(/의?\s*피해량이.*$/, "").trim(),
        text: line,
        percent,
        per100: Math.round(percent / (value / 100) * 100) / 100,
      };
    })
    .filter(item => Number.isFinite(item.percent))
    .sort((a, b) => b.percent - a.percent);

  return lines.length > 0 ? { stat: value, lines, best: lines[0] } : null;
}

/**
 * 공격력 내역.
 *
 *   공격력 = (기본 공격력 + 평면 공격력) × (1 + 공격력% 합)
 *
 * 실제 응답으로 맞춰 확인했다 — (158,499 + 390) × 1.036 = 164,609, 오차 0.
 * 평면이 먼저 더해지고 퍼센트는 합연산이다. 곱연산으로 하면 53 어긋난다.
 */
export function parseAttackDetail(payload) {
  const stats = Array.isArray(payload?.ArmoryProfile?.Stats) ? payload.ArmoryProfile.Stats : [];
  const stat = stats.find(item => String(item?.Type ?? "").trim() === "공격력");
  if (!stat) return null;

  const lines = statTooltipLines(stat);
  const base = readApiNumber(/기본 공격력은\s*([\d,]+)/.exec(lines.join("\n"))?.[1] ?? 0);
  const delta = readApiNumber(/공격력이\s*([\d,]+)\s*증가/.exec(lines.join("\n"))?.[1] ?? 0);
  if (base <= 0) return null;
  return { attackPower: readApiNumber(stat.Value), baseAttackPower: base, delta };
}

/** 특성마다 물약·원정대 레벨 보상이 얼마인지. 도감 몫을 설명하는 데 쓴다. */
export function parseExpeditionBonus(payload) {
  const stats = Array.isArray(payload?.ArmoryProfile?.Stats) ? payload.ArmoryProfile.Stats : [];
  const out = {};
  stats.forEach(stat => {
    const key = STAT_TYPE_TO_KEY[String(stat?.Type ?? "").trim()];
    if (!key) return;
    const found = /물약 및 원정대[^0-9]*([\d,]+)만큼/.exec(statTooltipLines(stat).join("\n"));
    if (found) out[key] = readApiNumber(found[1]);
  });
  return out;
}

// --- 악세서리 연마 효과 -------------------------------------------------------
//
// 연마 옵션은 상/중/하 세 등급이고 등급마다 값이 정해져 있다. 그래서 값을 보고
// 등급을 되짚을 수 있다 — 목걸이 적주피 2.00%면 상옵이다.

// 옵션마다 줄이 하나씩이라 줄머리에 못을 박는다. '공격력'을 줄 안 아무 데서나
// 찾으면 '무기 공격력 +3.00%'의 뒷동강을 물어 3%를 공격력 옵션으로 읽는다.
const GRIND_OPTIONS = [
  { part: "목걸이", field: "dealtDamage", pattern: /^\s*적에게\s*주는\s*피해\s*\+\s*([\d.]+)\s*%/m, grades: { 2: "high", 1.2: "mid", 0.55: "low" } },
  { part: "목걸이", field: "additionalDamage", pattern: /^\s*추가\s*피해\s*\+\s*([\d.]+)\s*%/m, grades: { 2.6: "high", 1.6: "mid", 0.6: "low" } },
  { part: "귀걸이", field: "attackPower", pattern: /^\s*공격력\s*\+\s*([\d.]+)\s*%/m, grades: { 1.55: "high", 0.95: "mid", 0.4: "low" } },
  { part: "귀걸이", field: "weaponAttack", pattern: /^\s*무기\s*공격력\s*\+\s*([\d.]+)\s*%/m, grades: { 3: "high", 1.8: "mid", 0.8: "low" } },
  { part: "반지", field: "critRate", pattern: /^\s*치명타\s*적중률\s*\+\s*([\d.]+)\s*%/m, grades: { 1.55: "high", 0.95: "mid", 0.4: "low" } },
  { part: "반지", field: "critDamage", pattern: /^\s*치명타\s*피해\s*\+\s*([\d.]+)\s*%/m, grades: { 4: "high", 2.4: "mid", 1.1: "low" } },
];

/** 값에서 등급을 되짚는다. 소수점 오차가 있을 수 있어 가장 가까운 것을 고른다. */
function gradeFromValue(value, grades) {
  let best = null;
  let bestGap = Infinity;
  for (const [amount, grade] of Object.entries(grades)) {
    const gap = Math.abs(Number(amount) - value);
    if (gap < bestGap) { bestGap = gap; best = grade; }
  }
  return bestGap <= 0.06 ? best : null;
}

export function parseAccessories(payload) {
  const equipment = Array.isArray(payload?.ArmoryEquipment) ? payload.ArmoryEquipment : [];
  const result = {
    necklace: { additionalDamage: "none", dealtDamage: "none" },
    earrings: [
      { attackPower: "none", weaponAttack: "none" },
      { attackPower: "none", weaponAttack: "none" },
    ],
    rings: [
      { critRate: "none", critDamage: "none" },
      { critRate: "none", critDamage: "none" },
    ],
  };
  const notes = [];
  const seen = { 귀걸이: 0, 반지: 0 };

  equipment.forEach(item => {
    const part = String(item?.Type ?? "");
    if (part !== "목걸이" && part !== "귀걸이" && part !== "반지") return;

    const grind = sectionWith(item?.Tooltip, "연마 효과");
    if (!grind) {
      notes.push(`${part}의 연마 효과를 못 읽었습니다`);
      return;
    }

    // 목걸이는 하나, 귀걸이·반지는 둘씩 — 나온 순서대로 1번 2번으로 넣는다.
    let target;
    if (part === "목걸이") {
      target = result.necklace;
    } else {
      const index = seen[part];
      seen[part] += 1;
      if (index > 1) return;
      target = part === "귀걸이" ? result.earrings[index] : result.rings[index];
    }

    GRIND_OPTIONS.filter(option => option.part === part).forEach(option => {
      const match = option.pattern.exec(grind);
      if (!match) return;
      const grade = gradeFromValue(Number.parseFloat(match[1]), option.grades);
      if (grade) target[option.field] = grade;
      else notes.push(`${part}의 ${match[0].trim()} 는 등급을 못 정했습니다`);
    });
  });

  return { accessories: result, notes };
}

// --- 각인 --------------------------------------------------------------------

/**
 * 각인 단계를 정한다.
 *
 * `Grade`와 `Level`로는 못 정한다. 실제 응답을 보면 Level이 유물 각인에서도
 * 0으로 오고(어빌리티 스톤이 얹어 준 레벨이지 등급 단계가 아니다), 그대로
 * 믿으면 유물 각인 다섯 개가 전부 '기본'으로 떨어진다.
 *
 * 대신 `Description`에 실제 적용 수치가 적혀 온다 — "적에게 주는 피해가 17.00%
 * 증가한다". 그 값을 라이브러리의 단계별 수치와 맞춘다. 게임이 말한 숫자가
 * 진실이므로, Level의 뜻이 앞으로 바뀌어도 이 방식은 버틴다.
 *
 * 못 맞추면 조용히 넘어가지 않고 무엇이 안 맞았는지 돌려준다.
 */
function engravingTierFromDescription(item, description) {
  const text = stripTags(description);
  const percents = [...text.matchAll(/([\d.]+)\s*%/g)]
    .map(match => Number.parseFloat(match[1]))
    .filter(Number.isFinite);
  if (percents.length === 0) return { tier: null, reason: "설명에 수치가 없습니다" };

  // 단계마다 값이 달라지는 효과만이 단계를 가른다. 예리한 둔기의 패널티처럼
  // 세 단계 내내 같은 값은 아무것도 알려 주지 않는다.
  const varying = (item.effects ?? []).filter(
    effect => Array.isArray(effect.amounts) && new Set(effect.amounts).size > 1,
  );
  if (varying.length === 0) return { tier: null, reason: "단계를 가를 수치가 없습니다" };

  // 딱 떨어질 때만 인정한다. 설명에는 패널티 수치도 섞여 오므로(원한의 받는
  // 피해 20%) 느슨하게 맞추면 엉뚱한 단계를 집는다.
  let best = null;
  varying.forEach(effect => {
    effect.amounts.forEach((amount, index) => {
      percents.forEach(percent => {
        const gap = Math.abs(Math.abs(readApiNumber(amount)) - percent);
        if (!best || gap < best.gap) best = { index, gap };
      });
    });
  });
  if (best && best.gap <= 0.05) return { tier: ENGRAVING_TIERS[best.index]?.value ?? null, reason: "" };

  // 어빌리티 스톤이 얹어 준 몫 때문에 마지막 단계를 넘어서는 일이 있다 —
  // 원한 26.25%는 유물 4단계 21%보다 크다. 넘친 만큼은 셀 자리가 없다.
  const ceiling = Math.max(...varying.flatMap(effect => effect.amounts.map(a => Math.abs(readApiNumber(a)))));
  const reached = Math.max(...percents);
  if (reached > ceiling) {
    return {
      tier: ENGRAVING_TIERS[ENGRAVING_TIERS.length - 1].value,
      reason: `${reached}%인데 이 계산기의 최고 단계는 ${ceiling}%입니다 — 차이는 직접 입력 효과로 보태 주세요`,
    };
  }
  return { tier: null, reason: `${reached}%를 단계에 맞추지 못했습니다` };
}

export function parseEngravings(payload) {
  const source = payload?.ArmoryEngraving ?? {};
  const list = Array.isArray(source.ArkPassiveEffects) ? source.ArkPassiveEffects : [];
  const byName = new Map(ENGRAVING_LIBRARY.map(item => [item.name, item]));
  const engravings = {};
  const notes = [];

  const stones = {};

  list.forEach(entry => {
    const name = String(entry?.Name ?? "").trim();
    const item = byName.get(name);
    if (!item) {
      notes.push(`'${name || "이름 없는 각인"}'은 계산기에 없습니다`);
      return;
    }

    // 단계는 Grade와 Level이 말한다. Description의 퍼센트로 맞추면 안 된다 —
    // 거기엔 어빌리티 스톤이 얹은 몫이 이미 섞여 있어서, 원한 유물 3단계 +
    // 돌 Lv.2가 24.00%로 오고 그게 유물 4단계(21%)로 잘못 잡혔다.
    //
    //   Grade 유물 · Level N  →  유물 N단계 (0이면 아직 전설 4단계)
    //   Grade 전설 · Level N  →  전설 N단계 (0이면 영웅)
    const grade = String(entry?.Grade ?? "").trim();
    const level = clamp(Math.round(readApiNumber(entry?.Level)), 0, 4);
    const tier = grade === "유물"
      ? (level > 0 ? `relic${level}` : "legendary4")
      : grade === "전설"
        ? (level > 0 ? `legendary${level}` : "hero")
        : "hero";
    engravings[item.id] = tier;

    const stone = clamp(Math.round(readApiNumber(entry?.AbilityStoneLevel)), 0, 4);
    if (stone > 0) stones[item.id] = stone;

    // 읽은 값이 표와 맞는지 대조한다. 어긋나면 표가 낡았거나 게임이 바뀐 것이다.
    const shown = allPercents(entry?.Description);
    const modeled = engravingModeledPercent(item, tier, stone);
    // 설명문에는 이득과 손해가 같이 온다 — "공격속도 10% 감소, 주는 피해 16% 증가".
    // 그래서 첫 수치가 아니라 나온 수치 전부와 맞춰 본다. 하나도 안 가까우면
    // 표가 낡았거나 게임이 바뀐 것이다.
    if (modeled != null && shown.length > 0 && !shown.some(one => Math.abs(one - modeled) <= 0.05)) {
      notes.push(`${name} — 게임은 ${shown.join(" / ")}%인데 표로는 ${modeled.toFixed(2)}%입니다`);
    }
  });

  return { engravings, stones, notes };
}

/** 설명문에 나온 퍼센트 전부. 이득과 손해가 섞여 오므로 하나만 고를 수 없다. */
function allPercents(description) {
  return [...stripTags(description ?? "").matchAll(/([\d.]+)\s*%/g)]
    .map(hit => Number.parseFloat(hit[1]))
    .filter(Number.isFinite);
}

/** 이 계산기가 보는 그 각인의 값. 모델링 안 하는 각인이면 null. */
function engravingModeledPercent(item, tier, stoneLevel) {
  const effect = item.effects?.find(one => one.kind === "damage" || one.kind === "percent");
  if (!effect) return null;
  const at = ENGRAVING_TIERS.findIndex(one => one.value === tier);
  if (at < 0) return null;
  const stone = engravingStoneAmount(item.id, stoneLevel, at);
  return engravingAmount(effect.amounts, at) + (stone && stone.key === effect.key ? stone.amount : 0);
}

// --- 아크 패시브 노드 ---------------------------------------------------------

// 인벤 DB의 직업 코드. 아모리는 직업을 이름으로만 주므로 표로 되짚는다.
const JOB_CODES = {
  "버서커": 102, "디스트로이어": 103, "워로드": 104, "홀리나이트": 105, "슬레이어": 112, "발키리": 113,
  "아르카나": 202, "서머너": 203, "바드": 204, "소서리스": 205,
  "배틀마스터": 302, "인파이터": 303, "기공사": 304, "창술사": 305, "스트라이커": 312, "브레이커": 313,
  "블레이드": 402, "데모닉": 403, "리퍼": 404, "소울이터": 405,
  "호크아이": 502, "데빌헌터": 503, "블래스터": 504, "스카우터": 505, "건슬링어": 512,
  "도화가": 602, "기상술사": 603, "환수사": 604, "차원술사": 612, "가디언나이트": 702,
};

export function jobCode(className) {
  return JOB_CODES[String(className ?? "").trim()] ?? 0;
}

/**
 * 깨달음·도약에서 찍은 노드.
 *
 * 진화와 달리 직업별 표가 있어야 한다. 표가 없는 직업이면 이름만 돌려주고
 * 레벨은 안 넣는다 — 화면이 "아직 이 직업은 표가 없습니다"라고 말할 수 있게.
 */
export function parseAwakening(payload, className) {
  const source = payload?.ArkPassive ?? {};
  const effects = Array.isArray(source.Effects) ? source.Effects : [];
  const job = jobCode(className);
  const notes = [];

  if (!job) return { job: 0, nodeLevels: {}, unmatched: [], notes: [] };
  // 트리는 30직업 다 있다. 없다면 직업 이름을 못 알아본 것이다.
  if (!hasAwakeningTree(job)) return { job, nodeLevels: {}, unmatched: [], notes: [] };

  // 찍은 것을 읽어 오는 것과, 그 수치를 딜에 반영하는 것은 다른 일이다.
  // 표가 없는 직업도 배분은 그대로 들여온다 — 트리에 그려 줘야 하니까.
  if (!isAwakeningModeled(job)) {
    notes.push("깨달음 · 도약을 아직 딜에 반영하지 않는 직업입니다. 배분은 그대로 들여옵니다.");
  }

  const nodes = getAwakeningNodes(job);
  const nodeLevels = {};
  const unmatched = [];

  effects.forEach(entry => {
    const group = String(entry?.Name ?? "").trim();
    if (group !== "깨달음" && group !== "도약") return;
    const description = stripTags(entry?.Description ?? "");
    const level = readApiNumber(/Lv\.?\s*(\d+)/i.exec(description)?.[1] ?? 0);

    // 이름이 겹칠 수 있으니 긴 것을 먼저 본다 — '교감 강화'와 '정령의 교감'처럼.
    const found = nodes
      .filter(item => item.group === group && description.includes(item.name))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (!found) { unmatched.push(description); return; }
    nodeLevels[found.id] = clamp(Math.round(level), 0, found.maxLevel);
  });

  if (unmatched.length > 0) {
    notes.push(`깨달음·도약에서 못 맞춘 노드 ${unmatched.length}개 — ${unmatched.join(", ")}`);
  }
  return { job, nodeLevels, unmatched, notes };
}

export function parseArkPassive(payload) {
  const source = payload?.ArkPassive ?? {};
  const notes = [];

  if (source.IsArkPassive === false) {
    return { nodeLevels: {}, points: {}, notes: ["이 캐릭터는 아크 패시브를 아직 열지 않았습니다"] };
  }

  const points = {};
  // 카르마 랭크·레벨이 Description에 "6랭크 26레벨"로 그대로 온다.
  //
  // 한동안 사람이 적는 값인 줄 알고 칸을 만들어 뒀는데, 여기 있었다. 셋 중
  // 딜에 오는 것은 둘이다 — 진화는 랭크당 진화형 피해 +1%, 깨달음은 레벨당
  // 무기 공격력 +0.1%(26레벨 → 게임이 +2.60%라고 적는다). 도약은 포인트만 준다.
  const karma = {};
  (Array.isArray(source.Points) ? source.Points : []).forEach(item => {
    const name = String(item?.Name ?? "").trim();
    if (!name) return;
    points[name] = readApiNumber(item?.Value);
    const hit = /(\d+)\s*랭크\s*(\d+)\s*레벨/.exec(stripTags(item?.Description ?? ""));
    if (hit) karma[name] = { rank: Number(hit[1]), level: Number(hit[2]) };
  });

  // 노드는 이름으로 맞춘다. 같은 이름이 여러 티어에 있을 수 있어(진화/깨달음)
  // 티어까지 함께 본다.
  const effects = Array.isArray(source.Effects) ? source.Effects : [];
  const nodeLevels = {};
  const unmatched = [];

  effects.forEach(entry => {
    const tier = String(entry?.Name ?? "").trim();
    const description = stripTags(entry?.Description ?? "");
    if (!description) return;
    // 깨달음·도약은 parseAwakening이 따로 읽는다. 여기서 세면 "계산기에 없는
    // 노드"라고 거짓말을 하게 된다.
    if (tier !== "진화") return;

    const level = readApiNumber(/Lv\.?\s*(\d+)/i.exec(description)?.[1] ?? 0);
    const candidates = NODE_LIBRARY.filter(node => description.includes(node.name));
    if (candidates.length === 0) {
      unmatched.push(description);
      return;
    }
    // 이름이 겹치면 티어로 가른다. 그래도 못 가르면 가장 긴 이름이 맞을 확률이 높다
    // — '일격'과 '전방위 일격'처럼 한쪽이 다른 쪽을 품는 경우다.
    const tiered = candidates.filter(node => tier && EVOLUTION_TIERS[node.tier] && node.tier.startsWith(tier));
    const pool = tiered.length > 0 ? tiered : candidates;
    const node = pool.reduce((best, item) => (item.name.length > best.name.length ? item : best), pool[0]);
    nodeLevels[node.id] = clamp(Math.round(level), 0, node.maxLevel);
  });

  if (unmatched.length > 0) {
    notes.push(`진화 노드 ${unmatched.length}개를 못 맞췄습니다 — ${unmatched.join(", ")}`);
  }
  // 이 계산기는 진화 140포인트를 전제로 짜여 있다. 그보다 적으면 배분표가
  // 실제로 쓸 수 있는 것보다 넓어지므로 그 사실을 밝힌다.
  const evolution = points["진화"];
  if (evolution > 0 && evolution !== 140) {
    notes.push(`진화 포인트가 ${evolution}입니다 — 이 계산기는 140을 전제로 배분합니다`);
  }
  return { nodeLevels, points, karma, notes };
}

// --- 아크 그리드 --------------------------------------------------------------

const CORE_SLOT_BY_KEYWORD = { "해": "sun", "달": "moon", "별": "star" };

/**
 * 툴팁의 17P 수치로 유물인지 고대인지 되짚는다.
 *
 * Grade가 '전설'처럼 우리가 안 다루는 값으로 올 때 쓴다. 코어 표의 17P 줄에는
 * 값이 둘 있고(유물 / 고대) 그게 정확히 이 구분이다 — 예컨대 안정적인 공격은
 * 유물 1.4%, 고대 2.8%. 툴팁에 적힌 수치가 어느 쪽에 가까운지 보면 된다.
 *
 * 못 가르면 유물로 둔다. 낮은 쪽으로 두는 편이 부풀리는 것보다 낫다.
 */
function stageFromTooltip(core, tooltip) {
  const at17 = core?.thresholds?.[17] ?? [];
  const varying = at17.find(effect => Array.isArray(effect.amounts) && effect.amounts[0] !== effect.amounts[1]);
  if (!varying) return 0;

  const found = /\[17P\][^[]*?([\d.]+)\s*%/.exec(String(tooltip ?? ""));
  const stated = Number.parseFloat(found?.[1] ?? "");
  if (!Number.isFinite(stated)) return 0;

  const gap = index => Math.abs(readNumber(varying.amounts[index]) - stated);
  return gap(1) < gap(0) ? 1 : 0;
}

/**
 * 아크 그리드 코어.
 *
 * 슬롯은 여섯이다 — 질서 해·달·별과 혼돈 해·달·별. 이 계산기는 혼돈만 다룬다.
 * 어느 쪽인지는 툴팁의 `[코어 타입] 혼돈 - 해` 한 줄이 말해 준다. 이름으로
 * 짐작하거나 순서에 기대면 질서 코어를 혼돈 자리에 앉히게 된다.
 *
 * 이름은 `혼돈의 해 코어 : 현란한 공격` 꼴이라 콜론 뒤가 코어 이름이다.
 * 포인트가 0이면 아무것도 안 낀 자리다 — 10P로 올려 잡으면 없는 효과가 붙는다.
 */
export function parseArkGrid(payload) {
  const source = payload?.ArkGrid ?? {};
  const slots = Array.isArray(source.Slots) ? source.Slots : [];
  const cores = {};
  const order = emptyOrderCores();
  const notes = [];
  let orderCores = 0;

  CHAOS_CORE_SLOTS.forEach(slot => {
    cores[slot.key] = { id: "none", points: 20, stage: 1 };
  });

  // 질서 코어는 이름만 받아 적는다. 효과는 직업 전용이라 계산에 안 들어가지만,
  // 무엇을 끼고 있는지는 화면에 있어야 한다 — 예전에는 통째로 버렸다.
  const takeOrder = (slotKey, name, slot, tooltip) => {
    if (!slotKey || !order[slotKey]) return;
    const points = Math.round(readApiNumber(slot?.Point));
    if (points <= 0) return;
    const grade = String(slot?.Grade ?? "");
    order[slotKey] = {
      name: name.includes(":") ? name.slice(name.lastIndexOf(":") + 1).trim() : name,
      points: clamp(points, 10, 20),
      stage: grade.includes("고대") ? 1 : 0,
    };
  };

  slots.forEach(slot => {
    const name = String(slot?.Name ?? "").trim();
    const tooltip = collectText(parseTooltip(slot?.Tooltip));
    const kind = /코어\s*타입\s*\n?\s*(질서|혼돈)\s*-\s*(해|달|별)/.exec(tooltip);
    const keyword = kind?.[2] ?? /(해|달|별)\s*코어/.exec(name)?.[1];

    // 코어 타입 줄을 못 찾으면 이름으로 물러선다.
    const family = kind?.[1] ?? (name.includes("질서") ? "질서" : name.includes("혼돈") ? "혼돈" : null);
    if (family === "질서") {
      orderCores += 1;
      takeOrder(CORE_SLOT_BY_KEYWORD[keyword], name, slot, tooltip);
      return;
    }

    const slotKey = CORE_SLOT_BY_KEYWORD[keyword];
    if (!slotKey || !cores[slotKey]) return;

    const points = Math.round(readApiNumber(slot?.Point));
    if (points <= 0) return;  // 빈 자리. 기본값 그대로 '없음'으로 둔다.

    const coreName = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1).trim() : name;
    const core = CHAOS_CORES.find(item => item.slot === slotKey && item.name === coreName)
      ?? CHAOS_CORES.find(item => item.name === coreName);
    if (!core) {
      notes.push(`코어 '${coreName}'은 계산기에 없습니다`);
      return;
    }

    // 등급은 고대 아니면 유물이다. Grade에 그렇게 적혀 오면 그대로 쓰고,
    // 아니면(전설 등 우리가 안 다루는 등급) 툴팁의 17P 수치로 되짚는다 —
    // 코어 표에 유물/고대 값이 둘 다 있으므로 어느 쪽인지 대조할 수 있다.
    const grade = String(slot?.Grade ?? "");
    const stage = grade.includes("고대") ? 1
      : grade.includes("유물") ? 0
      : stageFromTooltip(core, tooltip);
    cores[slotKey] = { id: core.id, points: clamp(points, 10, 20), stage };
  });

  if (orderCores > 0) {
    notes.push(`질서 코어 ${orderCores}개`);
  }
  return { cores, order, notes };
}

/**
 * 젬이 주는 추가 피해 레벨.
 *
 * `ArmoryGem`이 아니다 — 그쪽은 옛 보석(멸화/홍염)이라 아크 그리드와 무관하다.
 * 아크 그리드 젬의 결과는 `ArkGrid.Effects`에 효과별 레벨 합계로 온다.
 *
 *   { Name: "추가 피해", Level: 13, Tooltip: "추가 피해 +1.05%" }
 *
 * 13 × 0.0807 = 1.049%로 툴팁과 맞는다.
 */
/**
 * 보석(작열·광휘)의 쿨감. 아크 그리드 젬과는 다른 물건이다.
 *
 *   쿨감 % = (보석 레벨 + 2) × 2      7레벨 → 18%,  8레벨 → 20%
 *
 * 보석마다 레벨이 다르고 낀 스킬도 다르다. 쿨감의 DPS 효과가 1/(1−c)이므로
 * 퍼센트를 그냥 평균 내면 안 되고 '남은 쿨타임'의 조화평균을 내야 한다.
 *
 *   Σ wᵢ/(1−cᵢ) = 1/(1−c*)   →   c* = 1 − 1/Σ(wᵢ/(1−cᵢ))
 *
 * 가중치는 균등으로 둔다. 고레벨 보석이 주력기에 박히니 그쪽으로 치우쳐야
 * 맞지만, 스킬별 딜 비중을 모르는 채로 기울기를 정하면 근거 없는 상수가
 * 하나 느는 것뿐이다. 실제로 8레벨 2개 · 7레벨 7개에서 균등과 상위편중의
 * 차이는 0.5%p(DPS 0.6%)뿐이라, 제안값을 내고 사람이 고치는 편이 낫다.
 */
export function parseJewelCooldown(payload) {
  const gems = Array.isArray(payload?.ArmoryGem?.Gems) ? payload.ArmoryGem.Gems : [];
  const effects = Array.isArray(payload?.ArmoryGem?.Effects?.Skills) ? payload.ArmoryGem.Effects.Skills : [];
  if (gems.length === 0) return null;

  // 쿨감형 보석만 센다. 같은 보석이라도 피해 증가형이 섞여 있다.
  const cooldownSlots = new Set(
    effects
      .filter(item => /재사용 대기시간/.test(stripTags(item?.Description ?? "")))
      .map(item => readApiNumber(item?.GemSlot)),
  );
  const levels = gems
    .filter(gem => cooldownSlots.size === 0 || cooldownSlots.has(readApiNumber(gem?.Slot)))
    .map(gem => clamp(Math.round(readApiNumber(gem?.Level)), 0, JEWEL_MAX_LEVEL))
    .filter(level => level > 0)
    .sort((a, b) => b - a);
  if (levels.length === 0) return null;

  const remainSum = levels.reduce((sum, level) => sum + (1 / levels.length) / (1 - jewelCooldown(level) / 100), 0);
  const blended = (1 - 1 / remainSum) * 100;
  return {
    levels,
    count: levels.length,
    total: gems.length,
    percent: Math.round(blended * 100) / 100,
  };
}

export function parseGemLevel(payload) {
  const effects = Array.isArray(payload?.ArkGrid?.Effects) ? payload.ArkGrid.Effects : [];
  const gems = {};
  const mismatch = [];

  ARK_GRID_GEM_EFFECTS.forEach(item => {
    const found = effects.find(effect => String(effect?.Name ?? "").trim() === item.group);
    const level = clamp(Math.round(readApiNumber(found?.Level)), 0, GEM_MAX_LEVEL);
    gems[item.key] = level;
    if (!found || level <= 0) return;
    // 게임이 퍼센트도 같이 적어 준다. 레벨→퍼센트 공식이 맞는지 그 자리에서
    // 대조한다. 패치로 계수가 바뀌면 여기서 걸린다.
    const stated = Number.parseFloat(/([\d.]+)\s*%/.exec(stripTags(found.Tooltip ?? ""))?.[1] ?? "");
    const ours = arkGridGemDamage(item.key, level);
    if (Number.isFinite(stated) && Math.abs(stated - ours) > 0.005) {
      mismatch.push(`${item.label} Lv${level} — 게임 ${stated}% vs 계산 ${ours}%`);
    }
  });

  return { gems, mismatch };
}

// --- 팔찌 --------------------------------------------------------------------

const BRACELET_STAT_PATTERNS = [
  { key: "critStat", pattern: /치명\s*\+\s*([\d,]+)/ },
  { key: "specStat", pattern: /특화\s*\+\s*([\d,]+)/ },
  { key: "swiftStat", pattern: /신속\s*\+\s*([\d,]+)/ },
];

/** 한 줄에 나오는 숫자를 전부 뽑는다. 쉼표 섞인 것도 읽는다. */
function numbersIn(line) {
  return [...String(line).matchAll(/(\d[\d,]*(?:\.\d+)?)/g)]
    .map(match => readApiNumber(match[1]))
    .filter(Number.isFinite);
}

// 효과가 무엇에 걸리는지 알려 주는 낱말. 값만 맞춰서는 안 된다 —
// '공격/이동속도 중'의 5%는 아무 줄에나 나오는 5와 구별되지 않는다.
const BRACELET_KEYWORDS = {
  attackSpeed: /공격\s*(및|\/)?\s*이동\s*속도/,
  critRate: /치명타\s*적중률/,
  critDamage: /치명타\s*피해/,
  cooldownIncrease: /재사용\s*대기\s*시간/,
  weaponAttack: /무기\s*공격력/,
  mainStat: /힘|민첩|지능/,
  "주는 피해": /주는\s*피해/,
  "추가 피해": /추가\s*피해/,
  "악마/대악마 피해": /악마/,
};

/**
 * 팔찌 효과의 등급을 되짚는다.
 *
 * 등급별 수치는 못 박혀 있다 — 무공은 7,200 / 8,100 / 9,000, '쿨타임 증가 +
 * 주는 피해'는 2·5 / 2·6 / 2·7. 그래서 줄에 나온 숫자가 어느 등급의 묶음과
 * 통째로 맞는지 보면 등급이 나온다.
 *
 * 다만 숫자만으로는 부족하다. 낱말도 함께 봐야 한다. 처음에 값만 맞췄더니
 * 툴팁의 잡다한 0과 좌표 숫자가 '공격/이동속도 중'으로 읽혔다.
 *
 * 등급 하나에만 맞을 때 인정한다. 둘 이상이면 가른 근거가 없으니 손대지 않는다.
 */
function braceletGradeFromLine(item, line) {
  const found = numbersIn(line);
  if (found.length === 0) return null;

  // 숫자가 겹치는 줄들이 있다 — 무공 +9,000짜리가 셋이다(평범 · 생명력 조건 ·
  // 30중첩). 낱말로 먼저 가른다.
  if (item.line?.needs && !item.line.needs.test(line)) return null;
  if (item.line?.avoids && item.line.avoids.test(line)) return null;

  // 이 효과가 건드리는 것들이 줄에 이름으로 나와야 한다.
  const wordsOk = item.effects.every(effect => {
    const pattern = BRACELET_KEYWORDS[effect.key];
    return pattern ? pattern.test(line) : false;
  });
  if (!wordsOk) return null;

  // match가 있으면 그쪽을 본다. 중첩 효과는 amounts가 중첩을 곱한 뒤라서
  // 툴팁에 안 나온다 — 툴팁에 적힌 1,160으로 등급을 짚고 6,960으로 센다.
  const matches = BRACELET_GRADES.map((grade, gi) => {
    const wanted = item.effects.map(effect => Math.abs(readNumber((effect.match ?? effect.amounts)?.[gi])));
    const ok = wanted.every(value => found.some(number => Math.abs(number - value) < 0.005));
    return ok ? grade.value : null;
  }).filter(Boolean);

  return matches.length === 1 ? matches[0] : null;
}

// 이제 중첩·조건부 무공도 최대 중첩으로 센다(BRACELET_EFFECTS 참고).
// 남는 것은 딜에 안 오는 줄들 — 면역, 회복, 방어력.
const BRACELET_CONDITIONAL = /면역|회복량|방어력|최대 생명력|시드 등급/;

/**
 * 팔찌 — 특성 수치와, 값으로 등급을 되짚을 수 있는 효과.
 *
 * 못 짚은 줄은 그대로 돌려준다. 무엇을 안 읽었는지 화면이 보여줘야 사람이
 * 팔찌 편집에서 채울지 말지 정할 수 있다.
 */
export function parseBracelet(payload) {
  const equipment = Array.isArray(payload?.ArmoryEquipment) ? payload.ArmoryEquipment : [];
  const item = equipment.find(entry => String(entry?.Type ?? "") === "팔찌");
  if (!item) return { stats: null, mainStat: 0, effects: null, found: [], missed: [], notes: [] };

  // '팔찌 효과' 상자만 본다. 툴팁 전체를 훑으면 아이템 제목의 좌표 숫자와
  // 획득처 목록까지 딸려 와서, 그 숫자들이 효과 수치로 읽힌다.
  const text = sectionWith(item.Tooltip, "팔찌 효과");
  // 힘민지는 등급이 아니라 값이다 — 고대 기준 9,600~16,000 사이 아무 값.
  const mainStatLine = /(?:힘|민첩|지능)\s*\+\s*([\d,]+)/.exec(text);
  const mainStat = mainStatLine ? Math.max(0, Math.round(readApiNumber(mainStatLine[1]))) : 0;
  const stats = {};
  BRACELET_STAT_PATTERNS.forEach(({ key, pattern }) => {
    const match = pattern.exec(text);
    stats[key] = match ? clamp(Math.round(readApiNumber(match[1])), 0, 120) : 0;
  });

  const statNames = new Set(BRACELET_STAT_FIELDS.map(field => field.label));
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean)
    // 머리말과 특성 줄은 이미 읽었다.
    .filter(line => !line.includes("팔찌 효과"))
    .filter(line => ![...statNames].some(name => new RegExp(`^${name}\\s*\\+`).test(line)))
    // 효과 문장만 남긴다.
    .filter(line => /증가|감소|\+/.test(line));

  const effects = {};
  const found = [];
  const missed = [];

  lines.forEach(line => {
    if (BRACELET_CONDITIONAL.test(line)) { missed.push(line); return; }
    const hit = BRACELET_EFFECTS
      .map(entry => ({ entry, grade: braceletGradeFromLine(entry, line) }))
      .find(result => result.grade);
    if (!hit) { missed.push(line); return; }
    effects[hit.entry.id] = hit.grade;
    const label = BRACELET_GRADES.find(grade => grade.value === hit.grade)?.label ?? hit.grade;
    found.push(`${hit.entry.name} ${label}`);
  });

  const notes = missed.length > 0
    ? [`팔찌에서 못 읽은 줄 ${missed.length}개 — ${missed.map(line => line.slice(0, 34)).join(" / ")}`]
    : [];
  return { stats, mainStat, effects, found, missed, notes };
}

// 젬의 공격력·추가 피해·보스 피해는 이제 아크 그리드 카드가 레벨로 든다.
// 예전에는 직접 입력 효과로 밀어 넣었는데, 레벨이 원본이고 퍼센트는 파생이라
// 파생만 저장하면 레벨을 되돌려 고칠 방법이 없었다. parseGemLevel 참고.


// --- 카드 세트 ----------------------------------------------------------------

/**
 * 카드 세트 효과 중 피해에 해당하는 줄만 더한다.
 *
 * 그룹은 문장이 정한다. **추가 피해라고 적힌 것만 추가 피해**고 나머지는
 * 곱연산이다 — 성속성 피해는 추피가 아니다. 예전에는 전부 한 칸에 몰아넣어서
 * 곱해야 할 것을 더하고 있었다.
 */
export function parseCardSets(payload) {
  const groups = Array.isArray(payload?.ArmoryCard?.Effects) ? payload.ArmoryCard.Effects : [];
  const lines = [];
  const skipped = [];

  groups.forEach(group => {
    (Array.isArray(group?.Items) ? group.Items : []).forEach(entry => {
      const name = String(entry?.Name ?? "").trim();
      const text = stripTags(entry?.Description ?? "");
      const percent = Number.parseFloat(/([\d.]+)\s*%/.exec(text)?.[1] ?? "");
      // 받는 피해 감소는 방어다. 딜에 안 들어간다.
      const isDamage = /피해|공격력/.test(text) && !/감소|받는/.test(text);
      if (Number.isFinite(percent) && isDamage) {
        // 추피는 합연산 그룹, 나머지는 곱연산이다.
        const group = /추가\s*피해/.test(text) ? "damage:추가 피해" : "damage:주는 피해";
        lines.push({ name, text, percent, group });
      } else skipped.push(`${name} — ${text}`);
    });
  });

  const sumOf = group => lines.filter(line => line.group === group).reduce((sum, line) => sum + line.percent, 0);
  return {
    lines,
    additional: Math.round(sumOf("damage:추가 피해") * 100) / 100,
    dealt: Math.round(sumOf("damage:주는 피해") * 100) / 100,
    skipped,
  };
}

// --- 전투 특성 가르기 ---------------------------------------------------------

// 펫이 API 수치에 섞여 있을 때도 있고 없을 때도 있다 — 아모리를 찍은 순간 펫
// 버프가 켜져 있었느냐에 달린 듯하다. 응답 어디에도 그 표시가 없어서, 값으로 가른다.
//
// 도감·물약 몫은 물약·원정대 30 남짓에 카드 도감을 더해도 100을 잘 안 넘는다.
// 넘겼다면 펫 160이 섞인 것이다 — 치명이 236으로 뜬 적이 있는데 76 + 160이었다.
export const PET_MIXED_IN_FLOOR = 100;

/**
 * 캐릭터 합계에서 노드·팔찌 몫을 빼고, 남은 것에서 펫을 가려낸다.
 *
 * @param combat      API가 준 특성 합계 { critStat, specStat, ... }
 * @param owned       도감·물약과 펫을 비운 채로 잰 지금 세팅의 몫
 * @param isCollection 도감 칸이 있는 특성인지 — 없는 것은 시작값으로 간다
 * @param petBonus    펫 특성 보정치 (160)
 * @returns { lines, petStat } petStat은 펫이 섞였다고 본 특성, 없으면 ""
 */
export function splitCollectionStats(combat, owned, isCollection, petBonus) {
  const lines = [];

  for (const [key, total] of Object.entries(combat ?? {})) {
    const value = readNumber(total);
    if (!isCollection(key)) {
      // 제압·인내·숙련은 도감 칸이 없다. 뺄 것도 없이 통째로 간다.
      lines.push({ key, total: value, owned: 0, rest: value, withPet: false, collection: false });
      continue;
    }
    const mine = Math.round(readNumber(owned?.[key]));
    lines.push({ key, total: value, owned: mine, rest: Math.round(value - mine), withPet: false, collection: true });
  }

  // 펫은 한 특성에만 붙으니 후보가 여럿이면 하나만 고른다. 남은 몫이 제일 작은
  // 쪽이다 — 160을 빼고 나서 도감·물약다운 숫자로 남는 쪽이 그쪽이니까.
  // 후보가 둘 이상이라는 건 노드나 팔찌를 잘못 읽었다는 뜻이기도 한데, 그건
  // 음수 경고가 따로 짚는다.
  const pick = lines
    .filter(line => line.collection && line.rest > PET_MIXED_IN_FLOOR)
    .sort((a, b) => a.rest - b.rest)[0];
  if (pick) {
    pick.rest -= petBonus;
    pick.withPet = true;
  }

  return { lines, petStat: pick?.key ?? "" };
}

// --- 한데 모으기 --------------------------------------------------------------

/**
 * 응답 하나를 화면이 쓸 수 있는 꾸러미로 편다.
 *
 * 여기서 상태를 고치지는 않는다. 무엇을 넣을지는 사람이 고르고, 그 적용은
 * store가 한다 — 이 파일은 읽기만 한다.
 */
export function readCharacter(payload) {
  const profile = parseProfile(payload);
  const fromEquipment = parseEquipmentAttack(payload);
  const accessories = parseAccessories(payload);
  const engravings = parseEngravings(payload);
  const arkPassive = parseArkPassive(payload);
  const arkGrid = parseArkGrid(payload);
  const bracelet = parseBracelet(payload);
  const attackDetail = parseAttackDetail(payload);

  // 역산을 그만뒀다.
  //
  // 예전에는 게임이 알려 준 기본 공격력에서 √식을 뒤집어 힘민지를 되짚었다.
  // 그 값이 실제와 32% 어긋났다 — 이 식은 지금 게임을 재현하지 못한다.
  // 대신 장비에서 그대로 쌓는다. 배수(아바타·목장·카르마)는 세팅이 들고 있고
  // assembleAttack이 곱한다 — 목장을 고치면 값이 따라와야 하기 때문이다.
  const avatars = parseAvatars(payload, fromEquipment.mainStatType);
  // 무공을 먼저 세우고, 그걸로 힘민지를 되짚는다. 장비만 더하면 물약·도감 몫이
  // 빠져 0.4% 모자라는데, 게임이 알려 준 기본 공격력에는 이미 다 들어 있다.
  const scaling = parseBaseAttackScaling(payload);
  const detail = parseAttackDetail(payload);
  // 팔찌 평면까지 더한 무공. 되짚기는 이 값을 써야 한다 — weaponFlat은 팔찌를
  // 뺀 값(평면 증가를 나눌 기준)이라 그걸로 나누면 힘민지가 부푼다.

  const attackParts = {
    weaponFlat: fromEquipment.weaponAttack,
    weaponPercent: fromEquipment.weaponPercent,
    mainFlat: fromEquipment.mainStat,
    avatars: avatars.slots,
    avatarPercent: avatars.percent,
    baseAttackPower: readNumber(detail?.baseAttackPower),
    baseScalePercent: scaling.percent,
    weaponFlatAll: fromEquipment.weaponAttack + fromEquipment.braceletWeapon,
  };
  const attackSource = {
    avatars: avatars.notes,
    baseScaling: scaling,
    // 되짚은 값과 장비 합을 나란히 둔다. 크게 벌어지면 무언가를 못 읽은 것이다.
    equipmentSum: fromEquipment.mainStat,
  };

  const gemLevels = parseGemLevel(payload);
  const cards = parseCardSets(payload);
  const quality = parseWeaponQuality(payload);
  const awakening = parseAwakening(payload, profile.className);
  const specEfficiency = parseSpecEfficiency(payload);
  const expedition = parseExpeditionBonus(payload);
  const jewel = parseJewelCooldown(payload);
  const notes = [
    ...accessories.notes,
    ...engravings.notes,
    ...arkPassive.notes,
    ...awakening.notes,
    ...arkGrid.notes,
    ...bracelet.notes,
  ];
  // 레벨→퍼센트 공식이 게임 값과 어긋나면 알린다. 패치로 계수가 바뀌면 여기서 걸린다.
  if (gemLevels.mismatch.length > 0) {
    notes.push(`젬 공식이 게임 값과 어긋납니다 — ${gemLevels.mismatch.join(" / ")}`);
  }

  return {
    profile: { ...profile, mainStatType: profile.mainStatType ?? fromEquipment.mainStatType },
    attack: { weaponAttack: 0, mainStat: 0, flatAttack: 0, ...attackParts },
    attackSource,
    // 게임이 말하는 공격력. 이 값과 계산 결과를 맞춰 보면 무공·힘민지가
    // 실제보다 낮게 잡혔는지 바로 드러난다.
    reportedAttackPower: profile.attackPower,
    accessories: accessories.accessories,
    engravings: engravings.engravings,
    engravingStones: engravings.stones,
    nodeLevels: arkPassive.nodeLevels,
    arkPassivePoints: arkPassive.points,
    // 진화 랭크는 진화형 피해로, 깨달음 레벨은 무기 공격력으로 간다.
    karma: arkPassive.karma,
    awakening,
    arkGrid: { cores: arkGrid.cores, order: arkGrid.order, gems: gemLevels.gems },
    braceletStats: bracelet.stats,
    braceletEffects: bracelet.effects,
    braceletMainStat: bracelet.mainStat ?? 0,
    braceletFound: bracelet.found ?? [],
    weaponQuality: quality,
    cards,
    // 손으로 넣던 것들 — 게임이 스스로 밝힌 값.
    specEfficiency,
    jewel,
    attackDetail,
    expedition,
    notes,
  };
}

export { ENGRAVING_TIERS, BASE_URL };
