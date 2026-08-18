<script>
  /**
   * 4페이지 — 탐색 결과. 굴린 것을 보는 자리.
   *
   * 고르면 계기판이 미리보기로 바뀌고, 하단 막대의 '슬롯에 담기'를 눌러야
   * 슬롯이 된다. 여기서 규칙은 안 고친다 — 고치려면 설정으로 돌아간다.
   */
  import { explainMetrics } from "../core/explain.js";
  import { formatInteger, readNumber } from "../core/util.js";
  import { SEARCH_FLOOR_FIELDS } from "../core/runner.js";
  import { CHART_AXES } from "../core/axes.js";
  import {
    app, persist, startSearch, cancelSearch, goPage, PAGE, openDrawer,
    selectedResult, resultState, resultChanges,
  } from "../store.svelte.js";
  import Select from "./Select.svelte";
  import TradeoffChart from "./TradeoffChart.svelte";
  import ResultsTable from "./ResultsTable.svelte";
  import Gauge from "./Gauge.svelte";
  import CeilingBar from "./CeilingBar.svelte";

  const AXIS_OPTIONS = CHART_AXES.map(axis => ({ value: axis.key, label: axis.label }));

  // 고른 후보와 그 상세는 하단 막대도 같이 본다. 그래서 계산은 store에 두고
  // 여기서는 읽기만 한다 — 양쪽이 각자 세면 언젠가 서로 다른 빌드를 가리킨다.
  const entry = $derived(selectedResult());
  const previewReport = $derived.by(() => {
    const state = resultState(entry);
    return state ? explainMetrics(state) : null;
  });
  const changes = $derived(resultChanges(entry));

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

<!-- 이 결과가 무엇이었는지와, 규칙을 고치러 가는 길. 규칙 자체는 여기 없다. -->
<section class="card runbar">
  <div class="runbar-main">
    {#if app.running}
      <button class="btn" type="button" onclick={cancelSearch}>중지</button>
      <div class="runbar-status"><b>{app.progress.phase}</b><span>{formatInteger(app.progress.evaluated)}개 평가</span></div>
    {:else}
      <button class="btn" type="button" onclick={() => goPage(PAGE.rules)}>← 탐색 설정</button>
      <div class="runbar-status"><span>{app.status}</span></div>
      <span class="spacer"></span>
      <button class="btn sm" type="button" onclick={startSearch}>{app.results ? "다시 탐색" : "탐색 실행"}</button>
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
      <button class="btn primary" type="button" onclick={() => goPage(PAGE.rules)}>탐색 설정으로 →</button>
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
      <button class="btn primary" type="button" onclick={() => goPage(PAGE.rules)}>하한 낮추러 가기 →</button>
      <button class="btn" type="button" onclick={openDrawer}>지금 빌드 보기</button>
    </div>
  </section>
{:else}
  <div class="split">
    <div class="split-main">
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

      <ResultsTable />
    </div>

    {#if previewReport}
      <div class="preview-rail">
        <!-- 한 방 딜·DPS는 아래 막대가 든다. 여기 또 적으면 같은 숫자가 두 번이고,
             바로 그 중복 때문에 어느 쪽이 갱신되는지 헷갈린 적이 있다. -->
        <Gauge
          report={previewReport}
          title="상세 · 미리보기"
          showLead={false}
          meta="아직 적용 전"
          note="고른 지점의 수치입니다. 빌드는 아직 안 바뀌었습니다."
        />

      </div>
    {/if}
  </div>
{/if}
