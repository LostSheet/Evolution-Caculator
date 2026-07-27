<script>
  import { formatNumber, formatInteger, formatSignedPercent, percentDelta, clamp } from "../core/util.js";

  let { metrics, baseline, budget } = $props();

  const damageDelta = $derived(percentDelta(metrics.damageIndex, baseline.damageIndex));
  const dpsDelta = $derived(percentDelta(metrics.dpsIndex, baseline.dpsIndex));
  const over = $derived(metrics.pointsUsed > budget);
</script>

<section class="summary-strip" aria-label="계산 결과">
  <article class="metric-tile featured">
    <span>한 방 기대값</span>
    <strong>{formatNumber(metrics.damageIndex)}</strong>
    <small>노드 전 대비 {formatSignedPercent(damageDelta)}</small>
  </article>
  <article class="metric-tile featured-secondary">
    <span>DPS 기대값</span>
    <strong>{formatNumber(metrics.dpsIndex)}</strong>
    <small>노드 전 대비 {formatSignedPercent(dpsDelta)}</small>
  </article>
  <article class="metric-tile">
    <span>치명타 확률</span>
    <strong>{formatNumber(metrics.critRateCapped)}%</strong>
    <small>총 {formatNumber(metrics.critRateRaw)}%</small>
  </article>
  <article class="metric-tile">
    <span>치명타 피해</span>
    <strong>{formatNumber(metrics.critDamage)}%</strong>
  </article>
  <article class="metric-tile">
    <span>쿨타임 감소</span>
    <strong>{formatNumber(metrics.cooldownReduction)}%</strong>
    <small>{metrics.cooldownGroupLabel}</small>
  </article>
  <article class="metric-tile">
    <span>적용 공격/이동속도</span>
    <strong>공 {formatNumber(metrics.attackMoveSpeed)}%</strong>
    <small>이 {formatNumber(metrics.moveSpeed)}%</small>
    {#if metrics.attackSpeedExcess > 0 || metrics.moveSpeedExcess > 0}
      <small class="speed-excess">초과 공 {formatNumber(metrics.attackSpeedExcess)}% · 이 {formatNumber(metrics.moveSpeedExcess)}%</small>
    {/if}
  </article>
  <article class="metric-tile">
    <span>진화 포인트</span>
    <strong>{formatInteger(metrics.pointsUsed)} / {formatInteger(budget)}</strong>
    <small class:over>
      {over ? `${formatInteger(metrics.pointsUsed - budget)} 초과` : `${formatInteger(budget - metrics.pointsUsed)} 남음`}
    </small>
  </article>
</section>
