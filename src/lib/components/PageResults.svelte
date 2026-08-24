<script>
  /**
   * 4페이지 — 탐색 결과. 굴린 것을 보는 자리.
   *
   * 표의 체크가 곧 비교함에 담기다. 담은 것은 하단 막대에 열로 서고, 막대를
   * 열면 나란히 견줄 수 있다. 여기서 규칙은 안 고친다 — 고치려면 설정으로.
   */
  import { formatInteger, readNumber } from "../core/util.js";
  import { SEARCH_FLOOR_FIELDS } from "../core/runner.js";
  import { CHART_AXES } from "../core/axes.js";
  import {
    app, persist, startSearch, cancelSearch, goTab, openDrawer, basisStale,
  } from "../store.svelte.js";
  import Select from "./Select.svelte";
  import TradeoffChart from "./TradeoffChart.svelte";
  import ResultsTable from "./ResultsTable.svelte";
  import ResultDialog from "./ResultDialog.svelte";
  import CeilingBar from "./CeilingBar.svelte";

  const AXIS_OPTIONS = CHART_AXES.map(axis => ({ value: axis.key, label: axis.label }));

  // 자세히 보기는 눌렀을 때만 연다. 예전에는 오른쪽 세로 레일이 늘 띄우고
  // 있었는데, 한 번에 하나만 보여주면서 가로를 반이나 먹었다 — 여럿을 견주려고
  // 온 화면에서 정작 하나만 보였다.
  let inspectOpen = $state(false);
  let inspecting = $state(null);

  // 걸어 둔 하한. 결과가 비었을 때 이유를 대는 데 쓴다.
  const activeFloors = $derived(
    SEARCH_FLOOR_FIELDS
      .map(field => {
        const need = readNumber(app.search.floors?.[field.key]);
        return { label: field.label, need, text: `${Math.round(need * 100) / 100}` };
      })
      .filter(item => item.need > 0),
  );

  // 하한을 걸면 결과가 하나도 안 남을 수 있다. 그건 실패가 아니라 답이므로
  // 빈 표를 늘어놓지 말고 무엇에 걸렸는지만 말한다.
  const blockedByFloors = $derived(
    !!app.results && app.results.pareto.length === 0 && (app.results.rejected ?? 0) > 0,
  );
</script>

<!--
  이 결과가 무엇이었는지.

  단추는 없다 — 실행도 설정으로 가는 길도 위(상단바·하위 탭)에 늘 있어서,
  여기 또 두면 같은 일을 하는 자리가 한 화면에 둘이 된다.
-->
<section class="card runbar">
  <div class="runbar-main">
    {#if app.running}
      <button class="btn" type="button" onclick={cancelSearch}>중지</button>
      <div class="runbar-status"><b>{app.progress.phase}</b><span>{formatInteger(app.progress.evaluated)}개 평가</span></div>
    {:else}
      <!-- 이 표가 무엇을 딛고 선 숫자인지. 그 뒤로 기준이 바뀌면 여기가 띠가 된다. -->
      {#if app.results?.basisName}
        <span class="basis-tag" class:stale={basisStale()}>
          {#if basisStale()}기준 바뀜 · 돌린 시점 기준{:else}'{app.results.basisName}' 기준{/if}
        </span>
      {/if}
      <div class="runbar-status"><span>{app.status}</span></div>
    {/if}
  </div>

  <div class="progress" aria-hidden="true">
    <div style:width="{(app.running ? app.progress.progress : app.results ? 1 : 0) * 100}%"></div>
  </div>
</section>

{#if !app.results && !app.running}
  <section class="card blank">
    <p>아직 탐색하지 않았습니다. 설정에서 범위를 정하고 돌리면 한 방 딜과 DPS의 균형 곡선이 여기 그려집니다.</p>
    <div class="blank-actions">
      <button class="btn primary" type="button" onclick={() => goTab("rules")}>탐색 설정으로 →</button>
      <button class="btn" type="button" onclick={openDrawer}>지금 빌드 보기</button>
    </div>
  </section>
{:else if blockedByFloors}
  <section class="card blank">
    <!-- 평가 수와 나란히 적지 않는다. 빔은 중간 차원에서도 값을 재므로 둘의
         차이가 '통과한 개수'가 아닌데, 붙여 놓으면 그렇게 읽힌다. -->
    <p>완성된 조합 {formatInteger(app.results.rejected)}개가 모두 하한에 걸렸습니다.</p>
    <div class="summary-line">
      {#each activeFloors as floor}
        <span class="chip">{floor.label} {floor.text}% 이상</span>
      {/each}
    </div>
    <div class="blank-actions">
      <button class="btn primary" type="button" onclick={() => goTab("rules")}>하한 낮추러 가기 →</button>
      <button class="btn" type="button" onclick={openDrawer}>지금 빌드 보기</button>
    </div>
  </section>
{:else}
  <div class="results-main">
      <section class="card">
        <div class="card-hd">
          <h2>균형 곡선</h2>
          <span class="axis-pick">
            <i>세로</i>
            <Select label="세로축" options={AXIS_OPTIONS} bind:value={app.chartY} onchange={persist} />
            <i>가로</i>
            <Select label="가로축" options={AXIS_OPTIONS} bind:value={app.chartX} onchange={persist} />
          </span>
          <span class="spacer"></span>
        </div>
        <TradeoffChart />
        {#if app.results?.pareto?.length > 1}
          <CeilingBar front={app.results.pareto} />
        {/if}
      </section>

      <ResultsTable onInspect={next => { inspecting = next; inspectOpen = true; }} />
  </div>
{/if}

<ResultDialog bind:open={inspectOpen} entry={inspecting} />
