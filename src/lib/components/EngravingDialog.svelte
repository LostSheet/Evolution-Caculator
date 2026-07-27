<script>
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();

  const groups = [
    { title: "피해 증가", items: ENGRAVING_LIBRARY.filter(i => i.section === "damage"), dim: false },
    { title: "기타", items: ENGRAVING_LIBRARY.filter(i => i.section !== "damage"), dim: true },
  ];

  const activeCount = $derived(
    ENGRAVING_LIBRARY.filter(i => getEngravingTierIndex(app.character.engravings[i.id]) >= 0).length,
  );

  function setTier(item, value) {
    if (value === "none") delete app.character.engravings[item.id];
    else app.character.engravings[item.id] = value;
    persist();
  }
</script>

<Dialog bind:open title="각인" subtitle="{activeCount}개 적용" width="1000px">
  <div class="pick-grid">
    {#each groups as group}
      <section class="pick-group" class:dim={group.dim}>
        <h3>{group.title}</h3>
        <div class="pick-list">
          {#each group.items as item (item.id)}
            {@const tierIndex = getEngravingTierIndex(app.character.engravings[item.id])}
            {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
            <div class="pick" class:on={tierIndex >= 0} class:inactive={tierIndex >= 0 && !on}>
              <label for="eng-{item.id}">{item.name}</label>
              <select id="eng-{item.id}" class="boxed"
                      value={app.character.engravings[item.id] ?? "none"}
                      onchange={e => setTier(item, e.currentTarget.value)}>
                <option value="none">미적용</option>
                {#each ENGRAVING_TIERS as tier}<option value={tier.value}>{tier.label}</option>{/each}
              </select>
              {#if tierIndex >= 0}
                <small>{item.tierSummaries[tierIndex]}{on ? "" : " · 현재 미적용"}</small>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</Dialog>
