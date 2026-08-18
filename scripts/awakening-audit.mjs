// 깨달음 · 도약 수치 표를 원문과 대조한다.
//
//   node scripts/awakening-audit.mjs          전부
//   node scripts/awakening-audit.mjs 리퍼      한 직업
//
// 30직업 633노드를 사람이 눈으로 다시 볼 수는 없다. 그래서 기계가 볼 수 있는
// 것은 전부 기계가 본다. 제일 센 검사는 **수치 대조**다 — amounts에 적힌 숫자가
// 그 레벨 원문에 그대로 있어야 한다.
//
// 초안(draft)과 확정본(confirmed)을 다르게 본다.
//
//   확정본  전부 오류다. 계산에 들어가는 표라 틀리면 숫자가 조용히 망가진다.
//   초안    수치 대조만 오류다("?"는 아직 안 본 것이므로 당연히 남아 있다).
//           남은 자리는 세어서 알려 준다.

import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
import { AWAKENING_DRAFTS } from "../src/lib/data/awakening-effects/index.js";
import { getAwakeningNodes } from "../src/lib/core/awakening.js";

// 원문이 띄어쓰기를 섞어 쓴다 — '공격 속도'와 '공격속도'가 둘 다 나온다.
const RANK_KEYS = /치명타\s*적중률|치명타\s*피해|공격\s*속도|이동\s*속도|재사용\s*대기\s*시간/;

// 스킬을 짚거나 상태를 거는 낱말. awakening-open.mjs와 같은 목록이다.
const GATED = /스킬|기술|각성기|아이덴티티|상태|게이지|버프|효과가 존재|중일 때|동안|초간|스택|적중 시|사용 시|처치 시|시전 시|태세|모드/;

// 스킬**군**은 스킬을 짚는 것이 아니라 그 빌드의 딜 전부를 가리킨다.
// 사이드 노드의 값은 직업끼리 균등하게 맞춰져 있고, 그 노드를 찍는다는 건
// 그 스킬군에 몰빵한다는 뜻이다. 개별 스킬 이름(초각성기 · 두둥실 여우곰)은
// 여기 없다 — 그건 여전히 딜 비중이 있어야 셀 수 있다.
const SKILL_GROUP = new RegExp([
  "일반", "오의", "난무", "둔갑", "환수", "포격", "충격", "기력", "무공", "기공",
  "해방", "랜스", "루인", "스택트", "정의", "성휘", "신성", "징벌", "심판",
  "사신", "살귀", "망자", "급습", "핸드건", "라이플", "샷건", "드론", "합작",
  "분침", "시침", "악마", "잠식", "소환", "명령", "기상", "우산", "음양",
].map(name => `${name}[^.,]*스킬`).join("|") + "|모든\\s*스킬|모든\\s*공격|전체\\s*스킬|계열\\s*스킬");

/**
 * 원문에 이 숫자가 있는가.
 *
 * 글자로 맞춰 보다가 두 번 틀렸다. '0.180'을 0.18로 읽어 놓고 '0.18' 뒤에
 * 숫자가 없어야 한다고 우겼고, '…증가한다.3개'의 3을 소수점 뒤라고 막았다.
 * 그래서 글자가 아니라 **숫자로** 견준다 — 원문의 숫자를 전부 뽑아 놓고
 * 그 안에 있는지 본다.
 */
function numbersIn(text) {
  return new Set([...String(text).matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map(m => Number(m[0])));
}

// 깎는 효과는 음수로 적는다(스트라이커 구슬의 축복은 제 주력인 오의 피해를
// 10% 깎는다). 원문은 "10.0% 감소"라고 쓰므로 크기로 견준다.
function inText(text, value) {
  return numbersIn(text).has(Math.abs(Number(value)));
}

const only = process.argv[2];
const jobs = Object.entries(ARKPASSIVE_TREE)
  .map(([code, job]) => ({ code: Number(code), name: job.name }))
  .filter(job => !only || job.name === only);

if (jobs.length === 0) {
  console.error(`모르는 직업: ${only}`);
  process.exit(1);
}

const errors = [];
const review = [];
let checkedAmounts = 0;
const confirmed = [];
const drafts = [];

for (const { code, name } of jobs) {
  const model = AWAKENING_DRAFTS[code];
  if (!model) continue;
  const isDraft = model.status !== "confirmed";

  const desc = (await import(`../src/lib/data/arkpassive-desc/${code}.js`)).default;
  // 확정본만 getAwakeningNodes에 실리므로 트리에서 직접 노드를 만든다.
  const nodes = [];
  for (const group of ["깨달음", "도약"]) {
    for (const node of ARKPASSIVE_TREE[code][group]?.nodes ?? []) nodes.push({ ...node, group });
  }
  const byName = new Map(nodes.map(node => [node.name, node]));

  const say = message => errors.push(`${name} · ${message}`);
  const ask = message => review.push(`${name} · ${message}`);
  // 초안에서는 판단이 필요한 것을 오류로 세지 않는다. 아직 안 본 것이니까.
  const judge = isDraft ? ask : say;

  let open = 0;

  for (const key of Object.keys(model.nodes ?? {})) {
    if (!byName.has(key)) say(`'${key}'는 트리에 없는 노드입니다`);
  }
  const missing = nodes.filter(node => !model.nodes?.[node.name]);
  if (missing.length > 0) say(`안 적은 노드 ${missing.length}개 — ${missing.map(n => n.name).join(", ")}`);

  for (const branch of model.branches ?? []) {
    const node = byName.get(branch.name);
    if (!node) { say(`갈래 '${branch.name}'가 트리에 없습니다`); continue; }
    if (!(node.excludes ?? []).length) say(`갈래 '${branch.name}'는 배타 노드가 아닙니다`);
    if (!isDraft && !branch.note) judge(`갈래 '${branch.name}'에 설명이 없습니다`);
  }

  for (const node of nodes) {
    const effects = model.nodes?.[node.name];
    if (!effects) continue;
    const lines = desc?.[node.group]?.[node.name] ?? [];
    const whole = lines.join(" ");

    for (const effect of effects) {
      // 생성기가 남긴 표시. 확정 전에 사람이 지워야 한다.
      if (effect.kind === "note" && /TODO/.test(effect.scopeNote ?? "")) {
        open += 1;
        judge(`${node.name} — TODO 남음 (레벨별 문장이 달라 직접 읽어야 함)`);
        continue;
      }
      if (!effect.scope) { say(`${node.name} — scope 없음`); continue; }
      if (effect.scope === "?") { open += 1; judge(`${node.name} — scope 미정`); }
      if (effect.key === "?") { open += 1; judge(`${node.name} — 무엇에 붙는 수치인지 미정`); }
      if (effect.scope === "branch" && !byName.has(effect.branch)) {
        say(`${node.name} — branch '${effect.branch}'가 없습니다`);
      }
      if (effect.kind === "replaces" && !byName.has(effect.target)) {
        say(`${node.name} — replaces '${effect.target}'가 없습니다`);
      }
      if (!Array.isArray(effect.amounts)) continue;

      if (effect.amounts.length !== node.maxLevel) {
        say(`${node.name}/${effect.key} — 수치 ${effect.amounts.length}개, 최대 레벨 ${node.maxLevel}`);
        continue;
      }
      // 여기가 핵심이다. 초안이든 확정본이든 원문에 없는 숫자는 오류다.
      //
      // 0은 예외다. '그 레벨에는 이 효과가 없다'는 뜻이라 원문에 적힐 이유가
      // 없다 — 스카우터 제로 모드는 1레벨에 전역 피해 증가가 아예 없고
      // 2레벨부터 5 · 10%로 붙는다.
      effect.amounts.forEach((value, i) => {
        if (Number(value) === 0) return;
        checkedAmounts += 1;
        if (!inText(lines[i] ?? "", value)) {
          say(`${node.name}/${effect.key} Lv${i + 1} — ${value}를 원문에서 못 찾음`);
        }
      });
    }

    // 순위를 바꿀 낱말이 원문에 있는데 수치가 하나도 없다.
    //
    // note가 붙어 있으면 사람이 읽고 '셀 것이 없다'고 판단한 것이므로 묻지
    // 않는다 — 절대적인 명령은 쿨타임을 **늘리는** 노드라 셀 수치가 없다.
    // 생성기가 남긴 TODO note는 위에서 따로 잡는다.
    const reviewed = effects.some(e => e.kind === "note" && !/TODO/.test(e.scopeNote ?? ""));
    if (RANK_KEYS.test(whole) && !reviewed && !effects.some(e => Array.isArray(e.amounts))) {
      judge(`${node.name} — 치적 · 치피 · 속도 · 쿨감이 원문에 있는데 수치가 없습니다`);
    }
    // global이라고 했는데 원문 어느 문장에도 조건 없는 수치가 없다.
    //
    // 노드 전체에 '스킬'이 있는지로 보면 안 된다. 한 노드에 스킬 한정과 전역이
    // 같이 있는 것이 흔하기 때문이다 — 기공사 무상진결은 앞 문장이 무공 스킬
    // 쿨감이지만 "치명타 적중률이 15.0% 증가한다"에는 아무 조건도 없다.
    // 그래서 **문장 단위로** 본다. 숫자가 든 문장 중 하나라도 조건이 없으면
    // 전역이라 할 근거가 있는 것이다.
    //
    // 절 단위로 자른다. 문장으로만 자르면 "이동 속도가 10.0% 증가하고, 일반
    // 스킬과 …의 피해량이 4.8% 증가한다"가 통째로 걸린다 — 앞 절은 조건이
    // 없는데 뒤 절의 '스킬' 때문에 오탐이 난다. 숫자 안의 쉼표·마침표는 비켜 간다.
    if (effects.some(e => e.scope === "global")) {
      // '모든 스킬'은 스킬을 짚는 말이 아니라 전역이라는 말이다.
      // 쉼표 없이 '~하고'로 이어 붙인 문장이 많다. "치명타 적중률이 14.0%
      // 증가하고 영혼석 사용 시 …"처럼. 연결 어미에서도 끊는다.
      const clauses = whole
        .split(/[.,](?![0-9])|(?:하고|하며|되고|되며)\s+/)
        .filter(part => /[0-9]/.test(part));
      // 스킬군이나 '차원술사 스킬'처럼 제 직업 전체를 가리키는 말은 전역이다.
      const wide = new RegExp(`${SKILL_GROUP.source}|${name}(의)?\\s*스킬`);
      const free = clauses.some(part => wide.test(part) || !GATED.test(part));
      if (!free) judge(`${node.name} — global인데 조건 없는 절이 하나도 없습니다`);
    }
  }

  (isDraft ? drafts : confirmed).push({ name, open });
}

const total = Object.keys(ARKPASSIVE_TREE).length;
console.log(`확정 ${confirmed.length} / ${total}직업 — ${confirmed.map(j => j.name).join(" · ") || "없음"}`);
if (drafts.length > 0) {
  const openTotal = drafts.reduce((sum, job) => sum + job.open, 0);
  console.log(`초안 ${drafts.length}직업 · 확인해야 할 자리 ${openTotal}곳`);
  console.log(`  ${drafts.map(job => `${job.name} ${job.open}`).join(" · ")}`);
}
console.log(`원문과 대조한 수치 ${checkedAmounts}개`);

// 초안의 '확인' 목록은 수백 줄이라 다 찍으면 못 읽는다. 확정본 것만 낸다.
const shown = only ? review : review.filter(item => confirmed.some(job => item.startsWith(`${job.name} ·`)));
if (shown.length > 0) {
  console.log(`\n확인 ${shown.length}건`);
  shown.forEach(item => console.log(`  · ${item}`));
}
if (errors.length > 0) {
  console.log(`\n오류 ${errors.length}건`);
  errors.forEach(item => console.log(`  · ${item}`));
  process.exit(1);
}
console.log("\n오류 없음.");
