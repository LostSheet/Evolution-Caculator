<script>
  import { formatNumber, formatInteger } from "../core/util.js";
  import { createParetoFront } from "../core/search.js";
  import { sweepCeiling, ceilingLabel } from "../core/ceiling.js";
  import { CHART_AXES, chartAxis } from "../core/axes.js";
  import { cooldownRange, cooldownColor } from "../ramp.js";
  import { app, currentSignature, resultPool, focusResult } from "../store.svelte.js";

  // Generous margins — this panel is meant to be read slowly, and the callout
  // needs somewhere to sit without colliding with the axis.
  const PAD = { top: 40, right: 30, bottom: 56, left: 78 };
  const height = 430;
  let width = $state(900);
  let hovered = $state(null);

  const xAxis = $derived(chartAxis(app.chartX, "dpsIndex"));
  const yAxis = $derived(chartAxis(app.chartY, "damageIndex"));
  const xOf = point => point[xAxis.key];
  const yOf = point => point[yAxis.key];

  // 축을 바꿀 때마다 다시 탐색할 수는 없으니, 탐색이 남긴 점들 위에서 그 축의
  // 프론트를 다시 그린다. 탐색이 무엇을 남길지는 정해진 축이 정했으므로,
  // 낯선 축 조합에서는 곡선이 성길 수 있다.
  const pool = $derived(resultPool());

  const front = $derived.by(() => {
    if (pool.length === 0) return [];
    const build = createParetoFront(xAxis.key, yAxis.key);
    pool.forEach(entry => build.offer(entry));
    return build.items;
  });
  const cloud = $derived(pool.filter(entry => !front.some(f => f.id === entry.id)));
  const signature = $derived(currentSignature());

  const bounds = $derived.by(() => {
    const points = [...front, ...cloud];
    if (points.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const xs = points.map(xOf);
    const ys = points.map(yOf);
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

  const cdrRange = $derived(cooldownRange(front));
  const cdrColor = value => cooldownColor(value, cdrRange);

  const linePath = $derived(
    front.length === 0
      ? ""
      : front.map((p, i) => `${i === 0 ? "M" : "L"}${sx(xOf(p)).toFixed(1)},${sy(yOf(p)).toFixed(1)}`).join(" "),
  );

  const ticks = (min, max, count) =>
    Array.from({ length: count + 1 }, (_, i) => min + ((max - min) * i) / count);

  const active = $derived(hovered ?? front.find(p => p.id === app.selectedId) ?? null);

  // 예전에는 이웃 두 점의 기울기가 급한 곳에 고리를 둘렀는데, 그 기울기는
  // 점 사이 간격에 좌우돼서 촘촘한 자리마다 고리가 붙었다. 지금은 한계 스윕이
  // 정한 '가장 넓은 구간'을 가진 점 하나만 표시한다. 추천 카드가 고르는 것과
  // 같은 점이라, 두 화면이 다른 곳을 가리키는 일이 없다.
  // 한계 스윕은 '한 방 딜 × DPS' 곡선의 개념이다. 다른 축에서는 안 그린다.
  const onDefaultAxes = $derived(xAxis.key === "dpsIndex" && yAxis.key === "damageIndex");
  const sweep = $derived(onDefaultAxes ? sweepCeiling(front) : { segments: [], byId: new Map(), championId: null });

  const headline = $derived.by(() => {
    if (!sweep.championId) return null;
    const point = front.find(p => p.id === sweep.championId);
    if (!point) return null;
    return { point, label: ceilingLabel(sweep, point.id) };
  });

  // 고르기만 한다. 고른 점은 아래 막대에 임시 열로 서고, 담기는 표의 체크가 한다.
  function choose(point) {
    focusResult(point);
  }
</script>

<div class="chart-body" bind:clientWidth={width}>
  {#if front.length === 0}
    <p class="chart-empty">탐색을 실행하면 곡선이 여기에 그려집니다.</p>
  {:else}
    <svg viewBox="0 0 {width} {height}" role="img"
         aria-label="한 방 딜 균형 곡선. 점 색은 쿨타임 감소를 나타냅니다.">
      {#each ticks(bounds.minY, bounds.maxY, 4) as value}
        <line class="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={sy(value)} y2={sy(value)} />
        <text class="chart-tick" x={PAD.left - 12} y={sy(value)} text-anchor="end" dominant-baseline="middle">
          {yAxis.tick(value)}
        </text>
      {/each}

      <line class="chart-axis" x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} />
      <line class="chart-axis" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />

      {#each ticks(bounds.minX, bounds.maxX, 5) as value}
        <text class="chart-tick" x={sx(value)} y={PAD.top + plotH + 20} text-anchor="middle">
          {xAxis.tick(value)}
        </text>
      {/each}

      <text class="chart-axis-title" x={PAD.left} y={PAD.top - 18}>{yAxis.label} ↑</text>
      <text class="chart-axis-title" x={width - PAD.right} y={PAD.top + plotH + 44} text-anchor="end">{xAxis.label} →</text>

      {#each cloud as point (point.id)}
        <circle class="chart-cloud" cx={sx(xOf(point))} cy={sy(yOf(point))} r="2.5" />
      {/each}

      <path class="chart-line" d={linePath} />

      {#if headline}
        {@const hx = sx(xOf(headline.point))}
        {@const hy = sy(yOf(headline.point))}
        <line class="chart-callout-line" x1={hx} y1={hy - 14} x2={hx} y2={hy - 34} />
        <text class="chart-callout" x={hx} y={hy - 51} text-anchor="middle">
          한계 {headline.label}
        </text>
        <text class="chart-callout-sub" x={hx} y={hy - 39} text-anchor="middle">
          구간이 가장 넓습니다
        </text>
      {/if}

      {#each front as point (point.id)}
        {@const isCurrent = point.signature === signature}
        <g class="chart-point" class:selected={point.id === app.selectedId} class:current={isCurrent}
           role="button" tabindex="0"
           aria-label="{yAxis.label} {formatNumber(yOf(point))}, {xAxis.label} {formatNumber(xOf(point))}, 쿨감 {formatNumber(point.cooldownReduction)}퍼센트"
           onmouseenter={() => (hovered = point)}
           onmouseleave={() => (hovered = null)}
           onfocus={() => (hovered = point)}
           onblur={() => (hovered = null)}
           onclick={() => choose(point)}
           onkeydown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(point); } }}>
          {#if point.id === sweep.championId}
            <circle class="chart-knee-ring" cx={sx(xOf(point))} cy={sy(yOf(point))} r="11" />
          {/if}
          <circle class="chart-dot"
                  cx={sx(xOf(point))} cy={sy(yOf(point))}
                  r={point.id === app.selectedId ? 8 : point.id === sweep.championId ? 6.5 : 5.5}
                  style:--ramp={cdrColor(point.cooldownReduction)} />
          <circle class="chart-hit" cx={sx(xOf(point))} cy={sy(yOf(point))} r="16" />
        </g>
      {/each}

      {#if active}
        <line class="chart-cross" x1={sx(xOf(active))} x2={sx(xOf(active))}
              y1={sy(yOf(active))} y2={PAD.top + plotH} />
        <line class="chart-cross" y1={sy(yOf(active))} y2={sy(yOf(active))}
              x1={PAD.left} x2={sx(xOf(active))} />
      {/if}
    </svg>
  {/if}
</div>

{#if front.length > 0}
  <div class="chart-foot">
    <span class="ramp" aria-hidden="true"></span>
    <small>쿨감 {formatNumber(cdrRange.min)}% → {formatNumber(cdrRange.max)}%</small>
    {#if sweep.championId}
      <span class="ramp-knee" aria-hidden="true"></span>
      <small>가장 넓은 한계 구간</small>
    {/if}
    <span class="ramp-cloud" aria-hidden="true"></span>
    <small>순위권 {cloud.length}</small>
    <!-- '적용됩니다'라고 적혀 있었다 — 지금은 아무것도 안 얹는다. 고르기다. -->
    <small style="margin-left:auto">점 클릭 = 고르기</small>
  </div>
{/if}
