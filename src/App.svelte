<script>
  import { app, currentMetrics, exportState, importState } from "./lib/store.svelte.js";
  import { formatInteger, readNumber, clamp } from "./lib/core/util.js";
  import SettingsDrawer from "./lib/components/SettingsDrawer.svelte";
  import SearchBar from "./lib/components/SearchBar.svelte";
  import TradeoffChart from "./lib/components/TradeoffChart.svelte";
  import SelectionDetail from "./lib/components/SelectionDetail.svelte";
  import ResultsTable from "./lib/components/ResultsTable.svelte";
  import NodeBoard from "./lib/components/NodeBoard.svelte";
  import EngravingDialog from "./lib/components/EngravingDialog.svelte";
  import BraceletDialog from "./lib/components/BraceletDialog.svelte";

  let settingsOpen = $state(false);
  let engravingsOpen = $state(false);
  let braceletOpen = $state(false);
  let fileInput = $state(null);

  const metrics = $derived(currentMetrics());
  const budget = $derived(Math.max(0, readNumber(app.character.settings.pointBudget)));

  // The topbar carries what the search is holding fixed, so it stays visible
  // without opening the drawer.
  const summary = $derived.by(() => {
    const base = app.character.base;
    const s = app.character.settings;
    const direction = s.backAttack && s.headAttack ? "백·헤드"
      : s.backAttack ? "백어택" : s.headAttack ? "헤드어택" : "비방향성";
    const mana = clamp(Math.round(readNumber(app.character.convenience.manaShare)), 0, 100);
    return [
      { label: "특성", value: `${formatInteger(base.critStat)}·${formatInteger(base.specStat)}·${formatInteger(base.swiftStat)}` },
      { label: "포인트", value: formatInteger(budget) },
      { label: "방향", value: direction },
      { label: "마나", value: `${mana}%` },
    ];
  });

  async function onImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importState(file);
      app.status = "불러오기 완료";
    } catch {
      app.status = "불러오기 파일을 읽지 못했습니다.";
    } finally {
      event.target.value = "";
    }
  }
</script>

<header class="topbar">
  <div class="wordmark">아크 패시브 <b>계산기</b></div>

  <div class="config-summary" aria-label="고정된 설정 요약">
    {#each summary as item}
      <span class="summary-chip">{item.label}<b>{item.value}</b></span>
    {/each}
  </div>

  <div class="topbar-actions">
    <button class="btn icon" type="button" title="내보내기" aria-label="내보내기" onclick={exportState}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></svg>
    </button>
    <button class="btn icon" type="button" title="불러오기" aria-label="불러오기" onclick={() => fileInput?.click()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9m0 0 4 4m-4-4-4 4M4 7V4h16v3" /></svg>
    </button>
    <input bind:this={fileInput} type="file" accept="application/json" hidden onchange={onImport} />
    <button class="btn" type="button" onclick={() => (settingsOpen = true)}>설정</button>
  </div>
</header>

<main class="page">
  <SearchBar />

  <div class="workspace">
    <section class="card">
      <div class="card-hd">
        <h2>한 방 딜 × DPS 균형 곡선</h2>
        <span class="spacer"></span>
        <span class="eyebrow">{app.results ? `${formatInteger(app.results.pareto.length)}개 지점` : "대기"}</span>
      </div>
      <TradeoffChart />
    </section>

    <SelectionDetail />
  </div>

  <ResultsTable />

  <NodeBoard {metrics} {budget} />
</main>

<SettingsDrawer
  bind:open={settingsOpen}
  onOpenEngravings={() => (engravingsOpen = true)}
  onOpenBracelet={() => (braceletOpen = true)}
/>
<EngravingDialog bind:open={engravingsOpen} />
<BraceletDialog bind:open={braceletOpen} />
