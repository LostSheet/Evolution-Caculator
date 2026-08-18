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
  import SlotBar from "./SlotBar.svelte";
  import Select from "./Select.svelte";

  let { report, budget, onOpenEngravings } = $props();

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

  // 왼쪽 모서리를 끌어서 닫는다. 서랍은 미는 물건이라는 감각이 있고,
  // 손잡이까지 커서를 옮기지 않아도 된다.
  let dragX = $state(0);
  let dragging = $state(false);

  function grab(event) {
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    dragX = 0;
    const startX = event.clientX;
    const move = e => { dragX = Math.max(0, e.clientX - startX); };
    const drop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      dragging = false;
      // 화면 폭의 6분의 1쯤 밀면 닫는다. 그보다 짧으면 제자리로 돌아온다.
      if (dragX > window.innerWidth / 6) closeDrawer();
      dragX = 0;
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
       style:transform={dragX > 0 ? `translateX(${dragX}px)` : undefined}
       aria-hidden={!app.drawer.open}
       inert={!app.drawer.open || undefined}>
  <div class="bd-grip" onpointerdown={grab} role="presentation" title="밀어서 닫기"></div>

  <header class="bd-hd">
    <div class="bd-title">
      <b>빌드</b>
      <small>{current ? `${current.name} · ${slotOriginLabel(current)}` : "슬롯 없음"}</small>
    </div>
    <span class="spacer"></span>
    <button class="btn sm" type="button" onclick={() => { closeDrawer(); goPage(PAGE.compare); }}>나란히 보기</button>
    <button class="btn icon" type="button" aria-label="닫기" onclick={closeDrawer}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </header>

  <SlotBar inDrawer />

  <div class="bd-body">
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
  </div>
</aside>
