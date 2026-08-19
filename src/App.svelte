<script>
  import {
    app, PAGES, PAGE, goPage, goTab, setTab, currentTab,
    selectedResult, resultState, boxedSlot, toggleBoxed,
    startSearch, cancelSearch, cycleTheme,
    toggleDrawer, buildState, makeMine,
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
   * 비교함 — 접힌 막대에 열로 서는 것들.
   *
   * 지금 만지는 슬롯은 살아 있는 빌드를 잰다. 슬롯에 적힌 값은 마지막 저장
   * 시점이라 방금 올린 노드가 숫자에 안 나타난다.
   *
   * 첫 칸이 내 빌드다. 언제나 편집 대상이자 증감의 기준이라 고를 것이 없다.
   * 나머지는 얼린 것이고, 누르면 내 빌드로 올라온다(맞바꾸기).
   */
  /**
   * 결과 표에서 고른 줄.
   *
   * 고르기만 해서는 비교가 안 됐다 — 하이라이트만 되고 숫자는 안 서서, 견주려면
   * 반드시 담아야 했다. 담기 전에 "이게 내 빌드보다 나은가"를 먼저 보는 게
   * 순서라, 고른 줄을 임시 열로 세운다. 담으면 그때 영구 열이 된다.
   */
  const previewed = $derived.by(() => {
    if (app.page !== PAGE.search || currentTab() !== "results") return null;
    const entry = selectedResult();
    if (!entry || boxedSlot(entry)) return null;
    return { entry, build: resultState(entry) };
  });

  const boxSlots = $derived.by(() => {
    const columns = [
      { id: null, name: app.buildName, mine: true },
      ...app.compare.map(item => ({ id: item.id, name: item.name, build: item.build, mine: false })),
      ...(previewed ? [{ id: "preview", name: "고른 후보", build: previewed.build, mine: false, preview: true }] : []),
    ];
    const scores = columns.map(column => calculateMetrics(
      column.mine ? app.character : buildState(column.build),
    ));
    // 증감은 지표마다 따로 낸다. 하나만 적으면 두 숫자 중 어느 쪽 것인지
    // 알 수가 없다 — 실제로 한 방 딜은 오르고 DPS는 내려가는 빌드가 있다.
    const rel = (now, base) => (
      !Number.isFinite(base) || base === 0 || Math.abs(percentDelta(now, base)) < 0.005
        ? null
        : { value: percentDelta(now, base) }
    );
    return columns.map((column, at) => ({
      id: column.id,
      name: column.name,
      isBase: column.mine,
      preview: Boolean(column.preview),
      damageIndex: scores[at].damageIndex,
      dpsIndex: scores[at].dpsIndex,
      damageDelta: column.mine ? null : rel(scores[at].damageIndex, scores[0]?.damageIndex),
      dpsDelta: column.mine ? null : rel(scores[at].dpsIndex, scores[0]?.dpsIndex),
    }));
  });

  /**
   * 막대는 언제나 비교함이다.
   *
   * 예전에는 탐색 화면에서만 '고른 후보' 하나를 들고 옆에 '슬롯에 담기'가
   * 붙어 있었다. 지금은 표의 체크가 곧 담기라 그 단추가 할 일이 없고, 오히려
   * 그 모드 때문에 방금 담은 것이 막대에서 안 보였다.
   */
  const bar = $derived({
    report: null,
    deltas: [],
    slots: boxSlots,
    label: "비교함",
    handle: { open: app.drawer.open, onToggle: toggleDrawer },
    action: null,
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
<nav class="subtabs" aria-label="{axis.label} 안">
  {#each axis.tabs as item (item.key)}
    <button type="button" class="subtab" class:on={tab === item.key}
            aria-current={tab === item.key ? "page" : undefined}
            onclick={() => setTab(item.key)}>{item.label}</button>
  {/each}
</nav>

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
  {:else if tab === "rules"}
    <PageRules {report} {plan} {budget} />
  {:else}
    <PageResults />
  {/if}
</main>

<!-- 비교함. 접으면 하단 막대, 펼치면 표 — 같은 물건의 두 상태다. -->
<BuildDrawer {report} {budget} onOpenEngravings={() => (engravingsOpen = true)} />

<!-- 답이 놓이는 자리. 어느 화면에 있든 늘 보인다. 이름표가 서랍 손잡이다. -->
<StatusBar report={bar.report} deltas={bar.deltas} label={bar.label}
           action={bar.action} handle={bar.handle}
           slots={bar.slots ?? null}
           onPick={id => (id === "preview" ? toggleBoxed(previewed?.entry) : makeMine(id))} />

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
