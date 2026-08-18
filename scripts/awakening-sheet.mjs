// 한 직업의 깨달음 · 도약 원문을 읽기 좋게 뽑는다.
//
// 30직업을 한 번에 펼치면 664노드다. 한 직업씩 끊어 읽으려고 이 스크립트가 있다 —
// 한 직업은 20노드 남짓, 원문 6KB 안팎이라 한 번에 다 볼 수 있다.
//
//   node scripts/awakening-sheet.mjs 리퍼
//   node scripts/awakening-sheet.mjs 리퍼 --all     순위와 무관한 노드까지 전부
//   node scripts/awakening-sheet.mjs --todo         아직 안 적은 직업 목록
//
// 기본은 **순위를 바꿀 수 있는 노드만** 낸다. 치적 · 치피 · 공속 · 이속 · 쿨감.
// 나머지 피해량 증가는 어느 진화 배분에나 똑같이 곱해져서 순위를 안 바꾼다.
// 다만 화면이 "안 셌다"고 밝히려면 결국 전부 적어야 하므로, --all도 둔다.

import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
import { AWAKENING_EFFECTS } from "../src/lib/data/awakening-effects/index.js";

// 진화 배분의 순위를 바꿀 수 있는 것들. 원문이 띄어쓰기를 섞어 쓴다.
const RANK_KEYS = /치명타\s*적중률|치명타\s*피해|공격\s*속도|이동\s*속도|재사용\s*대기\s*시간/;

const args = process.argv.slice(2);
const all = args.includes("--all");
const wanted = args.find(arg => !arg.startsWith("--"));

const byName = new Map(Object.entries(ARKPASSIVE_TREE).map(([code, job]) => [job.name, Number(code)]));

if (args.includes("--todo") || !wanted) {
  const rows = [...byName].map(([name, code]) => {
    const done = Boolean(AWAKENING_EFFECTS[code]);
    return { name, code, done };
  });
  const todo = rows.filter(row => !row.done);
  console.log(`적음 ${rows.length - todo.length} / ${rows.length}직업`);
  if (todo.length > 0) console.log(`남음: ${todo.map(row => row.name).join(" · ")}`);
  process.exit(0);
}

const code = byName.get(wanted);
if (!code) {
  console.error(`모르는 직업: ${wanted}`);
  console.error(`쓸 수 있는 이름: ${[...byName.keys()].join(" · ")}`);
  process.exit(1);
}

const tree = ARKPASSIVE_TREE[code];
const desc = (await import(`../src/lib/data/arkpassive-desc/${code}.js`)).default;
const done = AWAKENING_EFFECTS[code]?.nodes ?? {};

console.log(`# ${tree.name} (${code})`);
console.log(`# 적은 노드 ${Object.keys(done).length}개 · ${all ? "전체" : "순위를 바꿀 수 있는 것만"}`);
console.log(`# 원문 src/lib/data/arkpassive-desc/${code}.js · 적는 곳 src/lib/data/awakening-effects/${code}.js`);

for (const group of ["깨달음", "도약"]) {
  const entry = tree[group];
  if (!entry) continue;
  console.log(`\n## ${group} — ${entry.budget}P · 관문 ${entry.gates.slice(1).join(" / ")}`);

  for (const node of entry.nodes) {
    const lines = desc?.[group]?.[node.name] ?? [];
    const ranks = RANK_KEYS.test(lines.join(" "));
    if (!all && !ranks) continue;

    const marks = [
      `${node.tier ?? node.row}티어`,
      `${node.cost}P/렙`,
      `최대 ${node.maxLevel}`,
      node.requires ? `선행 ${node.requires.name} ${node.requires.level}` : "",
      node.excludes?.length ? `배타 ${node.excludes.join(",")}` : "",
      ranks ? "★순위" : "",
      done[node.name] ? "적음" : "",
    ].filter(Boolean);

    console.log(`\n### ${node.name}  (${marks.join(" · ")})`);
    // 1레벨과 만렙만 낸다. 가운데는 등차라 두 끝이면 수열이 잡힌다.
    // 다르면 --all로 전부 보면 된다.
    lines.forEach((line, i) => {
      if (!all && lines.length > 2 && i !== 0 && i !== lines.length - 1) return;
      console.log(`  Lv${i + 1}. ${line}`);
    });
  }
}
