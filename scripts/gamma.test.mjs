// 감마 스윕 검사.
//
// 구간을 표본으로 찍는 게 아니라 교차점에서 잘라 만들기 때문에, "임의의 λ를
// 뽑아 그 구간의 주인이 실제로 1등인가"가 곧 정확성 검사가 된다.
import { sweepGamma, scoreAt } from "../src/lib/core/gamma.js";

const EPS = 1e-9;

function randomFront(size) {
  // 파레토 프론트: 한 방 딜 내림차순, 쿨감 오름차순
  const front = [];
  let damage = 200 + Math.random() * 100;
  let cooldown = Math.random() * 5;
  for (let i = 0; i < size; i += 1) {
    front.push({
      id: `b${i}`,
      damageIndex: damage,
      cooldownReduction: cooldown,
      dpsIndex: damage / (1 - Math.min(cooldown, 80) / 100),
    });
    damage -= Math.random() * 8 + 0.5;
    cooldown += Math.random() * 6 + 0.5;
  }
  return front;
}

let failures = 0;
let checks = 0;

for (let trial = 0; trial < 400; trial += 1) {
  const front = randomFront(2 + Math.floor(Math.random() * 20));
  const { segments, byId, championId } = sweepGamma(front);

  // (a) 구간이 [0,1]을 빈틈없이 덮는가
  if (segments.length === 0) { failures += 1; continue; }
  if (Math.abs(segments[0].from) > EPS) failures += 1;
  if (Math.abs(segments[segments.length - 1].to - 1) > EPS) failures += 1;
  for (let i = 1; i < segments.length; i += 1) {
    if (Math.abs(segments[i].from - segments[i - 1].to) > EPS) failures += 1;
  }

  // (b) 구간의 주인이 그 구간 안 어디서든 실제 1등인가
  for (const segment of segments) {
    for (let s = 0; s < 5; s += 1) {
      const lambda = segment.from + (segment.to - segment.from) * ((s + 0.5) / 5);
      const mine = scoreAt(segment.entry, lambda);
      const best = Math.max(...front.map(entry => scoreAt(entry, lambda)));
      checks += 1;
      if (best - mine > 1e-9 * Math.max(1, best)) failures += 1;
    }
  }

  // (c) 폭 합계가 1인가
  const total = [...byId.values()].reduce((acc, item) => acc + item.width, 0);
  if (Math.abs(total - 1) > 1e-9) failures += 1;

  // (d) 추천은 가장 넓은 구간의 주인인가
  const widest = Math.max(...[...byId.values()].map(item => item.width));
  if (Math.abs(byId.get(championId).width - widest) > 1e-9) failures += 1;
}

console.log(`감마 스윕: ${failures} failures / 400 fronts (${checks} λ 표본)`);

// λ=1이면 DPS 순위와, λ=0이면 한 방 딜 순위와 같아야 한다.
let anchorFailures = 0;
for (let trial = 0; trial < 200; trial += 1) {
  const front = randomFront(3 + Math.floor(Math.random() * 10));
  const atZero = front.reduce((a, b) => (scoreAt(b, 0) > scoreAt(a, 0) ? b : a));
  const byDamage = front.reduce((a, b) => (b.damageIndex > a.damageIndex ? b : a));
  if (atZero.id !== byDamage.id) anchorFailures += 1;

  const atOne = front.reduce((a, b) => (scoreAt(b, 1) > scoreAt(a, 1) ? b : a));
  const byDps = front.reduce((a, b) => (b.dpsIndex > a.dpsIndex ? b : a));
  if (atOne.id !== byDps.id) anchorFailures += 1;
}
console.log(`양 끝 일치 (λ=0 → 한 방 딜, λ=1 → DPS): ${anchorFailures} failures / 400`);

if (failures || anchorFailures) {
  console.error("gamma: FAILED");
  process.exit(1);
}
console.log("gamma: all checks passed");
