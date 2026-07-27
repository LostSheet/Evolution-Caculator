<script>
  import { EVOLUTION_TIERS, NODE_LIBRARY } from "../core/data.js";
  import { getNodeCost, getManaShareRatio, calculateBluntThornBonus, calculateSonicBreakthroughBonus } from "../core/metrics.js";
  import { formatInteger, formatNumber, readNumber, clamp } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import NodeIcon from "./NodeIcon.svelte";

  let { metrics, budget } = $props();

  let tooltip = $state(null);
  let pointer = $state({ x: 0, y: 0 });

  const tiers = Object.keys(EVOLUTION_TIERS);

  function tierUsage(tier) {
    const points = NODE_LIBRARY
      .filter(node => node.tier === tier)
      .reduce((sum, node) => sum + (app.character.nodeLevels[node.id] || 0) * getNodeCost(node), 0);
    return { points, maxPoints: EVOLUTION_TIERS[tier].maxPoints };
  }

  function setLevel(node, next) {
    app.character.nodeLevels[node.id] = clamp(Math.round(next), 0, node.maxLevel);
    persist();
  }

  function step(node, large) {
    return large ? Math.min(10, node.maxLevel) : 1;
  }

  function bump(node, direction, large) {
    setLevel(node, (app.character.nodeLevels[node.id] || 0) + direction * step(node, large));
  }

  // Level-aware note text: "-10%/20%" collapses to the value for the current level.
  function formatNote(text, level) {
    if (level <= 0) return text;
    return text.replace(/([+-]?\d+(?:\.\d+)?%?)\/([+-]?\d+(?:\.\d+)?%?)/g, (_m, first, second) => {
      if (level <= 1) return first;
      if (/^[+-]/.test(second) || !/^[+-]/.test(first)) return second;
      return `${first[0]}${second}`;
    });
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
        `총 공속 ${formatNumber(metrics.attackSpeedRaw)}% · 초과 ${formatNumber(metrics.attackSpeedExcess)}%`,
      ];
    }
    const primary = node.effects.filter(e => e.kind !== "note" && e.kind !== "special");
    return (primary.length > 0 ? primary : node.effects).map(e => formatEffect(e, level));
  }

  function formatEffect(effect, level) {
    if (effect.kind === "note") return formatNote(effect.text, level);
    if (effect.kind === "special") return `${level > 0 ? "적용" : "미적용"}: ${effect.label}`;
    const total = readNumber(effect.amount) * level;
    const unit = effect.kind === "stat" ? "" : "%";
    const base = `${effect.label} +${formatNumber(total)}${unit}`;
    if (!effect.manaOnly) return base;
    const share = getManaShareRatio(app.character.convenience);
    return `${base} → 마나 딜 비중 ${formatInteger(share * 100)}% 적용 +${formatNumber(total * share)}${unit}`;
  }

  function showTooltip(node, event) {
    tooltip = node;
    pointer = { x: event.clientX, y: event.clientY };
  }
</script>

<section class="panel nodes-panel arc-board" aria-label="아크 패시브 노드">
  <div class="arc-board-top">
    <div class="arc-board-title">
      <strong>진화</strong>
      <small>노드를 클릭해 레벨을 올리고, 우클릭하면 내려갑니다 (Shift로 10단위)</small>
    </div>
    <div class="arc-board-points">
      <span>진화 포인트</span>
      <strong>{formatInteger(metrics.pointsUsed)} / {formatInteger(budget)}</strong>
    </div>
  </div>

  <div class="point-track" aria-label="포인트 사용량">
    <div
      class:over={metrics.pointsUsed > budget}
      style:width="{budget > 0 ? Math.min(100, (metrics.pointsUsed / budget) * 100) : 0}%"
    ></div>
  </div>

  <div class="node-grid" onmousemove={e => (pointer = { x: e.clientX, y: e.clientY })} role="presentation">
    {#each tiers as tier}
      {@const usage = tierUsage(tier)}
      {@const info = EVOLUTION_TIERS[tier]}
      <section class="arc-tier-row">
        <div class="tier-marker" aria-label="{info.label} {usage.points}/{usage.maxPoints}">
          <div class="tier-diamond"><span>{info.label.replace("T", "")}</span></div>
          <strong>{formatInteger(usage.points)}/{formatInteger(usage.maxPoints)}</strong>
        </div>
        <div class="tier-nodes">
          {#each NODE_LIBRARY.filter(n => n.tier === tier) as node (node.id)}
            {@const level = app.character.nodeLevels[node.id] || 0}
            <button
              type="button"
              class="node-card"
              class:active={level > 0}
              class:maxed={level >= node.maxLevel}
              aria-label="{node.name} Lv. {level}/{node.maxLevel}"
              onclick={e => bump(node, 1, e.shiftKey)}
              oncontextmenu={e => { e.preventDefault(); bump(node, -1, e.shiftKey); }}
              onkeydown={e => {
                if (["Backspace", "Delete"].includes(e.key)) { e.preventDefault(); bump(node, -1, e.shiftKey); }
              }}
              onmouseenter={e => showTooltip(node, e)}
              onmouseleave={() => (tooltip = null)}
              onfocus={e => showTooltip(node, { clientX: e.target.getBoundingClientRect().right, clientY: e.target.getBoundingClientRect().top })}
              onblur={() => (tooltip = null)}
            >
              <span class="node-cost">{formatInteger(getNodeCost(node))}P</span>
              <span class="node-icon {node.icon}" aria-hidden="true"><NodeIcon name={node.icon} /></span>
              <span class="node-level">Lv. {formatInteger(level)}/{formatInteger(node.maxLevel)}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</section>

{#if tooltip}
  {@const level = app.character.nodeLevels[tooltip.id] || 0}
  <div
    class="node-tooltip"
    style:left="{Math.min(pointer.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 440)}px"
    style:top="{pointer.y + 16}px"
  >
    <strong>{tooltip.name}</strong>
    <small>{tooltip.tier} · {formatInteger(getNodeCost(tooltip))}P · Lv. {formatInteger(level)}/{formatInteger(tooltip.maxLevel)}</small>
    <span class="tooltip-effects">
      {#each effectLines(tooltip, level) as line}
        <em>{line}</em>
      {/each}
    </span>
  </div>
{/if}
