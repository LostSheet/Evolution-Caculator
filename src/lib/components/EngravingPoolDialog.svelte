<script>
  import { ENGRAVING_TIERS, NON_RAID_ENGRAVINGS } from "../core/engravings.js";
  import { isDirectionalConditionActive } from "../core/metrics.js";
  import { formatInteger } from "../core/util.js";
  import {
    OPTIMIZER_ENGRAVING_ROLES, OPTIMIZER_ROLE_LABELS, DIRECTION_REQUIREMENT_LABELS,
    getModeledEngravings, defaultEngravingRole,
  } from "../core/search.js";
  import { getEngravingRole, getEngravingSearchTierIndex, buildSearchPlan } from "../core/runner.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();

  const items = getModeledEngravings();
  const plan = $derived(buildSearchPlan(app.character, app.search));
  const optionCount = $derived(plan.engravings.dimensions[0]?.options.length ?? 0);

  const summary = $derived(
    app.search.engravingSlots === "fixed"
      ? "각인 개수가 '탐색 안 함'이라 조합하지 않습니다"
      : `${plan.engravings.slots}슬롯 · 고정 ${plan.engravings.locked.length} · 후보 ${plan.engravings.candidates.length} → ${formatInteger(optionCount)}가지`,
  );

  function setRole(item, role) {
    app.search.engravingRoles = { ...app.search.engravingRoles, [item.id]: role };
    persist();
  }

  function setTier(item, value) {
    app.search.engravingTiers = { ...app.search.engravingTiers, [item.id]: value };
    persist();
  }

  function preset(kind) {
    const roles = {};
    const tiers = { ...app.search.engravingTiers };
    for (const item of items) {
      if (kind === "raid") roles[item.id] = defaultEngravingRole(item);
      else if (kind === "allCandidate") roles[item.id] = "candidate";
      else if (kind === "allExcluded") roles[item.id] = "excluded";
      else if (kind === "fromCurrent") {
        const current = app.character.engravings?.[item.id];
        const has = ENGRAVING_TIERS.some(t => t.value === current);
        roles[item.id] = has ? "locked" : "excluded";
        if (has) tiers[item.id] = current;
      }
    }
    app.search.engravingRoles = roles;
    app.search.engravingTiers = tiers;
    persist();
  }
</script>

<Dialog bind:open title="각인 후보 설정" subtitle={summary} width="820px">
  <div class="engraving-dialog-body engraving-pool-body">
    <p class="engraving-pool-help">
      <strong>고정</strong>은 항상 슬롯을 차지하고, <strong>후보</strong> 중에서 남은 슬롯을 채웁니다.
      <strong>제외</strong>는 탐색에서 아예 빠집니다. 단계는 해당 각인을 실제로 쓸 수 있는 단계로 맞춰 주세요.
    </p>
    {#if plan.engravings.overflow}
      <p class="engraving-pool-warning">
        고정 각인 {plan.engravings.locked.length}개가 슬롯 {plan.engravings.slots}개를 넘습니다. 슬롯을 늘리거나 고정을 줄여 주세요.
      </p>
    {/if}
    <div class="engraving-pool-toolbar">
      <button class="ghost-button" type="button" onclick={() => preset("raid")}>레이드 기본값</button>
      <button class="ghost-button" type="button" onclick={() => preset("allCandidate")}>전체 후보</button>
      <button class="ghost-button" type="button" onclick={() => preset("allExcluded")}>전체 제외</button>
      <button class="ghost-button" type="button" onclick={() => preset("fromCurrent")}>현재 각인을 고정으로</button>
    </div>
    <div class="engraving-pool-list">
      {#each items as item (item.id)}
        {@const role = getEngravingRole(item, app.search)}
        {@const tierIndex = getEngravingSearchTierIndex(item, app.search)}
        {@const conditionActive = isDirectionalConditionActive(item.condition, app.character.settings)}
        <div class="engraving-pool-row" data-role={role} class:condition-inactive={role !== "excluded" && !conditionActive}>
          <div class="engraving-pool-name">
            <strong>{item.name}</strong>
            <small class="engraving-pool-note">
              {conditionActive
                ? (NON_RAID_ENGRAVINGS.get(item.id) ?? item.tierSummaries[tierIndex])
                : `${DIRECTION_REQUIREMENT_LABELS[item.condition]} · 현재 효과 없음`}
            </small>
          </div>
          <select aria-label="{item.name} 탐색 역할" value={role} onchange={e => setRole(item, e.currentTarget.value)}>
            {#each OPTIMIZER_ENGRAVING_ROLES as option}
              <option value={option}>{OPTIMIZER_ROLE_LABELS[option]}</option>
            {/each}
          </select>
          <select
            aria-label="{item.name} 단계"
            value={ENGRAVING_TIERS[tierIndex].value}
            disabled={role === "excluded"}
            onchange={e => setTier(item, e.currentTarget.value)}
          >
            {#each ENGRAVING_TIERS as tier}<option value={tier.value}>{tier.label}</option>{/each}
          </select>
        </div>
      {/each}
    </div>
  </div>
</Dialog>
