// 끝마/무마 부분 적용 검사.
//
// 주장은 이것이다: 딜의 β만 끝마/무마를 받는다면, 전체 DPS는 두 무리의 합이다.
//
//   DPS = D · [ (1−β)/R_전체 + β/(R_전체 · R_마나) ]
//
// 계산기는 이걸 "유효 마나 쿨감" 하나로 접어서 네 그룹 곱에 그대로 넣는다.
// 접기 전 식과 접은 뒤 값이 같은지를 직접 확인한다 — 여기가 틀리면 쿨감이
// 조용히 부풀거나 줄어든다.
import { DEFAULT_STATE, mergeState, calculateMetrics, getManaCooldownShareRatio, getManaShareRatio, blendCooldownRemain } from "../src/lib/core/metrics.js";

const EPS = 1e-9;
let failures = 0;
const fail = (label, detail) => { failures += 1; console.error(`  ✗ ${label} — ${detail}`); };

function build({ mix, swift = 0, endlessMana = 0, infiniteMagic = 0, optimizedTraining = 0 }) {
  return mergeState(DEFAULT_STATE, {
    base: { ...DEFAULT_STATE.base, swiftStat: swift, specDamagePer100: 0 },
    settings: { ...DEFAULT_STATE.settings },
    convenience: { ...DEFAULT_STATE.convenience, damageMix: mix },
    nodeLevels: {
      "e2-endless-mana": endlessMana,
      "e3-infinite-magic": infiniteMagic,
      "e2-optimized-training": optimizedTraining,
    },
  });
}

const mixOf = (manaCooldown, plainCooldown, identityPlain, identityMana, feederMana = true) =>
  ({ manaCooldown, plainCooldown, identityPlain, identityMana, feederMana });

// --- (a) 접기 전 식과 접은 뒤 값이 같은가 -----------------------------------
{
  let checks = 0;
  for (let trial = 0; trial < 300; trial += 1) {
    const mix = mixOf(
      Math.floor(Math.random() * 11) * 10,
      Math.floor(Math.random() * 11) * 10,
      Math.floor(Math.random() * 11) * 10,
      Math.floor(Math.random() * 11) * 10,
      Math.random() < 0.5,
    );
    if (mix.manaCooldown + mix.plainCooldown + mix.identityPlain + mix.identityMana === 0) continue;

    const state = build({
      mix,
      swift: Math.floor(Math.random() * 1800),
      endlessMana: Math.floor(Math.random() * 3),
      infiniteMagic: Math.floor(Math.random() * 3),
      optimizedTraining: Math.floor(Math.random() * 3),
    });
    const metrics = calculateMetrics(state);
    // 80% 상한이 걸리면 접기 전 식과 비교할 수 없다 — 상한은 접은 뒤에 걸리므로.
    if (metrics.cooldownReduction > 80) continue;

    const beta = getManaCooldownShareRatio(state.convenience);
    const remainAll = ["swift", "generic", "skill"]
      .reduce((acc, key) => acc * (1 - metrics.cooldownGroups[key] / 100), 1);
    const remainMana = 1 - metrics.manaCooldownRaw / 100;

    const expected = metrics.damageIndex * ((1 - beta) / remainAll + beta / (remainAll * remainMana));
    checks += 1;
    if (Math.abs(metrics.dpsIndex - expected) > EPS * Math.max(1, expected)) {
      fail("두 무리 합", `β=${beta.toFixed(3)} 기대 ${expected.toFixed(9)} 실제 ${metrics.dpsIndex.toFixed(9)}`);
    }
  }
  console.log(`(a) 두 무리로 나눠 센 DPS == 계산 결과: ${failures} failures / ${checks} states`);
}

// --- (b) 양 끝 --------------------------------------------------------------
{
  const before = failures;
  const nodes = { endlessMana: 2, infiniteMagic: 2, optimizedTraining: 1, swift: 900 };

  // β=1이면 옛 모델(쿨감을 안 깎던 시절)과 정확히 같아야 한다.
  const full = calculateMetrics(build({ mix: mixOf(100, 0, 0, 0), ...nodes }));
  const legacyLike = calculateMetrics(build({ mix: null, ...nodes }));
  if (Math.abs(full.dpsIndex - legacyLike.dpsIndex) > EPS) {
    fail("β=1", `${full.dpsIndex} vs 옛 모델 ${legacyLike.dpsIndex}`);
  }

  // β=0이면 끝마/무마 그룹이 통째로 사라져야 한다.
  const none = calculateMetrics(build({ mix: mixOf(0, 100, 0, 0), ...nodes }));
  if (Math.abs(none.cooldownGroups.mana) > EPS) {
    fail("β=0", `끝마/무마 그룹이 ${none.cooldownGroups.mana}%로 남았다`);
  }
  // 무한한 마력은 진화형 피해도 주므로 노드를 빼면 한 방 딜까지 달라진다.
  // 여기서 같아야 하는 건 쿨감 쪽 배수뿐이다.
  const without = calculateMetrics(build({ mix: mixOf(0, 100, 0, 0), swift: 900, optimizedTraining: 1 }));
  if (Math.abs(none.cooldownFactor - without.cooldownFactor) > EPS) {
    fail("β=0", `끝마/무마를 안 찍은 빌드와 쿨감 배수가 다르다: ${none.cooldownFactor} vs ${without.cooldownFactor}`);
  }

  // 부분 적용은 언제나 양 끝 사이에 있어야 한다.
  const half = calculateMetrics(build({ mix: mixOf(50, 50, 0, 0), ...nodes }));
  if (!(half.cooldownGroups.mana > 0 && half.cooldownGroups.mana < full.cooldownGroups.mana)) {
    fail("β=0.5", `${half.cooldownGroups.mana}%가 0과 ${full.cooldownGroups.mana}% 사이가 아니다`);
  }
  // 감소율을 그냥 절반으로 깎는 것보다는 커야 한다 — 속도로 섞기 때문이다.
  if (!(half.cooldownGroups.mana > full.cooldownGroups.mana * 0.5)) {
    fail("β=0.5", `단순 절반(${(full.cooldownGroups.mana * 0.5).toFixed(4)})보다 작다: ${half.cooldownGroups.mana.toFixed(4)}`);
  }
  console.log(`(b) 양 끝과 중간: ${failures - before} failures`);
}

// --- (c) 네 갈래가 두 계수로 옳게 접히는가 ----------------------------------
{
  const before = failures;
  const cases = [
    // [mix,                                 마나 전용 피해, 끝마/무마]
    [mixOf(100, 0, 0, 0), 1.0, 1.0],
    [mixOf(0, 100, 0, 0), 0.0, 0.0],
    [mixOf(0, 0, 100, 0), 0.0, 1.0],          // 아덴기: 피해는 못 받고 쿨감은 받는다
    [mixOf(0, 0, 100, 0, false), 0.0, 0.0],   // 수급기가 마나를 안 쓰면 쿨감도 없다
    [mixOf(0, 0, 0, 100), 1.0, 1.0],
    [mixOf(40, 20, 30, 10), 0.5, 0.8],
    [mixOf(40, 20, 30, 10, false), 0.5, 0.5],
    [mixOf(20, 10, 15, 5), 0.5, 0.8],         // 합이 50이어도 비율은 같다
  ];
  for (const [mix, expectedMana, expectedCooldown] of cases) {
    const convenience = { ...DEFAULT_STATE.convenience, damageMix: mix };
    const mana = getManaShareRatio(convenience);
    const cooldown = getManaCooldownShareRatio(convenience);
    const label = `${mix.manaCooldown}/${mix.plainCooldown}/${mix.identityPlain}/${mix.identityMana}${mix.feederMana ? "" : " 수급기 마나X"}`;
    if (Math.abs(mana - expectedMana) > EPS) fail(label, `마나 전용 피해 ${mana} != ${expectedMana}`);
    if (Math.abs(cooldown - expectedCooldown) > EPS) fail(label, `끝마/무마 ${cooldown} != ${expectedCooldown}`);
  }

  // 합이 0이면 옛 슬라이더로 물러난다.
  const zero = { ...DEFAULT_STATE.convenience, manaShare: 60, damageMix: mixOf(0, 0, 0, 0) };
  if (Math.abs(getManaShareRatio(zero) - 0.6) > EPS) fail("합 0", "옛 슬라이더로 물러나지 않았다");
  console.log(`(c) 네 갈래 → 두 계수: ${failures - before} failures / ${cases.length + 1} cases`);
}

// --- (d) blendCooldownRemain 자체 -------------------------------------------
{
  const before = failures;
  if (Math.abs(blendCooldownRemain(28, 1) - 0.72) > EPS) fail("β=1", "R_eff != R");
  if (Math.abs(blendCooldownRemain(28, 0) - 1) > EPS) fail("β=0", "R_eff != 1");
  if (Math.abs(blendCooldownRemain(0, 0.5) - 1) > EPS) fail("쿨감 0", "R_eff != 1");
  // 쿨이 0이 되는 스킬이 조금이라도 섞이면 사이클 시간도 0으로 간다.
  // (실제로는 뒤에서 80% 상한이 잡는다.)
  if (blendCooldownRemain(100, 0.5) !== 0) fail("쿨감 100", "R_eff != 0");
  // β가 커질수록 남은 시간은 단조 감소해야 한다.
  let previous = Infinity;
  for (let beta = 0; beta <= 1.0001; beta += 0.05) {
    const remain = blendCooldownRemain(28, beta);
    if (remain > previous + EPS) fail("단조성", `β=${beta.toFixed(2)}에서 ${remain} > ${previous}`);
    previous = remain;
  }
  console.log(`(d) blendCooldownRemain: ${failures - before} failures`);
}

if (failures) {
  console.error("mana: FAILED");
  process.exit(1);
}
console.log("mana: all checks passed");
