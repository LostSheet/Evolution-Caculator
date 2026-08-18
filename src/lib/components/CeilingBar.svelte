<script>
  // 쿨감 소화 한계 막대 — 가로축이 곧 쿨감 %다. λ와 달리 대입할 단위가 있다.
  // "내 로테이션은 쿨감 30%쯤에서 막힌다" 하나만 알면 읽힌다.
  import { formatNumber } from "../core/util.js";
  import { sweepCeiling } from "../core/ceiling.js";
  import { cooldownColor } from "../ramp.js";
  import { app } from "../store.svelte.js";

  let { front } = $props();

  const sweep = $derived(sweepCeiling(front));

  // 쿨감을 냉 → 온으로. 곡선의 램프와 같은 규칙이라 눈이 이어진다.
  // 여기는 프론트가 아니라 0~60% 고정 눈금을 쓴다 — 이 막대의 가로축은
  // 후보들의 분포가 아니라 소화 한계 자체이므로.
  const ramp = cooldown => cooldownColor(cooldown, { min: 0, max: 60 });
</script>

{#if sweep.segments.length > 1}
  <div class="gamma">
    <div class="gamma-hd">
      <h3>쿨감 소화 한계</h3>
      <span class="spacer"></span>
      <span class="gamma-pick">쿨감이 어디까지 실제로 먹히느냐에 따라 1등이 갈립니다</span>
    </div>

    <div class="gamma-track" role="group" aria-label="소화 한계 구간별 최적 빌드">
      {#each sweep.segments as segment (segment.from)}
        <button
          type="button"
          class="gamma-seg"
          class:selected={segment.entry.id === app.selectedId}
          class:champion={segment.entry.id === sweep.championId}
          style:flex-grow={segment.width}
          style:--ramp={ramp(segment.entry.cooldownReduction)}
          title="소화 한계 {formatNumber(segment.from)}~{formatNumber(segment.to)}% · 한 방 {formatNumber(segment.entry.damageIndex)} · 쿨감 {formatNumber(segment.entry.cooldownReduction)}%"
          onclick={() => (app.selectedId = segment.entry.id)}>
          {#if segment.width > 0.12}<span>{formatNumber(segment.entry.cooldownReduction)}%</span>{/if}
        </button>
      {/each}
    </div>

    <div class="gamma-axis">
      <span>0% · 쿨감이 하나도 안 먹힘</span>
      <span class="spacer"></span>
      <span>{formatNumber(sweep.maxCeiling)}% · 전부 먹힘</span>
    </div>
  </div>
{/if}
