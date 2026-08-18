// 깨달음 · 도약 수치 표의 초안을 만든다.
//
//   node scripts/awakening-draft.mjs           아직 없는 직업 전부
//   node scripts/awakening-draft.mjs 리퍼        한 직업
//   node scripts/awakening-draft.mjs --force    이미 있는 것까지 다시 (초안만)
//
// 왜 기계가 할 수 있나: 레벨별 설명은 **숫자만 다르고 문장이 같다.** 30직업
// 633노드 중 582개가 그렇다. 그러니 변하는 숫자 열이 곧 amounts다. 손으로 옮겨
// 적을 일이 없으니 오타가 원천적으로 안 생긴다.
//
// 기계가 못 하는 것은 scope다 — "치명타 적중률 10%"가 전역인지, 페르소나 상태에서만인지는
// 문장 모양으로 안 갈린다. 그래서 **안전한 쪽으로만 자동 배정한다.**
//
//   partial / conditional  스킬 이름이나 상태 낱말이 붙어 있으면 → 안 센다
//   ?                      그 밖의 전부 → 사람이 봐야 한다
//
// global은 기계가 절대 안 붙인다. 특정 스킬 전용을 전역으로 세면 치적이 부풀고,
// 뭉툭한 가시의 80% 상한과 최소 치적 하한이 전부 어긋난다. 덜 세는 것은 고칠 수
// 있지만 부풀린 것은 티가 안 난다.
//
// 뼈대가 다른 51노드는 수치를 못 뽑는다. 조용히 빠뜨리지 않고 note로 남겨
// awakening-audit이 매번 짚게 한다.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";

const OUT = "src/lib/data/awakening-effects";
const NUM = /[0-9]+(?:\.[0-9]+)?/g;

// 문맥에서 무엇에 붙는 수치인지 읽는다. 순서가 중요하다 —
// '치명타 피해'가 '피해'보다 먼저 걸려야 한다.
// 원문이 띄어쓰기를 섞어 쓴다 — '공격 속도'가 393번, '공격속도'가 96번.
// 붙여 쓴 것을 놓치면 워로드 전술 이동의 공속 5%처럼 통째로 사라진다.
const S = "\\s*";
const KEYS = [
  [new RegExp(`치명타${S}적중률`), "critRate"],
  [new RegExp(`치명타${S}피해(량)?`), "critDamage"],
  [new RegExp(`공격${S}속도`), "attackSpeedOnly"],
  [new RegExp(`이동${S}속도`), "moveSpeedOnly"],
  [new RegExp(`재사용${S}대기${S}시간`), "cooldownReduction"],
  [new RegExp(`추가${S}피해`), "damage:추가 피해"],
  [/피해(량)?/, "damage:주는 피해"],
];

// '피해'가 붙었다고 다 딜이 아니다. 무력화 · 부위 파괴는 별도 피해원이고,
// 받는 피해 · 아군 · 보호막은 아예 다른 이야기다. 이걸 주는 피해로 세면
// 있지도 않은 딜이 붙는다.
const NOT_DAMAGE = /무력화|부위 파괴|받는 피해|아군|보호막|생명력|방어력|마나 회복|게이지|낙인/;

// 상태에 걸리는 낱말. 유지율을 모르면 못 센다.
const CONDITIONAL = /상태|게이지|버프|효과가 존재|중일 때|동안|초간|스택|적중 시|사용 시|처치 시|시전 시/;
// 스킬을 한정하는 낱말. 스킬별 딜 비중이 없어 아직 못 센다.
const PARTIAL = /스킬|기술|각성기|아이덴티티/;

function skeleton(line) {
  return line.replace(NUM, "§");
}

/** 레벨별 문장에서 값이 변하는 숫자 자리를 뽑는다. 문맥도 함께 준다. */
function extract(lines) {
  if (lines.length === 0) return { stable: false, columns: [] };
  const skels = lines.map(skeleton);
  if (!skels.every(s => s === skels[0])) return { stable: false, columns: [] };

  const marks = lines.map(line => [...line.matchAll(NUM)]);
  const columns = [];
  for (let i = 0; i < marks[0].length; i += 1) {
    const values = marks.map(row => Number(row[i][0]));
    const at = marks[0][i];
    const before = lines[0].slice(Math.max(0, at.index - 40), at.index);
    const after = lines[0].slice(at.index + at[0].length, at.index + at[0].length + 12);
    // 레벨이 올라도 안 변하는 숫자가 있다. 대부분 잡음("10초에 걸쳐")이지만
    // 진짜 효과일 때가 있다 — 고대의 바람의 이동 속도 10%는 1레벨이나 5레벨이나
    // 같다. 변하는 것만 뽑으면 그게 통째로 사라진다.
    const fixed = lines.length > 1 && new Set(values).size < 2;
    columns.push({ values, before, after, fixed, context: `${before}【값】${after}` });
  }
  return { stable: true, columns };
}

function guessKey(column) {
  // 숫자 바로 앞이 그 수치의 이름이다. 뒤쪽은 '% 증가한다' 정도라 앞을 먼저 본다.
  //
  // 안 변하는 숫자는 더 붙어 있어야 인정한다. 공수래의 '…치명타 적중률이 추가로
  // 증가한다.3개 미만…'에서 '3'을 치적 수치로 집었던 적이 있다 — 24자 안에
  // 낱말이 있었을 뿐 그 숫자와는 상관이 없었다.
  const reach = column.fixed ? 12 : 24;
  const near = column.before.slice(-reach);
  if (NOT_DAMAGE.test(near)) return "";
  const found = KEYS.find(([re]) => re.test(near))
    ?? (column.fixed ? null : KEYS.find(([re]) => re.test(column.before)));
  return found ? found[1] : "";
}

function guessScope(column, whole) {
  // 안전한 쪽만 자동으로 붙인다. 애매하면 사람에게 넘긴다.
  const near = `${column.before.slice(-50)}${column.after}`;
  if (CONDITIONAL.test(near)) return "conditional";
  if (PARTIAL.test(near)) return "partial";
  if (CONDITIONAL.test(whole) || PARTIAL.test(whole)) return "partial";
  return "?";
}

const quote = value => JSON.stringify(value);
const trim = text => text.replace(/\s+/g, " ").trim();

function nodeSource(node, lines) {
  const { stable, columns } = extract(lines);
  const whole = lines.join(" ");
  const note = text => `      note(${quote(trim(text).slice(0, 100))}),`;

  if (lines.length === 0) return [note("원문 없음 — 확인 필요"), 1];
  if (!stable) {
    // 레벨마다 문장이 달라 수치를 못 뽑는다. 빠뜨리지 않게 표시만 남긴다.
    return [
      `      // TODO 레벨별 문장이 달라 수치를 못 뽑았다. 직접 읽어야 한다.\n`
      + `      // ${trim(lines[0]).slice(0, 150)}\n`
      + note("TODO 직접 읽어야 함"),
      1,
    ];
  }
  if (columns.length === 0) return [note(trim(lines[0])), 0];

  const rows = [];
  let unresolved = 0;
  for (const column of columns) {
    const key = guessKey(column);
    const scope = guessScope(column, whole);
    // 안 변하는 숫자는 이름을 알아본 것만 싣는다. 전부 실으면 '10초', '5개'
    // 같은 잡음이 파일을 덮는다. 이름이 붙는다는 건 치적 · 치피 · 속도 · 쿨감 ·
    // 피해 중 하나라는 뜻이고, 그건 진짜 효과일 가능성이 높다.
    if (column.fixed && !key) continue;
    if (!key || scope === "?") unresolved += 1;

    // 레벨 하나짜리는 배열도 하나다.
    const amounts = node.maxLevel === 1 ? [column.values[0]] : column.values;
    const kind = key.startsWith("damage:") ? "damage" : "percent";
    const name = key.startsWith("damage:") ? key.slice(7) : key;

    // scopeNote는 화면 툴팁에 그대로 나간다. 원문 조각을 밀어 넣으면 읽을 수
    // 없는 문장이 되므로 비워 두고, 문맥은 위 주석이 든다.
    rows.push(
      `      // ${trim(column.context)}${column.fixed ? "  ← 레벨 무관" : ""}\n`
      + `      ${kind}(${quote(name || "?")}, [${amounts.join(", ")}], ${quote(scope)}, ""),`,
    );
  }
  return [rows.join("\n"), unresolved];
}

function build(code) {
  const tree = ARKPASSIVE_TREE[code];
  const descPath = `../src/lib/data/arkpassive-desc/${code}.js`;
  return import(descPath).then(module => {
    const desc = module.default;
    const blocks = [];
    let unresolved = 0;
    let nodeCount = 0;

    for (const group of ["깨달음", "도약"]) {
      const entry = tree[group];
      if (!entry) continue;
      blocks.push(`\n    // ── ${group} ${"─".repeat(56 - group.length * 2)}`);
      for (const node of entry.nodes) {
        nodeCount += 1;
        const lines = desc?.[group]?.[node.name] ?? [];
        const [body, open] = nodeSource(node, lines);
        unresolved += open ?? 0;
        blocks.push(`    ${quote(node.name)}: [\n${body}\n    ],`);
      }
    }

    // 배타로 묶인 1티어는 갈래의 뿌리다. 딜 구조를 가르는 자리라 설명이 붙어야 한다.
    const roots = (tree["깨달음"]?.nodes ?? []).filter(n => n.row === 1 && (n.excludes ?? []).length > 0);
    const branches = roots
      .map(n => `    { name: ${quote(n.name)}, note: "" },`)
      .join("\n");

    const source = `// ${tree.name} (${code}) — 깨달음 · 도약 수치.
//
// scripts/awakening-draft.mjs가 만든 초안이다. 수치와 key는 원문에서 뽑았고,
// **scope는 확인해야 한다.** "?"가 남아 있으면 awakening-audit이 잡는다.
//
//   원문   src/lib/data/arkpassive-desc/${code}.js
//   적는 법 ./kit.js
//
// 다 보고 나면 status를 "confirmed"로 바꾼다. 그 순간부터 계산에 들어간다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "draft",
${branches ? `  branches: [\n${branches}\n  ],\n` : "  branches: [],\n"}  nodes: {${blocks.join("\n")}
  },
};
`;
    return { source, unresolved, nodeCount };
  });
}

// --- 실행 --------------------------------------------------------------------

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find(arg => !arg.startsWith("--"));

const byName = new Map(Object.entries(ARKPASSIVE_TREE).map(([code, job]) => [job.name, Number(code)]));
if (only && !byName.has(only)) {
  console.error(`모르는 직업: ${only}`);
  process.exit(1);
}

const targets = only ? [byName.get(only)] : [...byName.values()];
let written = 0;
let skipped = 0;
let totalOpen = 0;

for (const code of targets) {
  const path = `${OUT}/${code}.js`;
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    // 확정한 파일은 --force로도 안 덮는다. 사람이 몇 시간 들여 붙인 scope를
    // 스크립트 한 번으로 날리는 일은 없어야 한다. (한 번 날려 봤다.)
    if (current.includes(`status: "confirmed"`)) {
      console.log(`${ARKPASSIVE_TREE[code].name.padEnd(8)} 확정본 — 건드리지 않음`);
      skipped += 1;
      continue;
    }
    if (!force) { skipped += 1; continue; }
  }
  const { source, unresolved, nodeCount } = await build(code);
  writeFileSync(path, source);
  written += 1;
  totalOpen += unresolved;
  console.log(`${ARKPASSIVE_TREE[code].name.padEnd(8)} 노드 ${String(nodeCount).padStart(2)} · 확인 필요 ${unresolved}`);
}

// index.js를 다시 짠다. Vite가 정적으로 훑어야 해서 import.meta.glob을 못 쓴다.
const files = readdirSync(OUT)
  .filter(name => /^\d+\.js$/.test(name))
  .map(name => Number(name.replace(".js", "")))
  .sort((a, b) => a - b);

const index = `// 손으로 확인한 깨달음 · 도약 수치 표를 모은다.
//
// 초안(status: "draft")은 여기 실리지만 계산에는 안 들어간다. scope를 다 보고
// "confirmed"로 바꾼 직업만 AWAKENING_EFFECTS에 나타난다 — 틀린 표가 조용히
// 숫자를 망치는 것보다 낫다.
//
//   node scripts/awakening-draft.mjs   초안을 만든다
//   node scripts/awakening-audit.mjs   적은 것을 원문과 대조한다
//
// 이 파일은 awakening-draft.mjs가 다시 짠다. 직접 고치지 않는다.
${files.map(code => `import job${code} from "./${code}.js";`).join("\n")}

const ALL = {
${files.map(code => `  ${code}: job${code},`).join("\n")}
};

export const AWAKENING_DRAFTS = ALL;

export const AWAKENING_EFFECTS = Object.fromEntries(
  Object.entries(ALL).filter(([, entry]) => entry.status === "confirmed"),
);

export const AWAKENING_MODELED = Object.keys(AWAKENING_EFFECTS).map(Number);
`;
writeFileSync(`${OUT}/index.js`, index);

console.log(`\n초안 ${written}개 작성 · 건너뜀 ${skipped}개 · 확인해야 할 자리 ${totalOpen}곳`);
console.log(`index.js 갱신 — 실린 직업 ${files.length} / ${Object.keys(ARKPASSIVE_TREE).length}`);
