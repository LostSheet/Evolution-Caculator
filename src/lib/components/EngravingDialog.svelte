<script>
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();

  const damage = ENGRAVING_LIBRARY.filter(item => item.section === "damage");
  const utility = ENGRAVING_LIBRARY.filter(item => item.section !== "damage");
  const activeCount = $derived(ENGRAVING_LIBRARY.filter(i => getEngravingTierIndex(app.character.engravings[i.id]) >= 0).length);

  function setTier(item, value) {
    if (value === "none") delete app.character.engravings[item.id];
    else app.character.engravings[item.id] = value;
    persist();
  }
</script>

<Dialog bind:open title="각인 설정" subtitle="{activeCount}개 적용" width="980px">
  <div class="engraving-dialog-body">
    {#each [{ title: "피해 증가 각인", items: damage }, { title: "기타 각인", items: utility }] as group}
      <section class="engraving-group" class:utility-engraving-group={group.title !== "피해 증가 각인"}>
        <h3>{group.title}</h3>
        <div class="engraving-list">
          {#each group.items as item (item.id)}
            {@const tierIndex = getEngravingTierIndex(app.character.engravings[item.id])}
            {@const conditionActive = isDirectionalConditionActive(item.condition, app.character.settings)}
            <div class="engraving-row" class:active={tierIndex >= 0} class:condition-inactive={tierIndex >= 0 && !conditionActive}>
              <label for="eng-{item.id}"><strong>{item.name}</strong></label>
              <select
                id="eng-{item.id}"
                value={app.character.engravings[item.id] ?? "none"}
                onchange={e => setTier(item, e.currentTarget.value)}
              >
                <option value="none">미적용</option>
                {#each ENGRAVING_TIERS as tier}<option value={tier.value}>{tier.label}</option>{/each}
              </select>
              {#if tierIndex >= 0}
                <small class="engraving-current-effect">
                  {item.tierSummaries[tierIndex]}{conditionActive ? "" : " · 현재 미적용"}
                </small>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</Dialog>
