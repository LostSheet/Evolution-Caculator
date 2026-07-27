// Combination search driver. Hand-written (the legacy version read browser
// globals); the pure helpers it leans on are lifted verbatim in search.js.
// Everything here is UI-free — progress and cancellation come in as callbacks.
import { EVOLUTION_TIERS, NODE_LIBRARY, ARC_PASSIVE_CONSTANTS } from "./data.js";
import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "./engravings.js";
import { readNumber, clamp } from "./util.js";
import {
  DEFAULT_STATE, finalizeMetrics, applyBaseEffect, applyBraceletEffects, applyEngravingTier,
  calculateAccessoryBonuses, normalizeAccessories, normalizeBracelet, addDamageGroup,
  getEngravingTierIndex, getManaShareRatio, getNodeCost, emptyNodeLevels,
  applyArkGridEffects, applyCollectionEffects, applyWeaponEffects,
} from "./metrics.js";
import {
  OPTIMIZER_EXHAUSTIVE_LIMIT, OPTIMIZER_REFINE_ROUNDS, OPTIMIZER_REFINE_SEEDS,
  OPTIMIZER_MAX_EXPANSIONS, OPTIMIZER_REFINE_BUDGET,
  OPTIMIZER_PET_OPTIONS, OPTIMIZER_TIER1_STEPS, OPTIMIZER_ENGRAVING_ROLES,
  getModeledStatKeys, isNodeImpactful, enumerateNodeCombos, keepFullBudgetCombos,
  getModeledEngravings, defaultEngravingRole, enumerateEngravingSets,
  createTopList, createParetoFront, annotateParetoKnees, createChunkClock, selectBeam,
} from "./search.js";

export const SEARCH_DEFAULTS = {
  tier1Mode: "step10",
  petSearch: true,
  engravingSlots: "fixed",
  engravingRoles: {},
  engravingTiers: {},
  fullBudget: true,
  mode: "auto",
  beamWidth: 600,
  resultLimit: 20,
};

// --- engraving roles --------------------------------------------------------

export function getEngravingRole(item, options) {
  const role = options.engravingRoles?.[item.id];
  return OPTIMIZER_ENGRAVING_ROLES.includes(role) ? role : defaultEngravingRole(item);
}

export function getEngravingSearchTierIndex(item, options) {
  const index = getEngravingTierIndex(options.engravingTiers?.[item.id]);
  return index >= 0 ? index : ENGRAVING_TIERS.length - 1;
}

const toEntry = (item, options) => ({ item, tierIndex: getEngravingSearchTierIndex(item, options) });

function buildEngravingDimensions(options) {
  const empty = { locked: [], candidates: [], slots: 0, pickCount: 0, overflow: false, controlledIds: [], dimensions: [] };
  if (options.engravingSlots === "fixed") return empty;

  const modeled = getModeledEngravings();
  const locked = modeled.filter(item => getEngravingRole(item, options) === "locked").map(item => toEntry(item, options));
  const candidates = modeled.filter(item => getEngravingRole(item, options) === "candidate").map(item => toEntry(item, options));
  const slots = clamp(Math.round(readNumber(options.engravingSlots)), 1, 5);
  const controlledIds = modeled.map(item => item.id);

  if (locked.length > slots) return { ...empty, locked, candidates, slots, overflow: true, controlledIds };

  const pickCount = Math.min(slots - locked.length, candidates.length);
  return {
    locked,
    candidates,
    slots,
    pickCount,
    overflow: false,
    controlledIds,
    dimensions: [{ key: "engravingSet", label: "각인", options: enumerateEngravingSets(candidates, pickCount, locked) }],
  };
}

// --- plan -------------------------------------------------------------------

function buildTier1Options(sourceState, options, modeledStatKeys, useFullTier) {
  const tierInfo = EVOLUTION_TIERS["진화 1"];
  const tierNodes = NODE_LIBRARY.filter(node => node.tier === "진화 1");

  if (options.tier1Mode === "fixed") {
    const levels = tierNodes
      .map(node => [node.id, clamp(Math.round(readNumber(sourceState.nodeLevels?.[node.id])), 0, node.maxLevel)])
      .filter(entry => entry[1] > 0);
    const points = levels.reduce((sum, entry) => sum + entry[1] * tierInfo.cost, 0);
    return [{ kind: "nodes", levels, points, goddessLevel: 0 }];
  }

  const step = OPTIMIZER_TIER1_STEPS[options.tier1Mode] || 10;
  const searchNodes = tierNodes.filter(node => isNodeImpactful(node, modeledStatKeys));
  const combos = enumerateNodeCombos(searchNodes, tierInfo.cost, tierInfo.maxPoints, step);
  return useFullTier ? keepFullBudgetCombos(combos) : combos;
}

function buildTierOptions(tier, modeledStatKeys, useFullTier) {
  const tierInfo = EVOLUTION_TIERS[tier];
  const searchNodes = NODE_LIBRARY
    .filter(node => node.tier === tier && isNodeImpactful(node, modeledStatKeys));
  const combos = enumerateNodeCombos(searchNodes, tierInfo.cost, tierInfo.maxPoints, 1);
  return useFullTier ? keepFullBudgetCombos(combos) : combos;
}

export function buildSearchPlan(sourceState, options) {
  const modeledStatKeys = getModeledStatKeys(sourceState);
  const budget = Math.max(0, readNumber(sourceState.settings.pointBudget));
  const tierMaxTotal = Object.values(EVOLUTION_TIERS).reduce((sum, tier) => sum + tier.maxPoints, 0);
  const useFullTier = Boolean(options.fullBudget) && budget >= tierMaxTotal;
  const engravings = buildEngravingDimensions(options);

  const dimensions = [
    { key: "tier1", label: "1T", options: buildTier1Options(sourceState, options, modeledStatKeys, useFullTier) },
    {
      key: "pet",
      label: "펫",
      options: options.petSearch
        ? OPTIMIZER_PET_OPTIONS.map(pet => ({ kind: "pet", pet }))
        : [{ kind: "pet", pet: sourceState.convenience?.petStat || "none" }],
    },
  ];

  ["진화 2", "진화 3", "진화 4", "진화 5"].forEach(tier => {
    dimensions.push({ key: tier, label: EVOLUTION_TIERS[tier].label, options: buildTierOptions(tier, modeledStatKeys, useFullTier) });
  });

  engravings.dimensions.forEach(dimension => dimensions.push(dimension));

  return {
    dimensions,
    budget,
    useFullTier,
    budgetBelowTierMax: budget < tierMaxTotal,
    engravings,
    skippedNodes: NODE_LIBRARY.filter(node => !isNodeImpactful(node, modeledStatKeys)),
    totalCombos: dimensions.reduce((product, dimension) => product * dimension.options.length, 1),
  };
}

// --- evaluator --------------------------------------------------------------

export function buildEvaluator(sourceState, searchedEngravingIds) {
  const convenience = { ...DEFAULT_STATE.convenience, ...(sourceState.convenience || {}) };
  const manaShare = getManaShareRatio(convenience);
  const settings = sourceState.settings;
  const specDamagePer100 = readNumber(sourceState.base.specDamagePer100);
  const critDamageBonus = readNumber(sourceState.base.critDamageBonus);
  const accessories = normalizeAccessories(sourceState.accessories);
  const bracelet = normalizeBracelet(sourceState.bracelet);

  const baseStats = {
    critStat: readNumber(sourceState.base.critStat),
    specStat: readNumber(sourceState.base.specStat),
    swiftStat: readNumber(sourceState.base.swiftStat),
    dominationStat: readNumber(sourceState.base.dominationStat),
    enduranceStat: readNumber(sourceState.base.enduranceStat),
    expertiseStat: readNumber(sourceState.base.expertiseStat),
  };
  const basePercent = {
    critRate: readNumber(sourceState.base.baseCritRate),
    critDamage: 0, attackSpeed: 0, attackSpeedOnly: 0, moveSpeedOnly: 0,
    cooldownReduction: 0, cooldownIncrease: 0, manaCooldownReduction: 0,
    skillCooldownReduction: 0, critOnlyDamage: 0,
  };
  const baseDamage = {};

  (sourceState.baseEffects || []).forEach(effect => applyBaseEffect(effect, basePercent, baseDamage));

  const accessoryBonuses = calculateAccessoryBonuses(accessories);
  basePercent.critRate += accessoryBonuses.critRate;
  basePercent.critDamage += accessoryBonuses.critDamage;
  addDamageGroup(baseDamage, "추가 피해", accessoryBonuses.additionalDamage);
  addDamageGroup(baseDamage, "진화형 피해", clamp(Math.round(readNumber(convenience.evolutionKarmaRank)), 0, 6));

  if (convenience.feast) basePercent.attackSpeed += ARC_PASSIVE_CONSTANTS.feastSpeed;
  if (settings.backAttack) {
    basePercent.critRate += ARC_PASSIVE_CONSTANTS.backAttackCritRate;
    addDamageGroup(baseDamage, "주는 피해", ARC_PASSIVE_CONSTANTS.backAttackDamage);
  }
  if (settings.headAttack) addDamageGroup(baseDamage, "헤드어택 피해", ARC_PASSIVE_CONSTANTS.headAttackDamage);

  applyArkGridEffects(sourceState.arkGrid, basePercent, baseDamage);
  applyCollectionEffects(sourceState.collection, baseStats, baseDamage);
  applyWeaponEffects(sourceState.weapon, baseDamage);
  applyBraceletEffects(bracelet, settings, baseStats, basePercent, baseDamage);

  const baseEngravingSpecials = { critRateMinimum: 0, raidCaptainRate: 0 };
  ENGRAVING_LIBRARY.forEach(item => {
    if (searchedEngravingIds.has(item.id)) return;
    const tierIndex = getEngravingTierIndex(sourceState.engravings?.[item.id]);
    if (tierIndex < 0) return;
    applyEngravingTier(item, tierIndex, basePercent, baseDamage, baseEngravingSpecials, manaShare, settings);
  });

  const contributions = new Map();
  NODE_LIBRARY.forEach(node => {
    const contribution = { cost: getNodeCost(node), stats: [], percent: [], damage: [], critOnly: 0, specials: [] };
    node.effects.forEach(effect => {
      if (effect.kind === "note") return;
      if (effect.kind === "special") { contribution.specials.push(effect.key); return; }
      const amount = readNumber(effect.amount) * (effect.manaOnly ? manaShare : 1);
      if (amount === 0) return;
      if (effect.kind === "stat") contribution.stats.push([effect.key, amount]);
      else if (effect.kind === "damage") contribution.damage.push([effect.key, amount]);
      else if (effect.kind === "critOnlyDamage") contribution.critOnly += amount;
      else contribution.percent.push([effect.key, amount]);
    });
    contributions.set(node.id, contribution);
  });

  return function evaluate(picks) {
    const totalStats = { ...baseStats };
    const percentBonuses = { ...basePercent };
    const damageGroups = { ...baseDamage };
    const specials = { bluntThorn: 0, sonicBreakthrough: 0 };
    const engravingSpecials = { ...baseEngravingSpecials };
    let pointsUsed = 0;
    let goddessLevel = 0;

    for (let i = 0; i < picks.length; i += 1) {
      const pick = picks[i];
      if (!pick) continue;

      if (pick.kind === "pet") {
        if (Object.hasOwn(totalStats, pick.pet)) totalStats[pick.pet] += ARC_PASSIVE_CONSTANTS.petStatBonus;
        continue;
      }

      if (pick.kind === "engravingSet") {
        for (let j = 0; j < pick.active.length; j += 1) {
          const entry = pick.active[j];
          applyEngravingTier(entry.item, entry.tierIndex, percentBonuses, damageGroups, engravingSpecials, manaShare, settings);
        }
        continue;
      }

      pointsUsed += pick.points;
      goddessLevel += pick.goddessLevel;
      for (let j = 0; j < pick.levels.length; j += 1) {
        const [nodeId, level] = pick.levels[j];
        const contribution = contributions.get(nodeId);
        for (let k = 0; k < contribution.stats.length; k += 1) {
          const [key, amount] = contribution.stats[k];
          totalStats[key] = readNumber(totalStats[key]) + amount * level;
        }
        for (let k = 0; k < contribution.percent.length; k += 1) {
          const [key, amount] = contribution.percent[k];
          percentBonuses[key] = readNumber(percentBonuses[key]) + amount * level;
        }
        for (let k = 0; k < contribution.damage.length; k += 1) {
          const [key, amount] = contribution.damage[k];
          addDamageGroup(damageGroups, key, amount * level);
        }
        if (contribution.critOnly !== 0) percentBonuses.critOnlyDamage += contribution.critOnly * level;
        for (let k = 0; k < contribution.specials.length; k += 1) {
          const key = contribution.specials[k];
          specials[key] = Math.max(specials[key] || 0, level);
        }
      }
    }

    if (convenience.goddessBlessing) {
      percentBonuses.attackSpeed += Math.max(0, ARC_PASSIVE_CONSTANTS.goddessBlessingSpeed - goddessLevel * 3);
    }

    return finalizeMetrics({
      settings, specDamagePer100, critDamageBonus,
      totalStats, percentBonuses, damageGroups, specials, engravingSpecials,
      pointsUsed, accessoryBonuses,
    });
  };
}

// --- result snapshots -------------------------------------------------------

function buildResultEntry(picks, metrics, plan, baseEngravings) {
  const nodeLevels = emptyNodeLevels();
  const engravings = { ...baseEngravings };
  let pet = "none";

  picks.forEach(pick => {
    if (!pick) return;
    if (pick.kind === "pet") { pet = pick.pet; return; }
    if (pick.kind === "engravingSet") {
      plan.engravings.controlledIds.forEach(id => delete engravings[id]);
      pick.active.forEach(entry => { engravings[entry.item.id] = ENGRAVING_TIERS[entry.tierIndex].value; });
      return;
    }
    pick.levels.forEach(([nodeId, level]) => { nodeLevels[nodeId] = level; });
  });

  const signature = [
    NODE_LIBRARY.map(node => nodeLevels[node.id]).join(","),
    pet,
    plan.engravings.controlledIds.map(id => engravings[id] || "none").join(","),
  ].join("|");

  return {
    id: signature, signature, nodeLevels, pet, engravings,
    damageIndex: metrics.damageIndex,
    dpsIndex: metrics.dpsIndex,
    pointsUsed: metrics.pointsUsed,
    critRateCapped: metrics.critRateCapped,
    critDamage: metrics.critDamage,
    cooldownReduction: metrics.cooldownReduction,
    attackMoveSpeed: metrics.attackMoveSpeed,
  };
}

function offerResult(context, picks, metrics) {
  const wantedByRanking = metrics.damageIndex > context.damageTop.threshold
    || metrics.dpsIndex > context.dpsTop.threshold;
  const wantedByPareto = context.pareto.accepts(metrics.damageIndex, metrics.dpsIndex);
  if (!wantedByRanking && !wantedByPareto) return;

  const entry = buildResultEntry(picks, metrics, context.plan, context.baseEngravings);
  if (wantedByRanking) {
    context.damageTop.offer(entry);
    context.dpsTop.offer(entry);
  }
  if (wantedByPareto) context.pareto.offer(entry);
}

// --- drivers ----------------------------------------------------------------

// setTimeout is throttled to ~1s in a background tab, which stretches a 3s
// search into 20s+ the moment the user switches away. MessageChannel is not
// throttled, so it stays responsive either way.
const yieldChannel = typeof MessageChannel === "function" ? new MessageChannel() : null;
let yieldQueue = [];

if (yieldChannel) {
  yieldChannel.port1.onmessage = () => {
    const pending = yieldQueue;
    yieldQueue = [];
    for (const resolve of pending) resolve();
  };
}

function nextTick() {
  if (!yieldChannel) return new Promise(resolve => setTimeout(resolve, 0));
  return new Promise(resolve => {
    yieldQueue.push(resolve);
    yieldChannel.port2.postMessage(null);
  });
}

async function runExhaustive(context, report, isCancelled) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  const indexes = new Array(dimensions.length).fill(0);
  const picks = dimensions.map(dimension => dimension.options[0]);
  const total = plan.totalCombos;
  const clock = createChunkClock();

  for (let counter = 0; counter < total; counter += 1) {
    let points = 0;
    for (let i = 0; i < picks.length; i += 1) if (picks[i].kind === "nodes") points += picks[i].points;

    if (points <= plan.budget) {
      const metrics = evaluate(picks);
      context.evaluated += 1;
      offerResult(context, picks, metrics);
    }

    if (clock.expired()) {
      report({ phase: "전수 탐색", progress: counter / total, evaluated: context.evaluated });
      await nextTick();
      if (isCancelled()) return;
      clock.reset();
    }

    let dimension = dimensions.length - 1;
    while (dimension >= 0) {
      indexes[dimension] += 1;
      if (indexes[dimension] < dimensions[dimension].options.length) {
        picks[dimension] = dimensions[dimension].options[indexes[dimension]];
        break;
      }
      indexes[dimension] = 0;
      picks[dimension] = dimensions[dimension].options[0];
      dimension -= 1;
    }
    if (dimension < 0) break;
  }
}

async function runBeam(context, report, isCancelled, beamWidth) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  let beam = [{ indexes: [], points: 0 }];

  for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
    const dimension = dimensions[dimensionIndex];
    const candidates = [];
    const clock = createChunkClock();
    const stepBeam = Math.max(20, Math.floor(OPTIMIZER_MAX_EXPANSIONS / dimension.options.length));
    const sources = beam.length > stepBeam ? beam.slice(0, stepBeam) : beam;

    for (let beamIndex = 0; beamIndex < sources.length; beamIndex += 1) {
      const item = sources[beamIndex];
      for (let optionIndex = 0; optionIndex < dimension.options.length; optionIndex += 1) {
        const option = dimension.options[optionIndex];
        const points = item.points + (option.kind === "nodes" ? option.points : 0);
        if (points > plan.budget) continue;

        const indexes = item.indexes.concat(optionIndex);
        const picks = indexes.map((index, i) => dimensions[i].options[index]);
        const metrics = evaluate(picks);
        context.evaluated += 1;
        candidates.push({ indexes, points, damageIndex: metrics.damageIndex, dpsIndex: metrics.dpsIndex });
        if (dimensionIndex === dimensions.length - 1) offerResult(context, picks, metrics);

        if (clock.expired()) {
          report({ phase: `빔 탐색 ${dimension.label}`, progress: dimensionIndex / (dimensions.length + 1), evaluated: context.evaluated });
          await nextTick();
          if (isCancelled()) return;
          clock.reset();
        }
      }
    }

    if (candidates.length === 0) return;

    beam = selectBeam(candidates, beamWidth);
    report({ phase: `빔 탐색 ${dimension.label}`, progress: (dimensionIndex + 1) / (dimensions.length + 1), evaluated: context.evaluated });
    await nextTick();
    if (isCancelled()) return;
  }

  await refine(context, beam, report, isCancelled);
}

// Beam search commits to prefixes before later tiers are known, so walk the best
// finishers back through every dimension until no single swap helps.
async function refine(context, beam, report, isCancelled) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  const seeds = [
    ...beam.slice().sort((a, b) => b.damageIndex - a.damageIndex).slice(0, OPTIMIZER_REFINE_SEEDS),
    ...beam.slice().sort((a, b) => b.dpsIndex - a.dpsIndex).slice(0, OPTIMIZER_REFINE_SEEDS),
  ];
  const ceiling = context.evaluated + OPTIMIZER_REFINE_BUDGET;
  const clock = createChunkClock();

  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    if (context.evaluated >= ceiling) return;

    for (const metricKey of ["damageIndex", "dpsIndex"]) {
      const indexes = seeds[seedIndex].indexes.slice();
      let best = evaluate(indexes.map((index, i) => dimensions[i].options[index]))[metricKey];
      context.evaluated += 1;

      for (let round = 0; round < OPTIMIZER_REFINE_ROUNDS; round += 1) {
        let improved = false;

        for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
          const dimension = dimensions[dimensionIndex];
          const original = indexes[dimensionIndex];
          let bestOption = original;

          for (let optionIndex = 0; optionIndex < dimension.options.length; optionIndex += 1) {
            if (optionIndex === original) continue;
            indexes[dimensionIndex] = optionIndex;
            const picks = indexes.map((index, i) => dimensions[i].options[index]);
            const points = picks.reduce((sum, pick) => sum + (pick.kind === "nodes" ? pick.points : 0), 0);
            if (points > plan.budget) continue;

            const metrics = evaluate(picks);
            context.evaluated += 1;
            offerResult(context, picks, metrics);
            if (metrics[metricKey] > best) {
              best = metrics[metricKey];
              bestOption = optionIndex;
              improved = true;
            }

            if (clock.expired()) {
              report({ phase: "정밀 보정", progress: 0.9, evaluated: context.evaluated });
              await nextTick();
              if (isCancelled()) return;
              clock.reset();
            }
          }
          indexes[dimensionIndex] = bestOption;
        }
        if (!improved) break;
      }

      const finalPicks = indexes.map((index, i) => dimensions[i].options[index]);
      context.evaluated += 1;
      offerResult(context, finalPicks, evaluate(finalPicks));
    }
  }
}

/**
 * Runs the combination search.
 * @param {object} sourceState fixed character state
 * @param {object} options search scope (see SEARCH_DEFAULTS)
 * @param {(p: {phase: string, progress: number, evaluated: number}) => void} [onProgress]
 * @param {() => boolean} [isCancelled]
 */
export async function runSearch(sourceState, options, onProgress = () => {}, isCancelled = () => false) {
  const settings = { ...SEARCH_DEFAULTS, ...options };
  const plan = buildSearchPlan(sourceState, settings);

  if (plan.engravings.overflow) {
    return { error: "engravingOverflow", plan, damage: [], dps: [], pareto: [], evaluated: 0, exhaustive: false };
  }

  const limit = clamp(Math.round(readNumber(settings.resultLimit)), 1, 50);
  const context = {
    plan,
    evaluate: buildEvaluator(sourceState, new Set(plan.engravings.controlledIds)),
    baseEngravings: sourceState.engravings || {},
    damageTop: createTopList(limit, "damageIndex"),
    dpsTop: createTopList(limit, "dpsIndex"),
    pareto: createParetoFront(),
    evaluated: 0,
  };

  const exhaustive = settings.mode === "exhaustive"
    || (settings.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT);

  const startedAt = Date.now();
  if (exhaustive) await runExhaustive(context, onProgress, isCancelled);
  else await runBeam(context, onProgress, isCancelled, clamp(Math.round(readNumber(settings.beamWidth)), 10, 5000));

  return {
    error: null,
    plan,
    exhaustive,
    evaluated: context.evaluated,
    elapsedMs: Date.now() - startedAt,
    cancelled: isCancelled(),
    damage: context.damageTop.items.slice(),
    dps: context.dpsTop.items.slice(),
    pareto: annotateParetoKnees(context.pareto.items.slice()),
  };
}
