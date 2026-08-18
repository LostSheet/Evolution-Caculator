// 깨달음 · 도약 수치 표를 손으로 적을 때 쓰는 조각들.
//
// 직업마다 파일 하나(<직업코드>.js)를 두고 여기 함수로 채운다. 한 직업씩 끊어
// 읽으려고 이렇게 나눴다 — 30직업 664노드를 한 덩이로 두면 고칠 때마다 전부를
// 다시 봐야 한다.
//
// 원문은 src/lib/data/arkpassive-desc/<직업코드>.js 에 레벨별로 다 있다.
// 읽기 좋은 꼴로 뽑으려면: node scripts/awakening-sheet.mjs <직업이름>
// 다 적은 뒤 확인하려면:   node scripts/awakening-audit.mjs
//
// --- scope ---------------------------------------------------------------
//
//   global      모든 스킬에 상시로 걸린다 → 계산에 들어간다
//   branch      배타 선택 중 한쪽을 골랐을 때만 전역이 된다
//   partial     일부 스킬에만 걸린다 → 스킬별 딜 비중이 없어 아직 안 센다
//   conditional 특정 상태에서만 걸린다 → 유지율을 모르면 못 센다
//   note        수치가 없다
//
// global은 아껴 쓴다. 특정 스킬에만 걸리는 것을 전역으로 세면 치적이 부풀고,
// 그러면 뭉툭한 가시의 80% 상한과 최소 치적 하한이 전부 어긋난다.
//
// --- amounts -------------------------------------------------------------
//
// 레벨 수만큼 적는다. 1레벨부터 만렙까지, 원문에 적힌 숫자 그대로.
// awakening-audit이 원문에서 그 숫자를 찾아 대조하므로 반올림하면 걸린다.

export function percent(key, amounts, scope, scopeNote = "") {
  return { kind: "percent", key, amounts, scope, scopeNote };
}

export function damage(key, amounts, scope, scopeNote = "") {
  return { kind: "damage", key, amounts, scope, scopeNote };
}

/** 이 갈래를 골랐을 때만 전역이 되는 효과. branch는 배타 1티어 노드 이름. */
export function branchPercent(key, amounts, branch, scopeNote) {
  return { kind: "percent", key, amounts, scope: "branch", branch, scopeNote };
}

export function branchDamage(key, amounts, branch, scopeNote) {
  return { kind: "damage", key, amounts, scope: "branch", branch, scopeNote };
}

/**
 * 고정 수치가 아니라 **식**으로 붙는 효과.
 *
 * 게임에는 "공격 속도 증가량의 120%만큼 치명타 피해"처럼 내 빌드를 재료로 쓰는
 * 노드가 있다. 숫자를 미리 적을 수 없으니 식으로 둔다. 사전 세팅의 직접 입력
 * 효과가 쓰는 것과 같은 기계를 쓰므로 계산 단계도 알아서 맞는다.
 *
 *   기민함     formula("critDamage", "{{공격속도합}} * {n}%", [40, 80, 120], null, "global")
 *   성검 개방   formula("damage:주는 피해", "{{치명타적중률합}} * {n}%", [0.15, 0.35, 0.55], [15, 35, 55], "global")
 *
 * expression 안의 {n}이 레벨별 수치로 바뀐다. cap도 레벨별 배열을 받는다.
 * 쓸 수 있는 변수는 metrics.js의 FORMULA_VARIABLES에 있다 —
 * 공격속도 · 이동속도(상한 적용) / 공격속도합 · 이동속도합(상한 전) /
 * 치명 · 특화 · 신속 · 제압 · 인내 · 숙련 / 치명타적중률 · 치명타적중률합 · 치명타피해.
 */
export function formula(category, expression, amounts, caps, scope, scopeNote = "") {
  return { kind: "formula", category, expression, amounts, caps, scope, scopeNote };
}

/** 수치가 없거나 이 계산기가 다루지 않는 효과. 무엇인지는 적어 둔다. */
export function note(text) {
  return { kind: "note", scope: "note", scopeNote: text };
}

/**
 * 다른 노드의 수치를 갈아치운다. 더하기가 아니다.
 * 고대의 축복이 정신 집중의 23%를 47%로 바꾸는 식.
 */
export function replaces(target, key, amounts) {
  return { kind: "replaces", target, key, amounts, scope: "replace" };
}
