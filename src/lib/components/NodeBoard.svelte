<script>
  import { EVOLUTION_TIERS, NODE_LIBRARY } from "../core/data.js";
  import { getNodeCost, getManaShareRatio, calculateBluntThornBonus, calculateSonicBreakthroughBonus } from "../core/metrics.js";
  import { formatInteger, formatNumber, readNumber, clamp } from "../core/util.js";
  import { app, persist, resetSection } from "../store.svelte.js";
  import NodeIcon from "./NodeIcon.svelte";

  let { metrics, budget } = $props();

  let tip = $state(null);
  let pointer = $state({ x: 0, y: 0 });

  const tiers = Object.keys(EVOLUTION_TIERS);

  function tierUsage(tier) {
    const points = NODE_LIBRARY
      .filter(node => node.tier === tier)
      .reduce((sum, node) => sum + (app.character.nodeLevels[node.id] || 0) * getNodeCost(node), 0);
    return { points, maxPoints: EVOLUTION_TIERS[tier].maxPoints };
  }

  function bump(node, direction, large) {
    const step = large ? Math.min(10, node.maxLevel) : 1;
    const next = (app.character.nodeLevels[node.id] || 0) + direction * step;
    app.character.nodeLevels[node.id] = clamp(Math.round(next), 0, node.maxLevel);
    persist();
  }

  function formatNote(text, level) {
    if (level <= 0) return text;
    return text.replace(/([+-]?\d+(?:\.\d+)?%?)\/([+-]?\d+(?:\.\d+)?%?)/g, (_m, first, second) => {
      if (level <= 1) return first;
      if (/^[+-]/.test(second) || !/^[+-]/.test(first)) return second;
      return `${first[0]}${second}`;
    });
  }

  function formatEffect(effect, level) {
    if (effect.kind === "note") return formatNote(effect.text, level);
    if (effect.kind === "special") return `${level > 0 ? "적용" : "미적용"}: ${effect.label}`;
    const total = readNumber(effect.amount) * level;
    const unit = effect.kind === "stat" ? "" : "%";
    const base = `${effect.label} +${formatNumber(total)}${unit}`;
    if (!effect.manaOnly) return base;
    const share = getManaShareRatio(app.character.convenience);
    return `${base} → 마나 비중 ${formatInteger(share * 100)}% 적용 +${formatNumber(total * share)}${unit}`;
  }

  function effectLines(node, level) {
    if (node.id === "e5-blunt-thorn") {
      const converted = calculateBluntThornBonus(level, metrics.critRateRaw).damage;
      return [
        ...node.effects.filter(e => e.kind === "damage").map(e => formatEffect(e, level)),
        "치명타 확률 상한 80%",
        `초과 치적 전환 +${formatNumber(converted)}%`,
      ];
    }
    if (node.id === "e5-sonic-breakthrough") {
      const sonic = calculateSonicBreakthroughBonus(level, metrics.attackSpeed, metrics.moveSpeedBonus);
      return [
        `진화형 피해 +${formatNumber(sonic.damage)}%`,
        `기본 ${formatNumber(sonic.baseDamage)}% · 상한 ${formatNumber(sonic.capBonus)}% · 초과 ${formatNumber(sonic.excessDamage)}%`,
      ];
    }
    const primary = node.effects.filter(e => e.kind !== "note" && e.kind !== "special");
    return (primary.length > 0 ? primary : node.effects).map(e => formatEffect(e, level));
  }
</script>

<section class="card">
  <div class="card-hd">
    <h2>노드 배분</h2>
    <span class="eyebrow">클릭 +1 · 우클릭 −1 · Shift 10단위</span>
    <span class="spacer"></span>
    <span class="eyebrow" style:color={metrics.pointsUsed > budget ? "var(--warm)" : "var(--txt-2)"}>
      {formatInteger(metrics.pointsUsed)} / {formatInteger(budget)}
    </span>
    <button class="btn sm" type="button" onclick={() => resetSection("nodes")}>비우기</button>
  </div>

  <div class="board-track" aria-hidden="true">
    <div class:over={metrics.pointsUsed > budget}
         style:width="{budget > 0 ? Math.min(100, (metrics.pointsUsed / budget) * 100) : 0}%"></div>
  </div>

  <div class="board-body" onmousemove={e => (pointer = { x: e.clientX, y: e.clientY })} role="presentation">
    {#each tiers as tier}
      {@const usage = tierUsage(tier)}
      <div class="board-tier">
        <div class="board-tier-label">
          <b>{EVOLUTION_TIERS[tier].label}</b>
          <span>{formatInteger(usage.points)}/{formatInteger(usage.maxPoints)}</span>
        </div>
        <div class="board-nodes">
          {#each NODE_LIBRARY.filter(n => n.tier === tier) as node (node.id)}
            {@const level = app.character.nodeLevels[node.id] || 0}
            <button type="button" class="node" class:on={level > 0} class:max={level >= node.maxLevel}
                    aria-label="{node.name} Lv. {level}/{node.maxLevel}"
                    onclick={e => bump(node, 1, e.shiftKey)}
                    oncontextmenu={e => { e.preventDefault(); bump(node, -1, e.shiftKey); }}
                    onmouseenter={e => { tip = node; pointer = { x: e.clientX, y: e.clientY }; }}
                    onmouseleave={() => (tip = null)}
                    onfocus={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      tip = node; pointer = { x: r.right, y: r.top };
                    }}
                    onblur={() => (tip = null)}>
              <NodeIcon name={node.icon} />
              <span>{node.name}</span>
              <span class="lv">{level}/{node.maxLevel}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

{#if tip}
  {@const level = app.character.nodeLevels[tip.id] || 0}
  <div class="tip"
       style:left="{Math.min(pointer.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 380)}px"
       style:top="{pointer.y + 18}px">
    <strong>{tip.name}</strong>
    <small>{tip.tier} · {formatInteger(getNodeCost(tip))}P · Lv. {formatInteger(level)}/{formatInteger(tip.maxLevel)}</small>
    <ul>
      {#each effectLines(tip, level) as line}<li>{line}</li>{/each}
    </ul>
  </div>
{/if}
