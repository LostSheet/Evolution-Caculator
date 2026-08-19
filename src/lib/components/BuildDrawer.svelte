<script>
  /**
   * 빌드 서랍.
   *
   * 빌드는 더 이상 페이지가 아니다. 페이지였을 때는 "지금 무엇을 하는 중인가"와
   * "내 세팅이 무엇인가"가 같은 줄에 서 있었는데, 그 둘은 성격이 다르다. 앞은
   * 흐름이고 뒤는 물건이라, 물건은 어느 흐름에 있든 꺼내 볼 수 있어야 한다.
   *
   * 그래서 서랍이다. 평소엔 숨어 있고, 하단 막대가 손잡이다. 열어도 그 막대는
   * 그대로 보인다 — 만지는 동안 한 방 딜·DPS가 사라지면 만지는 이유가 사라진다.
   */
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex, isDirectionalConditionActive, FOODS } from "../core/metrics.js";
  import { OPTIMIZER_PET_LABELS, OPTIMIZER_PET_OPTIONS } from "../core/search.js";
  import {
    app, persist, closeDrawer, ensureEditable, setBaseSlot,
    activeSlot, slotReadOnly, slotOriginLabel, goPage, PAGE,
  } from "../store.svelte.js";
  import NodeBoard from "./NodeBoard.svelte";
  import Gauge from "./Gauge.svelte";
  import CompareTable from "./CompareTable.svelte";
  import Select from "./Select.svelte";

  let { report, budget, onOpenEngravings } = $props();

  /**
   * 서랍 안의 두 얼굴.
   *
   * 비교함  담은 것을 나란히. 슬롯을 다루는 단추도 여기 열 머리에 있다.
   * 빌드    지금 고른 슬롯 하나를 만진다.
   *
   * 겹쳐 두지 않고 탭으로 가른다. 둘 다 세로를 많이 먹어서 한 화면에 쌓으면
   * 어느 쪽도 제대로 안 보인다.
   */
  let tab = $state("compare");

  const current = $derived(activeSlot());
  const readOnly = $derived(slotReadOnly(current));

  const worn = $derived(
    ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(app.character.engravings[item.id]) >= 0),
  );

  const PET_OPTIONS = OPTIMIZER_PET_OPTIONS.map(value => ({ value, label: OPTIMIZER_PET_LABELS[value] }));
  const FOOD_OPTIONS = FOODS.map(food => ({ value: food.id, label: food.label, hint: food.summary }));

  // 펫과 음식은 슬롯이 드는 빌드다. 탐색 화면의 같은 이름 칸은 '탐색에 맡길지'를
  // 묻는 규칙이라 여기와 다른 것을 정한다 — 그쪽은 이 값을 고정으로 쓸 뿐이다.
  function setPet(value) {
    ensureEditable();
    app.character.convenience.petStat = value;
    persist();
  }

  function setFood(value) {
    ensureEditable();
    app.character.convenience.food = value;
    persist();
  }

  // 윗 모서리를 끌어내려 닫는다.
  //
  // 예전에는 오른쪽에서 밀려 들어왔다. 그런데 이 서랍을 여는 손잡이는 화면
  // 맨 아래 막대다 — 아래를 눌렀는데 옆에서 나오면 같은 물건으로 안 읽힌다.
  // 아래에서 올라오면 막대가 그대로 자라나는 것이 된다.
  let dragY = $state(0);
  let dragging = $state(false);

  function grab(event) {
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    dragY = 0;
    const startY = event.clientY;
    const move = e => { dragY = Math.max(0, e.clientY - startY); };
    const drop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      dragging = false;
      // 화면 높이의 6분의 1쯤 끌어내리면 닫는다. 그보다 짧으면 제자리로.
      if (dragY > window.innerHeight / 6) closeDrawer();
      dragY = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
  }

  function onKey(event) {
    if (event.key === "Escape") closeDrawer();
  }
</script>

<svelte:window onkeydown={app.drawer.open ? onKey : undefined} />

{#if app.drawer.open}
  <!-- 뒤 화면은 살아 있다. 어두워지되 클릭하면 닫힌다. -->
  <button class="bd-scrim" type="button" aria-label="빌드 서랍 닫기" onclick={closeDrawer}></button>
{/if}

<aside class="build-drawer" class:open={app.drawer.open} class:dragging
       style:transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
       aria-hidden={!app.drawer.open}
       inert={!app.drawer.open || undefined}>
  <div class="bd-grip" onpointerdown={grab} role="presentation" title="끌어내려 닫기"></div>

  <header class="bd-hd">
    <div class="bd-tabs" role="tablist" aria-label="서랍">
      <button class="bd-tab" type="button" role="tab" class:on={tab === "compare"}
              aria-selected={tab === "compare"} onclick={() => (tab = "compare")}>비교함</button>
      <button class="bd-tab" type="button" role="tab" class:on={tab === "build"}
              aria-selected={tab === "build"} onclick={() => (tab = "build")}>빌드</button>
    </div>
    <small class="bd-who">{current ? `${current.name} · ${slotOriginLabel(current)}` : "슬롯 없음"}</small>
    <span class="spacer"></span>
    <button class="btn icon" type="button" aria-label="닫기" onclick={closeDrawer}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </header>

  <div class="bd-body">
    {#if tab === "compare"}
      <!-- 편집을 누르면 그 슬롯으로 갈아타고 빌드 탭으로 넘어간다. 서랍 안이라
           서랍을 또 열 수는 없다. -->
      <CompareTable onEdit={() => (tab = "build")} />
    {:else}
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

        <!-- 펫과 음식도 슬롯이 든다. 노드·각인과 한 화면에 있어야 슬롯을
             갈아끼웠을 때 무엇이 같이 바뀌었는지가 보인다. -->
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
      <Gauge {report} title="상세" showLead={false} onPinBaseline={() => setBaseSlot(app.activeSlotId)} />
    </div>
    {/if}
  </div>
</aside>
