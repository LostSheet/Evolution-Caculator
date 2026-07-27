// Validates the search runner in three layers:
//   a) the fast evaluator reproduces calculateMetrics exactly
//   b) exhaustive search finds the true maximum over its own plan
//   c) the collected Pareto front matches a brute-force front
// calculateMetrics is itself proven equal to the legacy build by diff-legacy.mjs,
// so (a) transitively anchors the whole chain to the original implementation.
import { NODE_LIBRARY } from "../src/lib/core/data.js";
import { CHAOS_CORES, CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS } from "../src/lib/core/cores.js";
import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../src/lib/core/engravings.js";
import { DEFAULT_STATE, mergeState, calculateMetrics, emptyNodeLevels } from "../src/lib/core/metrics.js";
import { buildSearchPlan, buildEvaluator, runSearch } from "../src/lib/core/runner.js";

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const maybe = (p = 0.5) => Math.random() < p;
const grades = ["none", "high", "mid", "low"];

function randomState() {
  const engravings = {};
  for (const item of ENGRAVING_LIBRARY) if (maybe(0.3)) engravings[item.id] = pick(ENGRAVING_TIERS).value;

  const cores = {};
  for (const slot of CHAOS_CORE_SLOTS) {
    const pool = CHAOS_CORES.filter(core => core.slot === slot.key);
    cores[slot.key] = maybe(0.7)
      ? { id: pick(pool).id, points: pick(CHAOS_CORE_POINTS), stage: Math.floor(Math.random() * 2) }
      : { id: "none", points: 20, stage: 1 };
  }

  return mergeState(DEFAULT_STATE, {
    arkGrid: { cores, gemLevel: Math.floor(Math.random() * 11) },
    weapon: { quality: Math.floor(Math.random() * 101) },
    collection: {
      ranch: maybe(),
      critStat: Math.floor(Math.random() * 200),
      specStat: Math.floor(Math.random() * 200),
      swiftStat: Math.floor(Math.random() * 200),
    },
    base: {
      critStat: Math.floor(Math.random() * 1500), specStat: Math.floor(Math.random() * 1500),
      swiftStat: Math.floor(Math.random() * 1500), dominationStat: 0, enduranceStat: 0, expertiseStat: 0,

      specDamagePer100: maybe() ? Math.random() * 5 : 0,
    },
    settings: {
      pointBudget: 140, includeCooldown: maybe(), includeAttackSpeed: maybe(),
      backAttack: maybe(), headAttack: maybe(),
    },
    convenience: {
      petStat: "none", evolutionKarmaRank: Math.floor(Math.random() * 7),
      manaShare: Math.floor(Math.random() * 21) * 5, goddessBlessing: maybe(), feast: maybe(),
    },
    accessories: {
      necklace: { additionalDamage: pick(grades) },
      rings: [{ critRate: pick(grades), critDamage: pick(grades) }, { critRate: pick(grades), critDamage: pick(grades) }],
    },
    bracelet: { stats: { critStat: 60, specStat: 0, swiftStat: 40 }, effects: {} },
    engravings,
  });
}

// Rebuild an equivalent full state from a pick vector and run the reference path.
function referenceMetrics(state, plan, picks) {
  const nodeLevels = emptyNodeLevels();
  const engravings = { ...state.engravings };
  let petStat = "none";
  for (const p of picks) {
    if (p.kind === "pet") petStat = p.pet;
    else if (p.kind === "engravingSet") {
      plan.engravings.controlledIds.forEach(id => delete engravings[id]);
      p.active.forEach(e => { engravings[e.item.id] = ENGRAVING_TIERS[e.tierIndex].value; });
    } else p.levels.forEach(([id, lv]) => { nodeLevels[id] = lv; });
  }
  return calculateMetrics({ ...state, nodeLevels, engravings, convenience: { ...state.convenience, petStat } });
}

// --- (a) evaluator vs calculateMetrics --------------------------------------
let evalFailures = 0;
let evalSamples = 0;
let worstDelta = 0;

for (let trial = 0; trial < 40; trial += 1) {
  const state = randomState();
  const options = {
    tier1Mode: pick(["fixed", "step10", "step5"]),
    petSearch: true,
    engravingSlots: pick(["fixed", "3", "5"]),
    fullBudget: maybe(),
  };
  const plan = buildSearchPlan(state, options);
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));

  for (let i = 0; i < 60; i += 1) {
    const picks = plan.dimensions.map(d => d.options[Math.floor(Math.random() * d.options.length)]);
    const fast = evaluate(picks);
    const ref = referenceMetrics(state, plan, picks);
    evalSamples += 1;
    for (const field of ["damageIndex", "dpsIndex", "cooldownReduction", "critRateCapped", "pointsUsed"]) {
      const delta = Math.abs(fast[field] - ref[field]) / Math.max(1, Math.abs(ref[field]));
      worstDelta = Math.max(worstDelta, delta);
      if (delta > 1e-9) { evalFailures += 1; break; }
    }
  }
}
console.log(`(a) evaluator vs calculateMetrics: ${evalFailures} failures / ${evalSamples} samples (worst rel delta ${worstDelta.toExponential(2)})`);

// --- (b)+(c) exhaustive search vs brute force -------------------------------
let searchFailures = 0;
const checks = [];

for (let trial = 0; trial < 6; trial += 1) {
  const state = randomState();
  const options = { tier1Mode: "fixed", petSearch: true, engravingSlots: "fixed", fullBudget: true, mode: "exhaustive", resultLimit: 20 };
  const result = await runSearch(state, options);
  const plan = result.plan;
  const evaluate = buildEvaluator(state, new Set(plan.engravings.controlledIds));

  // Brute-force sweep of the same plan.
  const dims = plan.dimensions;
  const idx = new Array(dims.length).fill(0);
  const picks = dims.map(d => d.options[0]);
  const points = [];
  for (let c = 0; c < plan.totalCombos; c += 1) {
    let used = 0;
    for (let i = 0; i < picks.length; i += 1) if (picks[i].kind === "nodes") used += picks[i].points;
    if (used <= plan.budget) { const m = evaluate(picks); points.push([m.damageIndex, m.dpsIndex]); }
    let d = dims.length - 1;
    while (d >= 0) {
      idx[d] += 1;
      if (idx[d] < dims[d].options.length) { picks[d] = dims[d].options[idx[d]]; break; }
      idx[d] = 0; picks[d] = dims[d].options[0]; d -= 1;
    }
    if (d < 0) break;
  }

  const maxDamage = points.reduce((m, p) => Math.max(m, p[0]), -Infinity);
  const maxDps = points.reduce((m, p) => Math.max(m, p[1]), -Infinity);

  points.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
  const wantFront = [];
  let best = -Infinity;
  for (const p of points) if (p[1] > best) { best = p[1]; wantFront.push(p); }

  const gotFront = result.pareto.map(e => [e.damageIndex, e.dpsIndex]);
  const frontSame = gotFront.length === wantFront.length
    && gotFront.every((g, i) => Math.abs(g[0] - wantFront[i][0]) < 1e-9 && Math.abs(g[1] - wantFront[i][1]) < 1e-9);
  const topDamageSame = Math.abs(result.damage[0].damageIndex - maxDamage) < 1e-9;
  const topDpsSame = Math.abs(result.dps[0].dpsIndex - maxDps) < 1e-9;

  if (!frontSame || !topDamageSame || !topDpsSame) searchFailures += 1;
  checks.push({ swept: points.length, front: gotFront.length, frontSame, topDamageSame, topDpsSame });
}

console.log(`(b) exhaustive top-1 == brute-force max: ${checks.filter(c => c.topDamageSame && c.topDpsSame).length}/${checks.length}`);
console.log(`(c) collected front == brute-force front: ${checks.filter(c => c.frontSame).length}/${checks.length} (sizes ${checks.map(c => c.front).join(",")})`);

// --- applied result reproduces its own numbers ------------------------------
let applyFailures = 0;
for (let trial = 0; trial < 8; trial += 1) {
  const state = randomState();
  const result = await runSearch(state, { tier1Mode: "step10", petSearch: true, engravingSlots: "5", mode: "beam", beamWidth: 200 });
  for (const entry of [result.damage[0], result.dps[0], ...result.pareto.slice(0, 3)]) {
    if (!entry) continue;
    const applied = calculateMetrics({
      ...state,
      nodeLevels: entry.nodeLevels,
      engravings: entry.engravings,
      convenience: { ...state.convenience, petStat: entry.pet },
    });
    if (Math.abs(applied.damageIndex - entry.damageIndex) > 1e-9 || Math.abs(applied.dpsIndex - entry.dpsIndex) > 1e-9) {
      applyFailures += 1;
    }
  }
}
console.log(`(d) applying a result reproduces its shown numbers: ${applyFailures === 0 ? "OK" : `${applyFailures} FAILURES`}`);

const failed = evalFailures + searchFailures + applyFailures;
console.log(failed === 0 ? "runner: all checks passed" : `runner: ${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
