// 아머리 응답을 사람이 읽는 꼴로 펼친다.
//
//   node scripts/api-dump.mjs 캐릭터이름
//   node scripts/api-dump.mjs 캐릭터이름 --out reference/덤프.txt
//   node scripts/api-dump.mjs 캐릭터이름 --json      (가공 전 원본도 같이)
//
// 원본은 세 겹으로 싸여 있어서 눈으로 못 읽는다:
//   1. Tooltip이 문자열 안에 든 JSON이고
//   2. 그 안의 값이 다시 HTML이고 (<FONT COLOR='#FFD200'>…</FONT><BR>)
//   3. 상자 번호(Element_005)가 아이템마다 달라 위치로 못 찾는다.
//
// 여기서는 셋을 다 벗겨 `부위 · 이름 · 등급` 아래에 툴팁 본문을 그대로 들여쓴다.
// 어떤 필드가 실제로 오는지 눈으로 확인하려고 만든 것이므로 아무것도 안 버린다.
//
// **키는 어디에도 안 찍는다.** .env.local의 LOSTARK_KEY를 읽기만 하고, 출력에는
// 응답 내용만 담긴다. 그래서 결과 파일을 그대로 넘겨도 안전하다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCharacter, LostArkError } from "../src/lib/core/lostark.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadKey() {
  if (process.env.LOSTARK_KEY) return process.env.LOSTARK_KEY.trim();
  try {
    const text = readFileSync(resolve(HERE, "../.env.local"), "utf8");
    const line = /^\s*(?:VITE_)?LOSTARK_KEY\s*=\s*(.+)$/m.exec(text);
    return line ? line[1].trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

/** 태그를 걷어낸다. <BR>만 줄바꿈으로 살린다. */
function strip(text) {
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 툴팁 하나를 줄 목록으로 편다.
 *
 * 상자 종류마다 값의 모양이 달라서 재귀로 훑는다. 문자열이면 태그를 벗기고,
 * 객체면 값들을 이어 붙인다. 순서는 원본 그대로 둔다 — 게임이 적어 준 차례가
 * 곧 화면에 뜨는 차례라서, 정렬하면 무엇 밑에 무엇이 붙은 건지 사라진다.
 */
function flatten(node, out = []) {
  if (node == null) return out;
  if (typeof node === "string") {
    const text = strip(node);
    if (text) out.push(...text.split("\n"));
    return out;
  }
  if (typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach(item => flatten(item, out));
    return out;
  }
  if (typeof node === "object") {
    // topStr / contentStr / bottomStr 순서가 게임 화면 순서다.
    for (const key of ["topStr", "leftStr0", "leftStr1", "leftStr2", "rightStr0", "contentStr", "bottomStr", "value"]) {
      if (key in node) flatten(node[key], out);
    }
    for (const [key, value] of Object.entries(node)) {
      if (["topStr", "leftStr0", "leftStr1", "leftStr2", "rightStr0", "contentStr", "bottomStr", "value", "type", "slotData"].includes(key)) continue;
      flatten(value, out);
    }
    return out;
  }
  return out;
}

function tooltipLines(tooltip) {
  if (!tooltip) return [];
  let parsed = tooltip;
  if (typeof tooltip === "string") {
    try {
      parsed = JSON.parse(tooltip);
    } catch {
      return strip(tooltip).split("\n").filter(Boolean);
    }
  }
  // 같은 줄이 두 번 실려 오는 일이 잦다(요약 + 본문). 붙어 있는 중복만 지운다.
  const lines = flatten(parsed);
  return lines.filter((line, at) => line !== lines[at - 1]);
}

const out = [];
const say = (text = "") => out.push(text);
const block = (lines, pad = "    ") => lines.forEach(line => say(pad + line));

function heading(title) {
  say("");
  say("═".repeat(72));
  say(`  ${title}`);
  say("═".repeat(72));
}

function item(label, detail = "") {
  say("");
  say(`── ${label}${detail ? `  ${detail}` : ""}`);
}

/** 툴팁이 붙은 목록을 통째로 편다. 이름과 등급은 머리에, 본문은 들여쓰기. */
function dumpList(title, list, describe) {
  heading(`${title}  (${Array.isArray(list) ? list.length : 0}개)`);
  if (!Array.isArray(list) || list.length === 0) {
    say("  (없음)");
    return;
  }
  list.forEach(entry => {
    const { label, detail, tooltip, extra } = describe(entry);
    item(label, detail);
    if (extra) block(extra, "    · ");
    const lines = tooltipLines(tooltip);
    if (lines.length > 0) block(lines);
  });
}

/** 툴팁이 없는 잡다한 객체는 열쇠=값으로만 적는다. */
function dumpPlain(title, value, skip = []) {
  heading(title);
  if (value == null) {
    say("  (없음)");
    return;
  }
  Object.entries(value).forEach(([key, own]) => {
    if (skip.includes(key)) return;
    if (own == null) { say(`  ${key} = null`); return; }
    if (typeof own === "object") { say(`  ${key} = ${JSON.stringify(own).slice(0, 300)}`); return; }
    say(`  ${key} = ${own}`);
  });
}

const name = process.argv.slice(2).filter(arg => !arg.startsWith("--")).join(" ").trim();
if (!name) {
  console.error("캐릭터 이름을 적어 주세요 — node scripts/api-dump.mjs 캐릭터이름");
  process.exit(1);
}

let payload;
try {
  payload = await fetchCharacter(loadKey(), name);
} catch (error) {
  console.error(error instanceof LostArkError ? error.message : String(error?.message ?? error));
  process.exit(1);
}

const profile = payload.ArmoryProfile ?? {};

say(`로스트아크 아머리 덤프 — ${profile.CharacterName ?? name}`);
say(`${profile.ServerName ?? "?"} · ${profile.CharacterClassName ?? "?"} · Lv ${profile.ItemAvgLevel ?? "?"} · 전투력 ${profile.CombatPower ?? "?"}`);
say(`응답 최상위: ${Object.keys(payload).join(", ")}`);

heading("ArmoryProfile — 전투 특성");
(profile.Stats ?? []).forEach(stat => {
  item(`${stat.Type} = ${stat.Value}`);
  block(tooltipLines(stat.Tooltip));
});

heading("ArmoryProfile — 성향");
(profile.Tendencies ?? []).forEach(t => say(`  ${t.Type} ${t.Point}/${t.MaxPoint}`));

dumpPlain("ArmoryProfile — 나머지", profile, ["Stats", "Tendencies", "Decorations"]);

dumpList("ArmoryEquipment — 장비", payload.ArmoryEquipment, entry => ({
  label: `${entry.Type} · ${entry.Name}`,
  detail: `[${entry.Grade}]`,
  tooltip: entry.Tooltip,
}));

dumpList("ArmoryAvatars — 아바타", payload.ArmoryAvatars, entry => ({
  label: `${entry.Type} · ${entry.Name}`,
  detail: `[${entry.Grade}] ${entry.IsInner ? "속옷" : "겉옷"}`,
  tooltip: entry.Tooltip,
}));

heading("ArmoryEngraving — 각인");
const engraving = payload.ArmoryEngraving ?? {};
(engraving.ArkPassiveEffects ?? []).forEach(effect => {
  item(`${effect.Name} · ${effect.Grade ?? ""} ${effect.Level ?? ""}`);
  block(strip(effect.Description).split("\n"));
});
if ((engraving.ArkPassiveEffects ?? []).length === 0) say("  (없음)");

heading("ArkPassive — 아크 패시브");
const arkPassive = payload.ArkPassive ?? {};
say(`  개방 여부 IsArkPassive = ${arkPassive.IsArkPassive}`);
(arkPassive.Points ?? []).forEach(point => say(`  ${point.Name} = ${point.Value}`));
(arkPassive.Effects ?? []).forEach(effect => {
  item(`${effect.Name} (${effect.Description ? "" : "설명 없음"})`);
  block(strip(effect.Description).split("\n"));
});

dumpList("ArkGrid — 아크 그리드 코어", payload.ArkGrid?.Slots, entry => ({
  label: `${entry.Name}`,
  detail: `[${entry.Grade}] ${entry.Point}P`,
  tooltip: entry.Tooltip,
}));

dumpList("ArkGrid — 젬 효과 합계", payload.ArkGrid?.Effects, entry => ({
  label: `${entry.Name} Lv.${entry.Level}`,
  tooltip: entry.Tooltip,
}));

dumpList("ArmoryGem — 보석", payload.ArmoryGem?.Gems, entry => ({
  label: `슬롯 ${entry.Slot} · ${entry.Name}`,
  detail: `Lv.${entry.Level} [${entry.Grade}]`,
  tooltip: entry.Tooltip,
}));

heading("ArmoryGem — 보석이 붙은 스킬");
(payload.ArmoryGem?.Effects?.Skills ?? []).forEach(skill => {
  item(`슬롯 ${skill.GemSlot} · ${skill.Name}`);
  block(strip(skill.Description).split("\n"));
});

heading("ArmoryCard — 카드");
(payload.ArmoryCard?.Cards ?? []).forEach(card => say(`  ${card.Name} [${card.Grade}] 각성 ${card.AwakeCount}/${card.AwakeTotal}`));
(payload.ArmoryCard?.Effects ?? []).forEach(effect => {
  item(`세트 ${effect.Index}`);
  (effect.Items ?? []).forEach(one => {
    say(`    ${one.Name}`);
    block(strip(one.Description).split("\n"), "      ");
  });
});

dumpList("ArmorySkills — 스킬", payload.ArmorySkills, entry => ({
  label: `${entry.Name} Lv.${entry.Level}`,
  detail: entry.IsAwakening ? "[각성]" : "",
  extra: [
    ...(entry.Tripods ?? []).filter(t => t.IsSelected).map(t => `트라이포드 ${t.Tier}단 ${t.Name} Lv.${t.Level}`),
    ...(entry.Rune ? [`룬 ${entry.Rune.Name} [${entry.Rune.Grade}]`] : []),
  ],
  tooltip: null,
}));

heading("Collectibles — 수집품");
(payload.Collectibles ?? []).forEach(one => {
  say(`  ${one.Type}  ${one.Point}/${one.MaxPoint}`);
});

heading("ColosseumInfo — 대결장");
say(`  ${JSON.stringify(payload.ColosseumInfo ?? null).slice(0, 200)}`);

const text = out.join("\n") + "\n";
const flag = process.argv.indexOf("--out");
const target = flag >= 0 && process.argv[flag + 1]
  ? resolve(process.cwd(), process.argv[flag + 1])
  : resolve(HERE, `../reference/armory-${name}.txt`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, text, "utf8");
console.log(`${text.split("\n").length}줄 · ${(text.length / 1024).toFixed(1)}KB → ${target}`);

if (process.argv.includes("--json")) {
  const raw = target.replace(/\.txt$/, "") + ".json";
  writeFileSync(raw, JSON.stringify(payload, null, 2), "utf8");
  console.log(`가공 전 원본 → ${raw}`);
}
