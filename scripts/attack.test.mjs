// 공격력 축 — 무기 공격력 · 힘민지 · 평면 증가.
//
//   기본 공격력 = √(힘민지 × 무기 공격력 / 6)
//
// 여기서 확인하는 것 넷:
//   (a) 기준값을 안 적으면 예전과 한 치도 안 달라진다 — 저장본이 안 깨진다
//   (b) 무공·힘민지 %는 제곱근으로 접힌다 (3%가 1.49%)
//   (c) 평면 증가는 기준값을 나눠 퍼센트가 된다
//   (d) 기준값이 없으면 평면을 버리되 무엇을 버렸는지 남긴다
import {
  DEFAULT_STATE, mergeState, calculateMetrics, baseAttackPower, damageGroupFactor, ATTACK_CHAIN_GROUPS,
} from "../src/lib/core/metrics.js";
import { explainMetrics } from "../src/lib/core/explain.js";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
  return ok;
};
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const state = patch => mergeState(DEFAULT_STATE, patch);

// --- (a) 기준값이 없으면 예전 그대로 -----------------------------------------
{
  const before = calculateMetrics(state({
    engravings: { grudge: "legendary4", "cursed-doll": "legendary4" },
    nodeLevels: { "e1-crit": 10, "e1-spec": 30 },
    accessories: { necklace: { additionalDamage: "high" } },
  }));
  const after = calculateMetrics(state({
    engravings: { grudge: "legendary4", "cursed-doll": "legendary4" },
    nodeLevels: { "e1-crit": 10, "e1-spec": 30 },
    accessories: { necklace: { additionalDamage: "high" } },
    attack: { weaponAttack: 0, mainStat: 0, flatAttack: 0 },
  }));
  check("(a) 기준값 0 == 미입력", close(before.damageIndex, after.damageIndex));
  check("(a) 기본 공격력은 0", after.baseAttackPower === 0, String(after.baseAttackPower));
}

// --- (b) 무공 %는 제곱근으로 접힌다 -------------------------------------------
//
// 예전에는 피해 그룹 쪽에서 √를 흉내 냈다(SQRT_DAMAGE_GROUPS). 지금은 공격력
// 사슬의 C = √(A × B ÷ 6)이 √를 원래대로 처리한다 — 기대값은 그대로다.
// 다만 사슬이 서려면 공격력 기준값이 있어야 한다. 비어 있으면 사슬이 0이라
// 지수가 예전 꼴(100 × 치명 × 배수)로 떨어지고 무공이 아무 일도 안 한다.
{
  const BASE = { weaponAttack: 70000, mainStat: 90000, flatAttack: 0 };
  // 귀걸이 무기 공격력 상옵 = 3.00%
  const plain = calculateMetrics(state({ attack: BASE }));
  const withWeapon = calculateMetrics(state({
    attack: BASE,
    accessories: { earrings: [{ weaponAttack: "high" }, {}] },
  }));
  const ratio = withWeapon.damageIndex / plain.damageIndex;
  check("(b) 무공 3% → ×√1.03", close(ratio, Math.sqrt(1.03), 1e-12), ratio.toFixed(9));

  // 귀걸이 공격력 상옵 = 1.55%. 무공 상옵보다 근소하게 나아야 한다.
  const withAttack = calculateMetrics(state({
    attack: BASE,
    accessories: { earrings: [{ attackPower: "high" }, {}] },
  }));
  check(
    "(b) 공격력 상 > 무공 상",
    withAttack.damageIndex > withWeapon.damageIndex,
    `${(withAttack.damageIndex / plain.damageIndex - 1) * 100}% vs ${(ratio - 1) * 100}%`,
  );

  // 같은 그룹 안에서는 더한 뒤 한 번만 접는다 — √(1.03)·√(1.03) 이 아니라 √(1.06).
  const twoEarrings = calculateMetrics(state({
    attack: BASE,
    accessories: { earrings: [{ weaponAttack: "high" }, { weaponAttack: "high" }] },
  }));
  check(
    "(b) 그룹 안에서는 더한 뒤 한 번만 접는다",
    close(twoEarrings.damageIndex / plain.damageIndex, Math.sqrt(1.06), 1e-12),
  );
  check("(b) damageGroupFactor 직접", close(damageGroupFactor("무기 공격력", 6), Math.sqrt(1.06)));
  check("(b) 다른 그룹은 그대로", close(damageGroupFactor("추가 피해", 6), 1.06));
}

// --- (c) 평면 증가 -----------------------------------------------------------
{
  const attack = { weaponAttack: 70000, mainStat: 90000, flatAttack: 0 };
  const power = baseAttackPower(attack);
  check("(c) 기본 공격력 = √(힘민지 × 무공 / 6)", close(power, Math.sqrt(90000 * 70000 / 6)));

  const plain = calculateMetrics(state({ attack }));
  // 팔찌 무기 공격력 상 = +9,000
  const braced = calculateMetrics(state({
    attack,
    bracelet: { stats: {}, effects: { "weapon-attack": "high" } },
  }));
  check(
    "(c) 팔찌 무공 +9,000 → √(79000/70000)",
    close(braced.damageIndex / plain.damageIndex, Math.sqrt(79000 / 70000), 1e-12),
    (braced.damageIndex / plain.damageIndex).toFixed(9),
  );

  // 팔찌 힘민지는 등급이 아니라 값이다 — 고대 기준 9,600~16,000 사이 아무 값.
  const statBraced = calculateMetrics(state({
    attack,
    bracelet: { stats: {}, mainStat: 16000, effects: {} },
  }));
  check(
    "(c) 팔찌 힘민지 +16,000 → √(106000/90000)",
    close(statBraced.damageIndex / plain.damageIndex, Math.sqrt(106000 / 90000), 1e-12),
  );

  // 직접 입력의 평면 공격력. 공격력 %와는 곱해진다.
  const flat = calculateMetrics(state({
    attack,
    baseEffects: [{ id: "x", label: "평면 공격력", category: "flat:attackPower", customCategory: "", amount: 5000, formula: "", cap: "" }],
  }));
  check(
    "(c) 평면 공격력 +5,000 → 1 + 5000/기본",
    close(flat.damageIndex / plain.damageIndex, 1 + 5000 / power, 1e-12),
  );
}

// --- (d) 기준값이 없으면 버리되 알린다 ---------------------------------------
{
  const dropped = calculateMetrics(state({
    bracelet: { stats: {}, effects: { "weapon-attack": "high" } },
  }));
  const plain = calculateMetrics(state({}));
  check("(d) 기준값 없으면 안 센다", close(dropped.damageIndex, plain.damageIndex));
  check("(d) 버린 것을 남긴다", dropped.droppedFlat.length === 1, JSON.stringify(dropped.droppedFlat));
  check("(d) 무엇을 버렸는지", dropped.droppedFlat[0]?.amount === 9000, JSON.stringify(dropped.droppedFlat[0]));

  const kept = calculateMetrics(state({
    attack: { weaponAttack: 70000, mainStat: 90000 },
    bracelet: { stats: {}, effects: { "weapon-attack": "high" } },
  }));
  check("(d) 기준값이 있으면 안 버린다", kept.droppedFlat.length === 0);
}

// --- (e) 계기판이 같은 수를 말한다 --------------------------------------------
{
  const source = state({
    attack: { weaponAttack: 70000, mainStat: 90000, flatAttack: 0 },
    accessories: {
      necklace: { additionalDamage: "high", dealtDamage: "high" },
      earrings: [{ attackPower: "high", weaponAttack: "high" }, { attackPower: "mid", weaponAttack: "mid" }],
      rings: [{ critRate: "high", critDamage: "high" }, { critRate: "mid", critDamage: "mid" }],
    },
    bracelet: { stats: { critStat: 80 }, mainStat: 14400, effects: { "weapon-attack": "high" } },
    engravings: { grudge: "legendary4" },
    nodeLevels: { "e1-crit": 10, "e1-spec": 30 },
  });
  const report = explainMetrics(source);
  // 공격력 사슬이 삼키는 그룹은 배수에서 빠진다 — A·B·E 안에서 한 번 곱해진다.
  const product = report.damage
    .filter(group => !ATTACK_CHAIN_GROUPS.has(group.key))
    .reduce((acc, group) => acc * group.multiplier, 1);
  check(
    "(e) 그룹 배수의 곱 == damageMultiplier",
    close(product, report.metrics.damageMultiplier, 1e-9),
    `${product} vs ${report.metrics.damageMultiplier}`,
  );

  // 평면이 그룹 밖으로 나가면서 힘민지 그룹은 출처가 없으면 아예 안 선다.
  // 서는 것만 검사한다 — 없는 줄을 세는 것은 이 검사가 할 일이 아니다.
  const rooted = report.damage.filter(group => group.rooted);
  check("(e) 접히는 그룹이 표시된다", rooted.length >= 1, rooted.map(g => g.key).join(", "));
  // 평면은 퍼센트로 안 바뀌고 사슬에 평면대로 실린다.
  const flatKeys = report.attackChain.flats.map(f => f.key).sort().join(",");
  check("(e) 평면은 사슬이 든다", flatKeys === "mainStat,weaponAttack", flatKeys);
  rooted.forEach(group => {
    check(
      `(e) ${group.key} 배수는 √(1+합)`,
      close(group.multiplier, Math.sqrt(1 + group.total / 100)),
      `합 ${group.total}% → ×${group.multiplier}`,
    );
  });

  const residual = report.damage.filter(group => Math.abs(group.residual) > 1e-9);
  check("(e) 설명 못 한 몫 없음", residual.length === 0, residual.map(g => `${g.key} ${g.residual}`).join(", "));
}

console.log(failures === 0 ? "attack: all checks passed" : `attack: ${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
