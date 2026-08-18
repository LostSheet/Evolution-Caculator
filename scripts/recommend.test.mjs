// 손실 환산 검사.
//
// 이 모듈은 이제 고르지 않는다 — 각 축의 "최고 대비 손실"만 만든다. 고르는
// 일은 ceiling.js가 한다. 그러니 검사할 것은 손실이 정의대로인가뿐이다.
import { analyseFront } from "../src/lib/core/recommend.js";

const EPS = 1e-9;
let failures = 0;
const fail = (label, detail) => { failures += 1; console.error(`  ✗ ${label} — ${detail}`); };

// 진짜 파레토 프론트를 만든다. 한 방 딜은 내려가고 DPS는 반드시 올라가야 한다 —
// 안 그러면 그 지점은 지배당해서 애초에 프론트에 못 남는다. 쿨감을 80% 상한
// 위로 올리면 DPS가 도리어 떨어져 지배당하므로, 상한 아래에서만 만든다.
function randomFront(size) {
  const front = [];
  let damage = 200 + Math.random() * 100;
  let cooldown = Math.random() * 5;

  for (let i = 0; i < size; i += 1) {
    front.push({ id: `b${i}`, damageIndex: damage, cooldownReduction: cooldown, dpsIndex: damage / (1 - cooldown / 100) });
    if (cooldown >= 78) break;

    const nextCooldown = Math.min(78, cooldown + Math.random() * 6 + 0.5);
    // DPS가 오르려면 한 방 딜은 이 비율보다 덜 깎여야 한다.
    const floor = damage * (1 - nextCooldown / 100) / (1 - cooldown / 100);
    damage = floor + (damage - floor) * Math.random() * 0.98;
    cooldown = nextCooldown;
  }
  return front;
}

// --- (a) 정의대로인가 -------------------------------------------------------
{
  let checks = 0;
  for (let trial = 0; trial < 500; trial += 1) {
    const front = randomFront(1 + Math.floor(Math.random() * 20));
    const report = analyseFront(front);
    if (!report) { fail("null", `길이 ${front.length}인데 null`); continue; }

    const { rows } = report;
    checks += 1;

    // 손실은 모두 0 이상이고, 각 축에 정확히 하나씩 0이 있어야 한다.
    for (const row of rows) {
      if (row.damageLoss < -EPS || row.dpsLoss < -EPS) {
        fail("음수 손실", `${row.damageLoss} / ${row.dpsLoss}`);
      }
      if (Math.abs(row.worstLoss - Math.max(row.damageLoss, row.dpsLoss)) > EPS) {
        fail("최악 손실", `${row.worstLoss} != max(${row.damageLoss}, ${row.dpsLoss})`);
      }
    }
    if (rows.filter(row => row.damageLoss < EPS).length !== 1) fail("한 방 최고", "0인 행이 하나가 아니다");
    if (rows.filter(row => row.dpsLoss < EPS).length !== 1) fail("DPS 최고", "0인 행이 하나가 아니다");

    // 폭은 각 축에서 가장 큰 손실과 같아야 한다.
    if (Math.abs(report.damageSpread - Math.max(...rows.map(r => r.damageLoss))) > EPS) {
      fail("한 방 폭", `${report.damageSpread}`);
    }
    if (Math.abs(report.dpsSpread - Math.max(...rows.map(r => r.dpsLoss))) > EPS) {
      fail("DPS 폭", `${report.dpsSpread}`);
    }
    // 진짜 파레토 프론트라면 한 방 딜이 최고인 지점이 DPS는 최저다.
    const byDamage = rows.reduce((a, b) => (b.entry.damageIndex > a.entry.damageIndex ? b : a));
    if (Math.abs(byDamage.dpsLoss - report.dpsSpread) > EPS) {
      fail("양 끝", `한 방 최고 지점의 DPS 손실 ${byDamage.dpsLoss} != 폭 ${report.dpsSpread}`);
    }
  }
  console.log(`(a) 손실 정의 · 양 끝 · 폭: ${failures} failures / ${checks} fronts`);
}

// --- (b) 두 축의 폭 비율 ----------------------------------------------------
// "한 방 딜이 DPS보다 훨씬 넓게 벌어진다"는 것은 정리가 아니다. 성립하려면
// d²/(1−c)가 한 방 딜 끝에서 최대여야 하는데, 그건 프론트 모양에 달렸다.
// 그래서 단언하지 않고 재기만 한다 — 실제 탐색 결과가 어느 쪽인지가 중요하다.
{
  const total = 500;
  const ratios = [];
  for (let trial = 0; trial < total; trial += 1) {
    const report = analyseFront(randomFront(3 + Math.floor(Math.random() * 18)));
    if (report.dpsSpread > 1e-6) ratios.push(report.damageSpread / report.dpsSpread);
  }
  ratios.sort((a, b) => a - b);
  const wider = ratios.filter(r => r >= 1).length;
  console.log(
    `(b) 한 방 폭 ÷ DPS 폭: 중앙값 ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}배` +
    ` · 한 방이 더 넓은 프론트 ${wider}/${ratios.length}`,
  );
}

// --- (c) 손으로 푼 예제 -----------------------------------------------------
{
  const before = failures;
  const front = [
    { id: "a", damageIndex: 100, dpsIndex: 100, cooldownReduction: 0 },
    { id: "b", damageIndex: 96, dpsIndex: 104, cooldownReduction: 7.7 },
    { id: "c", damageIndex: 80, dpsIndex: 110, cooldownReduction: 27.3 },
  ];
  const { rows, damageSpread, dpsSpread } = analyseFront(front);
  //   a: 한 방 -0%,     DPS -9.09%
  //   b: 한 방 -4%,     DPS -5.45%
  //   c: 한 방 -20%,    DPS -0%
  const at = id => rows.find(row => row.entry.id === id);
  if (Math.abs(at("a").damageLoss) > EPS) fail("예제", `a 한 방 손실 ${at("a").damageLoss}`);
  if (Math.abs(at("a").dpsLoss - (1 - 100 / 110) * 100) > 1e-9) fail("예제", `a DPS 손실 ${at("a").dpsLoss}`);
  if (Math.abs(at("b").damageLoss - 4) > 1e-9) fail("예제", `b 한 방 손실 ${at("b").damageLoss}`);
  if (Math.abs(at("b").dpsLoss - (1 - 104 / 110) * 100) > 1e-9) fail("예제", `b DPS 손실 ${at("b").dpsLoss}`);
  if (Math.abs(at("c").damageLoss - 20) > EPS) fail("예제", `c 한 방 손실 ${at("c").damageLoss}`);
  if (Math.abs(damageSpread - 20) > EPS) fail("예제", `한 방 폭 ${damageSpread}`);
  if (Math.abs(dpsSpread - (1 - 100 / 110) * 100) > 1e-9) fail("예제", `DPS 폭 ${dpsSpread}`);
  console.log(`(c) 손으로 푼 예제: ${failures - before} failures`);
}

// --- (d) 가장자리 ----------------------------------------------------------
{
  const before = failures;
  if (analyseFront([]) !== null) fail("빈 프론트", "null이 아니다");
  if (analyseFront(null) !== null) fail("null", "null이 아니다");
  const single = analyseFront([{ id: "x", damageIndex: 100, dpsIndex: 100, cooldownReduction: 0 }]);
  if (single.rows.length !== 1 || single.rows[0].entry.id !== "x") fail("1개 프론트", "행이 하나가 아니다");
  if (single.damageSpread !== 0 || single.dpsSpread !== 0) fail("1개 프론트", "폭이 0이 아니다");
  console.log(`(d) 가장자리: ${failures - before} failures`);
}

if (failures) {
  console.error("recommend: FAILED");
  process.exit(1);
}
console.log("recommend: all checks passed");
