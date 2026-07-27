<script>
  import { formatNumber, formatInteger } from "../core/util.js";
  import { app, applyResult, currentSignature } from "../store.svelte.js";

  // Generous margins — this panel is meant to be read slowly, and the callout
  // needs somewhere to sit without colliding with the axis.
  const PAD = { top: 40, right: 30, bottom: 56, left: 78 };
  const height = 430;
  let width = $state(900);
  let hovered = $state(null);

  const front = $derived(app.results?.pareto ?? []);
  const cloud = $derived(
    app.results
      ? [...app.results.damage, ...app.results.dps].filter(e => !front.some(f => f.id === e.id))
      : [],
  );
  const signature = $derived(currentSignature());

  const bounds = $derived.by(() => {
    const points = [...front, ...cloud];
    if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const xs = points.map(p => p.dpsIndex);
    const ys = points.map(p => p.damageIndex);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      minX: minX - (maxX - minX) * 0.07 || minX - 1,
      maxX: maxX + (maxX - minX) * 0.07 || maxX + 1,
      minY: minY - (maxY - minY) * 0.1 || minY - 1,
      maxY: maxY + (maxY - minY) * 0.12 || maxY + 1,
    };
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

  // Cool (low cooldown, burst end) → warm (high cooldown, sustain end).
  function cdrColor(value) {
    const t = Math.min(1, Math.max(0, (value - cdrRange.min) / (cdrRange.max - cdrRange.min)));
    const from = [127, 178, 255];
    const to = [255, 123, 94];
    return `rgb(${from.map((c, i) => Math.round(c + (to[i] - c) * t)).join(",")})`;
  }

  const linePath = $derived(
    front.length === 0
      ? ""
      : front.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.dpsIndex).toFixed(1)},${sy(p.damageIndex).toFixed(1)}`).join(" "),
  );

  const ticks = (min, max, count) =>
    Array.from({ length: count + 1 }, (_, i) => min + ((max - min) * i) / count);

  const active = $derived(hovered ?? front.find(p => p.id === app.selectedId) ?? null);

  // Only the steepest knee gets a label; the rest are ringed, so the callout
  // stays a signal instead of clutter.
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

  function choose(point) {
    app.selectedId = point.id;
    applyResult(point);
  }
</script>

<div class="chart-body" bind:clientWidth={width}>
  {#if front.length === 0}
    <p class="chart-empty">탐색을 실행하면 균형 곡선이 여기에 그려집니다.</p>
  {:else}
    <svg viewBox="0 0 {width} {height}" role="img"
         aria-label="한 방 딜과 DPS 균형 곡선. 점 색은 쿨타임 감소를 나타냅니다.">
      {#each ticks(bounds.minY, bounds.maxY, 4) as value}
        <line class="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={sy(value)} y2={sy(value)} />
        <text class="chart-tick" x={PAD.left - 12} y={sy(value)} text-anchor="end" dominant-baseline="middle">
          {formatInteger(value)}
        </text>
      {/each}

      <line class="chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} />
      <line class="chart-axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />

      {#each ticks(bounds.minX, bounds.maxX, 5) as value}
        <text class="chart-tick" x={sx(value)} y={PAD.top + plotH + 20} text-anchor="middle">
          {formatInteger(value)}
        </text>
      {/each}

      <text class="chart-axis-title" x={PAD.left} y={PAD.top - 18}>한 방 기대값 ↑</text>
      <text class="chart-axis-title" x={width - PAD.right} y={PAD.top + plotH + 44} text-anchor="end">DPS 기대값 →</text>

      {#each cloud as point (point.id)}
        <circle class="chart-cloud" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="2.5" />
      {/each}

      <path class="chart-line" d={linePath} />

      {#if headline}
        {@const hx = sx(headline.point.dpsIndex)}
        {@const hy = sy(headline.point.damageIndex)}
        <line class="chart-callout-line" x1={hx} y1={hy - 14} x2={hx} y2={hy - 34} />
        <text class="chart-callout" x={hx} y={hy - 51} text-anchor="middle">
          ×{formatNumber(headline.point.exchangeRate)}
        </text>
        <text class="chart-callout-sub" x={hx} y={hy - 39} text-anchor="middle">
          한 방 −{formatInteger(headline.damageGiven)} → DPS +{formatInteger(headline.dpsGained)}
        </text>
      {/if}

      {#each front as point (point.id)}
        {@const isCurrent = point.signature === signature}
        <g class="chart-point" class:selected={point.id === app.selectedId} class:current={isCurrent}
           role="button" tabindex="0"
           aria-label="한 방 {formatNumber(point.damageIndex)}, DPS {formatNumber(point.dpsIndex)}, 쿨감 {formatNumber(point.cooldownReduction)}퍼센트"
           onmouseenter={() => (hovered = point)}
           onmouseleave={() => (hovered = null)}
           onfocus={() => (hovered = point)}
           onblur={() => (hovered = null)}
           onclick={() => choose(point)}
           onkeydown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(point); } }}>
          {#if point.isKnee}
            <circle class="chart-knee-ring" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="11" />
          {/if}
          <circle class="chart-dot"
                  cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)}
                  r={point.id === app.selectedId ? 8 : point.isKnee ? 6.5 : 5.5}
                  fill={cdrColor(point.cooldownReduction)} />
          <circle class="chart-hit" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="16" />
        </g>
      {/each}

      {#if active}
        <line class="chart-cross" x1={sx(active.dpsIndex)} x2={sx(active.dpsIndex)}
              y1={sy(active.damageIndex)} y2={PAD.top + plotH} />
        <line class="chart-cross" y1={sy(active.damageIndex)} y2={sy(active.damageIndex)}
              x1={PAD.left} x2={sx(active.dpsIndex)} />
      {/if}
    </svg>
  {/if}
</div>

{#if front.length > 0}
  <div class="chart-foot">
    <span class="ramp" aria-hidden="true"></span>
    <small>쿨감 {formatNumber(cdrRange.min)}% → {formatNumber(cdrRange.max)}%</small>
    <span class="ramp-knee" aria-hidden="true"></span>
    <small>교환비 급변</small>
    <span class="ramp-cloud" aria-hidden="true"></span>
    <small>순위권 {cloud.length}</small>
    <small style="margin-left:auto">점을 누르면 그 세팅이 적용됩니다</small>
  </div>
{/if}
