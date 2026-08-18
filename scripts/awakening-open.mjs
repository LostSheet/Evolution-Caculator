// 초안에서 **판단이 필요한 줄만** 뽑는다.
//
//   node scripts/awakening-open.mjs 버서커
//
// 초안 한 직업이 130줄인데 그중 결정이 필요한 것은 열 몇 줄이다. 나머지는
// 생성기가 이미 맞게 붙였다. 전부 펼쳐 놓고 보면 눈이 미끄러진다.
//
// 네 가지를 낸다.
//
//   미정      key나 scope가 "?"
//   TODO      레벨별 문장이 달라 수치를 못 뽑은 노드 — 원문을 통째로 낸다
//   전역 후보  원문에 스킬 이름도 상태 낱말도 없는 노드. 생성기는 global을
//             절대 안 붙이므로, 진짜 전역은 여기서만 나온다
//   갈래      설명을 적어야 하는 배타 1티어

import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
import { AWAKENING_DRAFTS } from "../src/lib/data/awakening-effects/index.js";

// 스킬을 짚거나 상태를 거는 낱말. 하나도 없으면 전역일 가능성이 높다.
const GATED = /스킬|기술|각성기|아이덴티티|상태|게이지|버프|효과가 존재|중일 때|동안|초간|스택|적중 시|사용 시|처치 시|시전 시|태세|모드/;

const wanted = process.argv[2];
const byName = new Map(Object.entries(ARKPASSIVE_TREE).map(([code, job]) => [job.name, Number(code)]));
const code = byName.get(wanted);
if (!code) {
  console.error(`모르는 직업: ${wanted}`);
  console.error([...byName.keys()].join(" · "));
  process.exit(1);
}

const tree = ARKPASSIVE_TREE[code];
const desc = (await import(`../src/lib/data/arkpassive-desc/${code}.js`)).default;
const model = AWAKENING_DRAFTS[code];
const trim = text => String(text).replace(/\s+/g, " ").trim();

console.log(`# ${tree.name} (${code}) · ${model.status}`);

if ((model.branches ?? []).length > 0) {
  console.log(`\n## 갈래 — 설명을 적을 것`);
  for (const branch of model.branches) {
    const lines = desc["깨달음"]?.[branch.name] ?? [];
    console.log(`  ${branch.name}: ${trim(lines[lines.length - 1] ?? "").slice(0, 140)}`);
  }
}

const undecided = [];
const todos = [];
const globals = [];

for (const group of ["깨달음", "도약"]) {
  for (const node of tree[group]?.nodes ?? []) {
    const effects = model.nodes?.[node.name] ?? [];
    const lines = desc[group]?.[node.name] ?? [];
    const whole = lines.join(" ");

    effects.forEach((effect, i) => {
      if (effect.kind === "note" && /TODO/.test(effect.scopeNote ?? "")) {
        todos.push({ group, node, lines });
        return;
      }
      if (effect.key === "?" || effect.scope === "?") {
        undecided.push({ node, i, effect, line: trim(lines[lines.length - 1] ?? "") });
      }
    });

    // 전역 후보 — 아무 조건도 안 걸린 노드.
    if (effects.some(e => Array.isArray(e.amounts)) && !GATED.test(whole)) {
      globals.push({ node, whole: trim(whole).slice(0, 160), effects });
    }
  }
}

if (globals.length > 0) {
  console.log(`\n## 전역 후보 ${globals.length} — 조건이 안 걸린 노드`);
  for (const item of globals) {
    console.log(`  ${item.node.name}: ${item.whole}`);
    item.effects.forEach(e => console.log(`      → ${e.kind} ${e.key ?? e.category} ${JSON.stringify(e.amounts ?? null)} (지금 ${e.scope})`));
  }
}

if (undecided.length > 0) {
  console.log(`\n## 미정 ${undecided.length}`);
  for (const item of undecided) {
    console.log(`  ${item.node.name} [${item.i}] ${item.effect.kind} key=${item.effect.key ?? "-"} scope=${item.effect.scope} ${JSON.stringify(item.effect.amounts ?? null)}`);
    console.log(`      ${item.line.slice(0, 160)}`);
  }
}

if (todos.length > 0) {
  console.log(`\n## TODO ${todos.length} — 레벨별 문장이 다름`);
  for (const item of todos) {
    console.log(`  ${item.node.name} (${item.group} · 최대 ${item.node.maxLevel})`);
    item.lines.forEach((line, i) => console.log(`      Lv${i + 1}: ${trim(line).slice(0, 220)}`));
  }
}

if (globals.length + undecided.length + todos.length === 0) console.log("\n판단할 것 없음.");

// --dump — 확정본을 새로 쓸 때 쓴다. 초안 파일은 주석이 붙어 130줄인데,
// 정작 옮겨 적어야 하는 것은 노드 이름과 수치뿐이다.
if (process.argv.includes("--dump")) {
  console.log(`\n## 전체 (확정본 작성용)`);
  for (const group of ["깨달음", "도약"]) {
    console.log(`  [${group}]`);
    for (const node of tree[group]?.nodes ?? []) {
      const effects = model.nodes?.[node.name] ?? [];
      const parts = effects.map(effect => {
        if (effect.kind === "note") return `note(${trim(effect.scopeNote).slice(0, 40)})`;
        const key = effect.key ?? effect.category;
        return `${effect.kind[0]}:${key}=${JSON.stringify(effect.amounts ?? null)}/${effect.scope}`;
      });
      const tail = trim((desc[group]?.[node.name] ?? []).slice(-1)[0] ?? "").slice(0, 90);
      console.log(`    ${node.name} <${node.maxLevel}렙> ${parts.join(" | ")}`);
      console.log(`        ${tail}`);
    }
  }
}
