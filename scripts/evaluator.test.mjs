// 탐색 평가기 == 본체 계산 — 각인을 탐색에 맡긴 채로.
//
// 이 검사가 없어서 두 경로가 11% 어긋난 채 굴러갔다. 표에는 7,287이 뜨는데
// 같은 빌드를 비교함에 담으면 8,121이었다 — 어느 쪽이 참인지 화면만 봐서는
// 알 수가 없다.
//
// 기존 검사들은 전부 engravingSlots:"fixed"로 각인을 빼고 쟀다. 그래서
// 각인 경로의 두 구멍이 통과했다:
//
//   1. 평가기가 normalizeAttack(원본 꼴)을 applyFlatAttackBonuses에 넘겼다.
//      weaponAttack이 0이라 나눌 분모가 없어 평면 증가가 통째로 버려졌다.
//   2. 평가기가 applyEngravingTier에 stoneLevel을 안 넘겼다.
//      어빌리티 스톤 몫만큼 탐색 쪽 딜이 낮게 나왔다.
//
// 둘 다 "탐색이 각인을 굴릴 때"만 드러난다. 그래서 여기서는 각인을 켠다.
import { DEFAULT_STATE, mergeState, calculateMetrics } from "../src/lib/core/metrics.js";
import { ENGRAVING_TIERS } from "../src/lib/core/engravings.js";
import { SEARCH_DEFAULTS, buildSearchPlan, buildEvaluator } from "../src/lib/core/runner.js";

let failures = 0;
const fail = message => { failures += 1; console.log(`  FAIL ${message}`); };

// 평면 증가와 어빌리티 스톤을 둘 다 든 캐릭터. 둘이 이 검사의 재료다.
const state = mergeState(DEFAULT_STATE, {
  base: { critStat: 0, specStat: 0, swiftStat: 0, dominationStat: 79, specDamagePer100: 7.93 },
  attack: {
    weaponFlat: 208715, weaponPercent: 3.6, mainFlat: 598677,
    baseAttackPower: 172026, baseScalePercent: 8.1,
    // 평면 무기 공격력 9000 — 조립 전 꼴로 재면 이게 통째로 사라진다.
    weaponFlatAll: 217715,
    avatars: { weapon: "legendary", head: "legendary", top: "legendary", bottom: "legendary" },
  },
  bracelet: { stats: { critStat: 72 }, effects: { "weapon-attack": "high", damage: "high", "crit-rate": "mid" } },
  collection: { critStat: 76, specStat: 75, swiftStat: 77 },
  weapon: { quality: 100 },
  jewel: { cooldown: 18 },
  engravings: {
    "hit-master": "legendary4", "cursed-doll": "legendary4",
    "raid-captain": "legendary4", "mass-increase": "legendary4", grudge: "relic3",
  },
  // 이 둘이 없으면 (2)번 구멍이 안 드러난다.
  engravingStones: { "cursed-doll": 3, grudge: 2 },
  convenience: { evolutionKarmaRank: 6, passionDance: 2, passionDanceSet: true, goddessBlessing: true, feast: true },
});

// 후보를 손으로 세운다. 비워 두면 돌 낀 둘이 고정으로 잡히고 나머지가 기본
// 역할을 따라가 조합이 하나로 접힌다 — 그러면 각인 경로를 안 밟는다.
const search = {
  ...SEARCH_DEFAULTS,
  tier1Mode: "step10",
  petRoles: { none: "locked" },
  foodRoles: { none: "locked" },
  engravingRoles: {
    "hit-master": "candidate", "raid-captain": "candidate", "mass-increase": "candidate",
    "precise-dagger": "candidate", "keen-blunt-weapon": "candidate", adrenaline: "candidate",
  },
};
const plan = buildSearchPlan(state, search);
const controlled = new Set(plan.engravings.controlledIds);
const evaluate = buildEvaluator(state, controlled);

// 평가기가 고른 조합을 그대로 본체에 넣어 다시 잰다.
function rebuild(picks) {
  const levels = Object.fromEntries(Object.keys(state.nodeLevels).map(id => [id, 0]));
  const engravings = { ...state.engravings };
  let petStat = state.convenience.petStat ?? "none";
  let food = state.convenience.food ?? "none";
  picks.forEach(pick => {
    if (pick.kind === "pet") { petStat = pick.pet; return; }
    if (pick.kind === "food") { food = pick.food; return; }
    if (pick.kind === "engravingSet") {
      plan.engravings.controlledIds.forEach(id => delete engravings[id]);
      pick.active.forEach(entry => { engravings[entry.item.id] = ENGRAVING_TIERS[entry.tierIndex].value; });
      return;
    }
    pick.levels.forEach(([id, level]) => { levels[id] = level; });
  });
  return calculateMetrics({
    ...state, nodeLevels: levels, engravings,
    convenience: { ...state.convenience, petStat, food },
  });
}

// (a) 각인이 실제로 탐색에 올라와 있어야 검사가 뜻을 가진다.
const engravingDim = plan.dimensions.find(d => d.options[0]?.kind === "engravingSet");
if (!engravingDim || engravingDim.options.length < 2) {
  fail(`(a) 각인이 탐색 차원에 없다 — 이 검사가 아무것도 안 한다 (${engravingDim?.options.length ?? 0}가지)`);
} else {
  console.log(`  (a) 각인 조합 ${engravingDim.options.length}가지가 탐색에 올라 있다`);
}

// (b) 여러 조합에서 두 경로가 같은 값을 내야 한다.
{
  let checked = 0;
  let worst = 0;
  let worstAt = "";
  const picks = new Array(plan.dimensions.length).fill(0);
  const walk = index => {
    if (index === plan.dimensions.length) {
      const chosen = plan.dimensions.map((d, i) => d.options[picks[i]]);
      const fast = evaluate(chosen);
      const slow = rebuild(chosen);
      const gap = Math.abs(fast.damageIndex - slow.damageIndex) / Math.max(1, slow.damageIndex);
      if (gap > worst) { worst = gap; worstAt = `${fast.damageIndex.toFixed(2)} vs ${slow.damageIndex.toFixed(2)}`; }
      checked += 1;
      return;
    }
    const options = plan.dimensions[index].options;
    for (let i = 0; i < Math.min(options.length, 3); i += 1) { picks[index] = i; walk(index + 1); }
  };
  walk(0);

  if (checked < 8) fail(`(b) 훑은 조합이 너무 적다 — ${checked}`);
  if (worst > 1e-9) fail(`(b) 평가기와 본체가 어긋난다 — 최악 ${(worst * 100).toFixed(3)}% (${worstAt})`);
  else console.log(`  (b) 평가기 == 본체: ${checked}개 조합 · 최악 ${worst.toExponential(2)}`);
}

// (c) 재료가 정말 실렸는지. 평면과 스톤이 0이면 (b)가 통과해도 의미가 없다.
{
  const base = calculateMetrics(state);
  const noStone = calculateMetrics({ ...state, engravingStones: {} });
  if (!(base.damageIndex > noStone.damageIndex)) fail("(c) 어빌리티 스톤이 딜을 안 움직인다 — 재료가 안 실렸다");
  else console.log(`  (c) 스톤 몫 ${(base.damageIndex / noStone.damageIndex * 100 - 100).toFixed(2)}% 확인`);

  const flat = calculateMetrics(state).attack;
  if (!(flat.weaponAttack > 0)) fail("(c) 조립한 무기 공격력이 0이다");
  else console.log(`  (c) 조립 무공 ${Math.round(flat.weaponAttack).toLocaleString("ko-KR")} 확인`);
}

if (failures > 0) { console.log(`${failures}개 실패.`); process.exit(1); }
console.log("오류 없음.");
