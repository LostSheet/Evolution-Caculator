<script>
  import { NODE_LIBRARY } from "../core/data.js";
  import { ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { calculateMetrics, getEngravingTierIndex } from "../core/metrics.js";
  import { formatNumber, formatSignedPercent, percentDelta, readNumber } from "../core/util.js";
  import { analyseFront } from "../core/recommend.js";
  import { sweepCeiling, ceilingLabel } from "../core/ceiling.js";
  import { cooldownRange, cooldownColor } from "../ramp.js";
  import {
    app, currentSignature, boxedSlot, toggleBoxed, anchorState, premiseExceeded, focusResult,
  } from "../store.svelte.js";
  import Hint from "./Hint.svelte";

  // 자세히 볼 후보. 부모가 모달을 띄운다.
  let { onInspect = null } = $props();

  const TABS = [
    { key: "pareto", label: "균형 곡선" },
    { key: "damage", label: "한 방 딜 순위" },
    { key: "dps", label: "DPS 순위" },
    { key: "cooldown", label: "쿨감 순위" },
  ];

  /**
   * 절대값이냐 증감이냐.
   *
   * `4,605.48`은 그 자체로 아무 말도 안 한다. 유저가 표에서 던지는 질문은
   * "지금 내 것보다 나은가"라서, 기본은 닻 대비 증감이다. 절대값은 원래
   * 크기가 궁금할 때 잠깐 켜는 것.
   */
  let relative = $state(true);
  // 초점과 다른 데만 적을지, 구성을 통째로 적을지.
  let diffOnly = $state(true);

  const list = $derived(
    app.results
      ? (app.results[app.view] ?? app.results.damage)
      : [],
  );
  const signature = $derived(currentSignature());

  // 닻 — 표 맨 위에 서는 0번 행이자 모든 증감의 기준.
  const anchor = $derived.by(() => {
    const state = anchorState();
    const metrics = calculateMetrics(state);
    return { state, metrics, premise: premiseExceeded() };
  });

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

  const rel = (now, base) => percentDelta(now, base);

  // 1T 배분과 2T 이후를 같이 적는다.
  //
  // 예전에는 1T를 통째로 뺐다 — "치명 30 · 신속 10"이 줄마다 반복되니 잡음이라
  // 봤기 때문이다. 그런데 제압이 탐색에 들어오면서 1T가 실제로 갈리기 시작했다.
  // 안 보이니 "제압이 탐색에 포함이 안 된 것 같다"로 읽힌다.
  const levelsOf = (levels, tier) => NODE_LIBRARY
    .filter(node => node.tier === tier && (levels[node.id] || 0) > 0)
    .map(node => `${node.name} ${levels[node.id]}`);

  const highlight = levels => levelsOf(levels, "진화 1").join(" · ");
  const highlightRest = levels => NODE_LIBRARY
    .filter(node => node.tier !== "진화 1" && (levels[node.id] || 0) > 0)
    .slice(0, 4)
    .map(node => `${node.name} ${levels[node.id]}`)
    .join(" · ");

  // 지금 초점인 줄. 다른 줄들은 이것과 다른 데만 적는다.
  const focusEntry = $derived(
    app.focus?.kind === "result"
      ? (list.find(item => item.id === app.focus.id) ?? null)
      : null,
  );

  const engravingName = Object.fromEntries(ENGRAVING_LIBRARY.map(item => [item.id, item.name]));
  const wornIds = state => ENGRAVING_LIBRARY
    .filter(item => getEngravingTierIndex(state?.[item.id]) >= 0)
    .map(item => item.id);

  /**
   * 초점과의 차이만.
   *
   * 97줄이 서로 뭐가 다른지가 표에서 완전히 투명했다. 공통부를 지우면
   * "각인 한 자리를 헌납하고 노드를 쿨감에 몰았다" 같은 체제 전환이 눈에 띈다.
   */
  function diffOf(entry) {
    if (!focusEntry || focusEntry.id === entry.id) return null;
    const parts = [];

    NODE_LIBRARY.forEach(node => {
      const was = focusEntry.nodeLevels[node.id] || 0;
      const now = entry.nodeLevels[node.id] || 0;
      if (was === now) return;
      if (was === 0) parts.push({ kind: "add", text: `+${node.name} ${now}` });
      else if (now === 0) parts.push({ kind: "drop", text: `−${node.name}` });
      else parts.push({ kind: "move", text: `${node.name} ${was}→${now}` });
    });

    const wasEng = new Set(wornIds(focusEntry.engravings));
    const nowEng = new Set(wornIds(entry.engravings));
    nowEng.forEach(id => { if (!wasEng.has(id)) parts.push({ kind: "add", text: `+${engravingName[id] ?? id}` }); });
    wasEng.forEach(id => { if (!nowEng.has(id)) parts.push({ kind: "drop", text: `−${engravingName[id] ?? id}` }); });

    if ((entry.pet || "none") !== (focusEntry.pet || "none")) {
      parts.push({ kind: "move", text: `펫 ${focusEntry.pet || "없음"}→${entry.pet || "없음"}` });
    }
    return parts;
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
    <div class="table-modes">
      <button type="button" class="mode-btn" class:on={relative} onclick={() => (relative = !relative)}>
        {relative ? "내 세팅 대비" : "절대값"}
      </button>
      <button type="button" class="mode-btn" class:on={diffOnly} onclick={() => (diffOnly = !diffOnly)}
              disabled={!focusEntry}>
        {diffOnly ? "차이만" : "전체 구성"}
      </button>
      <span class="mode-note">↑ ↓ 로 줄 이동</span>
    </div>

    <div class="table-scroll">
      <table class="results">
        <thead>
          <tr>
            <th class="left">#</th>
            <th>한 방</th>
            {#if !relative}<th class="loss-col">손실</th>{/if}
            <th>DPS</th>
            {#if !relative}<th class="loss-col">손실</th>{/if}
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
            <th class="left tier1-col">1T</th>
            <th class="left nodes-col">{diffOnly && focusEntry ? "초점과의 차이" : "주요 노드"}</th>
            <!-- 손이 오가는 두 자리를 붙여 둔다. 예전에는 담기가 왼쪽 끝,
                 자세히가 오른쪽 끝이라 표를 가로질러야 했다. -->
            <th class="pick-col"><span class="sr-only">자세히</span></th>
            <th class="pick-col" title="비교함에 담기">담기</th>
          </tr>
        </thead>
        <tbody>
          <!-- 0번 행 — 닻. 모든 증감이 이 줄에서 출발한다. 표 안에 기준이
               없으면 ±%가 무엇에 대한 것인지 화면 밖에서 외워야 한다. -->
          <tr class="anchor-row">
            <td class="left rank">내</td>
            <td class="lead">{relative ? "기준" : formatNumber(anchor.metrics.damageIndex)}</td>
            {#if !relative}<td class="loss-col">—</td>{/if}
            <td>{relative ? "기준" : formatNumber(anchor.metrics.dpsIndex)}</td>
            {#if !relative}<td class="loss-col">—</td>{/if}
            <td>{formatNumber(anchor.metrics.cooldownReduction)}%</td>
            <td>{formatNumber(anchor.metrics.critRateRaw)}%</td>
            {#if app.view === "pareto"}<td>—</td>{/if}
            <td class="left tier1">{highlight(anchor.state.nodeLevels)}</td>
            <td class="left nodes-col">
              {highlightRest(anchor.state.nodeLevels)}
              {#if anchor.premise}<span class="chip" style="margin-left:6px">전제 적용</span>{/if}
            </td>
            <td class="pick-col"></td>
            <td class="pick-col"></td>
          </tr>

          {#each list as entry, index (entry.id)}
            {@const row = losses.get(entry.id)}
            <!-- 상한에 눌리기 전 합산 치적. 옛 결과에는 없으므로 적용값으로 돌아간다. -->
            {@const raw = entry.critRateRaw ?? entry.critRateCapped}
            {@const boxed = boxedSlot(entry)}
            {@const parts = diffOnly ? diffOf(entry) : null}
            {@const dmgRel = rel(entry.damageIndex, anchor.metrics.damageIndex)}
            {@const dpsRel = rel(entry.dpsIndex, anchor.metrics.dpsIndex)}
            <tr class:selected={entry.id === app.selectedId}
                class:boxed={Boolean(boxed)}
                class:champ={entry.id === sweep.championId}
                onclick={() => focusResult(entry)}>
              <td class="left rank">
                <span class="swatch" style:--ramp={cdrColor(entry.cooldownReduction)}></span>{index + 1}
              </td>
              <td class:lead={app.view !== "dps"}>
                {#if relative}
                  <em class="rel {dmgRel >= 0 ? 'up' : 'down'}">{formatSignedPercent(dmgRel)}</em>
                {:else}
                  {formatNumber(entry.damageIndex)}
                {/if}
              </td>
              {#if !relative}
                <td class="loss-col">
                  {#if row}<span class:best={row.damageLoss < 1e-9}>{row.damageLoss < 1e-9 ? "최고" : `−${formatNumber(row.damageLoss)}%`}</span>{:else}—{/if}
                </td>
              {/if}
              <td class:lead={app.view === "dps"}>
                {#if relative}
                  <em class="rel {dpsRel >= 0 ? 'up' : 'down'}">{formatSignedPercent(dpsRel)}</em>
                {:else}
                  {formatNumber(entry.dpsIndex)}
                {/if}
              </td>
              {#if !relative}
                <td class="loss-col">
                  {#if row}<span class:best={row.dpsLoss < 1e-9}>{row.dpsLoss < 1e-9 ? "최고" : `−${formatNumber(row.dpsLoss)}%`}</span>{:else}—{/if}
                </td>
              {/if}
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
              <td class="left tier1">{highlight(entry.nodeLevels)}</td>
              <td class="left nodes-col">
                {#if parts}
                  {#if parts.length === 0}
                    <span class="diff-same">같음</span>
                  {:else}
                    {#each parts as part}<span class="diff {part.kind}">{part.text}</span>{/each}
                  {/if}
                {:else}
                  {highlightRest(entry.nodeLevels)}
                {/if}
                {#if entry.signature === signature}<span class="chip" style="margin-left:6px">적용 중</span>{/if}
              </td>
              <td class="pick-col">
                <!-- 담기 전에 무엇이 들었는지 본다. 표에는 주요 노드 넷까지만
                     적히므로 나머지는 여기서 편다.
                     화살표였는데 체크박스 안쪽에 놓이니 '다음으로 넘어감'처럼
                     읽혔다 — 하는 일이 들여다보기라 돋보기로 바꾼다. -->
                <button class="row-more" type="button" aria-label="{index + 1}번 후보 자세히"
                        title="자세히 보기"
                        onclick={event => { event.stopPropagation(); focusResult(entry); onInspect?.(entry); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4 4" />
                  </svg>
                </button>
              </td>
              <td class="pick-col">
                <!-- 줄 클릭은 '고르기'다. 체크는 '담기'라 줄로 안 번진다. -->
                <input type="checkbox" checked={Boolean(boxed)}
                       aria-label="{index + 1}번 후보를 비교함에 담기"
                       title={boxed ? `비교함에서 빼기 (${boxed.name})` : "비교함에 담기"}
                       onclick={event => event.stopPropagation()}
                       onchange={() => toggleBoxed(entry)} />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
