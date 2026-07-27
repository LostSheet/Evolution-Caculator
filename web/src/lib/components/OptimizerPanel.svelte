<script>
  import { EVOLUTION_TIERS, NODE_LIBRARY } from "../core/data.js";
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex } from "../core/metrics.js";
  import { formatNumber, formatInteger, formatSignedPercent, percentDelta, clamp, readNumber } from "../core/util.js";
  import { OPTIMIZER_EXHAUSTIVE_LIMIT, OPTIMIZER_PET_LABELS, getModeledEngravings } from "../core/search.js";
  import { buildSearchPlan, getEngravingRole } from "../core/runner.js";
  import { app, persist, startSearch, cancelSearch, applyResult, currentSignature } from "../store.svelte.js";
  import TradeoffChart from "./TradeoffChart.svelte";
  import EngravingPoolDialog from "./EngravingPoolDialog.svelte";

  let poolOpen = $state(false);

  const plan = $derived(buildSearchPlan(app.character, app.search));
  const exhaustive = $derived(
    app.search.mode === "exhaustive" || (app.search.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT),
  );

  const notes = $derived.by(() => {
    const out = [`1T는 ${plan.dimensions[0].options.length}가지 배분을 탐색합니다.`];
    if (plan.skippedNodes.length > 0) {
      out.push(`딜 기여가 없는 노드 ${plan.skippedNodes.length}개(${plan.skippedNodes.map(n => n.name).join(", ")})는 후보에서 제외됩니다.`);
    }
    if (app.search.engravingSlots !== "fixed") {
      const e = plan.engravings;
      if (e.overflow) out.push(`고정 각인 ${e.locked.length}개가 슬롯 ${e.slots}개를 넘습니다.`);
      else if (e.locked.length > 0) out.push(`각인 ${e.slots}슬롯 중 고정 ${e.locked.length}개(${e.locked.map(x => x.item.name).join(", ")})를 두고 후보 ${e.candidates.length}종에서 ${e.pickCount}개를 고릅니다.`);
      else out.push(`각인 후보 ${e.candidates.length}종에서 ${e.pickCount}개를 골라 ${e.slots}슬롯을 채웁니다.`);
      const excluded = getModeledEngravings().filter(i => getEngravingRole(i, app.search) === "excluded").length;
      if (excluded > 0) out.push(`제외 각인 ${excluded}종은 후보에서 빠집니다.`);
    }
    const share = clamp(Math.round(readNumber(app.character.convenience.manaShare)), 0, 100);
    if (share < 100) out.push(`마나 스킬 딜 비중 ${share}% 기준으로 마나 전용 피해 효과를 축소 반영합니다. 끝마/무마 쿨감은 그대로 반영됩니다.`);
    return out;
  });

  const list = $derived(
    app.results
      ? (app.view === "pareto" ? app.results.pareto : app.view === "dps" ? app.results.dps : app.results.damage)
      : [],
  );
  const signature = $derived(currentSignature());

  function nodeChips(entry, tier) {
    return NODE_LIBRARY
      .filter(node => node.tier === tier && (entry.nodeLevels[node.id] || 0) > 0)
      .map(node => `${node.name} ${entry.nodeLevels[node.id]}`);
  }

  function engravingChips(entry) {
    const controlled = app.results?.plan.engravings.controlledIds ?? [];
    const lockedIds = new Set((app.results?.plan.engravings.locked ?? []).map(e => e.item.id));
    return controlled
      .map(id => ({ id, tierIndex: getEngravingTierIndex(entry.engravings[id]) }))
      .filter(e => e.tierIndex >= 0)
      .map(e => ({
        locked: lockedIds.has(e.id),
        text: `${ENGRAVING_LIBRARY.find(i => i.id === e.id).name} ${ENGRAVING_TIERS[e.tierIndex].label}`,
      }));
  }
</script>

<details class="panel compact-drawer optimizer-panel" open>
  <summary>
    조합 탐색
    <span>{formatInteger(plan.totalCombos)}조합 · {exhaustive ? "전수 탐색" : `빔 탐색 (너비 ${formatInteger(app.search.beamWidth)})`}</span>
  </summary>

  <div class="optimizer-controls">
    <label>
      <span>1T 배분</span>
      <select bind:value={app.search.tier1Mode} onchange={persist}>
        <option value="fixed">현재 배분 고정</option>
        <option value="step10">10레벨 단위</option>
        <option value="step5">5레벨 단위</option>
        <option value="step2">2레벨 단위</option>
      </select>
    </label>
    <label>
      <span>각인 개수</span>
      <select bind:value={app.search.engravingSlots} onchange={persist}>
        <option value="fixed">탐색 안 함</option>
        {#each [1, 2, 3, 4, 5] as n}<option value={String(n)}>{n}개</option>{/each}
      </select>
    </label>
    <label class="optimizer-pool-field">
      <span>각인 후보</span>
      <button class="mini-button" type="button" onclick={() => (poolOpen = true)}>고정 · 제외 설정</button>
    </label>
    <label>
      <span>탐색 방식</span>
      <select bind:value={app.search.mode} onchange={persist}>
        <option value="auto">자동</option>
        <option value="exhaustive">전수 탐색</option>
        <option value="beam">빔 탐색</option>
      </select>
    </label>
    <label>
      <span>빔 너비</span>
      <input type="number" min="10" max="5000" step="10" bind:value={app.search.beamWidth} onchange={persist} />
    </label>
    <label>
      <span>결과 개수</span>
      <input type="number" min="1" max="50" step="1" bind:value={app.search.resultLimit} onchange={persist} />
    </label>
    <div class="optimizer-switches">
      <label class="switch"><input type="checkbox" bind:checked={app.search.petSearch} onchange={persist} /><span>펫 효과 탐색</span></label>
      <label class="switch"><input type="checkbox" bind:checked={app.search.fullBudget} onchange={persist} /><span>티어 포인트 전량 사용</span></label>
    </div>
  </div>

  <div class="optimizer-actions">
    <button class="mini-button" type="button" disabled={app.running} onclick={startSearch}>탐색 시작</button>
    <button class="ghost-button" type="button" disabled={!app.running} onclick={cancelSearch}>중지</button>
    <span>{app.running ? `${app.progress.phase} · ${formatInteger(app.progress.evaluated)}개 평가` : app.status}</span>
  </div>
  <div class="optimizer-progress" aria-hidden="true">
    <div style:width="{(app.running ? app.progress.progress : app.results ? 1 : 0) * 100}%"></div>
  </div>

  <ul class="optimizer-note">
    {#each notes as note}<li>{note}</li>{/each}
  </ul>

  <div class="optimizer-tabs" role="tablist">
    {#each [{ key: "pareto", label: "트레이드오프" }, { key: "damage", label: "한 방 딜 순위" }, { key: "dps", label: "DPS 순위" }] as tab}
      <button
        type="button" role="tab"
        class:active={app.view === tab.key}
        aria-selected={app.view === tab.key}
        onclick={() => (app.view = tab.key)}
      >{tab.label}</button>
    {/each}
  </div>

  {#if app.view === "pareto" && app.results}
    <TradeoffChart
      front={app.results.pareto}
      ranked={[...app.results.damage, ...app.results.dps]}
      selectedId={app.selectedId}
      currentSignature={signature}
      onselect={applyResult}
    />
  {/if}

  <div class="optimizer-results">
    {#if !app.results}
      <p class="optimizer-empty">탐색을 시작하면 상위 세팅 목록이 여기에 표시됩니다.</p>
    {:else if list.length === 0}
      <p class="optimizer-empty">조건에 맞는 조합을 찾지 못했습니다. 진화 포인트나 탐색 범위를 확인해 주세요.</p>
    {:else}
      {#each list as entry, index (entry.id)}
        {@const damageDelta = percentDelta(entry.damageIndex, app.results.baseline.damageIndex)}
        {@const dpsDelta = percentDelta(entry.dpsIndex, app.results.baseline.dpsIndex)}
        <article class="optimizer-result" class:current={entry.signature === signature} class:knee={entry.isKnee}>
          <div class="optimizer-result-head">
            <span class="optimizer-rank">{formatInteger(index + 1)}</span>
            <div class="optimizer-scores">
              <span><small>한 방</small><strong>{formatNumber(entry.damageIndex)}</strong><em class={damageDelta >= 0 ? "up" : "down"}>{formatSignedPercent(damageDelta)}</em></span>
              <span><small>DPS</small><strong>{formatNumber(entry.dpsIndex)}</strong><em class={dpsDelta >= 0 ? "up" : "down"}>{formatSignedPercent(dpsDelta)}</em></span>
              <span><small>쿨감</small><strong>{formatNumber(entry.cooldownReduction)}%</strong></span>
              <span><small>치적</small><strong>{formatNumber(entry.critRateCapped)}%</strong></span>
              <span><small>포인트</small><strong>{formatInteger(entry.pointsUsed)}</strong></span>
              {#if entry.isKnee}<span class="knee-flag">교환비 {formatNumber(entry.exchangeRate)}</span>{/if}
            </div>
            <button class="mini-button" type="button" onclick={() => applyResult(entry)}>적용</button>
          </div>
          <div class="optimizer-result-body">
            {#each Object.keys(EVOLUTION_TIERS) as tier}
              {@const chips = nodeChips(entry, tier)}
              {#if chips.length > 0}
                <div class="optimizer-tier-line">
                  <span class="optimizer-tier-tag">{EVOLUTION_TIERS[tier].label}</span>
                  {#each chips as chip}<span class="optimizer-chip">{chip}</span>{/each}
                </div>
              {/if}
            {/each}
            <div class="optimizer-tier-line">
              <span class="optimizer-tier-tag">기타</span>
              <span class="optimizer-chip pet">{OPTIMIZER_PET_LABELS[entry.pet] ?? "펫 없음"}</span>
              {#each engravingChips(entry) as chip}
                <span class="optimizer-chip engraving" class:locked={chip.locked}>{chip.locked ? "고정 " : ""}{chip.text}</span>
              {/each}
            </div>
          </div>
        </article>
      {/each}
    {/if}
  </div>
</details>

<EngravingPoolDialog bind:open={poolOpen} />
