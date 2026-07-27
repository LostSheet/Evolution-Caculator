const LEGACY_STORAGE_KEY = "ark-passive-simulator-state-v3";
const WORKSPACE_KEY = "ark-passive-simulator-workspace-v4";
const SAVED_KEY = "ark-passive-simulator-saved-v3";

const DEFAULT_STATE = {
  // 전투 특성은 출처별로 받는다 — 악세서리 / 팔찌 / 도감·물약.
  // base.*Stat은 모델의 합산 시작점일 뿐이라 0에서 출발한다.
  base: {
    critStat: 0,
    specStat: 0,
    swiftStat: 0,
    dominationStat: 0,
    enduranceStat: 0,
    expertiseStat: 0,
    specDamagePer100: 0,
  },
  settings: {
    pointBudget: 140,
    includeCooldown: true,
    includeAttackSpeed: false,
    backAttack: false,
    headAttack: false,
  },
  convenience: {
    petStat: "none",
    evolutionKarmaRank: 0,
    manaShare: 100,
    goddessBlessing: false,
    feast: false,
  },
  accessories: {
    necklace: { additionalDamage: "none" },
    rings: [
      { critRate: "none", critDamage: "none" },
      { critRate: "none", critDamage: "none" },
    ],
  },
  bracelet: {
    stats: { critStat: 0, specStat: 0, swiftStat: 0 },
    effects: {},
  },
  arkGrid: {
    cores: {
      sun: { id: "none", points: 20, stage: 1 },
      moon: { id: "none", points: 20, stage: 1 },
      star: { id: "none", points: 20, stage: 1 },
    },
    gemLevel: 0,
  },
  collection: {
    ranch: false,
    critStat: 0,
    specStat: 0,
    swiftStat: 0,
  },
  weapon: { quality: 0 },
  engravings: {},
  nodeLevels: {},
  baseEffects: [
    { id: makeId(), label: "카드 추가 피해", category: "damage:추가 피해", customCategory: "", amount: 0 },
    { id: makeId(), label: "각인/시너지 치적", category: "critRate", customCategory: "", amount: 0 },
    { id: makeId(), label: "추가 치명타 피해", category: "critDamage", customCategory: "", amount: 0 },
  ],
  selectedTier: "전체",
  setupName: "",
};

const MULTIPLICATIVE_DAMAGE_GROUPS = new Set(["주는 피해"]);

let workspace = loadWorkspace();
let state = composeWorkspaceState(workspace);
let savedSetups = loadSavedSetups();
let lastMetrics = null;
let statusTimer = null;
let nodeTooltip = null;
let activeTooltipNode = null;
let pendingWorkspaceAction = null;

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const dom = {
  metricDamage: $("#metricDamage"),
  metricDamageDelta: $("#metricDamageDelta"),
  metricDps: $("#metricDps"),
  metricDpsDelta: $("#metricDpsDelta"),
  metricCritRate: $("#metricCritRate"),
  metricCritTotal: $("#metricCritTotal"),
  metricCritDamage: $("#metricCritDamage"),
  metricAttackSpeed: $("#metricAttackSpeed"),
  metricMoveSpeed: $("#metricMoveSpeed"),
  metricSpeedTotal: $("#metricSpeedTotal"),
  metricSpeedExcess: $("#metricSpeedExcess"),
  metricPoints: $("#metricPoints"),
  metricPointHint: $("#metricPointHint"),
  boardPoints: $("#boardPoints"),
  pointFill: $("#pointFill"),
  tierFilter: $("#tierFilter"),
  nodeGrid: $("#nodeGrid"),
  baseEffectList: $("#baseEffectList"),
  comparisonList: $("#comparisonList"),
  setupName: $("#setupName"),
  autosaveStatus: $("#autosaveStatus"),
  profileSelect: $("#profileSelect"),
  nodePresetSelect: $("#nodePresetSelect"),
  activeContextLabel: $("#activeContextLabel"),
  workspaceActionDialog: $("#workspaceActionDialog"),
  workspaceActionForm: $("#workspaceActionForm"),
  workspaceActionTitle: $("#workspaceActionTitle"),
  workspaceActionMessage: $("#workspaceActionMessage"),
  workspaceNameField: $("#workspaceNameField"),
  workspaceNameInput: $("#workspaceNameInput"),
  workspaceActionConfirm: $("#workspaceActionConfirm"),
  statBreakdown: $("#statBreakdown"),
  damageBreakdown: $("#damageBreakdown"),
  formulaBreakdown: $("#formulaBreakdown"),
  breakdownClamp: $("#breakdownClamp"),
  sourceChip: $("#sourceChip"),
  referenceSource: $("#referenceSource"),
  referenceLink: $("#referenceLink"),
  referenceRules: $("#referenceRules"),
  referenceHighlights: $("#referenceHighlights"),
  referenceWarnings: $("#referenceWarnings"),
  engravingDialog: $("#engravingDialog"),
  engravingCount: $("#engravingCount"),
  damageEngravingList: $("#damageEngravingList"),
  utilityEngravingList: $("#utilityEngravingList"),
  selectedEngravings: $("#selectedEngravings"),
  braceletDialog: $("#braceletDialog"),
  braceletCount: $("#braceletCount"),
  supportedBraceletList: $("#supportedBraceletList"),
  unsupportedBraceletList: $("#unsupportedBraceletList"),
  selectedBracelet: $("#selectedBracelet"),
};

init();

function init() {
  ensureNodeLevelKeys();
  persistState();
  renderReference();
  renderTierFilter();
  renderBraceletLists();
  renderEngravingLists();
  bindStaticEvents();
  render();
}

function bindStaticEvents() {
  dom.profileSelect.addEventListener("change", () => switchWorkspaceSelection("profile", dom.profileSelect.value));
  dom.nodePresetSelect.addEventListener("change", () => switchWorkspaceSelection("nodePreset", dom.nodePresetSelect.value));

  $$('[data-profile-action]').forEach(button => {
    button.addEventListener("click", () => handleWorkspaceAction("profile", button.dataset.profileAction));
  });

  $$('[data-node-preset-action]').forEach(button => {
    button.addEventListener("click", () => handleWorkspaceAction("nodePreset", button.dataset.nodePresetAction));
  });

  dom.workspaceActionForm.addEventListener("submit", event => {
    event.preventDefault();
    completeWorkspaceAction();
  });
  $$('[data-workspace-action-cancel]').forEach(button => {
    button.addEventListener("click", () => dom.workspaceActionDialog.close());
  });
  dom.workspaceActionDialog.addEventListener("close", () => {
    pendingWorkspaceAction = null;
  });

  $$("[data-base]").forEach(input => {
    input.addEventListener("input", () => {
      state.base[input.dataset.base] = readNumber(input.value);
      persistState();
      refreshCalculationsOnly();
    });
    input.addEventListener("blur", () => {
      input.value = formatInputValue(state.base[input.dataset.base]);
    });
  });

  $$("[data-setting]").forEach(input => {
    input.addEventListener("input", () => {
      state.settings[input.dataset.setting] = readNumber(input.value);
      persistState();
      refreshCalculationsOnly();
    });
    input.addEventListener("blur", () => {
      input.value = formatInputValue(state.settings[input.dataset.setting]);
    });
  });

  $$("[data-toggle]").forEach(input => {
    input.addEventListener("change", () => {
      state.settings[input.dataset.toggle] = input.checked;
      commit();
    });
  });

  $$("[data-convenience]").forEach(input => {
    input.addEventListener("change", () => {
      const key = input.dataset.convenience;
      state.convenience[key] = key === "evolutionKarmaRank"
        ? clamp(Math.round(readNumber(input.value)), 0, 6)
        : input.value;
      commit();
    });
  });

  $$("[data-convenience-number]").forEach(input => {
    input.addEventListener("input", () => {
      state.convenience[input.dataset.convenienceNumber] = clamp(Math.round(readNumber(input.value)), 0, 100);
      persistState();
      syncManaShareLabel();
      refreshCalculationsOnly();
    });
  });

  $$("[data-convenience-toggle]").forEach(input => {
    input.addEventListener("change", () => {
      state.convenience[input.dataset.convenienceToggle] = input.checked;
      commit();
    });
  });

  $$("[data-accessory-slot]").forEach(input => {
    input.addEventListener("change", () => {
      const slot = input.dataset.accessorySlot;
      const field = input.dataset.accessoryField;
      if (slot === "necklace") {
        state.accessories.necklace[field] = input.value;
      } else if (slot.startsWith("ring-")) {
        const ringIndex = clamp(Math.round(readNumber(slot.slice(5))), 0, 1);
        state.accessories.rings[ringIndex][field] = input.value;
      }
      commit();
    });
  });

  $$('[data-bracelet-stat]').forEach(input => {
    input.addEventListener("input", () => {
      state.bracelet.stats[input.dataset.braceletStat] = clamp(readNumber(input.value), 0, 120);
      persistState();
      refreshCalculationsOnly();
      renderSelectedBracelet();
    });
    input.addEventListener("blur", () => {
      input.value = formatInputValue(state.bracelet.stats[input.dataset.braceletStat]);
    });
  });

  $("#openBracelet").addEventListener("click", () => {
    if (!dom.braceletDialog.open) dom.braceletDialog.showModal();
  });

  dom.braceletDialog.addEventListener("change", event => {
    const select = event.target.closest("[data-bracelet-effect-id]");
    if (!select) return;
    if (select.value === "none") {
      delete state.bracelet.effects[select.dataset.braceletEffectId];
    } else {
      state.bracelet.effects[select.dataset.braceletEffectId] = select.value;
    }
    commit();
  });

  $("#openEngravings").addEventListener("click", () => {
    if (!dom.engravingDialog.open) dom.engravingDialog.showModal();
  });

  dom.engravingDialog.addEventListener("change", event => {
    const select = event.target.closest("[data-engraving-id]");
    if (!select) return;
    if (select.value === "none") {
      delete state.engravings[select.dataset.engravingId];
    } else {
      state.engravings[select.dataset.engravingId] = select.value;
    }
    commit();
  });

  dom.setupName.addEventListener("input", () => {
    state.setupName = dom.setupName.value;
    commit(false);
  });

  $("#addBaseEffect").addEventListener("click", () => {
    state.baseEffects.push({
      id: makeId(),
      label: "새 효과",
      category: "damage:진화형 피해",
      customCategory: "",
      amount: 0,
    });
    commit();
  });

  $$('[data-reset-section]').forEach(button => {
    button.addEventListener("click", () => resetSection(button.dataset.resetSection));
  });

  $("#resetNodes").addEventListener("click", () => {
    Object.keys(state.nodeLevels).forEach(id => {
      state.nodeLevels[id] = 0;
    });
    commit();
  });

  $("#resetAll").addEventListener("click", () => {
    if (!window.confirm("입력값과 노드 선택을 초기화할까요? 저장된 비교 세팅은 유지됩니다.")) return;
    state = cloneState(DEFAULT_STATE);
    ensureNodeLevelKeys();
    commit();
  });

  $("#saveSetup").addEventListener("click", saveCurrentSetup);
  $("#exportState").addEventListener("click", exportState);
  $("#importState").addEventListener("change", importState);

  dom.nodeGrid.addEventListener("click", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    event.preventDefault();
    changeNodeLevel(nodeControl.dataset.nodeId, getNodeLevelStep(nodeControl.dataset.nodeId, event.shiftKey));
  });

  dom.nodeGrid.addEventListener("contextmenu", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    event.preventDefault();
    changeNodeLevel(nodeControl.dataset.nodeId, -getNodeLevelStep(nodeControl.dataset.nodeId, event.shiftKey));
  });

  dom.nodeGrid.addEventListener("keydown", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    if (!["Enter", " ", "Backspace", "Delete"].includes(event.key)) return;
    event.preventDefault();
    const direction = ["Backspace", "Delete"].includes(event.key) ? -1 : 1;
    changeNodeLevel(nodeControl.dataset.nodeId, direction * getNodeLevelStep(nodeControl.dataset.nodeId, event.shiftKey));
  });

  dom.nodeGrid.addEventListener("mouseover", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl || nodeControl === activeTooltipNode) return;
    showNodeTooltip(nodeControl, event);
  });

  dom.nodeGrid.addEventListener("mousemove", event => {
    if (activeTooltipNode) positionNodeTooltip(event.clientX, event.clientY);
  });

  dom.nodeGrid.addEventListener("mouseout", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    if (event.relatedTarget && nodeControl.contains(event.relatedTarget)) return;
    hideNodeTooltip();
  });

  dom.nodeGrid.addEventListener("focusin", event => {
    const nodeControl = event.target.closest("[data-node-id]");
    if (!nodeControl) return;
    const rect = nodeControl.getBoundingClientRect();
    showNodeTooltip(nodeControl, { clientX: rect.right, clientY: rect.top + rect.height / 2 });
  });

  dom.nodeGrid.addEventListener("focusout", hideNodeTooltip);

  dom.baseEffectList.addEventListener("input", updateBaseEffectFromEvent);
  dom.baseEffectList.addEventListener("change", updateBaseEffectFromEvent);
  dom.baseEffectList.addEventListener("click", event => {
    const remove = event.target.closest(".remove-effect");
    if (!remove) return;
    const row = remove.closest("[data-effect-id]");
    state.baseEffects = state.baseEffects.filter(effect => effect.id !== row.dataset.effectId);
    commit();
  });

  dom.comparisonList.addEventListener("click", event => {
    const button = event.target.closest("[data-setup-action]");
    if (!button) return;
    const setupId = button.dataset.setupId;
    const setup = savedSetups.find(item => item.id === setupId);
    if (button.dataset.setupAction === "load" && setup) {
      loadComparisonSetup(setup);
    }
    if (button.dataset.setupAction === "delete") {
      savedSetups = savedSetups.filter(item => item.id !== setupId);
      persistSavedSetups();
      renderComparison();
    }
  });
}

function resetSection(section) {
  let label = "설정";

  if (section === "combat") {
    state.base = cloneState(DEFAULT_STATE.base);
    state.settings.pointBudget = DEFAULT_STATE.settings.pointBudget;
    label = "전투 특성";
  } else if (section === "convenience") {
    state.convenience = cloneState(DEFAULT_STATE.convenience);
    ["includeCooldown", "includeAttackSpeed", "backAttack", "headAttack"].forEach(key => {
      state.settings[key] = DEFAULT_STATE.settings[key];
    });
    label = "편의 설정";
  } else if (section === "accessories") {
    state.accessories = cloneState(DEFAULT_STATE.accessories);
    label = "악세서리";
  } else if (section === "bracelet") {
    state.bracelet = cloneState(DEFAULT_STATE.bracelet);
    label = "팔찌";
  } else if (section === "engravings") {
    state.engravings = cloneState(DEFAULT_STATE.engravings);
    label = "각인";
  } else if (section === "baseEffects") {
    state.baseEffects = DEFAULT_STATE.baseEffects.map(effect => ({
      ...cloneState(effect),
      id: makeId(),
    }));
    label = "직접 입력 효과";
  } else {
    return;
  }

  commit();
  updateAutosaveStatus(`${label} 초기화됨`);
}

function renderWorkspaceSelectors() {
  const activeProfile = getActiveProfile();
  const activeNodePreset = getActiveNodePreset();

  dom.profileSelect.replaceChildren(...workspace.profiles.map(profile => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === workspace.activeProfileId;
    return option;
  }));

  dom.nodePresetSelect.replaceChildren(...workspace.nodePresets.map(preset => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === workspace.activeNodePresetId;
    return option;
  }));

  $$('[data-profile-action="delete"]').forEach(button => {
    button.disabled = workspace.profiles.length <= 1;
  });
  $$('[data-node-preset-action="delete"]').forEach(button => {
    button.disabled = workspace.nodePresets.length <= 1;
  });

  if (dom.activeContextLabel) {
    dom.activeContextLabel.textContent = `${activeProfile?.name || "캐릭터"} · ${activeNodePreset?.name || "노드"}`;
  }
}

function switchWorkspaceSelection(kind, id) {
  persistState();
  const collection = kind === "profile" ? workspace.profiles : workspace.nodePresets;
  if (!collection.some(item => item.id === id)) return;

  if (kind === "profile") workspace.activeProfileId = id;
  else workspace.activeNodePresetId = id;
  workspace.setupName = "";
  state = composeWorkspaceState(workspace);
  ensureNodeLevelKeys();
  persistState();
  render();
}

function handleWorkspaceAction(kind, action) {
  persistState();
  const isProfile = kind === "profile";
  const collection = isProfile ? workspace.profiles : workspace.nodePresets;
  const current = isProfile ? getActiveProfile() : getActiveNodePreset();
  if (!current) return;
  if (action === "delete" && collection.length <= 1) return;

  const targetLabel = isProfile ? "캐릭터" : "노드 프리셋";
  const fallbackName = action === "create"
    ? (isProfile ? `캐릭터 ${collection.length + 1}` : `노드 ${collection.length + 1}`)
    : action === "duplicate"
      ? getUniqueWorkspaceName(`${current.name} 복사본`, collection)
      : current.name;

  pendingWorkspaceAction = { kind, action, currentId: current.id, fallbackName };
  dom.workspaceActionTitle.textContent = action === "create"
    ? `새 ${targetLabel}`
    : action === "duplicate"
      ? `${targetLabel} 복제`
      : action === "rename"
        ? `${targetLabel} 이름 변경`
        : `${targetLabel} 삭제`;
  dom.workspaceNameField.hidden = action === "delete";
  dom.workspaceActionMessage.hidden = action !== "delete";
  dom.workspaceActionMessage.textContent = action === "delete"
    ? `'${current.name}'을 삭제합니다. 비교 저장 항목은 유지됩니다.`
    : "";
  dom.workspaceNameInput.value = fallbackName;
  dom.workspaceActionConfirm.textContent = action === "delete" ? "삭제" : "확인";
  dom.workspaceActionConfirm.classList.toggle("danger-button", action === "delete");
  if (!dom.workspaceActionDialog.open) dom.workspaceActionDialog.showModal();
  if (action !== "delete") {
    dom.workspaceNameInput.focus();
    dom.workspaceNameInput.select();
  }
}

function completeWorkspaceAction() {
  if (!pendingWorkspaceAction) return;
  const { kind, action, currentId, fallbackName } = pendingWorkspaceAction;
  const isProfile = kind === "profile";
  const collection = isProfile ? workspace.profiles : workspace.nodePresets;
  const current = collection.find(item => item.id === currentId);
  if (!current) {
    dom.workspaceActionDialog.close();
    return;
  }

  if (action === "create" || action === "duplicate") {
    const requestedName = dom.workspaceNameInput.value.trim().slice(0, 40) || fallbackName;
    const name = getUniqueWorkspaceName(requestedName, collection);
    const item = action === "create"
      ? (isProfile ? createProfile(name, DEFAULT_STATE) : createNodePreset(name, emptyNodeLevels()))
      : (isProfile ? createProfile(name, current.state) : createNodePreset(name, current.nodeLevels));
    collection.push(item);
    if (isProfile) workspace.activeProfileId = item.id;
    else workspace.activeNodePresetId = item.id;
  } else if (action === "rename") {
    const requestedName = dom.workspaceNameInput.value.trim().slice(0, 40) || fallbackName;
    current.name = getUniqueWorkspaceName(requestedName, collection, current.id);
    current.updatedAt = new Date().toISOString();
  } else if (action === "delete") {
    if (collection.length <= 1) {
      dom.workspaceActionDialog.close();
      return;
    }
    const nextCollection = collection.filter(item => item.id !== current.id);
    if (isProfile) {
      workspace.profiles = nextCollection;
      workspace.activeProfileId = nextCollection[0].id;
    } else {
      workspace.nodePresets = nextCollection;
      workspace.activeNodePresetId = nextCollection[0].id;
    }
  } else {
    dom.workspaceActionDialog.close();
    return;
  }

  workspace.setupName = "";
  state = composeWorkspaceState(workspace);
  ensureNodeLevelKeys();
  persistState();
  dom.workspaceActionDialog.close();
  render();
}

function getUniqueWorkspaceName(requestedName, collection, excludedId = "") {
  const baseName = String(requestedName || "이름 없음").trim().slice(0, 40) || "이름 없음";
  const usedNames = new Set(collection.filter(item => item.id !== excludedId).map(item => item.name));
  if (!usedNames.has(baseName)) return baseName;
  let index = 2;
  let candidate = "";
  do {
    const suffix = ` ${index}`;
    candidate = `${baseName.slice(0, 40 - suffix.length)}${suffix}`;
    index += 1;
  } while (usedNames.has(candidate));
  return candidate;
}

function render() {
  renderWorkspaceSelectors();
  syncInputs();
  const metrics = calculateMetrics(state);
  const baseline = calculateMetrics({ ...state, nodeLevels: emptyNodeLevels() });
  lastMetrics = metrics;

  renderMetrics(metrics, baseline);
  renderNodes();
  renderBaseEffects();
  renderSelectedBracelet();
  renderSelectedEngravings();
  renderBreakdowns(metrics);
  renderComparison();
  if (typeof syncOptimizerPanel === "function") syncOptimizerPanel();
  updateAutosaveStatus("저장됨");
}

function syncInputs() {
  $$("[data-base]").forEach(input => {
    input.value = formatInputValue(state.base[input.dataset.base]);
  });
  $$("[data-setting]").forEach(input => {
    input.value = formatInputValue(state.settings[input.dataset.setting]);
  });
  $$("[data-toggle]").forEach(input => {
    input.checked = Boolean(state.settings[input.dataset.toggle]);
  });
  $$("[data-convenience]").forEach(input => {
    input.value = String(state.convenience[input.dataset.convenience] ?? "none");
  });
  $$("[data-convenience-number]").forEach(input => {
    input.value = formatInputValue(state.convenience[input.dataset.convenienceNumber]);
  });
  $$("[data-convenience-toggle]").forEach(input => {
    input.checked = Boolean(state.convenience[input.dataset.convenienceToggle]);
  });
  syncManaShareLabel();
  $$("[data-accessory-slot]").forEach(input => {
    const slot = input.dataset.accessorySlot;
    const field = input.dataset.accessoryField;
    input.value = slot === "necklace"
      ? state.accessories.necklace[field]
      : state.accessories.rings[clamp(Math.round(readNumber(slot.slice(5))), 0, 1)][field];
  });
  $$("[data-bracelet-stat]").forEach(input => {
    input.value = formatInputValue(state.bracelet.stats[input.dataset.braceletStat]);
  });
  $$("[data-bracelet-effect-id]").forEach(select => {
    select.value = state.bracelet.effects[select.dataset.braceletEffectId] || "none";
  });
  $$("[data-engraving-id]").forEach(select => {
    select.value = state.engravings[select.dataset.engravingId] || "none";
  });
  dom.setupName.value = state.setupName || "";
}

function syncManaShareLabel() {
  $$("[data-mana-share-value]").forEach(node => {
    const share = clamp(Math.round(readNumber(state.convenience[node.dataset.manaShareValue])), 0, 100);
    node.textContent = `${share}%`;
    node.classList.toggle("muted-value", share >= 100);
  });
}

function renderTierFilter() {
  if (!dom.tierFilter) return;
  const tiers = ["전체", ...Object.keys(EVOLUTION_TIERS)];
  dom.tierFilter.replaceChildren(...tiers.map(tier => {
    const button = document.createElement("button");
    button.type = "button";
    const usage = tier === "전체" ? null : getTierUsage(tier);
    button.textContent = usage ? `${EVOLUTION_TIERS[tier].label} ${usage.points}/${usage.maxPoints}` : tier;
    button.dataset.tier = tier;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      state.selectedTier = tier;
      commit();
    });
    return button;
  }));
}

function renderBraceletLists() {
  const supportedFragment = document.createDocumentFragment();

  BRACELET_EFFECTS.forEach(braceletEffectItem => {
    const row = document.createElement("div");
    const selectId = `bracelet-${braceletEffectItem.id}`;
    row.className = "engraving-row bracelet-option-row";
    row.dataset.braceletEffectRow = braceletEffectItem.id;
    row.innerHTML = `<label for="${selectId}"><strong>${escapeHtml(braceletEffectItem.name)}</strong></label>`;

    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.braceletEffectId = braceletEffectItem.id;
    select.setAttribute("aria-label", `${braceletEffectItem.name} 단계`);

    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.textContent = "미적용";
    select.appendChild(noneOption);

    BRACELET_GRADES.forEach((grade, gradeIndex) => {
      const option = document.createElement("option");
      const gradeAmounts = braceletEffectItem.effects
        .map(effect => `${formatInputValue(effect.amounts[gradeIndex])}%`)
        .join(" / ");
      option.value = grade.value;
      option.textContent = `${grade.label} · ${gradeAmounts}`;
      select.appendChild(option);
    });
    row.appendChild(select);

    const currentEffect = document.createElement("small");
    currentEffect.className = "engraving-current-effect bracelet-current-effect";
    currentEffect.hidden = true;
    row.appendChild(currentEffect);
    supportedFragment.appendChild(row);
  });

  dom.supportedBraceletList.replaceChildren(supportedFragment);
  dom.unsupportedBraceletList.replaceChildren(...BRACELET_UNSUPPORTED_EFFECTS.map(item => {
    const row = document.createElement("div");
    row.className = "bracelet-unsupported-item";
    row.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.summary)}</span>`;
    return row;
  }));
}

function renderSelectedBracelet() {
  const statSelections = BRACELET_STAT_FIELDS
    .map(item => ({ ...item, amount: clamp(readNumber(state.bracelet.stats[item.key]), 0, 120) }))
    .filter(item => item.amount > 0);
  const effectSelections = BRACELET_EFFECTS
    .map(item => ({ ...item, gradeIndex: getBraceletGradeIndex(state.bracelet.effects[item.id]) }))
    .filter(item => item.gradeIndex >= 0);

  dom.braceletCount.textContent = `${statSelections.length + effectSelections.length}개 선택`;

  $$("[data-bracelet-effect-row]").forEach(row => {
    const item = BRACELET_EFFECTS.find(effect => effect.id === row.dataset.braceletEffectRow);
    const gradeIndex = getBraceletGradeIndex(state.bracelet.effects[item.id]);
    const selected = gradeIndex >= 0;
    const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
    const currentEffect = $(".bracelet-current-effect", row);
    row.classList.toggle("active", selected);
    row.classList.toggle("condition-inactive", selected && !conditionActive);
    currentEffect.hidden = !selected;
    currentEffect.textContent = selected
      ? `${item.summaries[gradeIndex]}${conditionActive ? "" : " · 현재 미적용"}`
      : "";
  });

  const chips = [
    ...statSelections.map(item => {
      const chip = document.createElement("span");
      chip.className = "selected-bracelet";
      chip.textContent = `${item.label} +${formatInteger(item.amount)}`;
      return chip;
    }),
    ...effectSelections.map(item => {
      const chip = document.createElement("span");
      const grade = BRACELET_GRADES[item.gradeIndex];
      const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
      chip.className = "selected-bracelet";
      chip.textContent = `${item.name} · ${grade.label}${conditionActive ? "" : " · 미적용"}`;
      return chip;
    }),
  ];

  if (chips.length === 0) {
    const empty = document.createElement("span");
    empty.className = "selected-bracelet-empty";
    empty.textContent = "선택 없음";
    dom.selectedBracelet.replaceChildren(empty);
    return;
  }

  dom.selectedBracelet.replaceChildren(...chips);
}

function renderEngravingLists() {
  const damageFragment = document.createDocumentFragment();
  const utilityFragment = document.createDocumentFragment();

  ENGRAVING_LIBRARY.forEach(engravingItem => {
    const row = document.createElement("div");
    const selectId = `engraving-${engravingItem.id}`;
    row.className = "engraving-row";
    row.dataset.engravingRow = engravingItem.id;
    row.innerHTML = `<label for="${selectId}"><strong>${escapeHtml(engravingItem.name)}</strong></label>`;

    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.engravingId = engravingItem.id;
    select.setAttribute("aria-label", `${engravingItem.name} 단계`);

    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.textContent = "미적용";
    select.appendChild(noneOption);

    ENGRAVING_TIERS.forEach(tier => {
      const option = document.createElement("option");
      option.value = tier.value;
      option.textContent = tier.label;
      select.appendChild(option);
    });
    row.appendChild(select);

    const currentEffect = document.createElement("small");
    currentEffect.className = "engraving-current-effect";
    currentEffect.hidden = true;
    row.appendChild(currentEffect);

    const target = engravingItem.section === "damage" ? damageFragment : utilityFragment;
    target.appendChild(row);
  });

  dom.damageEngravingList.replaceChildren(damageFragment);
  dom.utilityEngravingList.replaceChildren(utilityFragment);
}

function renderSelectedEngravings() {
  const activeEngravings = ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(state.engravings[item.id]) >= 0);
  dom.engravingCount.textContent = `${activeEngravings.length}개 적용`;

  $$("[data-engraving-row]").forEach(row => {
    const engravingItem = ENGRAVING_LIBRARY.find(item => item.id === row.dataset.engravingRow);
    const tierIndex = getEngravingTierIndex(state.engravings[row.dataset.engravingRow]);
    const conditionActive = isDirectionalConditionActive(engravingItem.condition, state.settings);
    const currentEffect = $(".engraving-current-effect", row);
    row.classList.toggle("active", tierIndex >= 0);
    row.classList.toggle("condition-inactive", tierIndex >= 0 && !conditionActive);
    currentEffect.hidden = tierIndex < 0;
    currentEffect.textContent = tierIndex >= 0
      ? `${engravingItem.tierSummaries[tierIndex]}${conditionActive ? "" : " · 현재 미적용"}`
      : "";
  });

  if (activeEngravings.length === 0) {
    const empty = document.createElement("span");
    empty.className = "selected-engraving-empty";
    empty.textContent = "선택 없음";
    dom.selectedEngravings.replaceChildren(empty);
    return;
  }

  dom.selectedEngravings.replaceChildren(...activeEngravings.map(item => {
    const tier = ENGRAVING_TIERS[getEngravingTierIndex(state.engravings[item.id])];
    const conditionActive = isDirectionalConditionActive(item.condition, state.settings);
    const chip = document.createElement("span");
    chip.className = "selected-engraving";
    chip.textContent = `${item.name} · ${tier.label}${conditionActive ? "" : " · 미적용"}`;
    return chip;
  }));
}

function renderMetrics(metrics, baseline) {
  const damageDelta = percentDelta(metrics.damageIndex, baseline.damageIndex);
  const dpsDelta = percentDelta(metrics.dpsIndex, baseline.dpsIndex);
  const budget = Math.max(0, state.settings.pointBudget || 0);
  const pointRatio = budget > 0 ? clamp(metrics.pointsUsed / budget, 0, 1) : 0;

  dom.metricDamage.textContent = formatNumber(metrics.damageIndex);
  dom.metricDamageDelta.textContent = `노드 전 대비 ${formatSignedPercent(damageDelta)}`;
  dom.metricDps.textContent = formatNumber(metrics.dpsIndex);
  dom.metricDpsDelta.textContent = `노드 전 대비 ${formatSignedPercent(dpsDelta)}`;
  dom.metricCritRate.textContent = `${formatNumber(metrics.critRateCapped)}%`;
  dom.metricCritTotal.textContent = `총 ${formatNumber(metrics.critRateRaw)}%`;
  dom.metricCritDamage.textContent = `${formatNumber(metrics.critDamage)}%`;
  dom.metricAttackSpeed.textContent = `공 ${formatNumber(metrics.attackMoveSpeed)}%`;
  dom.metricMoveSpeed.textContent = `이 ${formatNumber(metrics.moveSpeed)}%`;
  dom.metricSpeedTotal.textContent = `총 공 ${formatNumber(metrics.attackSpeedRaw)}% · 이 ${formatNumber(metrics.moveSpeedRaw)}%`;
  dom.metricSpeedExcess.textContent = `초과 공 ${formatNumber(metrics.attackSpeedExcess)}% · 이 ${formatNumber(metrics.moveSpeedExcess)}%`;
  dom.metricSpeedExcess.hidden = metrics.attackSpeedExcess <= 0 && metrics.moveSpeedExcess <= 0;
  dom.metricPoints.textContent = `${formatInteger(metrics.pointsUsed)} / ${formatInteger(budget)}`;
  if (dom.boardPoints) dom.boardPoints.textContent = `${formatInteger(metrics.pointsUsed)} / ${formatInteger(budget)}`;
  dom.metricPointHint.textContent = metrics.pointsUsed > budget ? `${formatInteger(metrics.pointsUsed - budget)} 초과` : `${formatInteger(budget - metrics.pointsUsed)} 남음`;
  dom.metricPointHint.classList.toggle("over", metrics.pointsUsed > budget);
  dom.pointFill.style.width = `${pointRatio * 100}%`;
  dom.pointFill.classList.toggle("over", metrics.pointsUsed > budget);
}

function renderNodes() {
  hideNodeTooltip();
  if (dom.tierFilter) $$("#tierFilter button").forEach(button => {
    const selected = button.dataset.tier === state.selectedTier;
    const usage = button.dataset.tier === "전체" ? null : getTierUsage(button.dataset.tier);
    if (usage) button.textContent = `${EVOLUTION_TIERS[button.dataset.tier].label} ${usage.points}/${usage.maxPoints}`;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  const fragment = document.createDocumentFragment();
  Object.keys(EVOLUTION_TIERS).forEach(tier => {
    const nodes = NODE_LIBRARY.filter(node => node.tier === tier);
    if (nodes.length > 0) fragment.appendChild(createTierRow(tier, nodes));
  });
  dom.nodeGrid.replaceChildren(fragment);
}

function createTierRow(tier, nodes) {
  const tierInfo = EVOLUTION_TIERS[tier];
  const usage = getTierUsage(tier);
  const row = document.createElement("section");
  row.className = "arc-tier-row";
  row.dataset.tier = tier;
  row.innerHTML = `
    <div class="tier-marker" aria-label="${escapeHtml(tierInfo.label)} ${usage.points}/${usage.maxPoints}">
      <div class="tier-diamond"><span>${escapeHtml(tierInfo.label.replace("T", ""))}</span></div>
      <strong>${formatInteger(usage.points)}/${formatInteger(usage.maxPoints)}</strong>
    </div>
    <div class="tier-nodes"></div>
  `;

  const nodeWrap = $(".tier-nodes", row);
  nodes.forEach(node => nodeWrap.appendChild(createNodeCard(node)));
  return row;
}

function createNodeCard(node) {
  const level = state.nodeLevels[node.id] || 0;
  const cost = getNodeCost(node);
  const card = document.createElement("button");
  card.type = "button";
  card.className = "node-card";
  card.dataset.nodeId = node.id;
  card.classList.toggle("active", level > 0);
  card.classList.toggle("maxed", level >= node.maxLevel);
  card.setAttribute("aria-label", `${node.name} Lv. ${level}/${node.maxLevel}`);

  card.innerHTML = `
    <span class="node-cost">${formatInteger(cost)}P</span>
    <span class="node-icon ${node.icon}" aria-hidden="true">${iconSvg(node.icon)}</span>
    <span class="node-level">Lv. ${formatInteger(level)}/${formatInteger(node.maxLevel)}</span>
  `;
  return card;
}

function renderReference() {
  if (dom.sourceChip) dom.sourceChip.textContent = `${REFERENCE_META.title} 기반`;
  if (
    !dom.referenceSource ||
    !dom.referenceLink ||
    !dom.referenceRules ||
    !dom.referenceWarnings ||
    !dom.referenceHighlights
  ) return;

  dom.referenceSource.textContent = `${REFERENCE_META.title} · 최근 수정 ${REFERENCE_META.updatedAt}`;
  dom.referenceLink.href = REFERENCE_META.sourceUrl;

  dom.referenceRules.replaceChildren(...REFERENCE_RULES.map(text => makeReferenceListItem(text)));
  dom.referenceWarnings.replaceChildren(...REFERENCE_WARNINGS.map(text => makeReferenceListItem(text)));
  dom.referenceHighlights.replaceChildren(...REFERENCE_HIGHLIGHTS.map(item => {
    const block = document.createElement("section");
    block.className = "reference-highlight";
    block.innerHTML = `<strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p>`;
    return block;
  }));
}

function renderBaseEffects() {
  const template = $("#baseEffectTemplate");
  const fragment = document.createDocumentFragment();

  state.baseEffects.forEach(effect => {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.effectId = effect.id;
    const label = $('[data-effect-field="label"]', row);
    const category = $('[data-effect-field="category"]', row);
    const custom = $('[data-effect-field="customCategory"]', row);
    const amount = $('[data-effect-field="amount"]', row);

    label.value = effect.label;
    category.replaceChildren(...EFFECT_CATEGORIES.map(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      return option;
    }));
    category.value = effect.category;
    custom.value = effect.customCategory || "";
    amount.value = formatInputValue(effect.amount);
    custom.hidden = effect.category !== "customDamage";
    custom.placeholder = "피해 그룹명";

    fragment.appendChild(row);
  });

  dom.baseEffectList.replaceChildren(fragment);
}

function renderBreakdowns(metrics) {
  dom.breakdownClamp.textContent = metrics.critRateRaw > metrics.critRateCapped
    ? `치명타 확률은 기대값 계산에서 ${formatNumber(metrics.critRateCapped)}%로 제한됨`
    : "";

  const statItems = [
    ["치명", metrics.totalStats.critStat],
    ["특화", metrics.totalStats.specStat],
    ["신속", metrics.totalStats.swiftStat],
    ["제압", metrics.totalStats.dominationStat],
    ["인내", metrics.totalStats.enduranceStat],
    ["숙련", metrics.totalStats.expertiseStat],
    ["총 치명타 확률", `${formatNumber(metrics.critRateRaw)}%`],
    ["적용 치명타 확률", `${formatNumber(metrics.critRateCapped)}%`],
    ["총 공격속도", `${formatNumber(metrics.attackSpeedRaw)}%`],
    ["적용 공격속도", `${formatNumber(metrics.attackMoveSpeed)}%`],
    ["초과 공격속도", `${formatNumber(metrics.attackSpeedExcess)}%`],
    ["총 이동속도", `${formatNumber(metrics.moveSpeedRaw)}%`],
    ["적용 이동속도", `${formatNumber(metrics.moveSpeed)}%`],
    ["초과 이동속도", `${formatNumber(metrics.moveSpeedExcess)}%`],
    ["공통 쿨감", `${formatNumber(metrics.cooldownGroups.global)}%`],
    ["끝마/무마 쿨감", `${formatNumber(metrics.cooldownGroups.mana)}%`],
    ["최훈/타지 쿨감", `${formatNumber(metrics.cooldownGroups.skill)}%`],
    ["적용 쿨감", `${formatNumber(metrics.cooldownReduction)}%`],
    ["재사용 대기시간 증가", `${formatNumber(metrics.cooldownIncrease)}%`],
  ];
  dom.statBreakdown.replaceChildren(...statItems.map(([label, value]) => makeBreakdownRow(label, value)));

  const damageRows = Object.entries(metrics.damageGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => makeBreakdownRow(label, `${formatNumber(value)}%`, value));
  if (damageRows.length === 0) damageRows.push(makeBreakdownRow("피해 그룹", "0.00%"));
  dom.damageBreakdown.replaceChildren(...damageRows);

  const formulaRows = [
    ["치명 기댓값", `${formatNumber(metrics.critFactor)}x`],
    ["치명 조건 피해", `${formatNumber(metrics.critOnlyDamage)}%`],
    ["뭉툭한 가시 전환", `${formatNumber(metrics.bluntThornBonus.damage)}%`],
    ["음속 돌파 전환", `${formatNumber(metrics.sonicBonus)}%`],
    ["돌격대장 전환", `${formatNumber(metrics.raidCaptainDamage)}%`],
    ["피해 그룹 곱", `${formatNumber(metrics.damageMultiplier)}x`],
    ["쿨감 적용", metrics.cooldownGroupLabel],
    ["쿨감 계수", `${formatNumber(metrics.cooldownFactor)}x`],
    ["공속 계수", `${formatNumber(metrics.attackSpeedFactor)}x`],
  ];
  dom.formulaBreakdown.replaceChildren(...formulaRows.map(([label, value]) => makeFormulaRow(label, value)));
}

function renderComparison() {
  if (savedSetups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-copy";
    empty.textContent = "저장된 세팅 없음";
    dom.comparisonList.replaceChildren(empty);
    return;
  }

  const current = lastMetrics || calculateMetrics(state);
  const fragment = document.createDocumentFragment();
  savedSetups.forEach(setup => {
    const metrics = calculateMetrics(setup.state);
    const context = [setup.profileName, setup.nodePresetName].filter(Boolean).join(" · ");
    const item = document.createElement("article");
    item.className = "comparison-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(setup.name)}</strong>
        ${context ? `<small class="comparison-context">${escapeHtml(context)}</small>` : ""}
        <span>${formatNumber(metrics.damageIndex)} / ${formatNumber(metrics.dpsIndex)}</span>
        <small>현재 DPS 대비 ${formatSignedPercent(percentDelta(metrics.dpsIndex, current.dpsIndex))}</small>
      </div>
      <div class="comparison-actions">
        <button class="mini-button" data-setup-action="load" data-setup-id="${setup.id}" type="button">불러오기</button>
        <button class="icon-button small" data-setup-action="delete" data-setup-id="${setup.id}" type="button" aria-label="삭제">${miniIcon("trash")}</button>
      </div>
    `;
    fragment.appendChild(item);
  });
  dom.comparisonList.replaceChildren(fragment);
}

function updateBaseEffectFromEvent(event) {
  const row = event.target.closest("[data-effect-id]");
  const field = event.target.dataset.effectField;
  if (!row || !field) return;
  const effect = state.baseEffects.find(item => item.id === row.dataset.effectId);
  if (!effect) return;

  if (field === "amount") {
    effect.amount = readNumber(event.target.value);
  } else {
    effect[field] = event.target.value;
  }

  if (field === "category") {
    commit();
    return;
  }

  persistState();
  refreshCalculationsOnly();
}

function showNodeTooltip(nodeControl, point) {
  const node = NODE_LIBRARY.find(item => item.id === nodeControl.dataset.nodeId);
  if (!node) return;
  const tooltip = ensureNodeTooltip();
  activeTooltipNode = nodeControl;
  tooltip.innerHTML = formatNodeTooltip(node, state.nodeLevels[node.id] || 0);
  tooltip.hidden = false;
  positionNodeTooltip(point.clientX, point.clientY);
}

function hideNodeTooltip() {
  activeTooltipNode = null;
  if (nodeTooltip) nodeTooltip.hidden = true;
}

function ensureNodeTooltip() {
  if (!nodeTooltip) {
    nodeTooltip = document.createElement("div");
    nodeTooltip.className = "node-tooltip";
    nodeTooltip.setAttribute("role", "tooltip");
    nodeTooltip.hidden = true;
    document.body.appendChild(nodeTooltip);
  }
  return nodeTooltip;
}

function positionNodeTooltip(clientX, clientY) {
  const tooltip = ensureNodeTooltip();
  if (tooltip.hidden) return;
  const margin = 12;
  const gap = 18;
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + gap;
  let top = clientY + gap;

  if (left + rect.width > window.innerWidth - margin) left = clientX - rect.width - gap;
  if (top + rect.height > window.innerHeight - margin) top = clientY - rect.height - gap;

  tooltip.style.left = `${clamp(left, margin, Math.max(margin, window.innerWidth - rect.width - margin))}px`;
  tooltip.style.top = `${clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin))}px`;
}

function formatNodeTooltip(node, level) {
  const cost = getNodeCost(node);
  const effectLines = getTooltipEffectLines(node, level);
  return `
    <strong>${escapeHtml(node.name)}</strong>
    <small>${escapeHtml(node.tier)} · ${formatInteger(cost)}P · Lv. ${formatInteger(level)}/${formatInteger(node.maxLevel)}</small>
    <span class="tooltip-effects">${effectLines.map(line => `<em>${escapeHtml(line)}</em>`).join("")}</span>
  `;
}

function getTooltipEffectLines(node, level) {
  if (node.id === "e5-blunt-thorn") {
    const metrics = lastMetrics || calculateMetrics(state);
    const converted = calculateBluntThornBonus(level, metrics.critRateRaw).damage;
    return [
      ...node.effects.filter(effect => effect.kind === "damage").map(effect => formatEffect(effect, level)),
      "치명타 확률 상한 80%",
      `초과 치적 전환 +${formatNumber(converted)}%`,
    ];
  }

  if (node.id === "e5-sonic-breakthrough") {
    const metrics = lastMetrics || calculateMetrics(state);
    const sonic = calculateSonicBreakthroughBonus(level, metrics.attackSpeed, metrics.moveSpeedBonus);
    return [
      `진화형 피해 +${formatNumber(sonic.damage)}%`,
      `기본 ${formatNumber(sonic.baseDamage)}% · 상한 ${formatNumber(sonic.capBonus)}% · 초과 ${formatNumber(sonic.excessDamage)}%`,
      `총 공속 ${formatNumber(metrics.attackSpeedRaw)}% · 초과 ${formatNumber(metrics.attackSpeedExcess)}%`,
      `총 이속 ${formatNumber(metrics.moveSpeedRaw)}% · 초과 ${formatNumber(metrics.moveSpeedExcess)}%`,
    ];
  }

  const primaryEffects = node.effects.filter(effect => effect.kind !== "note" && effect.kind !== "special");
  const tooltipEffects = primaryEffects.length > 0 ? primaryEffects : node.effects;
  return tooltipEffects.map(effect => formatEffect(effect, level));
}

function changeNodeLevel(id, delta) {
  const node = NODE_LIBRARY.find(item => item.id === id);
  if (!node) return;
  setNodeLevel(id, (state.nodeLevels[id] || 0) + delta);
}

function getNodeLevelStep(id, isLargeStep) {
  const node = NODE_LIBRARY.find(item => item.id === id);
  if (!node) return 1;
  return isLargeStep ? Math.min(10, node.maxLevel) : 1;
}

function setNodeLevel(id, level) {
  const node = NODE_LIBRARY.find(item => item.id === id);
  if (!node) return;
  const cost = getNodeCost(node);
  const tier = EVOLUTION_TIERS[node.tier];
  const usedByOtherNodes = getTierUsage(node.tier, id).points;
  const tierLimitedMax = tier ? Math.floor((tier.maxPoints - usedByOtherNodes) / cost) : node.maxLevel;
  state.nodeLevels[id] = clamp(Math.round(level), 0, Math.min(node.maxLevel, tierLimitedMax));
  commit();
}

function saveCurrentSetup() {
  const metrics = calculateMetrics(state);
  const profile = getActiveProfile();
  const nodePreset = getActiveNodePreset();
  const name = (state.setupName || "").trim() || `${profile.name} · ${nodePreset.name}`;
  savedSetups.unshift({
    id: makeId(),
    name,
    profileId: profile.id,
    profileName: profile.name,
    nodePresetId: nodePreset.id,
    nodePresetName: nodePreset.name,
    createdAt: new Date().toISOString(),
    state: cloneState(state),
    summary: {
      damageIndex: metrics.damageIndex,
      dpsIndex: metrics.dpsIndex,
    },
  });
  savedSetups = savedSetups.slice(0, 20);
  persistSavedSetups();
  updateAutosaveStatus("비교 저장됨");
  renderComparison();
}

function loadComparisonSetup(setup) {
  persistState();
  const snapshotState = mergeState(DEFAULT_STATE, setup.state || DEFAULT_STATE);
  let profile = setup.profileId
    ? workspace.profiles.find(item => item.id === setup.profileId)
    : null;
  let nodePreset = setup.nodePresetId
    ? workspace.nodePresets.find(item => item.id === setup.nodePresetId)
    : null;

  if (!profile) {
    const profileName = getUniqueWorkspaceName(
      setup.profileName || `${setup.name || "비교 세팅"} 캐릭터`,
      workspace.profiles,
    );
    profile = createProfile(profileName, snapshotState);
    workspace.profiles.push(profile);
  } else {
    profile.state = extractProfileState(snapshotState);
    profile.updatedAt = new Date().toISOString();
  }

  if (!nodePreset) {
    const presetName = getUniqueWorkspaceName(
      setup.nodePresetName || `${setup.name || "비교 세팅"} 노드`,
      workspace.nodePresets,
    );
    nodePreset = createNodePreset(presetName, snapshotState.nodeLevels);
    workspace.nodePresets.push(nodePreset);
  } else {
    nodePreset.nodeLevels = normalizeNodeLevels(snapshotState.nodeLevels);
    nodePreset.updatedAt = new Date().toISOString();
  }

  workspace.activeProfileId = profile.id;
  workspace.activeNodePresetId = nodePreset.id;
  workspace.selectedTier = snapshotState.selectedTier || "전체";
  workspace.setupName = "";
  state = composeWorkspaceState(workspace);
  ensureNodeLevelKeys();
  persistState();
  render();
}

// Only the damage side of mana-only effects is scaled. Mana-skill cooldown
// reduction is left alone: pulling a cooldown in by 30% also builds stacks and
// gauge 30% faster, so the whole cycle speeds up regardless of whether the main
// skill itself spends mana.
function getManaShareRatio(convenience) {
  return clamp(readNumber(convenience?.manaShare ?? 100), 0, 100) / 100;
}

function calculateMetrics(inputState) {
  const convenience = { ...DEFAULT_STATE.convenience, ...(inputState.convenience || {}) };
  const manaShare = getManaShareRatio(convenience);
  const accessories = normalizeAccessories(inputState.accessories);
  const bracelet = normalizeBracelet(inputState.bracelet);
  const totalStats = {
    critStat: readNumber(inputState.base.critStat),
    specStat: readNumber(inputState.base.specStat),
    swiftStat: readNumber(inputState.base.swiftStat),
    dominationStat: readNumber(inputState.base.dominationStat),
    enduranceStat: readNumber(inputState.base.enduranceStat),
    expertiseStat: readNumber(inputState.base.expertiseStat),
  };
  if (Object.hasOwn(totalStats, convenience.petStat)) {
    totalStats[convenience.petStat] += ARC_PASSIVE_CONSTANTS.petStatBonus;
  }
  const percentBonuses = {
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
  const damageGroups = {};
  const specials = {
    bluntThorn: 0,
    sonicBreakthrough: 0,
  };
  let pointsUsed = 0;

  NODE_LIBRARY.forEach(node => {
    const level = clamp(Math.round(inputState.nodeLevels?.[node.id] || 0), 0, node.maxLevel);
    pointsUsed += level * getNodeCost(node);
    node.effects.forEach(effect => {
      applyEffect(effect, level, totalStats, percentBonuses, damageGroups, specials, manaShare);
    });
  });

  (inputState.baseEffects || []).forEach(effect => {
    applyBaseEffect(effect, percentBonuses, damageGroups);
  });

  const accessoryBonuses = calculateAccessoryBonuses(accessories);
  percentBonuses.critRate += accessoryBonuses.critRate;
  percentBonuses.critDamage += accessoryBonuses.critDamage;
  addDamageGroup(damageGroups, "추가 피해", accessoryBonuses.additionalDamage);

  const karmaDamage = clamp(Math.round(readNumber(convenience.evolutionKarmaRank)), 0, 6);
  addDamageGroup(damageGroups, "진화형 피해", karmaDamage);

  const goddessNodeLevel = clamp(
    Math.round(readNumber(inputState.nodeLevels?.["e2-goddess-blessing"])),
    0,
    3,
  );
  if (convenience.goddessBlessing) {
    const goddessNodeSpeed = goddessNodeLevel * 3;
    percentBonuses.attackSpeed += Math.max(0, ARC_PASSIVE_CONSTANTS.goddessBlessingSpeed - goddessNodeSpeed);
  }
  if (convenience.feast) {
    percentBonuses.attackSpeed += ARC_PASSIVE_CONSTANTS.feastSpeed;
  }

  if (inputState.settings.backAttack) {
    percentBonuses.critRate += ARC_PASSIVE_CONSTANTS.backAttackCritRate;
    addDamageGroup(damageGroups, "주는 피해", ARC_PASSIVE_CONSTANTS.backAttackDamage);
  }
  if (inputState.settings.headAttack) {
    addDamageGroup(damageGroups, "헤드어택 피해", ARC_PASSIVE_CONSTANTS.headAttackDamage);
  }

  applyArkGridEffects(inputState.arkGrid, percentBonuses, damageGroups);
  applyCollectionEffects(inputState.collection, totalStats, damageGroups);
  applyWeaponEffects(inputState.weapon, damageGroups);
  applyBraceletEffects(bracelet, inputState.settings, totalStats, percentBonuses, damageGroups);

  const engravingSpecials = applyEngravingEffects(
    inputState.engravings,
    percentBonuses,
    damageGroups,
    manaShare,
    inputState.settings,
  );

  return finalizeMetrics({
    settings: inputState.settings,
    specDamagePer100: readNumber(inputState.base.specDamagePer100),
    critDamageBonus: 0,
    totalStats,
    percentBonuses,
    damageGroups,
    specials,
    engravingSpecials,
    pointsUsed,
    accessoryBonuses,
  });
}

// Shared tail of the damage model. `calculateMetrics` and the combination search
// both funnel into this so the two paths can never drift apart.
function finalizeMetrics(context) {
  const {
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
  } = context;

  const specDamage = (totalStats.specStat / 100) * readNumber(specDamagePer100);
  if (specDamage !== 0) {
    addDamageGroup(damageGroups, "특화 효율", specDamage);
  }

  const critRateFromStat = totalStats.critStat * ARC_PASSIVE_CONSTANTS.critRatePerCrit;
  const attackSpeedFromSwift = totalStats.swiftStat * ARC_PASSIVE_CONSTANTS.attackSpeedPerSwift;
  const cooldownFromSwift = totalStats.swiftStat * ARC_PASSIVE_CONSTANTS.cooldownPerSwift;
  const critRateRaw = Math.max(
    critRateFromStat + percentBonuses.critRate,
    engravingSpecials.critRateMinimum,
  );
  const sharedSpeedBonus = attackSpeedFromSwift + percentBonuses.attackSpeed;
  const attackSpeed = sharedSpeedBonus + percentBonuses.attackSpeedOnly;
  const moveSpeedBonus = sharedSpeedBonus + percentBonuses.moveSpeedOnly;
  const attackSpeedRaw = 100 + attackSpeed;
  const moveSpeedRaw = 100 + moveSpeedBonus;
  const attackSpeedExcess = Math.max(0, attackSpeedRaw - 140);
  const moveSpeedExcess = Math.max(0, moveSpeedRaw - 140);
  const appliedAttackSpeedBonus = clamp(attackSpeed, -99, 40);
  const attackMoveSpeed = 100 + appliedAttackSpeedBonus;
  const moveSpeed = 100 + clamp(moveSpeedBonus, -99, 40);
  const raidCaptainDamage = clamp(moveSpeedBonus, 0, 40) * engravingSpecials.raidCaptainRate / 100;
  addDamageGroup(damageGroups, "주는 피해", raidCaptainDamage);
  const globalCooldownReduction = cooldownFromSwift + percentBonuses.cooldownReduction;
  const cooldownGroups = {
    global: globalCooldownReduction,
    mana: globalCooldownReduction + percentBonuses.manaCooldownReduction,
    skill: globalCooldownReduction + percentBonuses.skillCooldownReduction,
  };
  const cooldownReduction = Math.max(cooldownGroups.global, cooldownGroups.mana, cooldownGroups.skill);
  const cooldownGroupLabel = getCooldownGroupLabel(cooldownGroups, cooldownReduction);
  const bluntThornBonus = calculateBluntThornBonus(specials.bluntThorn, critRateRaw);
  const sonicBreakdown = calculateSonicBreakthroughBonus(
    specials.sonicBreakthrough,
    attackSpeed,
    moveSpeedBonus,
  );
  const sonicBonus = sonicBreakdown.damage;
  if (bluntThornBonus.damage > 0) {
    addDamageGroup(damageGroups, "진화형 피해", bluntThornBonus.damage);
  }
  if (sonicBonus > 0) {
    addDamageGroup(damageGroups, "진화형 피해", sonicBonus);
  }

  const critCap = specials.bluntThorn > 0 ? 80 : 100;
  const critRateCapped = clamp(critRateRaw, 0, critCap);
  const critDamage = Math.max(
    100,
    ARC_PASSIVE_CONSTANTS.baseCritDamage + readNumber(critDamageBonus) + percentBonuses.critDamage,
  );

  const critChance = critRateCapped / 100;
  const critOnlyMultiplier = 1 + percentBonuses.critOnlyDamage / 100;
  const critFactor = (1 - critChance) + critChance * (critDamage / 100) * critOnlyMultiplier;
  const damageMultiplier = Object.values(damageGroups).reduce((acc, value) => acc * (1 + value / 100), 1);
  const cooldownIncrease = Math.max(0, percentBonuses.cooldownIncrease);
  const cooldownFactor = settings.includeCooldown
    ? 1 / ((1 - clamp(cooldownReduction, 0, 80) / 100) * (1 + cooldownIncrease / 100))
    : 1;
  const attackSpeedFactor = settings.includeAttackSpeed ? attackMoveSpeed / 100 : 1;
  const damageIndex = 100 * critFactor * damageMultiplier;
  const dpsIndex = damageIndex * cooldownFactor * attackSpeedFactor;

  return {
    totalStats,
    percentBonuses,
    damageGroups,
    specials,
    engravingSpecials,
    bluntThornBonus,
    sonicBonus,
    sonicBreakdown,
    pointsUsed,
    critRateFromStat,
    critRateRaw,
    critRateCapped,
    critDamage,
    attackSpeed,
    attackSpeedRaw,
    attackSpeedExcess,
    attackMoveSpeed,
    moveSpeedBonus,
    moveSpeedRaw,
    moveSpeedExcess,
    moveSpeed,
    raidCaptainDamage,
    accessoryBonuses,
    cooldownGroups,
    cooldownGroupLabel,
    cooldownReduction,
    cooldownIncrease,
    critOnlyDamage: percentBonuses.critOnlyDamage,
    critFactor,
    damageMultiplier,
    cooldownFactor,
    attackSpeedFactor,
    damageIndex,
    dpsIndex,
  };
}

function applyEffect(effect, level, totalStats, percentBonuses, damageGroups, specials, manaShare) {
  if (effect.kind === "note") return;
  if (effect.kind === "special") {
    if (level > 0) specials[effect.key] = Math.max(specials[effect.key] || 0, level);
    return;
  }

  const amount = readNumber(effect.amount) * level * (effect.manaOnly ? manaShare : 1);
  if (amount === 0) return;

  if (effect.kind === "stat") {
    totalStats[effect.key] = readNumber(totalStats[effect.key]) + amount;
    return;
  }

  if (effect.kind === "damage") {
    addDamageGroup(damageGroups, effect.key, amount);
    return;
  }

  if (effect.kind === "critOnlyDamage") {
    percentBonuses.critOnlyDamage = readNumber(percentBonuses.critOnlyDamage) + amount;
    return;
  }

  percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
}

function applyBaseEffect(effect, percentBonuses, damageGroups) {
  const amount = readNumber(effect.amount);
  if (amount === 0) return;

  if (effect.category === "customDamage") {
    const label = (effect.customCategory || effect.label || "기타 피해").trim();
    addDamageGroup(damageGroups, label, amount);
    return;
  }

  if (effect.category.startsWith("damage:")) {
    const label = effect.category.slice("damage:".length);
    addDamageGroup(damageGroups, label, amount);
    return;
  }

  percentBonuses[effect.category] = readNumber(percentBonuses[effect.category]) + amount;
}

function applyEngravingEffects(engravingState, percentBonuses, damageGroups, manaShare, settings) {
  const engravingSpecials = {
    critRateMinimum: 0,
    raidCaptainRate: 0,
  };

  ENGRAVING_LIBRARY.forEach(engravingItem => {
    const tierIndex = getEngravingTierIndex(engravingState?.[engravingItem.id]);
    if (tierIndex < 0) return;
    applyEngravingTier(engravingItem, tierIndex, percentBonuses, damageGroups, engravingSpecials, manaShare, settings);
  });

  return engravingSpecials;
}

function applyEngravingTier(engravingItem, tierIndex, percentBonuses, damageGroups, engravingSpecials, manaShare, settings) {
  // Directional engravings follow the same 백어택/헤드어택 gating as bracelets,
  // so head-attack and back-attack effects can never stack on one hit.
  if (!isDirectionalConditionActive(engravingItem.condition, settings)) return;

  engravingItem.effects.forEach(effect => {
    const amount = readNumber(effect.amounts?.[tierIndex]) * (effect.manaOnly ? manaShare : 1);
    if (effect.kind === "damage") {
      addDamageGroup(damageGroups, effect.key, amount);
      return;
    }
    if (effect.kind === "percent") {
      percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
      return;
    }
    if (effect.kind === "special") {
      engravingSpecials[effect.key] = Math.max(readNumber(engravingSpecials[effect.key]), amount);
    }
  });
}

function getEngravingTierIndex(value) {
  return ENGRAVING_TIERS.findIndex(tier => tier.value === value);
}

function normalizeBracelet(bracelet) {
  const stats = BRACELET_STAT_FIELDS.reduce((result, item) => {
    result[item.key] = clamp(Math.round(readNumber(bracelet?.stats?.[item.key])), 0, 120);
    return result;
  }, {});
  const effects = {};

  BRACELET_EFFECTS.forEach(item => {
    const grade = bracelet?.effects?.[item.id];
    if (getBraceletGradeIndex(grade) >= 0) effects[item.id] = grade;
  });

  return { stats, effects };
}

function normalizeArkGrid(arkGrid) {
  const cores = {};
  CHAOS_CORE_SLOTS.forEach(slot => {
    const chosen = arkGrid?.cores?.[slot.key] || {};
    const known = CHAOS_CORES.some(core => core.id === chosen.id);
    cores[slot.key] = {
      id: known ? chosen.id : "none",
      points: CHAOS_CORE_POINTS.includes(Math.round(readNumber(chosen.points)))
        ? Math.round(readNumber(chosen.points))
        : 20,
      stage: clamp(Math.round(readNumber(chosen.stage)), 0, CHAOS_CORE_STAGES.length - 1),
    };
  });
  return { cores, gemLevel: clamp(Math.round(readNumber(arkGrid?.gemLevel)), 0, GEM_MAX_LEVEL) };
}

function applyCoreEffect(effect, stage, times, percentBonuses, damageGroups) {
  const raw = Array.isArray(effect.amounts) ? effect.amounts[stage] : effect.amount;
  const amount = readNumber(raw) * times;
  if (amount === 0) return;

  if (effect.kind === "damage") {
    addDamageGroup(damageGroups, effect.key, amount);
    return;
  }
  if (effect.kind === "critOnlyDamage") {
    percentBonuses.critOnlyDamage = readNumber(percentBonuses.critOnlyDamage) + amount;
    return;
  }
  percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
}

function applyArkGridEffects(arkGrid, percentBonuses, damageGroups) {
  const grid = normalizeArkGrid(arkGrid);

  CHAOS_CORE_SLOTS.forEach(slot => {
    const chosen = grid.cores[slot.key];
    const core = CHAOS_CORES.find(item => item.id === chosen.id);
    if (!core) return;

    // 포인트 구간은 누적이다. 17P를 고르면 10P와 14P 효과도 함께 붙는다.
    [10, 14, 17].forEach(threshold => {
      if (chosen.points < threshold) return;
      (core.thresholds[threshold] || []).forEach(effect => {
        applyCoreEffect(effect, chosen.stage, 1, percentBonuses, damageGroups);
      });
    });

    // 18~20P는 1포인트마다 같은 값이 한 번씩 더 붙는다.
    const extra = clamp(chosen.points - 17, 0, 3);
    if (extra > 0) {
      core.perPoint.forEach(effect => {
        applyCoreEffect(effect, chosen.stage, extra, percentBonuses, damageGroups);
      });
    }
  });

  addDamageGroup(damageGroups, "추가 피해", grid.gemLevel * GEM_ADDITIONAL_DAMAGE_PER_LEVEL);
}

function applyCollectionEffects(collection, totalStats, damageGroups) {
  const source = { ...DEFAULT_STATE.collection, ...(collection || {}) };
  totalStats.critStat = readNumber(totalStats.critStat) + readNumber(source.critStat);
  totalStats.specStat = readNumber(totalStats.specStat) + readNumber(source.specStat);
  totalStats.swiftStat = readNumber(totalStats.swiftStat) + readNumber(source.swiftStat);
  if (source.ranch) {
    addDamageGroup(damageGroups, "추가 피해", STANDALONE_SOURCES.ranchCollection.amount);
  }
}

// 무기 품질은 '무기 추가 피해'라는 별도 그룹으로 둔다. 이름이 다른 피해 그룹은
// 곱연산이라 일반 '추가 피해'와 합산되지 않는다.
function applyWeaponEffects(weapon, damageGroups) {
  const quality = clamp(Math.round(readNumber(weapon?.quality)), 0, WEAPON_QUALITY_MAX);
  addDamageGroup(damageGroups, "무기 추가 피해", weaponQualityDamage(quality));
}

function applyBraceletEffects(bracelet, settings, totalStats, percentBonuses, damageGroups) {
  BRACELET_STAT_FIELDS.forEach(item => {
    totalStats[item.key] = readNumber(totalStats[item.key]) + readNumber(bracelet.stats[item.key]);
  });

  BRACELET_EFFECTS.forEach(item => {
    const gradeIndex = getBraceletGradeIndex(bracelet.effects[item.id]);
    if (gradeIndex < 0 || !isDirectionalConditionActive(item.condition, settings)) return;

    item.effects.forEach(effect => {
      const amount = readNumber(effect.amounts?.[gradeIndex]);
      if (effect.kind === "damage") {
        addDamageGroup(damageGroups, effect.key, amount);
        return;
      }
      if (effect.kind === "percent") {
        percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + amount;
      }
    });
  });
}

function getBraceletGradeIndex(value) {
  return BRACELET_GRADES.findIndex(grade => grade.value === value);
}

function isDirectionalConditionActive(condition, settings) {
  if (!condition) return true;
  if (condition === "backAttack") return Boolean(settings?.backAttack);
  if (condition === "headAttack") return Boolean(settings?.headAttack);
  if (condition === "nonDirectional") return !settings?.backAttack && !settings?.headAttack;
  return false;
}

function normalizeAccessories(accessories) {
  const nextRings = Array.isArray(accessories?.rings) ? accessories.rings : [];
  return {
    necklace: {
      ...DEFAULT_STATE.accessories.necklace,
      ...(accessories?.necklace || {}),
    },
    rings: DEFAULT_STATE.accessories.rings.map((ring, index) => ({
      ...ring,
      ...(nextRings[index] || {}),
    })),
  };
}

function calculateAccessoryBonuses(accessories) {
  const result = {
    additionalDamage: getAccessoryOptionValue("necklace", "additionalDamage", accessories.necklace.additionalDamage),
    critRate: 0,
    critDamage: 0,
  };

  accessories.rings.forEach(ring => {
    result.critRate += getAccessoryOptionValue("ring", "critRate", ring.critRate);
    result.critDamage += getAccessoryOptionValue("ring", "critDamage", ring.critDamage);
  });
  return result;
}

function getAccessoryOptionValue(part, field, grade) {
  return readNumber(ACCESSORY_OPTION_VALUES[part]?.[field]?.[grade]);
}

function addDamageGroup(damageGroups, key, amount) {
  const value = readNumber(amount);
  if (value === 0) return;

  if (MULTIPLICATIVE_DAMAGE_GROUPS.has(key)) {
    const currentMultiplier = 1 + readNumber(damageGroups[key]) / 100;
    const nextMultiplier = currentMultiplier * (1 + value / 100);
    damageGroups[key] = (nextMultiplier - 1) * 100;
    return;
  }

  damageGroups[key] = readNumber(damageGroups[key]) + value;
}

function calculateBluntThornBonus(level, critRateRaw) {
  if (level <= 0) return { damage: 0, convertedCrit: 0 };
  const excessCritRate = Math.max(0, readNumber(critRateRaw) - 80);
  const conversionRate = level >= 2 ? 1.5 : 1.25;
  const conversionLimit = level >= 2 ? 60 : 45;
  return {
    damage: Math.min(excessCritRate * conversionRate, conversionLimit),
    convertedCrit: Math.min(excessCritRate, conversionLimit / conversionRate),
  };
}

function calculateSonicBreakthroughBonus(level, attackSpeedBonus, moveSpeedBonus) {
  if (level <= 0) {
    return { damage: 0, baseDamage: 0, capBonus: 0, excessDamage: 0 };
  }

  const maxDamage = level >= 2 ? 24 : 12;
  const baseRate = level >= 2 ? 0.1 : 0.05;
  const fixedCapBonus = level >= 2 ? 8 : 4;
  const excessRate = level >= 2 ? 0.3 : 0.15;
  const appliedAttackBonus = clamp(readNumber(attackSpeedBonus), 0, 40);
  const appliedMoveBonus = clamp(readNumber(moveSpeedBonus), 0, 40);
  const attackExcess = Math.max(0, readNumber(attackSpeedBonus) - 40);
  const moveExcess = Math.max(0, readNumber(moveSpeedBonus) - 40);
  const bothOverCap = attackExcess > 0 && moveExcess > 0;
  const baseDamage = (appliedAttackBonus + appliedMoveBonus) * baseRate;
  const capBonus = bothOverCap ? fixedCapBonus : 0;
  const rawExcessDamage = bothOverCap ? (attackExcess + moveExcess) * excessRate : 0;
  const excessDamage = Math.min(rawExcessDamage, Math.max(0, maxDamage - baseDamage - capBonus));

  return {
    damage: baseDamage + capBonus + excessDamage,
    baseDamage,
    capBonus,
    excessDamage,
  };
}

function getCooldownGroupLabel(groups, selectedValue) {
  const epsilon = 0.0001;
  const labels = [];
  if (groups.mana > groups.global + epsilon && Math.abs(groups.mana - selectedValue) < epsilon) labels.push("끝마/무마");
  if (groups.skill > groups.global + epsilon && Math.abs(groups.skill - selectedValue) < epsilon) labels.push("최훈/타지");
  if (labels.length === 0) labels.push("공통");
  return labels.join(", ");
}

function getNodeCost(node) {
  return node.cost || EVOLUTION_TIERS[node.tier]?.cost || 0;
}

function getTierUsage(tier, excludedNodeId = "") {
  const tierInfo = EVOLUTION_TIERS[tier];
  const points = NODE_LIBRARY
    .filter(node => node.tier === tier && node.id !== excludedNodeId)
    .reduce((sum, node) => sum + (state.nodeLevels[node.id] || 0) * getNodeCost(node), 0);
  return {
    points,
    maxPoints: tierInfo?.maxPoints || points,
  };
}

function formatEffect(effect, level) {
  if (effect.kind === "note") return formatLevelAwareNote(effect.text, level);
  if (effect.kind === "special") return `${level > 0 ? "적용" : "미적용"}: ${effect.label}`;
  const total = readNumber(effect.amount) * level;
  const unit = effect.kind === "stat" ? "" : "%";
  const base = `${effect.label} +${formatNumber(total)}${unit}`;
  if (!effect.manaScope) return base;

  const share = getManaShareRatio(state.convenience);
  return `${base} → 마나 딜 비중 ${formatInteger(share * 100)}% 적용 +${formatNumber(total * share)}${unit}`;
}

function formatLevelAwareNote(text, level) {
  if (level <= 0) return text;
  return text.replace(/([+-]?\d+(?:\.\d+)?%?)\/([+-]?\d+(?:\.\d+)?%?)/g, (_match, first, second) => {
    if (level <= 1) return first;
    if (/^[+-]/.test(second) || !/^[+-]/.test(first)) return second;
    return `${first[0]}${second}`;
  });
}

function makeBreakdownRow(label, value, amount = 0) {
  const row = document.createElement("div");
  row.className = "breakdown-row";
  row.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>`;
  if (typeof amount === "number") {
    row.style.setProperty("--bar", `${clamp(amount, 0, 50) * 2}%`);
  }
  return row;
}

function makeFormulaRow(label, value) {
  const row = document.createElement("div");
  row.className = "formula-row";
  row.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
  return row;
}

function makeReferenceListItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function statusClass(value) {
  if (["미반영", "노트만"].includes(value)) return "muted";
  if (["풀효율", "부분 반영"].includes(value)) return "conditional";
  if (["계산 반영", "특성 반영"].includes(value)) return "modeled";
  if (value.includes("확인")) return "muted";
  return "";
}

function commit(shouldRender = true) {
  persistState();
  updateAutosaveStatus("저장 중");
  if (shouldRender) render();
}

function refreshCalculationsOnly() {
  const metrics = calculateMetrics(state);
  const baseline = calculateMetrics({ ...state, nodeLevels: emptyNodeLevels() });
  lastMetrics = metrics;
  renderMetrics(metrics, baseline);
  renderBreakdowns(metrics);
  renderComparison();
  if (typeof syncOptimizerPanel === "function") syncOptimizerPanel();
  updateAutosaveStatus("저장됨");
}

function persistState() {
  syncWorkspaceFromState();
  persistWorkspace();
}

function persistSavedSetups() {
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedSetups));
}

function persistWorkspace() {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

function loadWorkspace() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
    if (parsed) return normalizeWorkspace(parsed);
  } catch {
    // Fall through to the legacy state migration.
  }

  try {
    const legacyState = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    return createWorkspaceFromState(legacyState || DEFAULT_STATE);
  } catch {
    return createWorkspaceFromState(DEFAULT_STATE);
  }
}

function createWorkspaceFromState(sourceState) {
  const normalizedState = mergeState(DEFAULT_STATE, sourceState || DEFAULT_STATE);
  const profile = createProfile("기본 캐릭터", normalizedState);
  const nodePreset = createNodePreset("현재 노드", normalizedState.nodeLevels);
  return {
    version: 4,
    activeProfileId: profile.id,
    activeNodePresetId: nodePreset.id,
    selectedTier: normalizedState.selectedTier || "전체",
    setupName: normalizedState.setupName || "",
    profiles: [profile],
    nodePresets: [nodePreset],
  };
}

function normalizeWorkspace(source) {
  const sourceProfiles = Array.isArray(source?.profiles) ? source.profiles : [];
  const sourceNodePresets = Array.isArray(source?.nodePresets) ? source.nodePresets : [];
  const profiles = sourceProfiles.map((profile, index) => ({
    id: profile.id || makeId(),
    name: String(profile.name || `캐릭터 ${index + 1}`).slice(0, 40),
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: profile.updatedAt || profile.createdAt || new Date().toISOString(),
    state: extractProfileState(profile.state || profile),
  }));
  const nodePresets = sourceNodePresets.map((preset, index) => ({
    id: preset.id || makeId(),
    name: String(preset.name || `노드 ${index + 1}`).slice(0, 40),
    createdAt: preset.createdAt || new Date().toISOString(),
    updatedAt: preset.updatedAt || preset.createdAt || new Date().toISOString(),
    nodeLevels: normalizeNodeLevels(preset.nodeLevels),
  }));

  if (profiles.length === 0) profiles.push(createProfile("기본 캐릭터", DEFAULT_STATE));
  if (nodePresets.length === 0) nodePresets.push(createNodePreset("현재 노드", emptyNodeLevels()));

  const activeProfileId = profiles.some(item => item.id === source?.activeProfileId)
    ? source.activeProfileId
    : profiles[0].id;
  const activeNodePresetId = nodePresets.some(item => item.id === source?.activeNodePresetId)
    ? source.activeNodePresetId
    : nodePresets[0].id;

  return {
    version: 4,
    activeProfileId,
    activeNodePresetId,
    selectedTier: source?.selectedTier || "전체",
    setupName: source?.setupName || "",
    profiles,
    nodePresets,
  };
}

function createProfile(name, sourceState) {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name,
    createdAt: now,
    updatedAt: now,
    state: extractProfileState(sourceState),
  };
}

function createNodePreset(name, nodeLevels) {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name,
    createdAt: now,
    updatedAt: now,
    nodeLevels: normalizeNodeLevels(nodeLevels),
  };
}

function extractProfileState(sourceState) {
  const normalizedState = mergeState(DEFAULT_STATE, sourceState || DEFAULT_STATE);
  return {
    base: cloneState(normalizedState.base),
    settings: cloneState(normalizedState.settings),
    convenience: cloneState(normalizedState.convenience),
    accessories: cloneState(normalizedState.accessories),
    bracelet: cloneState(normalizedState.bracelet),
    engravings: cloneState(normalizedState.engravings),
    baseEffects: cloneState(normalizedState.baseEffects),
  };
}

function normalizeNodeLevels(nodeLevels) {
  return NODE_LIBRARY.reduce((levels, node) => {
    levels[node.id] = clamp(Math.round(readNumber(nodeLevels?.[node.id])), 0, node.maxLevel);
    return levels;
  }, {});
}

function composeWorkspaceState(sourceWorkspace) {
  const profile = sourceWorkspace.profiles.find(item => item.id === sourceWorkspace.activeProfileId)
    || sourceWorkspace.profiles[0];
  const nodePreset = sourceWorkspace.nodePresets.find(item => item.id === sourceWorkspace.activeNodePresetId)
    || sourceWorkspace.nodePresets[0];
  return mergeState(DEFAULT_STATE, {
    ...cloneState(profile.state),
    nodeLevels: cloneState(nodePreset.nodeLevels),
    selectedTier: sourceWorkspace.selectedTier || "전체",
    setupName: sourceWorkspace.setupName || "",
  });
}

function syncWorkspaceFromState() {
  const profile = getActiveProfile();
  const nodePreset = getActiveNodePreset();
  const now = new Date().toISOString();
  if (profile) {
    profile.state = extractProfileState(state);
    profile.updatedAt = now;
  }
  if (nodePreset) {
    nodePreset.nodeLevels = normalizeNodeLevels(state.nodeLevels);
    nodePreset.updatedAt = now;
  }
  workspace.selectedTier = state.selectedTier || "전체";
  workspace.setupName = state.setupName || "";
}

function getActiveProfile() {
  return workspace.profiles.find(item => item.id === workspace.activeProfileId) || workspace.profiles[0];
}

function getActiveNodePreset() {
  return workspace.nodePresets.find(item => item.id === workspace.activeNodePresetId) || workspace.nodePresets[0];
}

function loadSavedSetups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeState(base, next) {
  // 치적/치피는 출처별 입력으로 갈렸다. 예전 저장본에 남아 있어도 무시한다.
  const nextBase = { ...(next.base || {}) };
  delete nextBase.baseCritDamage;
  delete nextBase.baseCritRate;
  delete nextBase.critDamageBonus;

  const accessories = normalizeAccessories(next.accessories);
  const bracelet = normalizeBracelet(next.bracelet);

  return {
    base: { ...base.base, ...nextBase },
    settings: { ...base.settings, ...(next.settings || {}) },
    convenience: { ...base.convenience, ...(next.convenience || {}) },
    accessories,
    bracelet,
    arkGrid: normalizeArkGrid(next.arkGrid),
    collection: { ...base.collection, ...(next.collection || {}) },
    weapon: { ...base.weapon, ...(next.weapon || {}) },
    engravings: { ...(next.engravings || {}) },
    nodeLevels: { ...(next.nodeLevels || {}) },
    baseEffects: normalizeBaseEffects(next.baseEffects, base.baseEffects),
    selectedTier: next.selectedTier || base.selectedTier,
    setupName: next.setupName || "",
  };
}

function normalizeBaseEffects(effects, fallbackEffects) {
  const source = Array.isArray(effects) ? effects : cloneState(fallbackEffects);

  return source.flatMap(effect => {
    if (effect.category !== "attackSpeed") return [effect];

    const id = effect.id || makeId();
    const label = String(effect.label || "공격/이동속도").trim();
    const genericLabel = /공격\s*\/?\s*이동속도|공이속/.test(label);
    return [
      {
        ...effect,
        id,
        label: genericLabel ? "공격속도" : `${label} · 공속`,
        category: "attackSpeedOnly",
      },
      {
        ...effect,
        id: `${id}-move`,
        label: genericLabel ? "이동속도" : `${label} · 이속`,
        category: "moveSpeedOnly",
      },
    ];
  });
}

function ensureNodeLevelKeys() {
  NODE_LIBRARY.forEach(node => {
    if (typeof state.nodeLevels[node.id] !== "number") state.nodeLevels[node.id] = 0;
  });
}

function emptyNodeLevels() {
  return NODE_LIBRARY.reduce((levels, node) => {
    levels[node.id] = 0;
    return levels;
  }, {});
}

function exportState() {
  persistState();
  const payload = {
    exportedAt: new Date().toISOString(),
    workspace,
    state,
    savedSetups,
    constants: ARC_PASSIVE_CONSTANTS,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ark-passive-simulator.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importState(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      if (payload.workspace) {
        workspace = normalizeWorkspace(payload.workspace);
      } else if (payload.state) {
        workspace = createWorkspaceFromState(payload.state);
      }
      if (Array.isArray(payload.savedSetups)) savedSetups = payload.savedSetups;
      state = composeWorkspaceState(workspace);
      ensureNodeLevelKeys();
      persistSavedSetups();
      commit();
    } catch {
      window.alert("불러오기 파일을 읽지 못했습니다.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function updateAutosaveStatus(text) {
  clearTimeout(statusTimer);
  dom.autosaveStatus.textContent = text;
  statusTimer = setTimeout(() => {
    dom.autosaveStatus.textContent = "저장됨";
  }, 500);
}

function iconSvg(name) {
  const icons = {
    focus: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/></svg>',
    surge: '<svg viewBox="0 0 24 24"><path d="M5 19 12 3l7 16-7-4-7 4Z"/></svg>',
    wind: '<svg viewBox="0 0 24 24"><path d="M4 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M5 18h7"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>',
    flare: '<svg viewBox="0 0 24 24"><path d="m12 2 2 7 7 3-7 3-2 7-2-7-7-3 7-3 2-7Z"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M13 2 5 14h6l-1 8 9-13h-6l0-7Z"/></svg>',
    blade: '<svg viewBox="0 0 24 24"><path d="M14 3 4 16l4 4L21 10l-7-7Z"/><path d="m4 16-2 6 6-2"/></svg>',
    target: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 8a4 4 0 1 0 4 4"/><path d="M22 2 12 12"/></svg>',
    mark: '<svg viewBox="0 0 24 24"><path d="M12 2 9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7Z"/><path d="M12 8v8"/></svg>',
    cycle: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-13 6"/><path d="M4 12a8 8 0 0 1 13-6"/><path d="M17 3v3h-3M7 21v-3h3"/></svg>',
    crown: '<svg viewBox="0 0 24 24"><path d="M4 18h16l1-10-5 4-4-8-4 8-5-4 1 10Z"/><path d="M5 22h14"/></svg>',
    sigil: '<svg viewBox="0 0 24 24"><path d="m12 2 9 10-9 10-9-10 9-10Z"/><path d="m12 7 4 5-4 5-4-5 4-5Z"/></svg>',
  };
  return icons[name] || icons.sigil;
}

function miniIcon(name) {
  const icons = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14"/></svg>',
  };
  return icons[name];
}

function readNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return readNumber(value).toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatInteger(value) {
  return Math.round(readNumber(value)).toLocaleString("ko-KR");
}

function formatInputValue(value) {
  return Number.isFinite(Number(value)) ? String(value) : "0";
}

function percentDelta(value, base) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return 0;
  return (value / base - 1) * 100;
}

function formatSignedPercent(value) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatNumber(value)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId() {
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
