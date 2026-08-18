// Property test for the Pareto front collector against a brute-force reference.
// Ties in damageIndex are the case that broke the first implementation, so the
// generators deliberately use small integer ranges.
import { createParetoFront } from "../src/lib/core/search.js";

const bruteForce = points => {
  const kept = [];
  for (let i = 0; i < points.length; i += 1) {
    const [d, p] = points[i];
    let dominated = false;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const [od, op] = points[j];
      if (od >= d && op >= p && (od > d || op > p)) { dominated = true; break; }
      if (od === d && op === p && j < i) { dominated = true; break; }
    }
    if (!dominated) kept.push([d, p]);
  }
  return kept.sort((a, b) => b[0] - a[0]);
};

let failures = 0;
let totalPoints = 0;
let rejectedEarly = 0;

for (let trial = 0; trial < 3000; trial += 1) {
  const n = 1 + Math.floor(Math.random() * 300);
  const spread = [3, 8, 25, 1000][trial % 4];
  const points = Array.from({ length: n }, () => [
    Math.floor(Math.random() * spread),
    Math.floor(Math.random() * spread),
  ]);

  const front = createParetoFront();
  for (const [d, p] of points) {
    totalPoints += 1;
    if (!front.accepts(d, p)) { rejectedEarly += 1; continue; }
    front.offer({ damageIndex: d, dpsIndex: p });
  }

  const got = front.items.map(e => [e.damageIndex, e.dpsIndex]);
  const want = bruteForce(points);
  const damageDescending = got.every((e, i) => i === 0 || got[i - 1][0] > e[0]);
  const dpsAscending = got.every((e, i) => i === 0 || got[i - 1][1] < e[1]);

  if (JSON.stringify(got) !== JSON.stringify(want) || !damageDescending || !dpsAscending) {
    failures += 1;
    if (failures === 1) {
      console.log(`MISMATCH spread=${spread} n=${n}`);
      console.log("  got :", JSON.stringify(got));
      console.log("  want:", JSON.stringify(want));
    }
  }
}

console.log(`pareto front: ${failures} failures / 3000 trials (${totalPoints} points, ${rejectedEarly} rejected by accepts)`);

// 무릎 판정(이웃 두 점의 기울기)은 여기 있었다. 그 값이 빌드가 아니라 점 사이
// 간격을 재고 있어서 뺐다 — 같은 질문은 ceiling.test.mjs가 한계 구간으로 검사한다.

process.exit(failures === 0 ? 0 : 1);
