<script>
  import { formatNumber, formatInteger } from "../core/util.js";

  let { front = [], ranked = [], selectedId = null, currentSignature = "", onselect } = $props();

  // Generous margins: axis labels and the knee callout both need room, and the
  // whole point of this panel is that it gets read slowly.
  const PAD = { top: 34, right: 26, bottom: 52, left: 74 };
  const height = 380;
  let width = $state(900);
  let hovered = $state(null);

  // Ranked entries sit behind as context, so the front's shape reads against the
  // cloud of near-optimal settings it was drawn from.
  const cloud = $derived(ranked.filter(entry => !front.some(f => f.id === entry.id)));

  const bounds = $derived.by(() => {
    const points = [...front, ...cloud];
    if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const xs = points.map(p => p.dpsIndex);
    const ys = points.map(p => p.damageIndex);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padX = (maxX - minX) * 0.07 || 1;
    const padY = (maxY - minY) * 0.1 || 1;
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  });

  const plotW = $derived(Math.max(10, width - PAD.left - PAD.right));
  const plotH = $derived(Math.max(10, height - PAD.top - PAD.bottom));

  const sx = v => PAD.left + ((v - bounds.minX) / (bounds.maxX - bounds.minX)) * plotW;
  const sy = v => PAD.top + plotH - ((v - bounds.minY) / (bounds.maxY - bounds.minY)) * plotH;

  const cdrRange = $derived.by(() => {
    if (front.length === 0) return { min: 0, max: 1 };
    const values = front.map(p => p.cooldownReduction);
    const min = Math.min(...values), max = Math.max(...values);
    return { min, max: max === min ? min + 1 : max };
  });

  // Mint (low cooldown, burst end) → amber (high cooldown, sustain end).
  function cdrColor(value) {
    const t = Math.min(1, Math.max(0, (value - cdrRange.min) / (cdrRange.max - cdrRange.min)));
    const from = [134, 199, 168];
    const to = [224, 163, 62];
    return `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
  }

  const linePath = $derived(
    front.length === 0
      ? ""
      : front
          .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.dpsIndex).toFixed(1)},${sy(p.damageIndex).toFixed(1)}`)
          .join(" "),
  );

  function ticks(min, max, count) {
    return Array.from({ length: count + 1 }, (_, i) => min + ((max - min) * i) / count);
  }

  const active = $derived(hovered ?? front.find(p => p.id === selectedId) ?? null);

  // Label the single steepest knee inline; the rest are ringed only, so the
  // callout stays a signal instead of clutter.
  const headline = $derived.by(() => {
    const knees = front.filter(p => p.isKnee && p.exchangeRate > 0);
    if (knees.length === 0) return null;
    const best = knees.reduce((a, b) => (b.exchangeRate > a.exchangeRate ? b : a));
    const index = front.indexOf(best);
    if (index <= 0) return null;
    const previous = front[index - 1];
    return {
      point: best,
      damageGiven: previous.damageIndex - best.damageIndex,
      dpsGained: best.dpsIndex - previous.dpsIndex,
    };
  });
</script>

<div class="chart-wrap" bind:clientWidth={width}>
  {#if front.length === 0}
    <p class="chart-empty">탐색을 실행하면 트레이드오프 곡선이 여기에 표시됩니다.</p>
  {:else}
    <svg viewBox="0 0 {width} {height}" role="img"
         aria-label="한 방 딜과 DPS 트레이드오프 산점도. 점 색은 쿨타임 감소를 나타냅니다.">
      {#each ticks(bounds.minY, bounds.maxY, 4) as value}
        <line class="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={sy(value)} y2={sy(value)} />
        <text class="chart-tick" x={PAD.left - 10} y={sy(value)} text-anchor="end" dominant-baseline="middle">
          {formatInteger(value)}
        </text>
      {/each}

      <line class="chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} />
      <line class="chart-axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />

      {#each ticks(bounds.minX, bounds.maxX, 5) as value}
        <text class="chart-tick" x={sx(value)} y={PAD.top + plotH + 18} text-anchor="middle">
          {formatInteger(value)}
        </text>
      {/each}

      <text class="chart-axis-title" x={PAD.left} y={PAD.top - 16}>한 방 기대값 ↑</text>
      <text class="chart-axis-title" x={width - PAD.right} y={PAD.top + plotH + 40} text-anchor="end">DPS 기대값 →</text>

      {#each cloud as point (point.id)}
        <circle class="chart-cloud" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="2.5" />
      {/each}

      <path class="chart-line" d={linePath} />

      {#if headline}
        {@const hx = sx(headline.point.dpsIndex)}
        {@const hy = sy(headline.point.damageIndex)}
        <line class="chart-callout-line" x1={hx} y1={hy - 13} x2={hx} y2={hy - 32} />
        <text class="chart-callout" x={hx} y={hy - 48} text-anchor="middle">
          교환비 {formatNumber(headline.point.exchangeRate)}
        </text>
        <text class="chart-callout-sub" x={hx} y={hy - 37} text-anchor="middle">
          한 방 −{formatInteger(headline.damageGiven)} → DPS +{formatInteger(headline.dpsGained)}
        </text>
      {/if}

      {#each front as point (point.id)}
        {@const isCurrent = point.signature === currentSignature}
        <g class="chart-point" class:selected={point.id === selectedId} class:current={isCurrent}
           role="button" tabindex="0"
           aria-label="한 방 {formatNumber(point.damageIndex)}, DPS {formatNumber(point.dpsIndex)}, 쿨감 {formatNumber(point.cooldownReduction)}퍼센트"
           onmouseenter={() => (hovered = point)}
           onmouseleave={() => (hovered = null)}
           onfocus={() => (hovered = point)}
           onblur={() => (hovered = null)}
           onclick={() => onselect?.(point)}
           onkeydown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onselect?.(point); } }}>
          {#if point.isKnee}
            <circle class="chart-knee-ring" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="10" />
          {/if}
          <circle class="chart-dot"
                  cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)}
                  r={point.id === selectedId ? 7.5 : point.isKnee ? 6 : 5}
                  fill={cdrColor(point.cooldownReduction)} />
          <circle class="chart-hit" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="15" />
        </g>
      {/each}

      {#if active}
        <line class="chart-cross" x1={sx(active.dpsIndex)} x2={sx(active.dpsIndex)}
              y1={sy(active.damageIndex)} y2={PAD.top + plotH} />
        <line class="chart-cross" y1={sy(active.damageIndex)} y2={sy(active.damageIndex)}
              x1={PAD.left} x2={sx(active.dpsIndex)} />
      {/if}
    </svg>

    <div class="chart-legend">
      <span class="legend-gradient" aria-hidden="true"></span>
      <small>쿨감 {formatNumber(cdrRange.min)}% → {formatNumber(cdrRange.max)}%</small>
      <span class="legend-knee" aria-hidden="true"></span>
      <small>교환비 급변</small>
      <span class="legend-cloud" aria-hidden="true"></span>
      <small>순위권 {cloud.length}</small>
    </div>

    {#if active}
      <div class="chart-readout">
        <div><small>한 방</small><strong>{formatNumber(active.damageIndex)}</strong></div>
        <div><small>DPS</small><strong>{formatNumber(active.dpsIndex)}</strong></div>
        <div><small>쿨감</small><strong>{formatNumber(active.cooldownReduction)}%</strong></div>
        <div><small>치적</small><strong>{formatNumber(active.critRateCapped)}%</strong></div>
        {#if active.exchangeRate > 0}
          <div><small>교환비</small><strong class:knee-value={active.isKnee}>{formatNumber(active.exchangeRate)}</strong></div>
        {/if}
      </div>
    {:else}
      <p class="chart-hint">
        점을 누르면 해당 세팅이 적용됩니다. 고리 표시는 한 방 딜을 조금 내주고 DPS를 크게 얻는 지점입니다.
      </p>
    {/if}
  {/if}
</div>
