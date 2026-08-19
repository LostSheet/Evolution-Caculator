<script>
  /**
   * 진화 노드 — 140포인트 배분.
   *
   * 서랍에 있던 것을 페이지로 되돌린다. 편집 대상이 내 빌드 하나로 정해지면서
   * "고치는 곳은 페이지, 보는 곳은 서랍"이 규칙이 됐는데, 노드판만 서랍에
   * 남으면 그 규칙이 깨진다 — 장비는 페이지에서, 노드는 서랍에서 고치게 되어
   * 편집 자리가 다시 둘이 된다.
   *
   * 펫·음식도 같이 온다. 노드와 함께 봐야 남는 포인트를 어디에 쓸지가 보인다.
   */
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex, isDirectionalConditionActive, FOODS } from "../core/metrics.js";
  import { OPTIMIZER_PET_LABELS, OPTIMIZER_PET_OPTIONS } from "../core/search.js";
  import { app, persist } from "../store.svelte.js";
  import NodeBoard from "./NodeBoard.svelte";
  import Gauge from "./Gauge.svelte";
  import Select from "./Select.svelte";

  let { report, budget, onOpenEngravings } = $props();

  const worn = $derived(
    ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(app.character.engravings[item.id]) >= 0),
  );

  const PET_OPTIONS = OPTIMIZER_PET_OPTIONS.map(value => ({ value, label: OPTIMIZER_PET_LABELS[value] }));
  const FOOD_OPTIONS = FOODS.map(food => ({ value: food.id, label: food.label, hint: food.summary }));

  // 탐색 화면의 같은 이름 칸은 '탐색에 맡길지'를 묻는 규칙이라 여기와 다른 것을
  // 정한다 — 그쪽은 이 값을 고정으로 쓸 뿐이다.
  function setPet(value) {
    app.character.convenience.petStat = value;
    persist();
  }

  function setFood(value) {
    app.character.convenience.food = value;
    persist();
  }
</script>

<div class="split">
  <div class="split-main">
    <NodeBoard {report} {budget} />

    <section class="card">
      <div class="card-hd">
        <h2>각인</h2>
        <span class="spacer"></span>
        <span class="eyebrow">{worn.length} / 5 슬롯</span>
        <button class="btn sm" type="button" onclick={onOpenEngravings}>편집</button>
      </div>
      <div class="card-body">
        <div class="summary-line">
          {#if worn.length === 0}
            <span class="empty">선택 없음</span>
          {:else}
            {#each worn as item (item.id)}
              {@const tier = ENGRAVING_TIERS[getEngravingTierIndex(app.character.engravings[item.id])]}
              {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
              <span class="chip" class:muted={!on}>{item.name} · {tier.label}{on ? "" : " · 미적용"}</span>
            {/each}
          {/if}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-hd"><h2>펫 · 음식</h2></div>
      <div class="card-body">
        <div class="fields">
          <div class="field">
            <span>펫 효과</span>
            <Select label="펫 효과" options={PET_OPTIONS}
                    value={app.character.convenience.petStat || "none"} onchange={setPet} />
          </div>
          <div class="field">
            <span>음식</span>
            <Select label="음식" options={FOOD_OPTIONS}
                    value={app.character.convenience.food || "none"} onchange={setFood} />
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- 진화 포인트는 노드판 머리에 이미 있다. 여기 또 적으면 같은 숫자가 두 번이다. -->
  <Gauge {report} title="상세" showLead={false} />
</div>
