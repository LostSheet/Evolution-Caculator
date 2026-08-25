<script>
  import {
    app, PAGES, PAGE, goPage, goTab, setTab, currentTab, sweepMarket, marketHasResults,
    selectedResult, resultState, boxedSlot, toggleBoxed,
    startSearch, cancelSearch, cycleTheme,
    toggleDrawer, buildState, makeMine,
    anchorState, premiseExceeded, focusView, focusResult, resultPool,
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
  import PageNodes from "./lib/components/PageNodes.svelte";
  import PageMarket from "./lib/components/PageMarket.svelte";
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

  /**
   * 닻 — 모든 증감의 기준.
   *
   * 전제(탐색이 후보에게 입히는 각인 단계)가 실물을 넘으면 실물은 증감 자격을
   * 잃는다. 두 세계가 다른데 증감을 달면 그건 빌드 차이가 아니라 각인서 차이를
   * 재는 것이라, 아무 후보나 집어도 세게 나온다. 그때는 같은 전제를 입은
   * 내 배분이 자리를 잇고, 실물은 꼬리표로 남는다.
   */
  const anchor = $derived.by(() => {
    const premise = premiseExceeded();
    const scores = calculateMetrics(anchorState());
    const real = premise ? calculateMetrics(app.character) : null;
    return {
      // 배지가 '전제 적용'을 이미 말한다. 이름에도 넣으면 같은 말이 두 번이다.
      name: premise ? "내 배분" : app.buildName,
      premise,
      damageIndex: scores.damageIndex,
      dpsIndex: scores.dpsIndex,
      real: real ? {
        damage: percentDelta(real.damageIndex, scores.damageIndex),
        dps: percentDelta(real.dpsIndex, scores.dpsIndex),
      } : null,
    };
  });

  /** 지금 견주는 하나. 표 줄이든 곡선 점이든 타일이든 여기로 온다. */
  const focused = $derived.by(() => {
    const view = focusView();
    if (!view) return null;
    const scores = calculateMetrics(buildState(view.build));
    return {
      ...view,
      damageDelta: percentDelta(scores.damageIndex, anchor.damageIndex),
      dpsDelta: percentDelta(scores.dpsIndex, anchor.dpsIndex),
    };
  });

  /**
   * ↑/↓로 줄을 옮긴다.
   *
   * 견주는 일은 루프다 — 고르고, 두 증감을 읽고, 다음 줄로. 그 루프가 마우스
   * 왕복이면 느려서 몇 줄 보다 만다. 입력 칸에 있을 때는 물러난다.
   */
  function onKeydown(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (app.page !== PAGE.search || currentTab() !== "results" || !app.results) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    const list = app.results[app.view] ?? app.results.damage ?? [];
    if (list.length === 0) return;
    const at = list.findIndex(item => item.id === app.selectedId);
    const next = event.key === "ArrowDown"
      ? Math.min(list.length - 1, at + 1)
      : Math.max(0, (at < 0 ? 0 : at) - 1);
    event.preventDefault();
    focusResult(list[next]);
  }

  // 담기는 초점이 임시일 때만 뜻이 있다 — 이미 담긴 것은 타일이 들고 있다.
  function keepFocused() {
    if (focused?.temp && focused.entry) toggleBoxed(focused.entry);
  }

  /**
   * 상태 한 줄.
   *
   * app.status는 결과 화면의 runbar에서만 그려지고 있었다. 그래서 비교함이
   * 가득 차 거절당해도, 세팅을 저장해도, 빌드를 맞바꿔도 화면은 침묵했다 —
   * 앱이 허공에 대고 말하고 있었던 셈이다. 어느 화면에서든 잠깐 뜬다.
   */
  let toast = $state("");
  let toastTimer = 0;
  $effect(() => {
    const message = app.status;
    if (!message) return;
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 4000);
    return () => clearTimeout(toastTimer);
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

  // 지금 축과 그 안에서 보고 있는 부위.
  const axis = $derived(PAGES.find(item => item.n === app.page) ?? PAGES[0]);
  const tab = $derived(currentTab());
</script>

<svelte:window onkeydown={onKeydown} />

<header class="topbar">
  <div class="wordmark">아크 패시브 <b>계산기</b></div>

  <nav class="pages" aria-label="화면">
    {#each PAGES as item (item.key)}
      <button type="button" class="page-tab" class:active={app.page === item.n}
              aria-current={app.page === item.n ? "page" : undefined}
              onclick={() => goPage(item.n)}>
        <span class="page-text"><b>{item.label}</b></span>
      </button>
    {/each}
  </nav>

  <div class="topbar-actions">
    {#if tab !== "setup"}
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

    <!-- 이 자리는 늘 '다음 걸음'이다. 빌드를 만졌으면 굴려 보는 것이고,
         규칙을 세웠으면 돌리는 것이다. -->
    {#if app.page === PAGE.build}
      <button class="btn primary" type="button" onclick={() => goPage(PAGE.search)}>탐색으로 →</button>
    {:else if app.page === PAGE.market}
      <button class="btn primary" type="button" disabled={app.market.running || !app.api.key} onclick={sweepMarket}>
        {app.market.running ? `${app.market.done}/16` : marketHasResults() ? "갱신" : "훑기"}
      </button>
    {:else if app.running}
      <button class="btn" type="button" onclick={cancelSearch}>중지</button>
    {:else}
      <button class="btn primary" type="button" disabled={plan.engravings.overflow} onclick={startSearch}>
        {app.results ? "다시 탐색" : "탐색 실행"}
      </button>
    {/if}
  </div>
</header>

<!-- 하위 탭. 축 안의 부위를 고른다 — 빌드 셋은 전부 내 빌드를 고치고,
     탐색 둘은 규칙을 걸고 답을 읽는다. -->
{#if axis.tabs.length > 1}
<nav class="subtabs" aria-label="{axis.label} 안">
  {#each axis.tabs as item (item.key)}
    <button type="button" class="subtab" class:on={tab === item.key}
            aria-current={tab === item.key ? "page" : undefined}
            onclick={() => setTab(item.key)}>{item.label}</button>
  {/each}
</nav>
{/if}

<main class="page">
  {#if tab === "setup"}
    <PageSetup
      onOpenBracelet={() => (braceletOpen = true)}
      onOpenCharacter={() => (characterOpen = true)}
    />
  {:else if tab === "awakening"}
    <PageAwakening />
  {:else if tab === "nodes"}
    <PageNodes {report} {budget} onOpenEngravings={() => (engravingsOpen = true)} />
  {:else if tab === "market"}
    <PageMarket />
  {:else if tab === "rules"}
    <PageRules {report} {plan} {budget} />
  {:else}
    <PageResults />
  {/if}
</main>

<!-- 비교함. 접으면 하단 막대, 펼치면 표 — 같은 물건의 두 상태다. -->
<BuildDrawer {report} {budget} onOpenEngravings={() => (engravingsOpen = true)} />

<!-- 답이 놓이는 자리. 어느 화면에 있든 늘 보인다. 이름표가 서랍 손잡이다. -->
<StatusBar {anchor} focus={focused} count={app.compare.length} status={toast} label="비교함"
           handle={{ open: app.drawer.open, onToggle: toggleDrawer }}
           onKeep={keepFocused} />

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
