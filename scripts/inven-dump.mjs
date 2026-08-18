// 인벤 아크 패시브 DB를 긁어 노드 원본을 받아 둔다. 손으로 돌리는 도구다.
//
//   node scripts/inven-dump.mjs            30개 직업 전부
//   node scripts/inven-dump.mjs 203        서머너만
//   node scripts/inven-dump.mjs --check    받아 둔 것으로 진화 표를 대조만
//
// 결과는 data/arkpassive/*.json (gitignore에 걸려 있다).
//
// 왜 인벤인가: 로스트아크 오픈 API는 **그 캐릭터가 찍은** 노드만 준다. 트리
// 전체(레벨별 수치·포인트 비용·선행·배타)는 안 준다. 인벤 DB 페이지가 그걸
// 통째로 JSON으로 실어 보낸다.
//
// 무엇을 받아 두는가:
//   class 1 = 진화 (job 0, 전 직업 공용) — 이 계산기가 이미 표로 들고 있다
//   class 2 = 깨달음 (직업 전용)
//   class 3 = 도약 (직업 전용)
//
// 받아 둔다고 깨달음이 바로 계산에 들어가지는 않는다. 대부분이 "초각성기의",
// "명령 스킬의"처럼 **스킬 갈래에 걸리는데**, 지금 딜 비중은 마나/아이덴티티
// 네 칸뿐이라 적을 자리가 없다. 그 축이 생긴 뒤에 쓸 재료다.
//
// 지금 당장 쓰는 곳은 --check다. 진화 표가 패치로 어긋났는지 대조한다.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NODE_LIBRARY, EVOLUTION_TIERS } from "../src/lib/core/data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../data/arkpassive");

const JOBS = {
  102: "버서커", 103: "디스트로이어", 104: "워로드", 105: "홀리나이트", 112: "슬레이어", 113: "발키리",
  202: "아르카나", 203: "서머너", 204: "바드", 205: "소서리스",
  302: "배틀마스터", 303: "인파이터", 304: "기공사", 305: "창술사", 312: "스트라이커", 313: "브레이커",
  402: "블레이드", 403: "데모닉", 404: "리퍼", 405: "소울이터",
  502: "호크아이", 503: "데빌헌터", 504: "블래스터", 505: "스카우터", 512: "건슬링어",
  602: "도화가", 603: "기상술사", 604: "환수사", 612: "차원술사", 702: "가디언나이트",
};

const TIER_NAMES = { 1: "진화", 2: "깨달음", 3: "도약" };

const strip = text => String(text ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** 페이지에 박힌 노드 JSON을 꺼낸다. HTML 속성 안에 이스케이프된 채로 있다. */
function extract(html) {
  const text = html
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const nodes = [];
  for (const match of text.matchAll(/\{"code":\d+,"group_code":\d+,.*?"cur_level":\d+\}/g)) {
    try { nodes.push(JSON.parse(match[0])); } catch { /* 조각난 것은 버린다 */ }
  }
  // 같은 노드가 두 번 실려 오는 일이 있다.
  const seen = new Set();
  return nodes.filter(node => {
    if (seen.has(node.code)) return false;
    seen.add(node.code);
    return true;
  });
}

async function fetchJob(code) {
  // 슬래시가 없으면 301로 튕긴다.
  const response = await fetch(`https://lostark.inven.co.kr/dataninfo/arkpassive/?code=${code}`, {
    headers: {
      // 기본 UA로는 다른 페이지가 온다.
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      "accept-language": "ko-KR,ko;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`${code}: HTTP ${response.status}`);
  return extract(await response.text());
}

/**
 * 받아 둔 진화 노드와 이 계산기의 표를 대조한다.
 *
 * 진화는 전 직업 공용이라 아무 직업 파일에나 들어 있다. 패치로 수치가 바뀌면
 * 여기서 먼저 걸린다 — 계산기는 조용히 옛 숫자로 계속 돌 테니까.
 */
function checkEvolution(nodes) {
  const mine = new Map(NODE_LIBRARY.map(node => [node.name, node]));
  const theirs = nodes.filter(node => node.class === 1);
  const problems = [];

  theirs.forEach(node => {
    const ours = mine.get(node.name);
    if (!ours) { problems.push(`${node.name} — 계산기에 없음`); return; }
    if (ours.maxLevel !== node.max_level) {
      problems.push(`${node.name} — 최대 레벨 ${ours.maxLevel} vs 인벤 ${node.max_level}`);
    }
    const cost = ours.cost || EVOLUTION_TIERS[ours.tier]?.cost;
    if (cost !== node.point) {
      problems.push(`${node.name} — 포인트 ${cost} vs 인벤 ${node.point}`);
    }
    // 1티어 특성 노드는 레벨당 수치가 설명에 그대로 적혀 온다("치명이 500증가합니다").
    const stat = ours.effects?.find(effect => effect.kind === "stat");
    if (!stat) return;
    const last = strip(node.desc?.[node.max_level - 1] ?? "");
    const total = Number.parseFloat(/([\d,]+)\s*증가/.exec(last)?.[1]?.replace(/,/g, "") ?? "");
    if (!Number.isFinite(total)) return;
    const expected = stat.amount * node.max_level;
    if (Math.abs(total - expected) > 0.01) {
      problems.push(`${node.name} — 만렙 합계 ${expected} vs 인벤 ${total} (레벨당 ${stat.amount})`);
    }
  });

  const missing = [...mine.keys()].filter(name => !theirs.some(node => node.name === name));
  return { checked: theirs.length, problems, missing };
}

function summarise(nodes) {
  const counts = {};
  for (const node of nodes) {
    const tier = TIER_NAMES[node.class] ?? `class${node.class}`;
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}

// --- 실행 --------------------------------------------------------------------

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const wanted = args.filter(arg => /^\d+$/.test(arg)).map(Number);
const codes = wanted.length > 0 ? wanted : Object.keys(JOBS).map(Number);

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error("받아 둔 것이 없습니다. 먼저 인자 없이 한 번 돌려 주세요.");
    process.exit(1);
  }
  const file = readdirSync(OUT).find(name => name.endsWith(".json"));
  const saved = JSON.parse(readFileSync(resolve(OUT, file), "utf8"));
  const result = checkEvolution(saved.nodes);
  console.log(`진화 노드 ${result.checked}개 대조 (${saved.job})`);
  if (result.missing.length > 0) console.log(`  인벤에 없는 것: ${result.missing.join(", ")}`);
  if (result.problems.length === 0) console.log("  어긋난 곳 없음");
  else result.problems.forEach(line => console.log(`  ✗ ${line}`));
  process.exit(result.problems.length === 0 ? 0 : 1);
}

mkdirSync(OUT, { recursive: true });
let first = null;

for (const code of codes) {
  const name = JOBS[code] ?? String(code);
  try {
    const nodes = await fetchJob(code);
    writeFileSync(
      resolve(OUT, `${code}-${name}.json`),
      `${JSON.stringify({ code, job: name, fetchedAt: new Date().toISOString(), nodes }, null, 1)}\n`,
    );
    const counts = summarise(nodes);
    console.log(`${String(code).padEnd(4)} ${name.padEnd(8)} ${nodes.length}개  ${JSON.stringify(counts)}`);
    first ??= nodes;
  } catch (error) {
    console.log(`${String(code).padEnd(4)} ${name.padEnd(8)} 실패 — ${error.message}`);
  }
  // 남의 서버다. 한 번에 몰아치지 않는다.
  if (code !== codes[codes.length - 1]) await new Promise(done => setTimeout(done, 700));
}

if (first) {
  const result = checkEvolution(first);
  console.log(`\n진화 노드 ${result.checked}개 대조`);
  if (result.problems.length === 0) console.log("  계산기의 표와 어긋난 곳 없음");
  else result.problems.forEach(line => console.log(`  ✗ ${line}`));
}
