<script>
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import {
    app, persist, ensureEditable,
    saveEngravingSlot, applyEngravingSlot, updateEngravingSlot, removeEngravingSlot,
  } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";
  import Select from "./Select.svelte";

  let { open = $bindable(false) } = $props();

  const TIER_OPTIONS = [
    { value: "none", label: "미적용" },
    ...ENGRAVING_TIERS.map(tier => ({ value: tier.value, label: tier.label })),
  ];

  const groups = [
    { title: "피해 증가", items: ENGRAVING_LIBRARY.filter(i => i.section === "damage"), dim: false },
    { title: "기타", items: ENGRAVING_LIBRARY.filter(i => i.section !== "damage"), dim: true },
  ];

  const activeCount = $derived(
    ENGRAVING_LIBRARY.filter(i => getEngravingTierIndex(app.character.engravings[i.id]) >= 0).length,
  );

  function setTier(item, value) {
    // 각인도 슬롯이 드는 빌드다. 읽기 전용 슬롯이면 여기서 사본이 선다.
    ensureEditable();
    if (value === "none") delete app.character.engravings[item.id];
    else app.character.engravings[item.id] = value;
    persist();
  }
</script>

<Dialog bind:open title="각인" subtitle="{activeCount}개 적용" width="1000px">
  <!--
    각인은 원정대 공유다. 캐릭터를 갈아타도 같은 각인을 끼므로 세팅과 따로 둔다.

    남의 원정대를 대신 굴려 보는 동안 내 각인이 오염되면 안 되니, 불러오기는
    세팅만 채우고 슬롯은 안 건드린다 — 저장은 여기서 누를 때만 한다.
  -->
  <div class="roster">
    <b>보유 각인</b>
    <div class="roster-slots">
      {#each app.engravingRoster as slot (slot.id)}
        <div class="roster-slot">
          <button type="button" class="roster-apply" title="이 각인을 지금 세팅에 적용"
                  onclick={() => applyEngravingSlot(slot.id)}>{slot.name}</button>
          <button type="button" class="roster-act" title="지금 세팅으로 덮기"
                  onclick={() => updateEngravingSlot(slot.id)}>덮기</button>
          <button type="button" class="roster-act rm" title="지우기"
                  onclick={() => removeEngravingSlot(slot.id)}>×</button>
        </div>
      {/each}
      <button type="button" class="roster-add" onclick={() => saveEngravingSlot(prompt("원정대 이름", "내 원정대") ?? "")}>
        + 지금 각인 저장
      </button>
    </div>
  </div>
  <div class="pick-grid">
    {#each groups as group}
      <section class="pick-group" class:dim={group.dim}>
        <h3>{group.title}</h3>
        <div class="pick-list">
          {#each group.items as item (item.id)}
            {@const tierIndex = getEngravingTierIndex(app.character.engravings[item.id])}
            {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
            <div class="pick" class:on={tierIndex >= 0} class:inactive={tierIndex >= 0 && !on}>
              <span class="pick-name">{item.name}</span>
              <Select label="{item.name} 단계" options={TIER_OPTIONS}
                      value={app.character.engravings[item.id] ?? "none"}
                      onchange={next => setTier(item, next)} />
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
