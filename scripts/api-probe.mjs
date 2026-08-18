// 실제 API 응답으로 파서를 맞춰 보는 탐침. 테스트가 아니라 손으로 돌리는 도구다.
//
//   node scripts/api-probe.mjs 캐릭터이름
//
// 키는 .env.local의 LOSTARK_KEY에서 읽는다(.gitignore의 *.local에 이미 걸린다).
// 환경변수 LOSTARK_KEY가 있으면 그쪽이 먼저다.
//
// **키는 어디에도 출력하지 않는다.** 이 파일이 찍는 것은 응답의 생김새와
// 파서가 뽑아낸 값뿐이다. 그래야 출력을 그대로 붙여 넣어도 안전하다.
//
// lostark.test.mjs는 명세대로 지어낸 응답으로 돈다. 그건 "필드가 있으면 읽고
// 없으면 안 터진다"까지만 보증한다. 진짜 응답이 그 생김새인지는 여기서 본다.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCharacter, readCharacter, LostArkError } from "../src/lib/core/lostark.js";

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

// 이름에 공백이 들어갈 수 있어 나머지 인자를 다 잇는다. 다만 --raw 같은
// 깃발은 빼야 한다 — 안 그러면 'Crateris --raw'라는 캐릭터를 찾게 된다.
const name = process.argv.slice(2).filter(arg => !arg.startsWith("--")).join(" ").trim();
const key = loadKey();

if (!key) {
  console.error("키가 없습니다. .env.local에 LOSTARK_KEY=... 한 줄을 넣어 주세요.");
  process.exit(1);
}
if (!name) {
  console.error("사용법: node scripts/api-probe.mjs 캐릭터이름");
  process.exit(1);
}

let payload;
try {
  payload = await fetchCharacter(key, name);
} catch (error) {
  console.error(error instanceof LostArkError ? error.message : error);
  process.exit(1);
}

const line = (label, value) => console.log(`  ${String(label).padEnd(22)} ${value}`);
const num = value => Number(value ?? 0).toLocaleString("ko-KR");

console.log(`\n═══ 응답의 생김새 ═══`);
for (const [section, value] of Object.entries(payload)) {
  const shape = value == null
    ? "null"
    : Array.isArray(value) ? `배열 ${value.length}개` : typeof value === "object" ? "객체" : typeof value;
  line(section, shape);
}

// 1. 여기가 제일 중요하다. 무기 공격력과 힘민지가 Stats에 실려 오는가?
//    안 실려 오면 장비 툴팁 합산으로 넘어가고, 그건 카르마·각인 몫을 놓친다.
console.log(`\n═══ ArmoryProfile.Stats 에 실린 Type ═══`);
const stats = payload.ArmoryProfile?.Stats ?? [];
if (stats.length === 0) console.log("  (없음)");
for (const stat of stats) line(stat?.Type ?? "(이름 없음)", stat?.Value ?? "(값 없음)");

console.log(`\n═══ ArmoryEquipment 부위와 툴팁 상자 머리말 ═══`);
for (const item of payload.ArmoryEquipment ?? []) {
  let headings = [];
  try {
    const walk = node => {
      if (node == null || typeof node !== "object") return;
      if (node.type === "ItemPartBox") {
        const first = Object.values(node.value ?? {})[0];
        if (typeof first === "string") headings.push(first.replace(/<[^>]*>/g, "").trim());
      }
      Object.values(node).forEach(walk);
    };
    walk(JSON.parse(item.Tooltip));
  } catch {
    headings = ["(툴팁을 못 폄)"];
  }
  line(item?.Type ?? "?", [...new Set(headings)].join(" / ") || "(상자 없음)");
}

console.log(`\n═══ 아크 패시브 Effects 원문 ═══`);
for (const effect of payload.ArkPassive?.Effects ?? []) {
  line(effect?.Name ?? "?", String(effect?.Description ?? "").replace(/<[^>]*>/g, ""));
}

console.log(`\n═══ 아크 그리드 Slots ═══`);
for (const slot of payload.ArkGrid?.Slots ?? []) {
  line(`#${slot?.Index} ${slot?.Name ?? ""}`, `${slot?.Point}P · ${slot?.Grade ?? ""}`);
}

// 2. 파서가 실제로 뽑아낸 것.
const read = readCharacter(payload);
console.log(`\n═══ 파서가 뽑은 것 ═══`);
line("캐릭터", `${read.profile.name} · ${read.profile.server} · ${read.profile.className} · Lv ${read.profile.itemLevel}`);
line("무기 공격력", `${num(read.attack.weaponAttack)}  (출처: ${read.attackSource.weaponAttack})`);
line("힘민지", `${num(read.attack.mainStat)}  (출처: ${read.attackSource.mainStat})`);
line("주스탯 종류", read.profile.mainStatType ?? "(못 정함)");
line("전투 특성", Object.entries(read.profile.combat).map(([k, v]) => `${k} ${num(v)}`).join(" · ") || "(없음)");
line("노드", Object.entries(read.nodeLevels).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(" ") || "(없음)");
line("각인", Object.entries(read.engravings).map(([k, v]) => `${k}:${v}`).join(" ") || "(없음)");
line("팔찌 특성", read.braceletStats ? JSON.stringify(read.braceletStats) : "(못 읽음)");
line("팔찌 효과", `${JSON.stringify(read.braceletEffects ?? {})}  ${(read.braceletFound ?? []).join(" · ")}`);
line("무기 품질", read.weaponQuality ?? "(못 읽음)");
line("연마", JSON.stringify(read.accessories));
line("아크 그리드", JSON.stringify(read.arkGrid));
line("아크 패시브 P", JSON.stringify(read.arkPassivePoints));

console.log(`\n═══ 못 읽은 것 ═══`);
if (read.notes.length === 0) console.log("  (없음)");
for (const note of read.notes) console.log(`  · ${note}`);
console.log("");

// --raw — 파서가 어긋났을 때 원문을 본다. 무엇을 잘못 읽었는지는 결국
// 게임이 뭐라고 적어 보냈는지를 봐야 안다.
if (process.argv.includes("--raw")) {
  const strip = t => String(t ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").trim();
  const boxes = tooltip => {
    const out = [];
    try {
      const walk = node => {
        if (node == null || typeof node !== "object") return;
        if (node.type === "ItemPartBox") {
          const values = Object.values(node.value ?? {}).map(strip).filter(Boolean);
          if (values.length > 0) out.push(values);
        }
        Object.values(node).forEach(walk);
      };
      walk(JSON.parse(tooltip));
    } catch { /* 툴팁이 깨졌으면 빈 채로 둔다 */ }
    return out;
  };

  console.log(`═══ RAW · ArmoryEngraving ═══`);
  console.log(JSON.stringify(payload.ArmoryEngraving, null, 1));

  console.log(`\n═══ RAW · 장비 상자 본문 ═══`);
  for (const item of payload.ArmoryEquipment ?? []) {
    console.log(`\n── ${item?.Type} · ${item?.Name ?? ""}`);
    for (const [heading, ...body] of boxes(item?.Tooltip)) {
      console.log(`   [${heading}]`);
      for (const part of body) part.split("\n").forEach(row => console.log(`     ${row}`));
    }
  }

  console.log(`\n═══ RAW · ArkGrid Slots ═══`);
  for (const slot of payload.ArkGrid?.Slots ?? []) {
    console.log(`\n── #${slot?.Index} ${slot?.Name} · ${slot?.Point}P · ${slot?.Grade}`);
    for (const [heading, ...body] of boxes(slot?.Tooltip)) {
      console.log(`   [${heading}] ${body.join(" | ").slice(0, 220)}`);
    }
    console.log(`   Gems: ${JSON.stringify((slot?.Gems ?? []).map(g => ({ i: g?.Index, on: g?.IsActive, grade: g?.Grade })))}`);
  }

  console.log(`\n═══ RAW · ArkGrid Effects ═══`);
  console.log(JSON.stringify(payload.ArkGrid?.Effects, null, 1));

  console.log(`\n═══ RAW · Gems ═══`);
  console.log(JSON.stringify((payload.ArmoryGem?.Gems ?? []).map(g => ({ slot: g?.Slot, name: g?.Name, level: g?.Level, grade: g?.Grade })), null, 1));
  console.log("");
}

// runner.js를 안 물고 있어도 확실히 끝내 둔다.
process.exit(0);
