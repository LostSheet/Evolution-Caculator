const OPTIMIZER_STORAGE_KEY = "ark-passive-simulator-optimizer-v1";
// ~1us per combination, so this caps an automatic exhaustive run at roughly 5s.
const OPTIMIZER_EXHAUSTIVE_LIMIT = 5000000;
// Yield on a wall-clock budget, not an iteration count: a throttled timer costs
// far more than a chunk of work, so a fixed count collapses throughput.
const OPTIMIZER_CHUNK_MS = 28;
const OPTIMIZER_CLOCK_INTERVAL = 2000;
const OPTIMIZER_REFINE_ROUNDS = 3;
const OPTIMIZER_REFINE_SEEDS = 24;
// A big dimension (engraving sets can reach C(21,5) = 20,349) would otherwise
// cost beamWidth × options per step, so the beam is narrowed for that step and
// refinement stops once it has spent its budget.
const OPTIMIZER_MAX_EXPANSIONS = 800000;
const OPTIMIZER_REFINE_BUDGET = 800000;
const OPTIMIZER_PET_OPTIONS = ["none", "critStat", "specStat", "swiftStat"];
const OPTIMIZER_PET_LABELS = {
  none: "펫 없음",
  critStat: "펫 치명",
  specStat: "펫 특화",
  swiftStat: "펫 신속",
};
const OPTIMIZER_TIER1_STEPS = { step10: 10, step5: 5, step2: 2 };
const OPTIMIZER_ENGRAVING_ROLES = ["locked", "candidate", "excluded"];
const OPTIMIZER_ROLE_LABELS = { locked: "고정", candidate: "후보", excluded: "제외" };
const DIRECTION_REQUIREMENT_LABELS = {
  backAttack: "백어택을 켜야 적용",
  headAttack: "헤드어택을 켜야 적용",
  nonDirectional: "백어택·헤드어택을 모두 꺼야 적용",
};

const OPTIMIZER_DEFAULTS = {
  tier1Mode: "step10",
  petSearch: true,
  engravingSlots: "5",
  engravingRoles: {},
  engravingTiers: {},
  fullBudget: true,
  mode: "auto",
  beamWidth: 600,
  resultLimit: 20,
  metric: "damage",
};

let optimizerOptions = loadOptimizerOptions();
let optimizerResults = null;
let optimizerRunToken = 0;
let optimizerRunning = false;

const optimizerDom = {
  panel: $("#optimizerPanel"),
  spaceHint: $("#optimizerSpaceHint"),
  status: $("#optimizerStatus"),
  progressFill: $("#optimizerProgressFill"),
  run: $("#runOptimizer"),
  cancel: $("#cancelOptimizer"),
  tabs: $("#optimizerTabs"),
  results: $("#optimizerResults"),
  note: $("#optimizerNote"),
  openEngravingPool: $("#openEngravingPool"),
  engravingPoolDialog: $("#engravingPoolDialog"),
  engravingPoolList: $("#engravingPoolList"),
  engravingPoolSummary: $("#engravingPoolSummary"),
};

initOptimizer();

function initOptimizer() {
  if (!optimizerDom.panel) return;

  $$("[data-optimizer-option]").forEach(input => {
    input.addEventListener("change", () => {
      const key = input.dataset.optimizerOption;
      optimizerOptions[key] = input.type === "checkbox" ? input.checked : input.value;
      if (key === "beamWidth" || key === "resultLimit") {
        optimizerOptions[key] = clamp(Math.round(readNumber(input.value)), 1, key === "beamWidth" ? 5000 : 50);
      }
      persistOptimizerOptions();
      syncOptimizerPanel();
    });
  });

  optimizerDom.run.addEventListener("click", () => {
    runOptimizerSearch();
  });

  optimizerDom.cancel.addEventListener("click", () => {
    optimizerRunToken += 1;
    optimizerRunning = false;
    setOptimizerStatus("탐색을 중지했습니다.");
    syncOptimizerControls();
  });

  optimizerDom.tabs.addEventListener("click", event => {
    const button = event.target.closest("[data-optimizer-metric]");
    if (!button) return;
    optimizerOptions.metric = button.dataset.optimizerMetric;
    persistOptimizerOptions();
    syncOptimizerPanel();
  });

  optimizerDom.results.addEventListener("click", event => {
    const button = event.target.closest("[data-optimizer-apply]");
    if (!button) return;
    applyOptimizerResult(button.dataset.optimizerApply);
  });

  optimizerDom.openEngravingPool.addEventListener("click", () => {
    if (!optimizerDom.engravingPoolDialog.open) optimizerDom.engravingPoolDialog.showModal();
  });

  optimizerDom.engravingPoolDialog.addEventListener("change", event => {
    const roleSelect = event.target.closest("[data-engraving-role]");
    if (roleSelect) {
      optimizerOptions.engravingRoles = { ...optimizerOptions.engravingRoles, [roleSelect.dataset.engravingRole]: roleSelect.value };
    }
    const tierSelect = event.target.closest("[data-engraving-search-tier]");
    if (tierSelect) {
      optimizerOptions.engravingTiers = { ...optimizerOptions.engravingTiers, [tierSelect.dataset.engravingSearchTier]: tierSelect.value };
    }
    if (!roleSelect && !tierSelect) return;
    persistOptimizerOptions();
    syncOptimizerPanel();
  });

  optimizerDom.engravingPoolDialog.addEventListener("click", event => {
    const preset = event.target.closest("[data-engraving-preset]");
    if (!preset) return;
    event.preventDefault();
    applyEngravingPreset(preset.dataset.engravingPreset);
  });

  renderEngravingPoolList();
  syncOptimizerPanel();
}

function applyEngravingPreset(preset) {
  const roles = {};
  getModeledEngravings().forEach(item => {
    if (preset === "raid") roles[item.id] = defaultEngravingRole(item);
    else if (preset === "allCandidate") roles[item.id] = "candidate";
    else if (preset === "allExcluded") roles[item.id] = "excluded";
    else if (preset === "fromCurrent") {
      roles[item.id] = getEngravingTierIndex(state.engravings?.[item.id]) >= 0 ? "locked" : "excluded";
    }
  });

  optimizerOptions.engravingRoles = roles;

  if (preset === "fromCurrent") {
    const tiers = { ...optimizerOptions.engravingTiers };
    getModeledEngravings().forEach(item => {
      const value = state.engravings?.[item.id];
      if (getEngravingTierIndex(value) >= 0) tiers[item.id] = value;
    });
    optimizerOptions.engravingTiers = tiers;
  }

  persistOptimizerOptions();
  syncOptimizerPanel();
}

function renderEngravingPoolList() {
  if (!optimizerDom.engravingPoolList) return;

  optimizerDom.engravingPoolList.replaceChildren(...getModeledEngravings().map(item => {
    const row = document.createElement("div");
    row.className = "engraving-pool-row";
    row.dataset.engravingPoolRow = item.id;

    row.innerHTML = `
      <div class="engraving-pool-name">
        <strong>${escapeHtml(item.name)}</strong>
        <small class="engraving-pool-note"></small>
      </div>
    `;

    const roleSelect = document.createElement("select");
    roleSelect.dataset.engravingRole = item.id;
    roleSelect.setAttribute("aria-label", `${item.name} 탐색 역할`);
    OPTIMIZER_ENGRAVING_ROLES.forEach(role => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = OPTIMIZER_ROLE_LABELS[role];
      roleSelect.appendChild(option);
    });
    row.appendChild(roleSelect);

    const tierSelect = document.createElement("select");
    tierSelect.dataset.engravingSearchTier = item.id;
    tierSelect.setAttribute("aria-label", `${item.name} 단계`);
    ENGRAVING_TIERS.forEach(tier => {
      const option = document.createElement("option");
      option.value = tier.value;
      option.textContent = tier.label;
      tierSelect.appendChild(option);
    });
    row.appendChild(tierSelect);

    return row;
  }));
}

function syncEngravingPoolList() {
  if (!optimizerDom.engravingPoolList) return;

  getModeledEngravings().forEach(item => {
    const role = getEngravingRole(item);
    const row = $(`[data-engraving-pool-row="${item.id}"]`);
    if (!row) return;

    const tierIndex = getEngravingSearchTierIndex(item);
    const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
    row.dataset.role = role;
    row.classList.toggle("condition-inactive", role !== "excluded" && !conditionActive);
    $(`[data-engraving-role="${item.id}"]`, row).value = role;

    const tierSelect = $(`[data-engraving-search-tier="${item.id}"]`, row);
    tierSelect.value = ENGRAVING_TIERS[tierIndex].value;
    tierSelect.disabled = role === "excluded";

    $(".engraving-pool-note", row).textContent = conditionActive
      ? (NON_RAID_ENGRAVINGS.get(item.id) || item.tierSummaries[tierIndex])
      : `${DIRECTION_REQUIREMENT_LABELS[item.condition]} · 현재 효과 없음`;
  });

  const engravings = buildEngravingDimensions();
  const optionCount = engravings.dimensions[0]?.options.length || 0;
  optimizerDom.engravingPoolSummary.textContent = optimizerOptions.engravingSlots === "fixed"
    ? "각인 슬롯이 '고정'이라 탐색하지 않습니다"
    : `${engravings.slots}슬롯 · 고정 ${engravings.locked.length} · 후보 ${engravings.candidates.length} → ${formatInteger(optionCount)}가지`;
  optimizerDom.engravingPoolSummary.classList.toggle("over", engravings.overflow);
}

function loadOptimizerOptions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPTIMIZER_STORAGE_KEY));
    return { ...OPTIMIZER_DEFAULTS, ...(parsed || {}) };
  } catch {
    return { ...OPTIMIZER_DEFAULTS };
  }
}

function persistOptimizerOptions() {
  localStorage.setItem(OPTIMIZER_STORAGE_KEY, JSON.stringify(optimizerOptions));
}

// ---------------------------------------------------------------------------
// Search space
// ---------------------------------------------------------------------------

function getModeledStatKeys(sourceState) {
  const keys = new Set(["critStat", "swiftStat"]);
  if (readNumber(sourceState.base.specDamagePer100) !== 0) keys.add("specStat");
  return keys;
}

function isNodeImpactful(node, modeledStatKeys) {
  return node.effects.some(effect => {
    if (effect.kind === "note") return false;
    if (effect.kind === "stat") return modeledStatKeys.has(effect.key);
    return true;
  });
}

function enumerateNodeCombos(nodes, cost, maxPoints, step) {
  const combos = [];
  const levels = new Array(nodes.length).fill(0);

  const walk = (index, used) => {
    if (index === nodes.length) {
      const picked = [];
      let goddessLevel = 0;
      for (let i = 0; i < nodes.length; i += 1) {
        if (levels[i] <= 0) continue;
        picked.push([nodes[i].id, levels[i]]);
        if (nodes[i].id === "e2-goddess-blessing") goddessLevel = levels[i];
      }
      combos.push({ kind: "nodes", levels: picked, points: used, goddessLevel });
      return;
    }

    const node = nodes[index];
    const affordable = Math.min(node.maxLevel, Math.floor((maxPoints - used) / cost));
    for (let level = 0; level <= affordable; level += step) {
      levels[index] = level;
      walk(index + 1, used + level * cost);
    }
    levels[index] = 0;
  };

  walk(0, 0);
  return combos;
}

function keepFullBudgetCombos(combos) {
  const best = combos.reduce((max, combo) => Math.max(max, combo.points), 0);
  const filtered = combos.filter(combo => combo.points === best);
  return filtered.length > 0 ? filtered : combos;
}

function buildTier1Options(sourceState, modeledStatKeys, useFullTier) {
  const tier = "진화 1";
  const tierInfo = EVOLUTION_TIERS[tier];
  const tierNodes = NODE_LIBRARY.filter(node => node.tier === tier);

  if (optimizerOptions.tier1Mode === "fixed") {
    const picked = tierNodes
      .map(node => [node.id, clamp(Math.round(readNumber(sourceState.nodeLevels?.[node.id])), 0, node.maxLevel)])
      .filter(entry => entry[1] > 0);
    const points = picked.reduce((sum, entry) => sum + entry[1] * tierInfo.cost, 0);
    return [{ kind: "nodes", levels: picked, points, goddessLevel: 0 }];
  }

  const step = OPTIMIZER_TIER1_STEPS[optimizerOptions.tier1Mode] || 10;
  const searchNodes = tierNodes.filter(node => isNodeImpactful(node, modeledStatKeys));
  const combos = enumerateNodeCombos(searchNodes, tierInfo.cost, tierInfo.maxPoints, step);
  return useFullTier ? keepFullBudgetCombos(combos) : combos;
}

function buildTierOptions(tier, modeledStatKeys, useFullTier) {
  const tierInfo = EVOLUTION_TIERS[tier];
  const searchNodes = NODE_LIBRARY
    .filter(node => node.tier === tier)
    .filter(node => isNodeImpactful(node, modeledStatKeys));
  const combos = enumerateNodeCombos(searchNodes, tierInfo.cost, tierInfo.maxPoints, 1);
  return useFullTier ? keepFullBudgetCombos(combos) : combos;
}

// Every engraving the calculator models is one of: 고정(always slotted),
// 후보(the search picks among these), 제외(never slotted).
function getModeledEngravings() {
  return ENGRAVING_LIBRARY.filter(item => item.effects.length > 0);
}

function defaultEngravingRole(item) {
  return NON_RAID_ENGRAVINGS.has(item.id) ? "excluded" : "candidate";
}

function getEngravingRole(item) {
  const role = optimizerOptions.engravingRoles?.[item.id];
  return OPTIMIZER_ENGRAVING_ROLES.includes(role) ? role : defaultEngravingRole(item);
}

function getEngravingSearchTierIndex(item) {
  const index = getEngravingTierIndex(optimizerOptions.engravingTiers?.[item.id]);
  return index >= 0 ? index : ENGRAVING_TIERS.length - 1;
}

function toEngravingEntry(item) {
  return { item, tierIndex: getEngravingSearchTierIndex(item) };
}

function enumerateEngravingSets(candidates, pickCount, locked) {
  const options = [];
  const chosen = [];

  const walk = index => {
    if (chosen.length === pickCount) {
      options.push({ kind: "engravingSet", active: locked.concat(chosen) });
      return;
    }
    if (index >= candidates.length) return;
    if (candidates.length - index < pickCount - chosen.length) return;

    chosen.push(candidates[index]);
    walk(index + 1);
    chosen.pop();
    walk(index + 1);
  };

  walk(0);
  return options;
}

function buildEngravingDimensions() {
  const modeled = getModeledEngravings();
  const empty = {
    locked: [], candidates: [], slots: 0, pickCount: 0, overflow: false,
    controlledIds: [], dimensions: [],
  };
  if (optimizerOptions.engravingSlots === "fixed") return empty;

  const locked = modeled.filter(item => getEngravingRole(item) === "locked").map(toEngravingEntry);
  const candidates = modeled.filter(item => getEngravingRole(item) === "candidate").map(toEngravingEntry);
  const slots = clamp(Math.round(readNumber(optimizerOptions.engravingSlots)), 1, 5);
  const controlledIds = modeled.map(item => item.id);

  if (locked.length > slots) {
    return { ...empty, locked, candidates, slots, overflow: true, controlledIds };
  }

  const pickCount = Math.min(slots - locked.length, candidates.length);
  const options = enumerateEngravingSets(candidates, pickCount, locked);

  return {
    locked,
    candidates,
    slots,
    pickCount,
    overflow: false,
    controlledIds,
    dimensions: [{ key: "engravingSet", label: "각인", options }],
  };
}

function buildSearchPlan(sourceState) {
  const modeledStatKeys = getModeledStatKeys(sourceState);
  const budget = Math.max(0, readNumber(sourceState.settings.pointBudget));
  const tierMaxTotal = Object.values(EVOLUTION_TIERS).reduce((sum, tier) => sum + tier.maxPoints, 0);
  const useFullTier = Boolean(optimizerOptions.fullBudget) && budget >= tierMaxTotal;
  const engravings = buildEngravingDimensions();

  const dimensions = [
    { key: "tier1", label: "1T", options: buildTier1Options(sourceState, modeledStatKeys, useFullTier) },
  ];

  if (optimizerOptions.petSearch) {
    dimensions.push({
      key: "pet",
      label: "펫",
      options: OPTIMIZER_PET_OPTIONS.map(pet => ({ kind: "pet", pet })),
    });
  } else {
    dimensions.push({
      key: "pet",
      label: "펫",
      options: [{ kind: "pet", pet: sourceState.convenience?.petStat || "none" }],
    });
  }

  ["진화 2", "진화 3", "진화 4", "진화 5"].forEach(tier => {
    dimensions.push({
      key: tier,
      label: EVOLUTION_TIERS[tier].label,
      options: buildTierOptions(tier, modeledStatKeys, useFullTier),
    });
  });

  engravings.dimensions.forEach(dimension => dimensions.push(dimension));

  const totalCombos = dimensions.reduce((product, dimension) => product * dimension.options.length, 1);

  return {
    dimensions,
    budget,
    useFullTier,
    budgetBelowTierMax: budget < tierMaxTotal,
    engravings,
    skippedNodes: NODE_LIBRARY.filter(node => !isNodeImpactful(node, modeledStatKeys)),
    totalCombos,
  };
}

// ---------------------------------------------------------------------------
// Fast evaluator — shares `finalizeMetrics` with the main calculator
// ---------------------------------------------------------------------------

function buildOptimizerEvaluator(sourceState, searchedEngravingIds) {
  const convenience = { ...DEFAULT_STATE.convenience, ...(sourceState.convenience || {}) };
  const manaShare = getManaShareRatio(convenience);
  const settings = sourceState.settings;
  const specDamagePer100 = readNumber(sourceState.base.specDamagePer100);
  const critDamageBonus = 0;
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
    critRate: 0,
    critDamage: 0,
    attackSpeed: 0,
    attackSpeedOnly: 0,
    moveSpeedOnly: 0,
    cooldownReduction: 0,
    cooldownIncrease: 0,
    manaCooldownReduction: 0,
    skillCooldownReduction: 0,
    critOnlyDamage: 0,
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
  if (settings.headAttack) {
    addDamageGroup(baseDamage, "헤드어택 피해", ARC_PASSIVE_CONSTANTS.headAttackDamage);
  }

  applyBraceletEffects(bracelet, settings, baseStats, basePercent, baseDamage);

  const baseEngravingSpecials = { critRateMinimum: 0, raidCaptainRate: 0 };
  ENGRAVING_LIBRARY.forEach(item => {
    if (searchedEngravingIds.has(item.id)) return;
    const tierIndex = getEngravingTierIndex(sourceState.engravings?.[item.id]);
    if (tierIndex < 0) return;
    applyEngravingTier(item, tierIndex, basePercent, baseDamage, baseEngravingSpecials, manaShare, settings);
  });

  const nodeContributions = new Map();
  NODE_LIBRARY.forEach(node => {
    const contribution = { cost: getNodeCost(node), stats: [], percent: [], damage: [], critOnly: 0, specials: [] };
    node.effects.forEach(effect => {
      if (effect.kind === "note") return;
      if (effect.kind === "special") {
        contribution.specials.push(effect.key);
        return;
      }
      const amount = readNumber(effect.amount) * (effect.manaOnly ? manaShare : 1);
      if (amount === 0) return;
      if (effect.kind === "stat") contribution.stats.push([effect.key, amount]);
      else if (effect.kind === "damage") contribution.damage.push([effect.key, amount]);
      else if (effect.kind === "critOnlyDamage") contribution.critOnly += amount;
      else contribution.percent.push([effect.key, amount]);
    });
    nodeContributions.set(node.id, contribution);
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
          applyEngravingTier(
            entry.item,
            entry.tierIndex,
            percentBonuses,
            damageGroups,
            engravingSpecials,
            manaShare,
            settings,
          );
        }
        continue;
      }

      pointsUsed += pick.points;
      goddessLevel += pick.goddessLevel;
      for (let j = 0; j < pick.levels.length; j += 1) {
        const [nodeId, level] = pick.levels[j];
        const contribution = nodeContributions.get(nodeId);
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
        if (contribution.critOnly !== 0) {
          percentBonuses.critOnlyDamage += contribution.critOnly * level;
        }
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
      settings,
      specDamagePer100,
      critDamageBonus,
      totalStats,
      percentBonuses,
      damageGroups,
      specials,
      engravingSpecials,
      pointsUsed,
      accessoryBonuses,
    });
  };
}

// ---------------------------------------------------------------------------
// Result collection
// ---------------------------------------------------------------------------

function createTopList(limit, key) {
  const items = [];
  const seen = new Set();
  let threshold = -Infinity;

  return {
    items,
    get threshold() {
      return items.length >= limit ? threshold : -Infinity;
    },
    offer(entry) {
      const score = entry[key];
      if (items.length >= limit && score <= threshold) return;
      if (seen.has(entry.signature)) return;
      seen.add(entry.signature);
      items.push(entry);
      items.sort((a, b) => b[key] - a[key]);
      if (items.length > limit) {
        const dropped = items.pop();
        seen.delete(dropped.signature);
      }
      threshold = items[items.length - 1][key];
    },
  };
}

// The two ranked lists only capture the ends of the tradeoff. This keeps the
// full non-dominated set so the curve between them — and its knees — survives.
// Invariant: sorted by damageIndex descending, which makes dpsIndex ascending.
function createParetoFront() {
  const items = [];

  // Largest index whose damageIndex beats `value`, or -1 when none does.
  // `strict` distinguishes "> value" (insert position) from ">= value"
  // (domination test); equal-damage entries must be handled differently by each.
  const floorIndex = (damageIndex, strict) => {
    let low = 0;
    let high = items.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const beats = strict ? items[mid].damageIndex > damageIndex : items[mid].damageIndex >= damageIndex;
      if (beats) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  };

  return {
    items,
    // Cheap rejection so a dominated point never allocates a snapshot. dpsIndex
    // ascends with index, so the last entry at or above this damage is the
    // strongest possible dominator.
    accepts(damageIndex, dpsIndex) {
      const floor = floorIndex(damageIndex, false);
      return floor < 0 || items[floor].dpsIndex < dpsIndex;
    },
    offer(entry) {
      const floor = floorIndex(entry.damageIndex, false);
      if (floor >= 0 && items[floor].dpsIndex >= entry.dpsIndex) return;

      // Everything from here on has damage <= the new entry, so the leading run
      // with dps <= the new entry is now dominated and drops out.
      const insertAt = floorIndex(entry.damageIndex, true) + 1;
      let removeCount = 0;
      while (insertAt + removeCount < items.length && items[insertAt + removeCount].dpsIndex <= entry.dpsIndex) {
        removeCount += 1;
      }
      items.splice(insertAt, removeCount, entry);
    },
  };
}

// Marginal exchange rate along the front. A spike means a setting that gives up
// little burst for a lot of DPS (or the reverse) — the point of the whole view.
function annotateParetoKnees(front) {
  const rates = front.map((item, index) => {
    if (index === 0) return 0;
    const previous = front[index - 1];
    const damageDrop = previous.damageIndex - item.damageIndex;
    if (damageDrop <= 0) return 0;
    return (item.dpsIndex - previous.dpsIndex) / damageDrop;
  });

  const scored = rates.filter((rate, index) => index > 0 && rate > 0);
  const median = scored.length > 0
    ? scored.slice().sort((a, b) => a - b)[Math.floor(scored.length / 2)]
    : 0;

  return front.map((item, index) => ({
    ...item,
    exchangeRate: rates[index],
    // Flagged when this step trades markedly better than the front's norm.
    isKnee: index > 0 && median > 0 && rates[index] >= median * 1.6,
  }));
}

function buildResultEntry(picks, metrics, plan) {
  const nodeLevels = emptyNodeLevels();
  const engravings = { ...(state.engravings || {}) };
  let pet = "none";

  picks.forEach(pick => {
    if (!pick) return;
    if (pick.kind === "pet") {
      pet = pick.pet;
      return;
    }
    if (pick.kind === "engravingSet") {
      // The search owns every modeled engraving, so clear them all and re-add
      // only what this option slotted in.
      plan.engravings.controlledIds.forEach(id => delete engravings[id]);
      pick.active.forEach(entry => {
        engravings[entry.item.id] = ENGRAVING_TIERS[entry.tierIndex].value;
      });
      return;
    }
    pick.levels.forEach(([nodeId, level]) => {
      nodeLevels[nodeId] = level;
    });
  });

  const signature = [
    NODE_LIBRARY.map(node => nodeLevels[node.id]).join(","),
    pet,
    plan.engravings.controlledIds.map(id => engravings[id] || "none").join(","),
  ].join("|");

  return {
    id: signature,
    signature,
    nodeLevels,
    pet,
    engravings,
    damageIndex: metrics.damageIndex,
    dpsIndex: metrics.dpsIndex,
    pointsUsed: metrics.pointsUsed,
    critRateCapped: metrics.critRateCapped,
    critDamage: metrics.critDamage,
    cooldownReduction: metrics.cooldownReduction,
  };
}

// ---------------------------------------------------------------------------
// Search drivers
// ---------------------------------------------------------------------------

// setTimeout is throttled to ~1s in a background tab, which would stretch a 3s
// search into 20s+ the moment the user switches away. MessageChannel is not.
const optimizerYieldChannel = typeof MessageChannel === "function" ? new MessageChannel() : null;
let optimizerYieldQueue = [];

if (optimizerYieldChannel) {
  optimizerYieldChannel.port1.onmessage = () => {
    const pending = optimizerYieldQueue;
    optimizerYieldQueue = [];
    pending.forEach(resolve => resolve());
  };
}

function nextFrame() {
  if (!optimizerYieldChannel) return new Promise(resolve => setTimeout(resolve, 0));
  return new Promise(resolve => {
    optimizerYieldQueue.push(resolve);
    optimizerYieldChannel.port2.postMessage(null);
  });
}

function createChunkClock() {
  let deadline = performance.now() + OPTIMIZER_CHUNK_MS;
  let sinceCheck = 0;

  return {
    // True once the current chunk has used its time budget.
    expired() {
      sinceCheck += 1;
      if (sinceCheck < OPTIMIZER_CLOCK_INTERVAL) return false;
      sinceCheck = 0;
      return performance.now() >= deadline;
    },
    reset() {
      sinceCheck = 0;
      deadline = performance.now() + OPTIMIZER_CHUNK_MS;
    },
  };
}

async function runOptimizerSearch() {
  if (optimizerRunning) return;

  const plan = buildSearchPlan(state);
  const nodeDimensions = plan.dimensions.filter(dimension => dimension.options[0]?.kind === "nodes");
  if (nodeDimensions.some(dimension => dimension.options.length === 0)) {
    setOptimizerStatus("탐색 가능한 조합이 없습니다.");
    return;
  }

  if (plan.engravings.overflow) {
    setOptimizerStatus(`고정 각인이 ${plan.engravings.locked.length}개인데 슬롯은 ${plan.engravings.slots}개입니다. 슬롯을 늘리거나 고정을 줄여 주세요.`);
    return;
  }

  const searchedEngravingIds = new Set(plan.engravings.controlledIds);
  const evaluate = buildOptimizerEvaluator(state, searchedEngravingIds);
  const limit = clamp(Math.round(readNumber(optimizerOptions.resultLimit)), 1, 50);
  const damageTop = createTopList(limit, "damageIndex");
  const dpsTop = createTopList(limit, "dpsIndex");
  const pareto = createParetoFront();

  const exhaustive = optimizerOptions.mode === "exhaustive"
    || (optimizerOptions.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT);

  optimizerRunToken += 1;
  const token = optimizerRunToken;
  optimizerRunning = true;
  optimizerResults = null;
  syncOptimizerControls();
  setOptimizerProgress(0);

  const context = {
    plan,
    evaluate,
    damageTop,
    dpsTop,
    pareto,
    token,
    evaluated: 0,
    skipped: 0,
    startedAt: performance.now(),
  };

  try {
    if (exhaustive) {
      await runExhaustiveSearch(context);
    } else {
      await runBeamSearch(context);
    }
  } catch (error) {
    setOptimizerStatus(`탐색 중 오류가 발생했습니다: ${error.message}`);
    optimizerRunning = false;
    syncOptimizerControls();
    return;
  }

  if (token !== optimizerRunToken) return;

  optimizerRunning = false;
  optimizerResults = {
    damage: damageTop.items.slice(),
    dps: dpsTop.items.slice(),
    pareto: annotateParetoKnees(pareto.items.slice()),
    evaluated: context.evaluated,
    exhaustive,
    plan,
    elapsed: performance.now() - context.startedAt,
    baseline: calculateMetrics(state),
  };
  setOptimizerProgress(1);
  syncOptimizerPanel();
}

function offerResult(context, picks, metrics) {
  const wantedByRanking = metrics.damageIndex > context.damageTop.threshold
    || metrics.dpsIndex > context.dpsTop.threshold;
  const wantedByPareto = context.pareto.accepts(metrics.damageIndex, metrics.dpsIndex);
  if (!wantedByRanking && !wantedByPareto) return;

  const entry = buildResultEntry(picks, metrics, context.plan);
  if (wantedByRanking) {
    context.damageTop.offer(entry);
    context.dpsTop.offer(entry);
  }
  if (wantedByPareto) context.pareto.offer(entry);
}

async function runExhaustiveSearch(context) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  const indexes = new Array(dimensions.length).fill(0);
  const picks = new Array(dimensions.length).fill(null);
  const total = plan.totalCombos;
  const clock = createChunkClock();

  for (let i = 0; i < dimensions.length; i += 1) {
    picks[i] = dimensions[i].options[0];
  }

  for (let counter = 0; counter < total; counter += 1) {
    let points = 0;
    for (let i = 0; i < picks.length; i += 1) {
      if (picks[i].kind === "nodes") points += picks[i].points;
    }

    if (points <= plan.budget) {
      const metrics = evaluate(picks);
      context.evaluated += 1;
      offerResult(context, picks, metrics);
    } else {
      context.skipped += 1;
    }

    if (clock.expired()) {
      setOptimizerProgress(counter / total);
      setOptimizerStatus(`전수 탐색 ${formatInteger(counter)} / ${formatInteger(total)}`);
      await nextFrame();
      if (context.token !== optimizerRunToken) return;
      clock.reset();
    }

    // Odometer step.
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

  setOptimizerStatus(`전수 탐색 완료 · ${formatInteger(context.evaluated)}개 조합 평가`);
}

async function runBeamSearch(context) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  const beamWidth = clamp(Math.round(readNumber(optimizerOptions.beamWidth)), 10, 5000);
  let beam = [{ indexes: [], points: 0 }];

  for (let dimensionIndex = 0; dimensionIndex < dimensions.length; dimensionIndex += 1) {
    const dimension = dimensions[dimensionIndex];
    const candidates = [];
    const clock = createChunkClock();
    // Keep beam × options bounded no matter how wide this dimension is.
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
          setOptimizerStatus(`빔 탐색 ${dimension.label} 단계 · ${formatInteger(context.evaluated)}개 평가`);
          await nextFrame();
          if (context.token !== optimizerRunToken) return;
          clock.reset();
        }
      }
    }

    if (candidates.length === 0) {
      setOptimizerStatus("포인트 예산 안에서 만들 수 있는 조합이 없습니다.");
      return;
    }

    beam = selectBeam(candidates, beamWidth);
    setOptimizerProgress((dimensionIndex + 1) / (dimensions.length + 1));
    setOptimizerStatus(`빔 탐색 ${dimension.label} 단계 완료 · ${formatInteger(context.evaluated)}개 평가`);
    await nextFrame();
    if (context.token !== optimizerRunToken) return;
  }

  await refineBeamResults(context, beam);
  setOptimizerStatus(`빔 탐색 완료 · ${formatInteger(context.evaluated)}개 조합 평가`);
}

function selectBeam(candidates, beamWidth) {
  const half = Math.max(1, Math.floor(beamWidth / 2));
  const byDamage = candidates.slice().sort((a, b) => b.damageIndex - a.damageIndex).slice(0, half);
  const byDps = candidates.slice().sort((a, b) => b.dpsIndex - a.dpsIndex).slice(0, half);
  const merged = [];
  const seen = new Set();

  [...byDamage, ...byDps].forEach(item => {
    const key = item.indexes.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
}

// Beam search commits to prefixes before the later tiers are known, so walk the
// best finishers back through every dimension until no single swap helps.
async function refineBeamResults(context, beam) {
  const { plan, evaluate } = context;
  const dimensions = plan.dimensions;
  const seeds = [
    ...beam.slice().sort((a, b) => b.damageIndex - a.damageIndex).slice(0, OPTIMIZER_REFINE_SEEDS),
    ...beam.slice().sort((a, b) => b.dpsIndex - a.dpsIndex).slice(0, OPTIMIZER_REFINE_SEEDS),
  ];

  const budgetCeiling = context.evaluated + OPTIMIZER_REFINE_BUDGET;
  const clock = createChunkClock();

  for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    if (context.evaluated >= budgetCeiling) return;

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
              setOptimizerStatus(`후보 정밀 보정 ${formatInteger(seedIndex + 1)} / ${formatInteger(seeds.length)}`);
              await nextFrame();
              if (context.token !== optimizerRunToken) return;
              clock.reset();
            }
          }

          indexes[dimensionIndex] = bestOption;
        }

        if (!improved) break;
      }

      const finalPicks = indexes.map((index, i) => dimensions[i].options[index]);
      const finalMetrics = evaluate(finalPicks);
      context.evaluated += 1;
      offerResult(context, finalPicks, finalMetrics);
    }

    setOptimizerStatus(`후보 정밀 보정 ${formatInteger(seedIndex + 1)} / ${formatInteger(seeds.length)}`);
    await nextFrame();
    if (context.token !== optimizerRunToken) return;
  }
}

// ---------------------------------------------------------------------------
// Applying a result
// ---------------------------------------------------------------------------

function applyOptimizerResult(resultId) {
  const result = [...(optimizerResults?.damage || []), ...(optimizerResults?.dps || [])]
    .find(item => item.id === resultId);
  if (!result) return;

  // Apply the full snapshot the row was scored with, so the board reproduces
  // exactly the numbers shown on it.
  state.nodeLevels = normalizeNodeLevels(result.nodeLevels);
  state.convenience.petStat = result.pet;
  state.engravings = { ...result.engravings };
  commit();
}

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------

function syncOptimizerPanel() {
  if (!optimizerDom.panel) return;

  $$("[data-optimizer-option]").forEach(input => {
    const key = input.dataset.optimizerOption;
    if (input.type === "checkbox") input.checked = Boolean(optimizerOptions[key]);
    else input.value = String(optimizerOptions[key]);
  });

  $$("[data-optimizer-metric]").forEach(button => {
    const active = button.dataset.optimizerMetric === optimizerOptions.metric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  syncOptimizerControls();
  syncEngravingPoolList();
  renderOptimizerHint();
  renderOptimizerResults();
}

function syncOptimizerControls() {
  optimizerDom.run.disabled = optimizerRunning;
  optimizerDom.cancel.disabled = !optimizerRunning;
  optimizerDom.panel.classList.toggle("searching", optimizerRunning);
}

function renderOptimizerHint() {
  if (optimizerRunning) return;

  const plan = buildSearchPlan(state);
  const exhaustive = optimizerOptions.mode === "exhaustive"
    || (optimizerOptions.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT);
  const modeLabel = exhaustive ? "전수 탐색" : `빔 탐색 (너비 ${formatInteger(optimizerOptions.beamWidth)})`;

  optimizerDom.spaceHint.textContent = `${formatInteger(plan.totalCombos)}조합 · ${modeLabel}`;

  const notes = [
    `1T는 ${plan.dimensions[0].options.length}가지 배분을 탐색합니다.`,
  ];
  if (plan.skippedNodes.length > 0) {
    notes.push(`딜 기여가 없는 노드 ${plan.skippedNodes.length}개(${plan.skippedNodes.map(node => node.name).join(", ")})는 후보에서 제외됩니다.`);
  }
  if (plan.budgetBelowTierMax && optimizerOptions.fullBudget) {
    notes.push("진화 포인트가 티어 합계(140)보다 적어 티어 포인트 전량 사용 옵션이 자동 해제됩니다.");
  }
  const engravings = plan.engravings;
  if (optimizerOptions.engravingSlots !== "fixed") {
    if (engravings.overflow) {
      notes.push(`고정 각인 ${engravings.locked.length}개가 슬롯 ${engravings.slots}개를 넘습니다. 슬롯을 늘리거나 고정을 줄여 주세요.`);
    } else if (engravings.locked.length > 0) {
      notes.push(`각인 ${engravings.slots}슬롯 중 고정 ${engravings.locked.length}개(${engravings.locked.map(entry => entry.item.name).join(", ")})를 두고 후보 ${engravings.candidates.length}종에서 ${engravings.pickCount}개를 고릅니다.`);
    } else {
      notes.push(`각인 후보 ${engravings.candidates.length}종에서 ${engravings.pickCount}개를 골라 ${engravings.slots}슬롯을 채웁니다.`);
    }
    const excludedCount = getModeledEngravings().length - engravings.locked.length - engravings.candidates.length;
    if (excludedCount > 0) notes.push(`제외 각인 ${excludedCount}종은 후보에서 빠집니다. '각인 후보 설정'에서 조정할 수 있습니다.`);
  }
  const manaShare = getManaShareRatio(state.convenience);
  if (manaShare < 1) {
    notes.push(`마나 스킬 딜 비중 ${formatInteger(manaShare * 100)}% 기준으로 마나 전용 피해 효과를 축소 반영합니다. 끝마/무마 쿨감은 그대로 반영됩니다.`);
  }

  optimizerDom.note.replaceChildren(...notes.map(text => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
}

function renderOptimizerResults() {
  if (!optimizerResults) {
    const empty = document.createElement("p");
    empty.className = "optimizer-empty";
    empty.textContent = "탐색을 시작하면 상위 세팅 목록이 여기에 표시됩니다.";
    optimizerDom.results.replaceChildren(empty);
    return;
  }

  const metric = optimizerOptions.metric === "dps" ? "dps" : "damage";
  const list = optimizerResults[metric];
  const baseline = optimizerResults.baseline;

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "optimizer-empty";
    empty.textContent = "조건에 맞는 조합을 찾지 못했습니다. 진화 포인트나 탐색 범위를 확인해 주세요.";
    optimizerDom.results.replaceChildren(empty);
    return;
  }

  optimizerDom.results.replaceChildren(...list.map((result, index) => createOptimizerRow(result, index, baseline)));
}

function createOptimizerRow(result, index, baseline) {
  const row = document.createElement("article");
  row.className = "optimizer-result";
  if (result.signature === buildCurrentSignature()) row.classList.add("current");

  const damageDelta = percentDelta(result.damageIndex, baseline.damageIndex);
  const dpsDelta = percentDelta(result.dpsIndex, baseline.dpsIndex);

  const head = document.createElement("div");
  head.className = "optimizer-result-head";
  head.innerHTML = `
    <span class="optimizer-rank">${formatInteger(index + 1)}</span>
    <div class="optimizer-scores">
      <span><small>한 방</small><strong>${escapeHtml(formatNumber(result.damageIndex))}</strong><em class="${damageDelta >= 0 ? "up" : "down"}">${escapeHtml(formatSignedPercent(damageDelta))}</em></span>
      <span><small>DPS</small><strong>${escapeHtml(formatNumber(result.dpsIndex))}</strong><em class="${dpsDelta >= 0 ? "up" : "down"}">${escapeHtml(formatSignedPercent(dpsDelta))}</em></span>
      <span><small>치적</small><strong>${escapeHtml(formatNumber(result.critRateCapped))}%</strong></span>
      <span><small>쿨감</small><strong>${escapeHtml(formatNumber(result.cooldownReduction))}%</strong></span>
      <span><small>포인트</small><strong>${escapeHtml(formatInteger(result.pointsUsed))}</strong></span>
    </div>
  `;

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "mini-button";
  apply.dataset.optimizerApply = result.id;
  apply.textContent = "적용";
  head.appendChild(apply);
  row.appendChild(head);

  const body = document.createElement("div");
  body.className = "optimizer-result-body";

  Object.keys(EVOLUTION_TIERS).forEach(tier => {
    const picked = NODE_LIBRARY
      .filter(node => node.tier === tier && (result.nodeLevels[node.id] || 0) > 0)
      .map(node => `${node.name} ${formatInteger(result.nodeLevels[node.id])}`);
    if (picked.length === 0) return;

    const line = document.createElement("div");
    line.className = "optimizer-tier-line";
    line.innerHTML = `<span class="optimizer-tier-tag">${escapeHtml(EVOLUTION_TIERS[tier].label)}</span>`;
    picked.forEach(text => {
      const chip = document.createElement("span");
      chip.className = "optimizer-chip";
      chip.textContent = text;
      line.appendChild(chip);
    });
    body.appendChild(line);
  });

  const extras = document.createElement("div");
  extras.className = "optimizer-tier-line";
  extras.innerHTML = '<span class="optimizer-tier-tag">기타</span>';
  const petChip = document.createElement("span");
  petChip.className = "optimizer-chip pet";
  petChip.textContent = OPTIMIZER_PET_LABELS[result.pet] || "펫 없음";
  extras.appendChild(petChip);

  // Driven by the plan the results came from, not the live dropdown.
  const searchedEngravings = optimizerResults?.plan.engravings;
  const lockedIds = new Set((searchedEngravings?.locked || []).map(entry => entry.item.id));
  (searchedEngravings?.controlledIds || []).forEach(id => {
    const tierIndex = getEngravingTierIndex(result.engravings[id]);
    if (tierIndex < 0) return;
    const chip = document.createElement("span");
    chip.className = lockedIds.has(id) ? "optimizer-chip engraving locked" : "optimizer-chip engraving";
    const name = ENGRAVING_LIBRARY.find(item => item.id === id).name;
    chip.textContent = `${lockedIds.has(id) ? "고정 " : ""}${name} ${ENGRAVING_TIERS[tierIndex].label}`;
    extras.appendChild(chip);
  });

  body.appendChild(extras);
  row.appendChild(body);
  return row;
}

function buildCurrentSignature() {
  const controlledIds = optimizerResults?.plan.engravings.controlledIds || [];
  return [
    NODE_LIBRARY.map(node => clamp(Math.round(readNumber(state.nodeLevels[node.id])), 0, node.maxLevel)).join(","),
    state.convenience.petStat || "none",
    controlledIds.map(id => state.engravings[id] || "none").join(","),
  ].join("|");
}

function setOptimizerStatus(text) {
  if (optimizerDom.status) optimizerDom.status.textContent = text;
}

function setOptimizerProgress(ratio) {
  if (optimizerDom.progressFill) optimizerDom.progressFill.style.width = `${clamp(ratio, 0, 1) * 100}%`;
}
