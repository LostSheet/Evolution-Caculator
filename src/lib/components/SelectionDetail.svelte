<script>
  import { EVOLUTION_TIERS, NODE_LIBRARY } from "../core/data.js";
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex } from "../core/metrics.js";
  import { formatNumber, formatInteger, formatSignedPercent, percentDelta } from "../core/util.js";
  import { OPTIMIZER_PET_LABELS } from "../core/search.js";
  import { app, applyResult, currentSignature } from "../store.svelte.js";

  const entry = $derived(
    app.results
      ? [...app.results.pareto, ...app.results.damage, ...app.results.dps].find(e => e.id === app.selectedId)
        ?? app.results.pareto[0]
      : null,
  );

  const signature = $derived(currentSignature());
  const isApplied = $derived(entry ? entry.signature === signature : false);

  const damageDelta = $derived(entry && app.results ? percentDelta(entry.damageIndex, app.results.baseline.damageIndex) : 0);
  const dpsDelta = $derived(entry && app.results ? percentDelta(entry.dpsIndex, app.results.baseline.dpsIndex) : 0);

  // What this point costs relative to the neighbour above it on the curve.
  const trade = $derived.by(() => {
    if (!entry || !app.results) return null;
    const index = app.results.pareto.findIndex(e => e.id === entry.id);
    if (index <= 0) return null;
    const previous = app.results.pareto[index - 1];
    return {
      damageGiven: previous.damageIndex - entry.damageIndex,
      dpsGained: entry.dpsIndex - previous.dpsIndex,
      rate: entry.exchangeRate,
    };
  });

  function tierChips(tier) {
    if (!entry) return [];
    return NODE_LIBRARY
      .filter(node => node.tier === tier && (entry.nodeLevels[node.id] || 0) > 0)
      .map(node => ({ name: node.name, level: entry.nodeLevels[node.id] }));
  }

  const engravingChips = $derived.by(() => {
    if (!entry || !app.results) return [];
    const controlled = app.results.plan.engravings.controlledIds;
    if (controlled.length === 0) {
      return ENGRAVING_LIBRARY
        .filter(item => getEngravingTierIndex(entry.engravings[item.id]) >= 0)
        .map(item => ({ name: item.name, tier: ENGRAVING_TIERS[getEngravingTierIndex(entry.engravings[item.id])].label, locked: false }));
    }
    const lockedIds = new Set(app.results.plan.engravings.locked.map(e => e.item.id));
    return controlled
      .map(id => ({ id, tierIndex: getEngravingTierIndex(entry.engravings[id]) }))
      .filter(e => e.tierIndex >= 0)
      .map(e => ({
        name: ENGRAVING_LIBRARY.find(i => i.id === e.id).name,
        tier: ENGRAVING_TIERS[e.tierIndex].label,
        locked: lockedIds.has(e.id),
      }));
  });
</script>

<section class="card detail">
  <div class="card-hd">
    <h2>선택한 세팅</h2>
    <span class="spacer"></span>
    {#if entry?.isKnee}<span class="eyebrow" style="color:var(--warm)">균형점</span>{/if}
  </div>

  {#if !entry}
    <p class="detail-empty">
      탐색을 실행한 뒤 곡선에서 점을 고르거나 아래 표에서 행을 누르면
      그 세팅이 무엇을 내주고 무엇을 얻는지 여기에 표시됩니다.
    </p>
  {:else}
    <dl class="detail-figures">
      <div class="detail-figure lead">
        <dt>한 방 기대값</dt>
        <dd>
          {formatNumber(entry.damageIndex)}
          <em class={damageDelta >= 0 ? "up" : "down"}>{formatSignedPercent(damageDelta)}</em>
        </dd>
      </div>
      <div class="detail-figure">
        <dt>DPS 기대값</dt>
        <dd>
          {formatNumber(entry.dpsIndex)}
          <em class={dpsDelta >= 0 ? "up" : "down"}>{formatSignedPercent(dpsDelta)}</em>
        </dd>
      </div>
    </dl>

    <dl class="detail-secondary">
      <div><dt>쿨감</dt><dd>{formatNumber(entry.cooldownReduction)}%</dd></div>
      <div><dt>치적</dt><dd>{formatNumber(entry.critRateCapped)}%</dd></div>
      <div><dt>치피</dt><dd>{formatNumber(entry.critDamage)}%</dd></div>
      <div><dt>포인트</dt><dd>{formatInteger(entry.pointsUsed)}</dd></div>
    </dl>

    {#if trade}
      <div class="detail-knee">
        <strong>×{formatNumber(trade.rate)}</strong>
        <span>
          바로 위 지점 대비 한 방 −{formatInteger(trade.damageGiven)} 내주고 DPS +{formatInteger(trade.dpsGained)}
        </span>
      </div>
    {/if}

    <div class="detail-build">
      {#each Object.keys(EVOLUTION_TIERS) as tier}
        {@const chips = tierChips(tier)}
        {#if chips.length > 0}
          <div class="build-group">
            <h3>{EVOLUTION_TIERS[tier].label}</h3>
            <div class="build-chips">
              {#each chips as chip}
                <span class="chip">{chip.name}<span class="lv">{chip.level}</span></span>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      <div class="build-group">
        <h3>펫 · 각인</h3>
        <div class="build-chips">
          <span class="chip muted">{OPTIMIZER_PET_LABELS[entry.pet] ?? "펫 없음"}</span>
          {#each engravingChips as chip}
            <span class="chip" class:locked={chip.locked}>{chip.locked ? "고정 " : ""}{chip.name} {chip.tier}</span>
          {/each}
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn" class:primary={!isApplied} type="button" disabled={isApplied} onclick={() => applyResult(entry)}>
        {isApplied ? "현재 적용됨" : "이 세팅 적용"}
      </button>
    </div>
  {/if}
</section>
