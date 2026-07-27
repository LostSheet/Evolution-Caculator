<script>
  import { formatNumber, formatInteger } from "../core/util.js";

  let { front = [], ranked = [], selectedId = null, currentSignature = "", onselect } = $props();

  const PAD = { top: 24, right: 22, bottom: 46, left: 66 };
  let width = $state(880);
  let height = $state(420);
  let hovered = $state(null);

  // Ranked entries are drawn as faint context so the front's shape reads against
  // the cloud of near-optimal settings it was picked from.
  const cloud = $derived(
    ranked.filter(entry => !front.some(f => f.id === entry.id)),
  );

  const bounds = $derived.by(() => {
    const points = [...front, ...cloud];
    if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const xs = points.map(p => p.dpsIndex);
    const ys = points.map(p => p.damageIndex);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const padX = (maxX - minX) * 0.06 || 1;
    const padY = (maxY - minY) * 0.06 || 1;
    return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
  });

  const plotW = $derived(Math.max(10, width - PAD.left - PAD.right));
  const plotH = $derived(Math.max(10, height - PAD.top - PAD.bottom));

  const sx = v => PAD.left + ((v - bounds.minX) / (bounds.maxX - bounds.minX)) * plotW;
  const sy = v => PAD.top + plotH - ((v - bounds.minY) / (bounds.maxY - bounds.minY)) * plotH;

  const cdrRange = $derived.by(() => {
    if (front.length === 0) return { min: 0, max: 1 };
    const values = front.map(p => p.cooldownReduction);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, max: max === min ? min + 1 : max };
  });

  // Cool (low cooldown reduction) to warm (high) — matches the app's teal/gold pair.
  function cdrColor(value) {
    const t = Math.min(1, Math.max(0, (value - cdrRange.min) / (cdrRange.max - cdrRange.min)));
    const from = [92, 214, 202];
    const to = [232, 189, 102];
    const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t));
    return `rgb(${mix.join(",")})`;
  }

  const linePath = $derived(
    front.length === 0 ? "" : front.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.dpsIndex).toFixed(1)},${sy(p.damageIndex).toFixed(1)}`).join(" "),
  );

  function ticks(min, max, count = 5) {
    const out = [];
    for (let i = 0; i <= count; i += 1) out.push(min + ((max - min) * i) / count);
    return out;
  }

  const active = $derived(hovered ?? front.find(p => p.id === selectedId) ?? null);
</script>

<div class="chart-wrap" bind:clientWidth={width}>
  {#if front.length === 0}
    <p class="chart-empty">탐색을 실행하면 트레이드오프 곡선이 여기에 표시됩니다.</p>
  {:else}
    <svg viewBox="0 0 {width} {height}" role="img" aria-label="한 방 딜과 DPS 트레이드오프 산점도">
      <!-- grid -->
      {#each ticks(bounds.minY, bounds.maxY) as value}
        <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={sy(value)} y2={sy(value)} />
        <text class="axis-label" x={PAD.left - 8} y={sy(value)} text-anchor="end" dominant-baseline="middle">
          {formatInteger(value)}
        </text>
      {/each}
      {#each ticks(bounds.minX, bounds.maxX) as value}
        <line class="grid" y1={PAD.top} y2={PAD.top + plotH} x1={sx(value)} x2={sx(value)} />
        <text class="axis-label" x={sx(value)} y={PAD.top + plotH + 18} text-anchor="middle">
          {formatInteger(value)}
        </text>
      {/each}

      <text class="axis-title" x={PAD.left + plotW / 2} y={height - 8} text-anchor="middle">DPS 기대값 →</text>
      <text class="axis-title" x={14} y={PAD.top + plotH / 2} text-anchor="middle" transform="rotate(-90 14 {PAD.top + plotH / 2})">
        한 방 기대값 →
      </text>

      <!-- near-optimal cloud for context -->
      {#each cloud as point (point.id)}
        <circle class="cloud" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="2.5" />
      {/each}

      <path class="front-line" d={linePath} />

      {#each front as point (point.id)}
        {@const isCurrent = point.signature === currentSignature}
        <g
          class="point"
          class:selected={point.id === selectedId}
          class:current={isCurrent}
          class:knee={point.isKnee}
          role="button"
          tabindex="0"
          aria-label="한 방 {formatNumber(point.damageIndex)}, DPS {formatNumber(point.dpsIndex)}, 쿨감 {formatNumber(point.cooldownReduction)}%"
          onmouseenter={() => (hovered = point)}
          onmouseleave={() => (hovered = null)}
          onfocus={() => (hovered = point)}
          onblur={() => (hovered = null)}
          onclick={() => onselect?.(point)}
          onkeydown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onselect?.(point); } }}
        >
          {#if point.isKnee}
            <circle class="knee-ring" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="11" />
          {/if}
          <circle
            class="dot"
            cx={sx(point.dpsIndex)}
            cy={sy(point.damageIndex)}
            r={point.id === selectedId ? 8 : point.isKnee ? 7 : 5.5}
            fill={cdrColor(point.cooldownReduction)}
          />
          <circle class="hit" cx={sx(point.dpsIndex)} cy={sy(point.damageIndex)} r="14" />
        </g>
      {/each}

      {#if active}
        <line class="crosshair" x1={sx(active.dpsIndex)} x2={sx(active.dpsIndex)} y1={PAD.top} y2={PAD.top + plotH} />
        <line class="crosshair" y1={sy(active.damageIndex)} y2={sy(active.damageIndex)} x1={PAD.left} x2={PAD.left + plotW} />
      {/if}
    </svg>

    <div class="chart-legend">
      <span class="legend-gradient" aria-hidden="true"></span>
      <small>쿨감 {formatNumber(cdrRange.min)}% → {formatNumber(cdrRange.max)}%</small>
      <span class="legend-knee" aria-hidden="true"></span>
      <small>교환비 급변 지점</small>
      <span class="legend-cloud" aria-hidden="true"></span>
      <small>순위권 조합</small>
    </div>

    {#if active}
      <div class="chart-readout">
        <div>
          <small>한 방</small><strong>{formatNumber(active.damageIndex)}</strong>
        </div>
        <div>
          <small>DPS</small><strong>{formatNumber(active.dpsIndex)}</strong>
        </div>
        <div>
          <small>쿨감</small><strong>{formatNumber(active.cooldownReduction)}%</strong>
        </div>
        <div>
          <small>치적</small><strong>{formatNumber(active.critRateCapped)}%</strong>
        </div>
        {#if active.exchangeRate > 0}
          <div>
            <small>교환비</small><strong class:knee-value={active.isKnee}>{formatNumber(active.exchangeRate)}</strong>
          </div>
        {/if}
      </div>
    {:else}
      <p class="chart-hint">점을 누르면 해당 세팅이 적용됩니다. 굵은 고리는 한 방 딜을 조금 내주고 DPS를 크게 얻는 지점입니다.</p>
    {/if}
  {/if}
</div>

<style>
  .chart-wrap { padding: 12px; }
  svg { width: 100%; height: auto; overflow: visible; }

  .grid { stroke: rgba(81, 91, 112, 0.32); stroke-width: 1; }
  .axis-label { fill: var(--muted-2); font-size: 0.68rem; font-variant-numeric: tabular-nums; }
  .axis-title { fill: var(--muted); font-size: 0.72rem; }

  .cloud { fill: rgba(174, 182, 199, 0.28); }
  .front-line { fill: none; stroke: rgba(232, 189, 102, 0.45); stroke-width: 1.5; stroke-dasharray: 4 4; }

  .point { cursor: pointer; }
  .dot { stroke: #0f1115; stroke-width: 1.5; transition: r 120ms ease; }
  .hit { fill: transparent; }
  .knee-ring { fill: none; stroke: var(--gold-2); stroke-width: 2; opacity: 0.75; }
  .point.current .dot { stroke: var(--teal); stroke-width: 2.5; }
  .point.selected .dot { stroke: #fff; stroke-width: 2.5; }
  .point:focus-visible { outline: none; }
  .point:focus-visible .dot { stroke: #fff; stroke-width: 3; }

  .crosshair { stroke: rgba(232, 189, 102, 0.28); stroke-width: 1; stroke-dasharray: 3 3; }

  .chart-legend {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-top: 10px;
  }
  .chart-legend small { color: var(--muted-2); font-size: 0.7rem; }
  .legend-gradient {
    width: 54px; height: 9px;
    background: linear-gradient(90deg, rgb(92, 214, 202), rgb(232, 189, 102));
  }
  .legend-knee {
    width: 11px; height: 11px; border: 2px solid var(--gold-2); border-radius: 50%;
  }
  .legend-cloud {
    width: 7px; height: 7px; border-radius: 50%; background: rgba(174, 182, 199, 0.5);
  }

  .chart-readout {
    display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; padding-top: 10px;
    border-top: 1px solid rgba(81, 91, 112, 0.5);
  }
  .chart-readout div { display: flex; align-items: baseline; gap: 6px; }
  .chart-readout small { color: var(--muted-2); font-size: 0.72rem; }
  .chart-readout strong { font-size: 0.98rem; font-variant-numeric: tabular-nums; }
  .chart-readout strong.knee-value { color: var(--gold-2); }

  .chart-hint, .chart-empty {
    margin: 10px 0 0; color: var(--muted-2); font-size: 0.74rem; line-height: 1.5;
  }
  .chart-empty { padding: 40px 0; text-align: center; }
</style>
