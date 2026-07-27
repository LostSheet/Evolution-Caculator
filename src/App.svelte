<script>
  import { app, currentMetrics, baselineMetrics, resetSection, exportState, importState } from "./lib/store.svelte.js";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import MetricsStrip from "./lib/components/MetricsStrip.svelte";
  import ArcBoard from "./lib/components/ArcBoard.svelte";
  import OptimizerPanel from "./lib/components/OptimizerPanel.svelte";
  import EngravingDialog from "./lib/components/EngravingDialog.svelte";
  import BraceletDialog from "./lib/components/BraceletDialog.svelte";
  import { readNumber } from "./lib/core/util.js";

  let engravingsOpen = $state(false);
  let braceletOpen = $state(false);
  let fileInput = $state(null);

  const metrics = $derived(currentMetrics());
  const baseline = $derived(baselineMetrics());
  const budget = $derived(Math.max(0, readNumber(app.character.settings.pointBudget)));

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

<main class="app-shell">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <path d="M24 3 42 24 24 45 6 24 24 3Z" />
          <path d="M24 11 35 24 24 37 13 24 24 11Z" />
          <path d="M24 17v14M17 24h14" />
        </svg>
      </div>
      <h1>아크 패시브 계산기</h1>
    </div>
    <div class="top-actions">
      <button class="icon-button" type="button" title="내보내기" aria-label="내보내기" onclick={exportState}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></svg>
      </button>
      <button class="icon-button" type="button" title="불러오기" aria-label="불러오기" onclick={() => fileInput?.click()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9m0 0 4 4m-4-4-4 4M4 7V4h16v3" /></svg>
      </button>
      <input bind:this={fileInput} type="file" accept="application/json" hidden onchange={onImport} />
      <button class="ghost-button" type="button" onclick={() => resetSection("nodes")}>노드 초기화</button>
    </div>
  </header>

  <div class="simulator-layout">
    <SettingsPanel
      onOpenEngravings={() => (engravingsOpen = true)}
      onOpenBracelet={() => (braceletOpen = true)}
    />

    <div class="simulator-main">
      <MetricsStrip {metrics} {baseline} {budget} />
      <OptimizerPanel />
      <ArcBoard {metrics} {budget} />
    </div>
  </div>
</main>

<EngravingDialog bind:open={engravingsOpen} />
<BraceletDialog bind:open={braceletOpen} />
