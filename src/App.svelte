<script>
  import {
    app, PAGES, PAGE, goPage, startSearch, cancelSearch, cycleTheme,
    baselineState, baselineRef, selectedResult, resultState, resultChanges, confirmResult,
    toggleDrawer, openDrawer, activeSlot, selectSlot, buildState,
  } from "./lib/store.svelte.js";
  import { explainMetrics } from "./lib/core/explain.js";
  import { calculateMetrics } from "./lib/core/metrics.js";
  import { buildSearchPlan } from "./lib/core/runner.js";
  import { readNumber, formatNumber, percentDelta } from "./lib/core/util.js";
  import StatusBar from "./lib/components/StatusBar.svelte";
  import PageSetup from "./lib/components/PageSetup.svelte";
  import PageAwakening from "./lib/components/PageAwakening.svelte";
  import PageRules from "./lib/components/PageRules.svelte";
  import PageResults from "./lib/components/PageResults.svelte";
  import PageCompare from "./lib/components/PageCompare.svelte";
  import EngravingDialog from "./lib/components/EngravingDialog.svelte";
  import BraceletDialog from "./lib/components/BraceletDialog.svelte";
  import SavesMenu from "./lib/components/SavesMenu.svelte";
  import CharacterDialog from "./lib/components/CharacterDialog.svelte";
  import Gauge from "./lib/components/Gauge.svelte";
  import BuildDrawer from "./lib/components/BuildDrawer.svelte";

  let engravingsOpen = $state(false);
  let braceletOpen = $state(false);
  let gaugeOpen = $state(false);
  let characterOpen = $state(false);

  const report = $derived(explainMetrics(app.character));
  const budget = $derived(Math.max(0, readNumber(app.character.settings.pointBudget)));
  const plan = $derived(buildSearchPlan(app.character, app.search));

  // 기준 세팅의 지표. 기준은 빌드 부분(노드·각인·펫)만 들고 있으므로 지금 장비
  // 위에 얹어서 잰다 — 장비를 바꾸면 양쪽에 똑같이 걸려 상쇄되고, 남는 차이는
  // 빌드 차이뿐이다.
  const base = $derived.by(() => {
    const state = baselineState();
    return state ? calculateMetrics(state) : null;
  });

  // 기준과 같아지면 아예 안 띄운다. `+0.00%`는 읽을 게 없다.
  // 기준값도 같이 적는다 — "−2.63%"만 있으면 무엇에서 내려온 건지 알 수가 없다.
  const compare = (now, was, name) => {
    const pairs = [
      { now: now.damageIndex, was: was.damageIndex },
      { now: now.dpsIndex, was: was.dpsIndex },
    ].map(pair => ({ ...pair, value: percentDelta(pair.now, pair.was) }));
    // 둘 다 제자리면 같은 빌드다. 한쪽만 움직였으면 그건 보여준다 —
    // 포인트를 옮겨 한 방 딜은 그대로인데 쿨감만 바뀌는 일이 실제로 있다.
    if (pairs.every(pair => Math.abs(pair.value) < 0.005)) return [];
    return pairs.map(pair => ({
      value: pair.value,
      label: `${name} ${formatNumber(pair.was)} 대비`,
    }));
  };

  // 탐색에서 고른 후보. 탐색 화면에서는 막대가 이걸 든다 — 그 화면에서 눈이
  // 좇는 숫자가 내 빌드가 아니라 후보이므로. 다만 서랍을 열면 손이 만지는 것은
  // 내 빌드라, 그때는 다시 내 빌드를 잰다.
  const picked = $derived(app.page === PAGE.results && !app.drawer.open ? selectedResult() : null);
  const pickedReport = $derived.by(() => {
    const state = resultState(picked);
    return state ? explainMetrics(state) : null;
  });
  const pickedChanges = $derived(picked ? resultChanges(picked) : []);

  /**
   * 비교함 — 접힌 막대에 열로 서는 것들.
   *
   * 지금 만지는 슬롯은 살아 있는 빌드를 잰다. 슬롯에 적힌 값은 마지막 저장
   * 시점이라 방금 올린 노드가 숫자에 안 나타난다.
   *
   * 기준은 못 박지 않는다 — 인게임이 첫 칸에 자동으로 들어가 있고, 기준으로
   * 삼은 칸은 제 값을, 나머지는 그 칸 대비 증감을 적는다.
   */
  const boxSlots = $derived.by(() => {
    const scores = app.slots.map(slot => calculateMetrics(buildState(
      slot.id === app.activeSlotId
        ? {
            nodeLevels: app.character.nodeLevels,
            engravings: app.character.engravings || {},
            pet: app.character.convenience.petStat || "none",
          }
        : slot.build,
    )));
    const baseAt = Math.max(0, app.slots.findIndex(slot => slot.id === app.baseSlotId));
    return app.slots.map((slot, at) => {
      const was = scores[baseAt]?.damageIndex;
      const now = scores[at]?.damageIndex;
      const movable = at !== baseAt && Number.isFinite(was) && Number.isFinite(now) && was !== 0;
      return {
        id: slot.id,
        name: slot.name,
        isBase: at === baseAt,
        damageIndex: scores[at].damageIndex,
        dpsIndex: scores[at].dpsIndex,
        delta: movable ? { value: percentDelta(now, was) } : null,
      };
    });
  });

  const bar = $derived.by(() => {
    if (pickedReport) {
      return {
        report: pickedReport,
        deltas: compare(pickedReport, report, "지금 내 빌드"),
        label: "고른 후보",
        handle: null,
        action: {
          label: pickedChanges.length > 0 ? `슬롯에 담기 (${pickedChanges.length}곳) →` : "지금 빌드와 같음",
          disabled: pickedChanges.length === 0,
          onClick: () => confirmResult(picked),
        },
      };
    }
    // 비교함이 접힌 모습. 담은 것을 열로 세운다.
    return {
      report: null,
      deltas: [],
      slots: boxSlots,
      label: "비교함",
      handle: { open: app.drawer.open, onToggle: toggleDrawer },
      action: null,
    };
  });

  // 테마는 CSS가 :root[data-theme]로 읽는다. "auto"면 표식을 지워서
  // prefers-color-scheme이 그대로 먹게 둔다.
  //
  // 바꾸는 순간에는 전환을 꺼야 한다. 단추와 표에 color 전환이 걸려 있어서
  // 화면 전체가 130ms 동안 뭉개지기도 하고, 실제로 전환이 도는 중에 색
  // 변수가 바뀌면 그 요소만 옛 테마 색에 눌러앉는 걸 확인했다 —
  // 밝게 바꿨는데 상단 바 글자만 흰색으로 남았다.
  $effect(() => {
    const theme = app.theme;
    const root = document.documentElement;
    root.classList.add("theme-swap");
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    // 새 색이 한 번 그려진 다음에 전환을 되돌린다.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => root.classList.remove("theme-swap"));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  });

  const THEME_LABEL = { auto: "시스템", light: "밝게", dark: "어둡게" };
</script>

<header class="topbar">
  <div class="wordmark">아크 패시브 <b>계산기</b></div>

  <nav class="pages" aria-label="페이지">
    {#each PAGES as item, i}
      {#if i > 0}<span class="page-sep" aria-hidden="true"></span>{/if}
      <button type="button" class="page-tab"
              class:active={app.page === item.n}
              class:done={app.page > item.n}
              aria-current={app.page === item.n ? "page" : undefined}
              onclick={() => goPage(item.n)}>
        <em>{item.n}</em>
        <span class="page-text"><b>{item.label}</b></span>
      </button>
    {/each}
  </nav>

  <div class="topbar-actions">
    {#if app.page !== PAGE.setup}
      <button class="btn sm gauge-call" type="button" onclick={() => (gaugeOpen = true)}>상세</button>
    {/if}

    <button class="btn sm theme-btn" type="button" onclick={cycleTheme}
            title="화면 밝기 — {THEME_LABEL[app.theme]}"
            aria-label="화면 밝기 바꾸기 — 지금 {THEME_LABEL[app.theme]}">
      {#if app.theme === "light"}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" />
        </svg>
      {:else if app.theme === "dark"}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.4" />
          <path d="M12 3.6v16.8" />
          <path d="M12 3.6a8.4 8.4 0 0 1 0 16.8Z" fill="currentColor" stroke="none" />
        </svg>
      {/if}
      <span>{THEME_LABEL[app.theme]}</span>
    </button>

    <!-- 손으로 채우는 것보다 게임에서 받아오는 편이 빠르고 정확하다. 그래서
         저장 메뉴보다 앞에 둔다 — 새로 시작하는 사람이 제일 먼저 만난다. -->
    <button class="btn sm" type="button" onclick={() => (characterOpen = true)}
            title="로스트아크 API에서 캐릭터 읽어오기">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20.2a7.2 7.2 0 0 1 14 0" />
      </svg>
      <span>캐릭터</span>
    </button>

    <SavesMenu />

    <!-- 이 자리는 늘 '다음 걸음'이다. 설정 화면에서 다음 걸음은 돌리는 것이고,
         결과 화면에서는 나란히 놓고 보는 것이다. -->
    {#if app.page === PAGE.setup}
      <button class="btn primary" type="button" onclick={() => goPage(PAGE.awakening)}>깨달음으로 →</button>
    {:else if app.page === PAGE.awakening}
      <button class="btn primary" type="button" onclick={() => goPage(PAGE.rules)}>탐색 설정으로 →</button>
    {:else if app.running}
      <button class="btn" type="button" onclick={cancelSearch}>중지</button>
    {:else if app.page === PAGE.rules}
      <button class="btn primary" type="button" disabled={plan.engravings.overflow} onclick={startSearch}>
        {app.results ? "다시 탐색" : "탐색 실행"}
      </button>
    {:else if app.page === PAGE.results}
      <button class="btn primary" type="button" onclick={() => goPage(PAGE.compare)}>나란히 보기 →</button>
    {:else}
      <button class="btn primary" type="button" onclick={openDrawer}>빌드 열기</button>
    {/if}
  </div>
</header>

<main class="page" class:with-gauge={app.page !== PAGE.setup}>
  {#if app.page === PAGE.setup}
    <PageSetup
      onOpenBracelet={() => (braceletOpen = true)}
      onOpenCharacter={() => (characterOpen = true)}
    />
  {:else if app.page === PAGE.awakening}
    <PageAwakening />
  {:else if app.page === PAGE.rules}
    <PageRules {report} {plan} {budget} />
  {:else if app.page === PAGE.results}
    <PageResults />
  {:else}
    <PageCompare />
  {/if}
</main>

<!-- 빌드는 페이지가 아니라 물건이다. 어느 화면에서든 서랍으로 꺼낸다. -->
<BuildDrawer {report} {budget} onOpenEngravings={() => (engravingsOpen = true)} />

<!-- 답이 놓이는 자리. 어느 화면에 있든 늘 보인다. 이름표가 서랍 손잡이다. -->
<StatusBar report={bar.report} deltas={bar.deltas} label={bar.label}
           action={bar.action} handle={bar.handle}
           slots={bar.slots ?? null} activeId={app.activeSlotId} onPick={selectSlot} />

<EngravingDialog bind:open={engravingsOpen} />
<BraceletDialog bind:open={braceletOpen} />
<CharacterDialog bind:open={characterOpen} />

<!-- 폭이 좁아 오른쪽 상세가 접혔을 때 부르는 자리 -->
<dialog class="gauge-drawer" open={gaugeOpen} onclose={() => (gaugeOpen = false)}>
  {#if gaugeOpen}
    <div class="gauge-drawer-hd">
      <strong>상세</strong>
      <span class="spacer"></span>
      <button class="btn icon" type="button" aria-label="닫기" onclick={() => (gaugeOpen = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <Gauge {report} showHead={false} showLead={false} />
  {/if}
</dialog>
