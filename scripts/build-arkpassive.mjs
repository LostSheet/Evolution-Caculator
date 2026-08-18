// 인벤에서 받아 둔 아크 패시브 원본(data/arkpassive/*.json)을 앱이 쓰는 모양으로 편다.
//
// 원본은 직업당 60KB 안팎이고 30직업이면 839KB다 — 지금 번들(269KB)보다 크다.
// 그래서 두 덩이로 가른다.
//
//   구조 (이름 · 자리 · 최대 레벨 · 비용 · 선행 · 배타)  전 직업 합쳐 20KB대
//     → 한 파일에 몰아 정적으로 싣는다. 불러오기가 이름을 맞출 때도 쓰고,
//       계산이 최대 레벨을 물을 때도 쓴다. 늘 있어야 한다.
//
//   설명 (레벨별 문장)                        전 직업 376KB · 한 직업 최대 18KB
//     → 직업마다 따로 두고 툴팁이 필요할 때만 불러온다. 한 번에 한 직업만 본다.
//
// 진화(class 1)는 안 싣는다. 30직업이 글자 하나까지 같고, 이미 data.js가 들고 있다.
//
// 다시 만들려면: node scripts/build-arkpassive.mjs

import fs from "node:fs";
import path from "node:path";

const SOURCE_DIR = "data/arkpassive";
const TREE_FILE = "src/lib/data/arkpassive-tree.js";
const DESC_DIR = "src/lib/data/arkpassive-desc";

// 원본의 class 번호. 1은 진화라 안 쓴다.
const GROUPS = { 2: "깨달음", 3: "도약" };

// 총 예산은 원본에 없다. 게임에서 주는 포인트 수다.
const BUDGETS = { 깨달음: 100, 도약: 70 };

// "티어1 깨달음 포인트 24 사용 필요" — 앞 티어에서 이만큼 써야 다음 줄이 열린다.
// 진화의 티어별 상한과는 규칙이 다르다. 이쪽은 앞 줄의 누적 사용량이다.
const GATE_RE = /티어\s*(\d+)\s*(?:깨달음|도약)?\s*포인트\s*(\d+)\s*사용/;
// "[넘치는 교감] 3레벨 습득 필요"
const REQUIRE_RE = /\[(.+?)\]\s*(\d+)\s*레벨\s*습득/;

// 원본에 <span> 태그와 수치 엔티티가 섞여 있다. '빨리와 여우곰&#33;'처럼
// 노드 이름 안에도 들어 있어서, 안 풀면 배타 상대를 못 찾는다.
function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function readSources() {
  return fs.readdirSync(SOURCE_DIR)
    .filter(name => name.endsWith(".json"))
    .map(name => JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, name), "utf8")))
    .sort((a, b) => a.code - b.code);
}

/** 한 직업의 원본을 구조와 설명으로 가른다. */
function convert(source, problems) {
  const say = message => problems.push(`${source.job}: ${message}`);
  const groups = {};

  for (const [classCode, groupName] of Object.entries(GROUPS)) {
    const raw = source.nodes.filter(node => node.class === Number(classCode));
    if (raw.length === 0) continue;

    // group_code로 선행을 가리킨다. 이름은 사람이 읽는 열쇠고, 직업 안에서 유일하다.
    const byGroupCode = new Map(raw.map(node => [node.group_code, clean(node.name)]));
    const names = new Set(raw.map(node => clean(node.name)));
    if (names.size !== raw.length) say(`${groupName} 노드 이름이 겹칩니다`);

    // 줄마다의 관문. 같은 줄 노드는 전부 같은 값을 들고 있어 하나로 접는다.
    const gates = {};
    const nodes = raw.map(node => {
      const name = clean(node.name);
      const conditions = (node.precede_condition ?? []).map(clean);

      for (const text of conditions) {
        const gate = GATE_RE.exec(text);
        if (!gate) continue;
        const openedRow = node.node_row;
        const points = Number(gate[2]);
        if (gates[openedRow] !== undefined && gates[openedRow] !== points) {
          say(`${groupName} ${openedRow}줄의 관문이 노드마다 다릅니다`);
        }
        gates[openedRow] = points;
      }

      // 선행 노드는 group_code로도, 문장으로도 온다. 둘을 맞춰 본다.
      let requires = null;
      for (const text of conditions) {
        const match = REQUIRE_RE.exec(text);
        if (!match) continue;
        const target = clean(match[1]);
        if (!names.has(target)) { say(`${groupName} ${name}의 선행 '${target}'을 못 찾았습니다`); continue; }
        requires = { name: target, level: Number(match[2]) };
      }
      for (const code of node.precede_node_group ?? []) {
        const target = byGroupCode.get(code);
        if (!target) { say(`${groupName} ${name}의 선행 그룹 ${code}를 못 찾았습니다`); continue; }
        if (!requires) { say(`${groupName} ${name}: 선행 그룹은 있는데 문장이 없습니다`); continue; }
        if (requires.name !== target) say(`${groupName} ${name}: 선행 그룹과 문장이 어긋납니다`);
      }

      const excludes = (node.exclusive_condition ?? []).map(clean).filter(target => {
        if (names.has(target)) return true;
        say(`${groupName} ${name}의 배타 '${target}'을 못 찾았습니다`);
        return false;
      });

      return {
        name,
        row: node.node_row,
        col: node.node_column,
        maxLevel: node.max_level,
        cost: node.point,
        requires,
        excludes,
        desc: (node.desc ?? []).map(clean),
      };
    });

    // 읽는 순서대로 — 위에서 아래, 왼쪽에서 오른쪽.
    nodes.sort((a, b) => a.row - b.row || a.col - b.col);

    const rows = Math.max(...nodes.map(node => node.row));
    // gates[r] = r줄을 열려면 앞 줄에서 써야 하는 포인트. 첫 줄은 언제나 열려 있다.
    const gateList = Array.from({ length: rows + 1 }, (_v, row) => (row <= 1 ? 0 : gates[row] ?? 0));
    for (let row = 2; row <= rows; row += 1) {
      if (gateList[row] === 0) say(`${groupName} ${row}줄의 관문을 못 읽었습니다`);
    }

    groups[groupName] = {
      budget: BUDGETS[groupName],
      rows,
      cols: Math.max(...nodes.map(node => node.col)),
      gates: gateList,
      nodes,
    };
  }

  return groups;
}

// --- 찍어내기 ----------------------------------------------------------------

const HEAD = "// GENERATED by scripts/build-arkpassive.mjs - do not edit by hand.\n";

function treeSource(jobs) {
  const entries = jobs.map(({ code, name, groups }) => {
    const groupSource = Object.entries(groups).map(([groupName, group]) => {
      const nodes = group.nodes.map(node => {
        const parts = [
          `name: ${JSON.stringify(node.name)}`,
          `row: ${node.row}`, `col: ${node.col}`,
          `maxLevel: ${node.maxLevel}`, `cost: ${node.cost}`,
        ];
        if (node.requires) {
          parts.push(`requires: { name: ${JSON.stringify(node.requires.name)}, level: ${node.requires.level} }`);
        }
        if (node.excludes.length > 0) parts.push(`excludes: ${JSON.stringify(node.excludes)}`);
        return `      { ${parts.join(", ")} },`;
      }).join("\n");
      return `    ${JSON.stringify(groupName)}: {\n`
        + `      budget: ${group.budget}, rows: ${group.rows}, cols: ${group.cols},\n`
        + `      gates: ${JSON.stringify(group.gates)},\n`
        + `      nodes: [\n${nodes}\n      ],\n`
        + `    },`;
    }).join("\n");
    return `  ${code}: {\n    name: ${JSON.stringify(name)},\n${groupSource}\n  },`;
  }).join("\n");

  return `${HEAD}// Source: ${SOURCE_DIR}/*.json (인벤 아크 패시브 DB)
//
// 직업별 깨달음 · 도약 트리의 **구조**만 들어 있다. 레벨별 설명은 덩치가 커서
// arkpassive-desc/ 아래에 직업마다 따로 있고, 툴팁이 필요할 때만 불러온다.
//
//   gates[r] — r줄을 열려면 바로 앞 줄에서 써야 하는 포인트
//   requires — 이 노드를 열려면 필요한 앞 노드와 그 레벨
//   excludes — 같이 못 찍는 노드. 1티어의 갈래 선택이 여기서 갈린다.

export const ARKPASSIVE_TREE = {
${entries}
};

export const ARKPASSIVE_GROUPS = ["깨달음", "도약"];
`;
}

function descSource(job) {
  const groups = Object.entries(job.groups).map(([groupName, group]) => {
    const lines = group.nodes
      .map(node => `    ${JSON.stringify(node.name)}: ${JSON.stringify(node.desc)},`)
      .join("\n");
    return `  ${JSON.stringify(groupName)}: {\n${lines}\n  },`;
  }).join("\n");
  return `${HEAD}// ${job.name} (${job.code}) — 레벨별 설명.\n\nexport default {\n${groups}\n};\n`;
}

// --- 실행 --------------------------------------------------------------------

const problems = [];
const jobs = readSources().map(source => ({
  code: source.code,
  name: source.job,
  groups: convert(source, problems),
}));

fs.mkdirSync(path.dirname(TREE_FILE), { recursive: true });
fs.mkdirSync(DESC_DIR, { recursive: true });
// 직업이 빠지면 남은 파일이 거짓말을 한다. 매번 비우고 다시 쓴다.
for (const name of fs.readdirSync(DESC_DIR)) fs.rmSync(path.join(DESC_DIR, name));

fs.writeFileSync(TREE_FILE, treeSource(jobs));
for (const job of jobs) fs.writeFileSync(path.join(DESC_DIR, `${job.code}.js`), descSource(job));

const kb = file => (fs.statSync(file).size / 1024).toFixed(0);
const descTotal = fs.readdirSync(DESC_DIR)
  .reduce((sum, name) => sum + fs.statSync(path.join(DESC_DIR, name)).size, 0);
const nodeCount = jobs.reduce(
  (sum, job) => sum + Object.values(job.groups).reduce((n, group) => n + group.nodes.length, 0), 0,
);

console.log(`직업 ${jobs.length} · 노드 ${nodeCount}`);
console.log(`구조 ${TREE_FILE} — ${kb(TREE_FILE)}KB (정적)`);
console.log(`설명 ${DESC_DIR}/ — ${(descTotal / 1024).toFixed(0)}KB (직업별 지연 로드)`);

if (problems.length > 0) {
  console.error(`\n못 읽은 것 ${problems.length}건`);
  problems.forEach(item => console.error(`  · ${item}`));
  process.exit(1);
}
console.log("원본을 남김없이 읽었습니다.");
