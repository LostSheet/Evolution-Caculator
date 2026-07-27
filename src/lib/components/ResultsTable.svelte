<script>
  import { NODE_LIBRARY } from "../core/data.js";
  import { formatNumber, formatInteger } from "../core/util.js";
  import { app, currentSignature } from "../store.svelte.js";

  const TABS = [
    { key: "pareto", label: "균형 곡선" },
    { key: "damage", label: "한 방 딜 순위" },
    { key: "dps", label: "DPS 순위" },
  ];

  const list = $derived(
    app.results
      ? (app.view === "pareto" ? app.results.pareto : app.view === "dps" ? app.results.dps : app.results.damage)
      : [],
  );
  const signature = $derived(currentSignature());

  const cdrRange = $derived.by(() => {
    if (list.length === 0) return { min: 0, max: 1 };
    const values = list.map(e => e.cooldownReduction);
    const min = Math.min(...values), max = Math.max(...values);
    return { min, max: max === min ? min + 1 : max };
  });

  function cdrColor(value) {
    const t = Math.min(1, Math.max(0, (value - cdrRange.min) / (cdrRange.max - cdrRange.min)));
    const from = [127, 178, 255];
    const to = [255, 123, 94];
    return `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
  }

  // Two or three highest-tier picks read faster than the full node list.
  function highlight(entry) {
    return NODE_LIBRARY
      .filter(node => node.tier !== "진화 1" && (entry.nodeLevels[node.id] || 0) > 0)
      .slice(0, 4)
      .map(node => `${node.name} ${entry.nodeLevels[node.id]}`)
      .join(" · ");
  }
</script>

<section class="card">
  <div class="card-hd">
    <h2>후보</h2>
    <span class="spacer"></span>
    <div class="tabs" role="tablist">
      {#each TABS as tab}
        <button type="button" role="tab" class:active={app.view === tab.key}
                aria-selected={app.view === tab.key} onclick={() => (app.view = tab.key)}>
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  {#if !app.results}
    <p class="detail-empty">탐색을 실행하면 후보가 표로 정리됩니다.</p>
  {:else if list.length === 0}
    <p class="detail-empty">조건에 맞는 조합을 찾지 못했습니다. 진화 포인트나 탐색 범위를 확인해 주세요.</p>
  {:else}
    <div class="table-scroll">
      <table class="results">
        <thead>
          <tr>
            <th class="left">#</th>
            <th>한 방</th>
            <th>DPS</th>
            <th>쿨감</th>
            <th>치적</th>
            {#if app.view === "pareto"}<th>교환비</th>{/if}
            <th class="left">주요 노드</th>
          </tr>
        </thead>
        <tbody>
          {#each list as entry, index (entry.id)}
            <tr class:selected={entry.id === app.selectedId}
                class:knee={entry.isKnee}
                onclick={() => (app.selectedId = entry.id)}>
              <td class="left rank">
                <span class="swatch" style:background={cdrColor(entry.cooldownReduction)}></span>{index + 1}
              </td>
              <td class:lead={app.view !== "dps"}>{formatNumber(entry.damageIndex)}</td>
              <td class:lead={app.view === "dps"}>{formatNumber(entry.dpsIndex)}</td>
              <td>{formatNumber(entry.cooldownReduction)}%</td>
              <td>{formatNumber(entry.critRateCapped)}%</td>
              {#if app.view === "pareto"}
                <td class:knee-rate={entry.isKnee}>
                  {entry.exchangeRate > 0 ? `×${formatNumber(entry.exchangeRate)}` : "—"}
                </td>
              {/if}
              <td class="left">
                {highlight(entry)}
                {#if entry.signature === signature}<span class="chip" style="margin-left:6px">적용 중</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
