// 쿨감 소화 한계 스윕 검사.
//
// 구간을 해석적으로 자르므로, "임의의 한계를 뽑아 그 구간의 주인이 실제로
// 1등인가"가 곧 정확성 검사다.
import { sweepCeiling, scoreAtCeiling, formatCeilingSegment, ceilingLabel } from "../src/lib/core/ceiling.js";
import { sweepGamma } from "../src/lib/core/gamma.js";
import { analyseFront } from "../src/lib/core/recommend.js";

// 예전 추천 규칙(체비셰프). 이제 안 쓰지만, 왜 갈아탔는지를 (d)가 계속
// 증명하도록 여기에 남겨 둔다.
function chebyshevPick(front) {
  const { rows } = analyseFront(front);
  return rows.reduce((best, row) => (row.worstLoss < best.worstLoss - 1e-12 ? row : best)).entry.id;
}

const EPS = 1e-9;
let failures = 0;
const fail = (label, detail) => { failures += 1; console.error(`  ✗ ${label} — ${detail}`); };

// 진짜 파레토 프론트: 한 방 딜은 내려가고 DPS는 반드시 올라간다.
function randomFront(n) {
  const front = [];
  let d = 200 + Math.random() * 100, c = Math.random() * 5;
  for (let i = 0; i < n; i += 1) {
    front.push({ id: `b${i}`, damageIndex: d, cooldownReduction: c, dpsIndex: d / (1 - c / 100) });
    if (c >= 78) break;
    const nc = Math.min(78, c + Math.random() * 6 + 0.5);
    const floor = d * (1 - nc / 100) / (1 - c / 100);
    d = floor + (d - floor) * Math.random() * 0.98;
    c = nc;
  }
  return front;
}

// --- (a) 구간의 주인이 그 구간 안 어디서든 실제 1등인가 ----------------------
{
  let checks = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const front = randomFront(2 + Math.floor(Math.random() * 18));
    const { segments, byId, maxCeiling } = sweepCeiling(front);
    if (segments.length === 0) { fail("빈 결과", `길이 ${front.length}`); continue; }

    if (Math.abs(segments[0].from) > EPS) fail("시작", `${segments[0].from} != 0`);
    if (Math.abs(segments[segments.length - 1].to - maxCeiling) > 1e-6) {
      fail("끝", `${segments[segments.length - 1].to} != ${maxCeiling}`);
    }
    for (let i = 1; i < segments.length; i += 1) {
      if (Math.abs(segments[i].from - segments[i - 1].to) > EPS) fail("연속", `${segments[i].from} != ${segments[i - 1].to}`);
    }

    for (const segment of segments) {
      for (let s = 0; s < 5; s += 1) {
        const cap = segment.from + (segment.to - segment.from) * ((s + 0.5) / 5);
        const mine = scoreAtCeiling(segment.entry, cap);
        const best = Math.max(...front.map(entry => scoreAtCeiling(entry, cap)));
        checks += 1;
        if (best - mine > 1e-9 * Math.max(1, best)) {
          fail("주인", `한계 ${cap.toFixed(3)}에서 ${mine.toFixed(6)} < 최고 ${best.toFixed(6)}`);
        }
      }
    }

    const total = [...byId.values()].reduce((acc, item) => acc + item.width, 0);
    if (Math.abs(total - 1) > 1e-6) fail("폭 합계", `${total}`);
  }
  console.log(`(a) 구간의 주인이 실제 1등: ${failures} failures / 400 fronts (${checks} 표본)`);
}

// --- (b) 양 끝 --------------------------------------------------------------
// 한계 0이면 쿨감이 아무 소용 없으니 한 방 딜 1등, 한계를 다 열면 DPS 1등.
{
  const before = failures;
  for (let trial = 0; trial < 300; trial += 1) {
    const front = randomFront(3 + Math.floor(Math.random() * 12));
    const byDamage = front.reduce((a, b) => (b.damageIndex > a.damageIndex ? b : a));
    const byDps = front.reduce((a, b) => (b.dpsIndex > a.dpsIndex ? b : a));
    const { segments, maxCeiling } = sweepCeiling(front);
    if (segments[0].entry.id !== byDamage.id) fail("한계 0", `${segments[0].entry.id} != ${byDamage.id}`);
    if (segments[segments.length - 1].entry.id !== byDps.id) {
      fail("한계 최대", `${segments[segments.length - 1].entry.id} != ${byDps.id}`);
    }
    const top = scoreAtCeiling(byDps, maxCeiling);
    if (Math.abs(top - byDps.dpsIndex) > 1e-6 * top) fail("포화", `${top} != ${byDps.dpsIndex}`);
  }
  console.log(`(b) 한계 0 → 한 방 딜 / 한계 최대 → DPS: ${failures - before} failures / 300`);
}

// --- (c) 프론트의 모든 지점이 자기 구간을 하나씩 가지는가 --------------------
// λ와 다른 점이다. 한계 모형에서는 파레토 위의 모든 빌드가 어떤 한계에서는
// 최선이다 — 즉 "이 빌드는 언제 옳은가"에 늘 답이 있다.
{
  const before = failures;
  let orphans = 0, multi = 0, points = 0;
  for (let trial = 0; trial < 500; trial += 1) {
    const front = randomFront(3 + Math.floor(Math.random() * 15));
    const { byId } = sweepCeiling(front);
    points += front.length;
    for (const entry of front) {
      const item = byId.get(entry.id);
      if (!item) orphans += 1;
      else if (item.segments.length > 1) multi += 1;
    }
  }
  if (orphans > 0) fail("빈손", `${orphans}/${points} 지점이 자기 구간을 못 가졌다`);
  if (multi > 0) fail("쪼개짐", `${multi}/${points} 지점이 두 조각 이상으로 이겼다`);
  console.log(`(c) 모든 지점이 연속한 한 구간씩: ${failures - before} failures / ${points} 지점`);
}

// --- (d) 끝점 하나에 얼마나 휘둘리는가 --------------------------------------
// 탐색이 극단적인 빌드 하나를 더 찾았느냐로 추천이 뒤집히면 근거가 약한 것이다.
{
  let ceilingMoved = 0, lambdaMoved = 0, chebyshevMoved = 0, total = 0;
  for (let trial = 0; trial < 2000; trial += 1) {
    const front = randomFront(6 + Math.floor(Math.random() * 14));
    if (front.length < 5) continue;
    total += 1;
    const trimmed = front.slice(0, -1);
    if (sweepCeiling(front).championId !== sweepCeiling(trimmed).championId) ceilingMoved += 1;
    if (sweepGamma(front).championId !== sweepGamma(trimmed).championId) lambdaMoved += 1;
    if (chebyshevPick(front) !== chebyshevPick(trimmed)) chebyshevMoved += 1;
  }
  const pct = n => `${(n / total * 100).toFixed(1)}%`;
  console.log(`(d) 끝점 하나를 빼면 추천이 바뀌는 비율 (${total} fronts)`);
  console.log(`      소화 한계 최장 구간  ${pct(ceilingMoved)}`);
  console.log(`      λ 최장 구간          ${pct(lambdaMoved)}`);
  console.log(`      균형(체비셰프)        ${pct(chebyshevMoved)}`);
}

// --- (e) 표에 적히는 글자 ----------------------------------------------------
// 교환비 열을 대신하는 값이므로, 곡선 위의 모든 빌드가 읽을 수 있는 구간을
// 하나씩 갖고, 곡선 밖의 빌드는 빈칸이 되어야 한다.
{
  let labelFailures = 0;
  const say = (ok, message) => { if (!ok) { labelFailures += 1; console.log(`  FAIL ${message}`); } };

  // 마지막 구간은 위가 열려 있다 — 한계를 더 올려도 순위가 안 바뀐다.
  say(formatCeilingSegment({ from: 27.2, to: 31 }, 31) === "27%+", "(e) 마지막 구간은 N%+");
  say(formatCeilingSegment({ from: 0, to: 12.4 }, 31) === "0–12%", "(e) 가운데 구간은 범위");
  // 반올림해서 같아지는 좁은 구간은 없는 폭을 지어내지 않는다.
  say(formatCeilingSegment({ from: 12.1, to: 12.4 }, 31) === "12%", "(e) 아주 좁은 구간은 한 숫자");

  let covered = 0, blanks = 0, fronts = 0;
  for (let trial = 0; trial < 400; trial += 1) {
    const front = randomFront(4 + Math.floor(Math.random() * 12));
    if (front.length < 3) continue;
    fronts += 1;
    const sweep = sweepCeiling(front);
    for (const entry of front) {
      const label = ceilingLabel(sweep, entry.id);
      if (label) covered += 1;
      else blanks += 1;
    }
    // 곡선 밖의 id는 빈 글자여야 한다 — 표의 순위 탭이 이걸로 "—"를 찍는다.
    say(ceilingLabel(sweep, "없는-빌드") === "", "(e) 곡선 밖은 빈칸");
  }
  say(blanks === 0, `(e) 곡선 위의 빌드는 모두 구간을 가진다 (빈칸 ${blanks}개)`);
  failures += labelFailures;
  console.log(`(e) 구간 표기: ${labelFailures} failures / ${fronts} fronts, ${covered}개 빌드`);
}

if (failures) {
  console.error("ceiling: FAILED");
  process.exit(1);
}
console.log("ceiling: all checks passed");
