// Property test for the Pareto front collector against a brute-force reference.
// Ties in damageIndex are the case that broke the first implementation, so the
// generators deliberately use small integer ranges.
import { createParetoFront, annotateParetoKnees } from "../src/lib/core/search.js";

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

// Knee detection: one obviously cheap step on an otherwise flat front.
const knees = annotateParetoKnees([
  { damageIndex: 1000, dpsIndex: 100 },
  { damageIndex: 900, dpsIndex: 200 },
  { damageIndex: 800, dpsIndex: 300 },
  { damageIndex: 790, dpsIndex: 500 },
  { damageIndex: 690, dpsIndex: 600 },
]).filter(e => e.isKnee).map(e => e.damageIndex);

const kneeOk = knees.length === 1 && knees[0] === 790;
console.log(`knee detection: ${JSON.stringify(knees)} ${kneeOk ? "OK" : "FAIL"}`);
console.log(`edge cases: empty=${JSON.stringify(annotateParetoKnees([]))} single=${annotateParetoKnees([{ damageIndex: 1, dpsIndex: 1 }]).every(e => !e.isKnee) ? "OK" : "FAIL"}`);

process.exit(failures === 0 && kneeOk ? 0 : 1);
