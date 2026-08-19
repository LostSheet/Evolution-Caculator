<script>
  import { EVOLUTION_TIERS, NODE_LIBRARY } from "../core/data.js";
  import {
    getNodeCost, getManaShareRatio, calculateBluntThornBonus, calculateSonicBreakthroughBonus,
    isDirectionalConditionActive,
  } from "../core/metrics.js";
  import { marginalGain } from "../core/explain.js";
  import { getModeledStatKeys, isNodeImpactful } from "../core/search.js";
  import { formatInteger, formatNumber, formatSignedPercent, readNumber, clamp } from "../core/util.js";
  import {
    app, persist, resetSection,
    isNodeLocked, clearNodeLocks, nodeLockLevel, setNodeLock, clearNodeLock,
  } from "../store.svelte.js";
  import NodeIcon from "./NodeIcon.svelte";

  /**
   * mode — 같은 판이 두 가지 일을 한다.
   *
   *   "levels" (서랍)   클릭이 레벨을 올린다. 무엇을 찍을지 정하는 자리.
   *   "scope"  (탐색)   빈 판이다. 클릭이 자유 → 고정 → 제외를 돌고, 고정한
   *                     칸에만 레벨을 적는다. 빌드는 안 건드린다.
   *
   * 판을 두 번 그리는 대신 모드를 나눈 이유는 자리 감각이다. 티어별로 어느
   * 노드가 어디 있는지는 이미 손에 익어 있는데, 탐색 화면에서만 목록으로
   * 바뀌면 같은 것을 두 번 배워야 한다.
   *
   * scope는 지금 빌드를 아예 안 읽는다. 예전에는 '지금 찍혀 있는 레벨로 고정'
   * 이었는데, 그러면 슬롯을 갈아끼울 때마다 탐색 규칙이 따라 움직였다. 규칙은
   * 슬롯 밖에 서 있어야 한다 — 그래서 빈 판에서 시작해 고정한 칸만 채운다.
   */
  let { report, budget, mode = "levels" } = $props();
  const scoping = $derived(mode === "scope");

  // 이 판이 읽는 레벨. 탐색 대상 모드에서는 고정 레벨이 곧 레벨이다.
  const levelOf = node => (scoping ? (nodeLockLevel(node.id) ?? 0) : (app.character.nodeLevels[node.id] || 0));

  const metrics = $derived(report.metrics);

  let tip = $state(null);
  let pointer = $state({ x: 0, y: 0 });

  /**
   * 툴팁을 body로 옮긴다.
   *
   * 이 컴포넌트가 놓이는 자리는 격자(.split-main)다. 툴팁이 position:fixed라
   * 자리를 안 차지할 것 같지만, 그 자리에 남는 빈 텍스트 노드가 익명 격자
   * 항목이 되어 행 높이를 16px 늘린다. 그래서 툴팁이 뜨고 질 때마다 아래
   * 각인 카드가 위아래로 뛴다 — 노드를 훑는 내내 판이 흔들린다.
   *
   * 화면에 떠 있는 것은 애초에 문서 흐름에 있을 이유가 없다.
   */
  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  const tiers = Object.keys(EVOLUTION_TIERS);

  // "이걸 1렙 더 올리면 얼마" — 툴팁이 열린 노드에 대해서만 계산한다.
  // 탐색 대상 모드에서는 안 잰다 — 그 화면의 레벨은 규칙이지 내 빌드가 아니라서
  // "+1렙 하면 얼마"가 가리킬 대상이 없다.
  const gain = $derived(tip && !scoping ? marginalGain(app.character, tip, metrics, budget) : null);

  // 낙인력 · 공격력 강화처럼 이 계산기가 다루지 않는 노드. 탐색도 후보에서 빼므로
  // 화면에서도 물러나 있어야 한다.
  const inert = $derived.by(() => {
    const keys = getModeledStatKeys(app.character);
    return new Set(NODE_LIBRARY.filter(node => !isNodeImpactful(node, keys)).map(node => node.id));
  });

  function tierUsage(tier) {
    const points = NODE_LIBRARY
      .filter(node => node.tier === tier)
      .reduce((sum, node) => sum + levelOf(node) * getNodeCost(node), 0);
    return { points, maxPoints: EVOLUTION_TIERS[tier].maxPoints };
  }

  // 고정으로 이미 묶인 포인트. 탐색 대상 모드의 머리에 이 숫자가 선다 —
  // 그 화면에서 진행 막대가 재야 할 것은 내 빌드가 아니라 규칙이다.
  const lockedPoints = $derived(
    NODE_LIBRARY.reduce((sum, node) => sum + (nodeLockLevel(node.id) ?? 0) * getNodeCost(node), 0),
  );

  // 머리의 진행 막대가 재는 것. 모드마다 다르다.
  const used = $derived(scoping ? lockedPoints : metrics.pointsUsed);

  // 사용자가 직접 뺀 노드. 회색(계산기가 못 다룸)과 달리 붉게 칠하고,
  // 조합 탐색에서도 후보에서 빠진다.
  const excluded = $derived(new Set(app.search.excludedNodes));

  // 화면에서 고정은 하나의 개념이다 — 0 고정(제외)과 레벨 고정을 같이 센다.
  const lockCount = $derived(
    app.search.excludedNodes.length + Object.keys(app.search.lockedNodes ?? {}).length,
  );

  // 고정 때문에 갈 곳을 잃은 포인트.
  //
  // 치명을 6에 고정하면 1T에서 탐색이 쓸 수 있는 자리는 신속뿐인데 신속은 30이
  // 상한이라, 40P 중 4P가 어디에도 못 간다. 화면에는 그냥 "136 / 140"으로만
  // 보여서 탐색이 고장 난 것처럼 읽혔다. 왜 남는지를 그 자리에 적는다.
  const stranded = $derived.by(() => {
    const keys = getModeledStatKeys(app.character);
    const locked = app.search.lockedNodes ?? {};
    return tiers.map(tier => {
      const info = EVOLUTION_TIERS[tier];
      const nodes = NODE_LIBRARY.filter(node => node.tier === tier);
      const reach = nodes.reduce((sum, node) => {
        if (excluded.has(node.id)) return sum;
        // 고정한 노드는 그 레벨만큼만, 나머지는 탐색이 쓸 수 있는 것만 센다.
        if (Object.hasOwn(locked, node.id)) return sum + readNumber(locked[node.id]) * getNodeCost(node);
        if (!isNodeImpactful(node, keys)) return sum;
        return sum + node.maxLevel * getNodeCost(node);
      }, 0);
      const lost = info.maxPoints - Math.min(info.maxPoints, reach);
      const names = nodes
        .filter(node => Object.hasOwn(locked, node.id))
        .map(node => `${node.name} ${readNumber(locked[node.id])}`);
      return { tier, label: info.label, lost, names };
    }).filter(item => item.lost > 0 && item.names.length > 0);
  });

  // 티어마다 쓸 수 있는 포인트가 정해져 있다(3T는 20P = 노드 2개). 탐색은
  // 이 상한 안에서만 조합을 만드는데 손으로 찍을 때는 막지 않아서, 탐색이
  // 절대 내놓을 수 없는 빌드를 만들고 그 수치를 계기판이 그대로 보여줬다.
  function tierHeadroom(node) {
    const tier = EVOLUTION_TIERS[node.tier];
    const usedByOthers = NODE_LIBRARY
      .filter(other => other.tier === node.tier && other.id !== node.id)
      .reduce((sum, other) => sum + (app.character.nodeLevels[other.id] || 0) * getNodeCost(other), 0);
    return Math.max(0, Math.floor((tier.maxPoints - usedByOthers) / tier.cost));
  }

  function scopeOf(node) {
    if (excluded.has(node.id)) return "excluded";
    if (isNodeLocked(node.id)) return "locked";
    return "free";
  }

  function scopeLabel(node) {
    const state = scopeOf(node);
    if (state === "excluded") return "제외";
    if (state === "locked") return `${nodeLockLevel(node.id) ?? 0} 고정`;
    return "탐색이 굴림";
  }

  /**
   * 고정 레벨도 레벨이다 — 손은 두 판에서 같은 규칙을 쓴다.
   *
   *   클릭 +1 · 우클릭 −1 · Shift 10단위
   *   0에서 우클릭하면 제외 ↔ 자유
   *
   * 한동안 클릭 한 번이 자유 → 고정 → 제외를 도는 방식이었는데, 그건 이 앱이
   * 이미 쓰던 규칙을 이유 없이 갈아치운 것이었다. 판이 둘이라고 손이 둘일
   * 이유는 없다.
   */
  function bumpScope(node, direction, large) {
    const step = large ? Math.min(10, node.maxLevel) : 1;
    const current = nodeLockLevel(node.id);

    if (direction > 0) {
      setNodeLock(node.id, Math.min(node.maxLevel, (current ?? 0) + step));
      return;
    }
    // 자유에서 더 내릴 곳은 없다. 그 자리를 제외 토글로 쓴다 — 예전 노드판이
    // 하던 그대로다.
    if (current === null) { setNodeLock(node.id, 0); return; }
    if (current === 0) { clearNodeLock(node.id); return; }
    setNodeLock(node.id, Math.max(0, current - step));
  }

  /** 고정 레벨 직접 입력. 0은 제외, 빈 칸은 손대는 중이므로 그대로 둔다. */
  function setLockLevel(node, raw) {
    if (String(raw).trim() === "") return;
    setNodeLock(node.id, clamp(Math.round(readNumber(raw)), 0, node.maxLevel));
  }

  function bump(node, direction, large) {
    if (excluded.has(node.id)) return;
    // 읽기 전용 슬롯을 만지면 여기서 사본이 선다. 반드시 값을 읽기 전에.
    const step = large ? Math.min(10, node.maxLevel) : 1;
    const ceiling = Math.min(node.maxLevel, tierHeadroom(node));
    const current = app.character.nodeLevels[node.id] || 0;
    // 이미 상한을 넘겨 저장된 빌드라면 내리는 것은 막지 않는다.
    const limit = Math.max(ceiling, direction < 0 ? current : 0);
    const next = clamp(Math.round(current + direction * step), 0, limit);
    if (next === current) return;
    // 여기서 기준을 다시 잡지 않는다 — store.svelte.js의 markBaseline 참고.
    // 포인트를 옮기는 편집은 두 클릭이라, 클릭마다 잡으면 중간 상태가 기준이 된다.
    app.character.nodeLevels[node.id] = next;
    persist();
  }

  // 우클릭은 −1. 0에서는 아무 일도 안 한다.
  //
  // 예전에는 그 자리를 제외 토글로 썼다. 지금은 고정·제외가 탐색 화면의 빈 판에
  // 따로 있어서, 빌드를 만지는 손이 탐색 규칙까지 건드리면 어느 화면이 무엇을
  // 정하는지 다시 흐려진다. 이 판은 레벨만 정한다.
  function demote(node, large) {
    bump(node, -1, large);
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
    // 조건이 안 맞으면 0이다. 왜 0인지가 안 보이면 계산이 틀린 것처럼 읽힌다.
    if (!isDirectionalConditionActive(effect.condition, app.character.settings)) {
      return `${base} → 백어택/헤드어택 꺼져 있어 미적용`;
    }
    if (!effect.manaOnly) return base;
    const share = getManaShareRatio(app.character.convenience);
    return `${base} → 마나 스킬 딜 ${formatInteger(share * 100)}% 적용 +${formatNumber(total * share)}${unit}`;
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

<section class="card" class:board-scope={scoping}>
  <div class="card-hd">
    <h2>{scoping ? "고정 노드" : "노드 배분"}</h2>
    <span class="eyebrow">
      클릭 +1 · 우클릭 −1 · Shift 10단위{scoping ? " · 0에서 우클릭하면 제외" : ""}
    </span>
    <span class="spacer"></span>
    <!-- 조건부로 띄우면 첫 고정을 걸 때 머리가 커지면서 판 전체가 밀린다.
         자리는 늘 잡아 두고 쓸 수 없을 때만 흐린다. -->
    {#if scoping}
      <button class="btn sm" type="button" disabled={lockCount === 0} onclick={clearNodeLocks}>
        고정 {formatInteger(lockCount)}개 해제
      </button>
    {/if}
    <span class="eyebrow" style:color={used > budget ? "var(--warm)" : "var(--txt-2)"}>
      {scoping ? "고정 " : ""}{formatInteger(used)} / {formatInteger(budget)}
    </span>
    {#if !scoping}
      <button class="btn sm" type="button" onclick={() => resetSection("nodes")}>비우기</button>
    {/if}
  </div>

  <div class="board-track" aria-hidden="true">
    <div class:over={used > budget}
         style:width="{budget > 0 ? Math.min(100, (used / budget) * 100) : 0}%"></div>
  </div>

  {#each stranded as item (item.tier)}
    <p class="board-stranded">
      {item.names.join(" · ")} 고정 — {item.label}에서 {formatInteger(item.lost)}P가 갈 곳이 없습니다.
    </p>
  {/each}

  <!--
    툴팁은 커서를 안 따라다닌다.

    예전에는 판 위에서 마우스가 움직일 때마다 자리를 다시 잡았다. 읽으려고
    눈을 옮기는 동안에도 상자가 계속 미끄러져서, 판 전체가 흔들리는 것처럼
    보였다. 이제는 가리킨 노드 옆에 못 박고 그 노드를 벗어날 때까지 안 움직인다.
  -->
  <div class="board-body">
    {#each tiers as tier}
      {@const usage = tierUsage(tier)}
      <div class="board-tier">
        <div class="board-tier-label" class:over={usage.points > usage.maxPoints}>
          <b>{EVOLUTION_TIERS[tier].label}</b>
          <span>{formatInteger(usage.points)}/{formatInteger(usage.maxPoints)}</span>
        </div>
        <div class="board-nodes">
          {#each NODE_LIBRARY.filter(n => n.tier === tier) as node (node.id)}
            {@const level = levelOf(node)}
            {@const full = level >= Math.min(node.maxLevel, tierHeadroom(node))}
            {@const lockedHere = isNodeLocked(node.id)}
            {@const pinned = scoping && lockedHere && !excluded.has(node.id)}
            <div class="node" class:on={level > 0} class:max={level >= node.maxLevel}
                 class:full={full && level > 0 && !scoping}
                 class:inert={inert.has(node.id)} class:excluded={excluded.has(node.id)}
                 class:locked={lockedHere} class:pinned>
              <!-- 본체와 자물쇠는 형제다. 버튼 안에 버튼은 못 넣는다. -->
              <button type="button" class="node-main"
                      aria-label="{node.name} Lv. {level}/{node.maxLevel}{scoping ? ` · ${scopeLabel(node)}` : ''}"
                      onclick={e => (scoping ? bumpScope(node, 1, e.shiftKey) : bump(node, 1, e.shiftKey))}
                      oncontextmenu={e => { e.preventDefault(); if (scoping) bumpScope(node, -1, e.shiftKey); else demote(node, e.shiftKey); }}
                      onmouseenter={e => {
                        const r = e.currentTarget.getBoundingClientRect();
                        tip = node; pointer = { x: r.right, y: r.bottom };
                      }}
                      onmouseleave={() => (tip = null)}
                      onfocus={e => {
                        const r = e.currentTarget.getBoundingClientRect();
                        tip = node; pointer = { x: r.right, y: r.bottom };
                      }}
                      onblur={() => (tip = null)}>
                <NodeIcon name={node.icon} />
                <span>{node.name}</span>
                <span class="lv">{scoping && !pinned ? (excluded.has(node.id) ? "제외" : "—") : `${level}/${node.maxLevel}`}</span>
              </button>

              {#if scoping}
                <!-- 고정한 칸에만 숫자를 연다. 자유·제외에는 적을 레벨이 없다. -->
                {#if pinned}
                  <input class="node-lv" type="number" min="0" max={node.maxLevel} step="1"
                         aria-label="{node.name} 고정 레벨"
                         value={level}
                         onchange={e => setLockLevel(node, e.currentTarget.value)}
                         oninput={e => setLockLevel(node, e.currentTarget.value)} />
                {/if}
              {:else if lockedHere}
                <!-- 여기서는 못 푼다. 읽으라고 있는 표시다 — 이 판은 레벨만
                     정하고, 고정은 탐색 화면의 고정 노드 판이 정한다. -->
                <span class="node-lock" aria-hidden="true"
                      title={excluded.has(node.id) ? "탐색에서 제외됨" : `탐색이 ${nodeLockLevel(node.id)}에 고정`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="1.5" />
                    <path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11" />
                  </svg>
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

{#if tip}
  {@const level = levelOf(tip)}
  <div class="tip" use:portal
       style:left="{Math.min(pointer.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 380)}px"
       style:top="{pointer.y + 18}px">
    <strong>{tip.name}</strong>
    <small>{tip.tier} · {formatInteger(getNodeCost(tip))}P · Lv. {formatInteger(level)}/{formatInteger(tip.maxLevel)}</small>
    <ul>
      {#each effectLines(tip, level) as line}<li>{line}</li>{/each}
    </ul>
    {#if excluded.has(tip.id)}
      <p class="tip-note">제외됨 — 조합 탐색 후보에서 빠집니다. 우클릭하면 되돌립니다.</p>
    {:else if scoping && isNodeLocked(tip.id)}
      <p class="tip-note">{formatInteger(level)}에 고정 — 탐색이 이 레벨을 그대로 씁니다.</p>
    {:else if scoping}
      <p class="tip-note">탐색이 굴립니다. 눌러서 고정하면 레벨을 못 박습니다.</p>
    {:else if inert.has(tip.id)}
      <p class="tip-note">이 계산기가 다루지 않는 효과라 탐색 후보에서 빠집니다.</p>
    {/if}
    {#if gain}
      <dl class="tip-gain" class:over={gain.overBudget}>
        <div><dt>+1렙 하면</dt><dd>{formatInteger(gain.cost)}P</dd></div>
        <div><dt>한 방 딜</dt><dd class:up={gain.damage > 0}>{formatSignedPercent(gain.damage)}</dd></div>
        <div><dt>DPS</dt><dd class:up={gain.dps > 0}>{formatSignedPercent(gain.dps)}</dd></div>
        {#if gain.overBudget}<div class="warn"><dt>포인트 초과</dt><dd></dd></div>{/if}
      </dl>
    {/if}
  </div>
{/if}
