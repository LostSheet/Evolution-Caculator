<script>
  /**
   * 가격 대 딜 상승. 조합은 색으로 가른다.
   *
   * 표는 순서를 주지만 거리를 안 준다 — 0.98%와 0.10% 사이가 얼마나 먼지,
   * 170만과 1,000골드 사이가 얼마나 먼지는 숫자를 읽어 머리로 재야 한다.
   * 흩뿌려 놓으면 그게 눈에 보인다.
   *
   * 가로는 로그다. 가격이 1골드부터 300만까지 벌어져서, 선형으로 놓으면
   * 싼 것들이 전부 왼쪽 벽에 붙어 한 점이 된다.
   *
   * 굵은 선은 **가성비 경계**다 — 자기보다 싸면서 더 센 매물이 없는 것들.
   * 경계 아래의 점은 살 이유가 없다. 그리고 경계의 기울기가 곧 한계 골드당이라,
   * 선이 눕는 지점부터는 돈을 더 써도 덜 오른다.
   */
  import { formatInteger } from "../core/util.js";
  import { orderedLines, priceFrontier } from "../core/accessory.js";

  let { rows = [], part, colorOf = () => null, onpick = () => {} } = $props();

  const PAD = { top: 18, right: 18, bottom: 44, left: 52 };
  const height = 260;
  let width = $state(900);
  let hovered = $state(null);

  const points = $derived(rows.filter(row => row.gain > 0 && row.price > 0));

  const front = $derived(priceFrontier(points));
  const onFront = $derived(new Set(front));

  const bounds = $derived.by(() => {
    if (points.length === 0) return { x0: 3, x1: 7, y1: 1 };
    const xs = points.map(row => Math.log10(Math.max(1, row.price)));
    const maxY = Math.max(...points.map(row => row.gain));
    // 자릿수 끝까지 늘리면 왼쪽이 텅 빈다 — 목걸이는 최저가가 30만이라
    // 1,000골드 자리까지 그릴 이유가 없다. 점이 있는 범위에 바짝 붙인다.
    return {
      x0: Math.min(...xs) - 0.12,
      x1: Math.max(...xs) + 0.12,
      y1: maxY * 1.12,
    };
  });

  const px = price => PAD.left
    + (Math.log10(Math.max(1, price)) - bounds.x0) / (bounds.x1 - bounds.x0)
    * (width - PAD.left - PAD.right);
  const py = gain => height - PAD.bottom - (gain / bounds.y1) * (height - PAD.top - PAD.bottom);

  // 눈금은 1·3·10·30… 반 자릿수마다. 자릿수마다만 찍으면 30만~300만 구간에
  // 눈금이 둘뿐이라 어디가 어딘지 못 읽는다.
  const ticks = $derived.by(() => {
    const out = [];
    for (let e = -1; e <= 8; e += 1) {
      [1, 3].forEach(lead => {
        const value = lead * 10 ** e;
        const at = Math.log10(value);
        if (at < bounds.x0 || at > bounds.x1) return;
        out.push({
          x: px(value),
          label: value >= 10000 ? `${formatInteger(value / 10000)}만` : formatInteger(value),
        });
      });
    }
    return out;
  });
  const yTicks = $derived.by(() => {
    const step = bounds.y1 > 2 ? 0.5 : bounds.y1 > 0.8 ? 0.2 : 0.05;
    const out = [];
    for (let v = 0; v <= bounds.y1; v += step) out.push({ y: py(v), label: `${v.toFixed(step < 0.1 ? 2 : 1)}%` });
    return out;
  });

  const path = $derived(front.map((row, i) => `${i === 0 ? "M" : "L"}${px(row.price)},${py(row.gain)}`).join(" "));
  const grind = row => orderedLines(part, row.listing)
    .filter(line => line.counted)
    .map(line => `${line.name} ${line.percent ? `+${line.value.toFixed(2)}%` : `+${formatInteger(line.value)}`}`)
    .join(" · ");
</script>

<div class="mk-chart" bind:clientWidth={width}>
  {#if points.length === 0}
    <p class="market-empty">오르는 매물이 없습니다</p>
  {:else}
    <svg viewBox="0 0 {width} {height}" role="img" aria-label="가격 대 딜 상승">
      {#each yTicks as tick (tick.label)}
        <line class="mk-grid" x1={PAD.left} x2={width - PAD.right} y1={tick.y} y2={tick.y} />
        <text class="mk-tick" x={PAD.left - 8} y={tick.y + 3.5} text-anchor="end">{tick.label}</text>
      {/each}
      {#each ticks as tick (tick.label)}
        <line class="mk-grid soft" x1={tick.x} x2={tick.x} y1={PAD.top} y2={height - PAD.bottom} />
        <text class="mk-tick" x={tick.x} y={height - PAD.bottom + 16} text-anchor="middle">{tick.label}</text>
      {/each}
      <text class="mk-axis" x={width - PAD.right} y={height - 6} text-anchor="end">가격 (골드, 로그)</text>

      <path class="mk-front" d={path} />

      {#each points as row, at (at)}
        {@const lead = onFront.has(row)}
        <circle class="mk-dot c{colorOf(row) ?? 'x'}" class:lead class:on={hovered === row}
                cx={px(row.price)} cy={py(row.gain)} r={lead ? 5.5 : 3.6}
                role="button" tabindex="-1"
                onmouseenter={() => (hovered = row)}
                onmouseleave={() => (hovered = null)}
                onclick={() => onpick(row)}
                onkeydown={e => e.key === "Enter" && onpick(row)} />
      {/each}
    </svg>

    {#if hovered}
      {@const left = Math.min(Math.max(px(hovered.price), 90), width - 90)}
      <div class="mk-tip" style="left:{left}px; top:{py(hovered.gain) - 8}px">
        <b>{hovered.perGold.toFixed(4)}</b> 만골당
        <span>{grind(hovered)}</span>
        <span>품질 {hovered.listing.quality} · 주스탯 {formatInteger(hovered.listing.mainStat)}</span>
        <span>{formatInteger(hovered.price)}골드 · +{hovered.gain.toFixed(2)}%</span>
      </div>
    {/if}
  {/if}
</div>
