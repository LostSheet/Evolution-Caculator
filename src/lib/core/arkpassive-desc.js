// 깨달음 · 도약의 레벨별 설명문을 필요할 때 불러온다.
//
// 30직업치를 다 싣으면 392KB다 — 지금 번들(269KB)보다 크다. 그런데 한 번에 한
// 직업만 본다. 그래서 직업마다 따로 두고, 트리를 처음 그릴 때 그 직업 것만 받는다.
//
// 구조(자리·레벨·비용·선행·배타)는 여기 없다. 그건 arkpassive-tree.js에 늘 있다.
// 설명이 아직 안 왔다고 트리를 못 그리면 안 되기 때문이다.

// import.meta.glob은 Vite가 정적으로 훑어 직업마다 별도 청크로 쪼갠다.
// 문자열을 이어 붙인 경로로는 그게 안 된다.
const LOADERS = import.meta.glob("../data/arkpassive-desc/*.js");

const cache = new Map();

/** 이 직업 설명을 이미 받아 뒀는가. */
export function getLoadedDesc(job) {
  return cache.get(Number(job)) ?? null;
}

/**
 * 설명을 받아 온다. 두 번 부르면 같은 약속을 돌려준다 — 트리를 다시 그릴
 * 때마다 청크를 새로 받을 이유가 없다.
 */
export async function loadDesc(job) {
  const code = Number(job);
  if (cache.has(code)) return cache.get(code);
  const load = LOADERS[`../data/arkpassive-desc/${code}.js`];
  if (!load) return null;
  const module = await load();
  const desc = module.default ?? null;
  cache.set(code, desc);
  return desc;
}

/**
 * 그 레벨의 설명 한 줄. 레벨 0이면 1레벨 것을 보여 준다 —
 * 안 찍은 노드를 볼 때 알고 싶은 건 "찍으면 뭐가 되는가"다.
 */
export function describe(desc, group, name, level) {
  const lines = desc?.[group]?.[name];
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const index = Math.min(Math.max(Math.round(level) || 1, 1), lines.length) - 1;
  return lines[index];
}
