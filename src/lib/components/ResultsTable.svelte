<script>
  import { NODE_LIBRARY } from "../core/data.js";
  import { formatNumber, formatInteger } from "../core/util.js";
  import { analyseFront } from "../core/recommend.js";
  import { sweepCeiling, ceilingLabel } from "../core/ceiling.js";
  import { cooldownRange, cooldownColor } from "../ramp.js";
  import { app, currentSignature, boxedSlot, toggleBoxed } from "../store.svelte.js";
  import Hint from "./Hint.svelte";

  // 자세히 볼 후보. 부모가 모달을 띄운다.
  let { onInspect = null } = $props();

  const TABS = [
    { key: "pareto", label: "균형 곡선" },
    { key: "damage", label: "한 방 딜 순위" },
    { key: "dps", label: "DPS 순위" },
    { key: "cooldown", label: "쿨감 순위" },
  ];

  const list = $derived(
    app.results
      ? (app.results[app.view] ?? app.results.damage)
      : [],
  );
  const signature = $derived(currentSignature());

  // 손실은 언제나 균형 곡선 전체를 기준으로 잰다. 탭마다 기준이 달라지면
  // 같은 빌드가 탭을 옮길 때 숫자가 바뀌어 비교가 안 된다.
  const losses = $derived.by(() => {
    const report = analyseFront(app.results?.pareto ?? []);
    return new Map(report ? report.rows.map(row => [row.entry.id, row]) : []);
  });

  // 손실과 마찬가지로 언제나 균형 곡선 전체를 기준으로 잰다. 순위 탭에 있는
  // 빌드가 곡선 위에 없으면 구간도 없다 — 그건 빈칸이 아니라 답이다.
  const sweep = $derived(sweepCeiling(app.results?.pareto ?? []));

  const cdrRange = $derived(cooldownRange(list));
  const cdrColor = value => cooldownColor(value, cdrRange);

  // 1T 배분과 2T 이후를 같이 적는다.
  //
  // 예전에는 1T를 통째로 뺐다 — "치명 30 · 신속 10"이 줄마다 반복되니 잡음이라
  // 봤기 때문이다. 그런데 제압이 탐색에 들어오면서 1T가 실제로 갈리기 시작했다.
  // 안 보이니 "제압이 탐색에 포함이 안 된 것 같다"로 읽힌다.
  const levelsOf = (entry, tier) => NODE_LIBRARY
    .filter(node => node.tier === tier && (entry.nodeLevels[node.id] || 0) > 0)
    .map(node => `${node.name} ${entry.nodeLevels[node.id]}`);

  function highlight(entry) {
    return levelsOf(entry, "진화 1").join(" · ");
  }
  function highlightRest(entry) {
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
            <!-- 체크가 곧 담기다. 고르기와 담기를 갈라 두면 여럿을 견주려고
                 골랐다 담았다를 번갈아야 한다. -->
            <th class="pick-col" title="비교함에 담기"><span class="sr-only">담기</span></th>
            <th class="left">#</th>
            <th>한 방</th>
            <th class="loss-col">손실</th>
            <th>DPS</th>
            <th class="loss-col">손실</th>
            <th>쿨감</th>
            <!-- 뭉가를 든 빌드는 적용값이 전부 80%라 그것만 적으면 열이 아무것도
                 말하지 않고, 합산만 적으면 상한에 눌린 사실이 사라진다. 둘 다 적는다 —
                 앞이 실제로 적용된 값, 괄호 안이 상한 전 합산이다. -->
            <th>치적 <em class="mark-key over" title="뭉툭한 가시 — 적용은 80%까지, 괄호 안은 상한 전 합산 치적">(합산)</em></th>
            <!-- 예전에는 이 자리에 교환비(이웃 두 점의 기울기)가 있었다. 그 값은
                 빌드의 성질이 아니라 프론트에 점이 놓인 간격을 재고 있었다 —
                 1.47점짜리 칸이 표에서 가장 큰 수를 만들었다. 한계 구간은
                 프론트 전체를 보고 정해지고, 옆의 쿨감 열과 눈금이 같다. -->
            {#if app.view === "pareto"}
              <th>
                <span class="th-hint">한계 구간
                  <Hint label="한계 구간" float wide>
                    <p>
                      내 로테이션이 쿨감 몇 %에서 막히는지 정하고, 그 값이 든 줄을 보세요.
                      그 구간에서는 이 빌드가 1위입니다.
                    </p>
                  </Hint>
                </span>
              </th>
            {/if}
            <th class="left">1T</th>
            <th class="left">주요 노드</th>
            <th class="pick-col"><span class="sr-only">자세히</span></th>
          </tr>
        </thead>
        <tbody>
          {#each list as entry, index (entry.id)}
            {@const row = losses.get(entry.id)}
            <!-- 상한에 눌리기 전 합산 치적. 옛 결과에는 없으므로 적용값으로 돌아간다. -->
            {@const raw = entry.critRateRaw ?? entry.critRateCapped}
            {@const boxed = boxedSlot(entry)}
            <tr class:selected={entry.id === app.selectedId}
                class:boxed={Boolean(boxed)}
                class:champ={entry.id === sweep.championId}
                onclick={() => (app.selectedId = entry.id)}>
              <td class="pick-col">
                <!-- 줄 클릭은 '고르기'다. 체크는 '담기'라 줄로 안 번진다. -->
                <input type="checkbox" checked={Boolean(boxed)}
                       aria-label="{index + 1}번 후보를 비교함에 담기"
                       title={boxed ? `비교함에서 빼기 (${boxed.name})` : "비교함에 담기"}
                       onclick={event => event.stopPropagation()}
                       onchange={() => toggleBoxed(entry)} />
              </td>
              <td class="left rank">
                <span class="swatch" style:--ramp={cdrColor(entry.cooldownReduction)}></span>{index + 1}
              </td>
              <td class:lead={app.view !== "dps"}>{formatNumber(entry.damageIndex)}</td>
              <td class="loss-col">
                {#if row}<span class:best={row.damageLoss < 1e-9}>{row.damageLoss < 1e-9 ? "최고" : `−${formatNumber(row.damageLoss)}%`}</span>{:else}—{/if}
              </td>
              <td class:lead={app.view === "dps"}>{formatNumber(entry.dpsIndex)}</td>
              <td class="loss-col">
                {#if row}<span class:best={row.dpsLoss < 1e-9}>{row.dpsLoss < 1e-9 ? "최고" : `−${formatNumber(row.dpsLoss)}%`}</span>{:else}—{/if}
              </td>
              <td class:lead={app.view === "cooldown"}>{formatNumber(entry.cooldownReduction)}%</td>
              <!-- 상한이 실제로 걸린 줄만 괄호를 단다. 뭉가를 들었어도 합산이
                   80% 아래면 눌린 게 없으므로 그냥 한 숫자다. -->
              <td>
                {#if entry.bluntThorn && raw > entry.critRateCapped + 1e-9}
                  <!-- 눌린 값은 언제나 상한 그 자체라 80.00%처럼 잴 일이 없다. -->
                  {Math.round(entry.critRateCapped * 100) / 100}%&nbsp;<em class="over" title="상한 전 합산 치적 — 초과분은 뭉툭한 가시가 피해로 바꾼다">({formatNumber(raw)}%)</em>
                {:else}
                  {formatNumber(raw)}%
                {/if}
              </td>
              {#if app.view === "pareto"}
                <td class:champ-span={entry.id === sweep.championId}>{ceilingLabel(sweep, entry.id) || "—"}</td>
              {/if}
              <td class="left tier1">{highlight(entry)}</td>
              <td class="left">
                {highlightRest(entry)}
                {#if entry.signature === signature}<span class="chip" style="margin-left:6px">적용 중</span>{/if}
              </td>
              <td class="pick-col">
                <!-- 담기 전에 무엇이 들었는지 본다. 표에는 주요 노드 넷까지만
                     적히므로 나머지는 여기서 편다. -->
                <button class="row-more" type="button" aria-label="{index + 1}번 후보 자세히"
                        title="자세히 보기"
                        onclick={event => { event.stopPropagation(); app.selectedId = entry.id; onInspect?.(entry); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
