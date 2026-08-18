<script>
  // 깨달음 · 도약 트리.
  //
  // 진화 노드판과 손놀림을 맞춘다 — 클릭 +1, 우클릭 −1, Shift는 끝까지.
  // 다른 점은 셋이다.
  //
  //   선행  부모를 다 채워야 열린다. 데이터에 있는 규칙이라 눌러도 안 올라간다.
  //   배타  1티어 택1이 딜 구조를 가른다. 형제를 찍으면 이쪽이 닫힌다.
  //   비용  노드마다 다르다(24P 뿌리 · 8P 줄기 · 2P 잎). 그래서 아이콘 대신
  //         비용을 굵기로 쓴다 — 인벤 아이콘은 421종인데 그림이 없다.
  //
  // 그리고 이 화면이 반드시 갈라 보여야 하는 것: **찍고 읽는 것은 30직업 다 되고,
  // 딜 계산에 들어가는 것은 표를 붙인 직업뿐이다.**
  import {
    getAwakeningNodes, awakeningGroupInfo, awakeningHeadroom,
    isAwakeningModeled, awakeningBranchNote, awakeningBonuses,
  } from "../core/awakening.js";
  import { ARKPASSIVE_TREE } from "../data/arkpassive-tree.js";
  import { EFFECT_CATEGORIES } from "../core/data.js";
  import { loadDesc, getLoadedDesc, describe } from "../core/arkpassive-desc.js";
  import { app, resetSection, bumpAwakening } from "../store.svelte.js";
  import { formatInteger, formatNumber, readNumber } from "../core/util.js";
  import JobPicker from "./JobPicker.svelte";

  // 지금 보고 있는 탭. 페이지가 들고 있어서 다른 데 갔다 와도 그대로다.
  let { group = $bindable("깨달음") } = $props();

  const GROUPS = ["깨달음", "도약"];

  // 효과 열쇠는 계산기 안에서 쓰는 이름이다(critRate). 화면에는 게임 낱말로 적는다.
  // 피해 그룹은 열쇠가 이미 한글이라 그대로 쓴다.
  const KEY_LABELS = Object.fromEntries(
    EFFECT_CATEGORIES.map(item => [item.value.replace(/^damage:/, ""), item.label]),
  );
  const labelOf = key => KEY_LABELS[key] ?? key;

  // 왜 미반영인지. scope를 그대로 내보이면 영어 낱말이 튀어나온다.
  const SCOPE_WHY = {
    partial: "일부 스킬 전용",
    conditional: "특정 상태에서만 적용",
    branch: "다른 선택지 전용",
    note: "수치 없음",
  };

  let pickerOpen = $state(false);
  const job = $derived(app.character.awakening?.job ?? 0);
  const levels = $derived(app.character.awakening?.nodeLevels ?? {});
  const jobName = $derived(ARKPASSIVE_TREE[job]?.name ?? "");
  const nodes = $derived(getAwakeningNodes(job));
  const modeled = $derived(isAwakeningModeled(job));

  // 설명문은 직업마다 따로 받는다. 트리는 그 전에 이미 그려진다.
  let desc = $state(null);
  $effect(() => {
    const code = job;
    if (!code) { desc = null; return; }
    desc = getLoadedDesc(code);
    let alive = true;
    loadDesc(code).then(loaded => { if (alive && job === code) desc = loaded; });
    return () => { alive = false; };
  });

  const levelOf = id => Math.round(readNumber(levels?.[id]));

  const groups = $derived.by(() => GROUPS.map(name => {
    const info = awakeningGroupInfo(job, name);
    if (!info) return null;
    const mine = nodes.filter(node => node.group === name);
    return {
      name, info, nodes: mine,
      spent: mine.reduce((sum, node) => sum + levelOf(node.id) * node.cost, 0),
    };
  }).filter(Boolean));

  // 계산 반영 여부. 셋으로 갈린다.
  //
  //   in       제 수치가 그대로 들어간다
  //   replace  제 수치는 없지만 다른 노드를 갈아치운다 — 고대의 축복이 정신
  //            집중을 23%에서 47%로 올린다. 이걸 '안 셈'으로 묶으면 거짓말이다.
  //   out      일부 스킬·조건 한정이라 못 센다
  const verdicts = $derived.by(() => {
    const map = new Map();
    if (!modeled) return map;
    const result = awakeningBonuses(job, levels);
    result.applied.forEach(row => map.set(row.node, "in"));
    result.skipped.forEach(row => {
      if (map.get(row.node) === "in") return;
      if (row.scope === "replace") { map.set(row.node, "replace"); return; }
      if (!map.has(row.node)) map.set(row.node, "out");
    });
    return map;
  });

  // 세는 범위는 지금 보고 있는 탭이다. 트리에 점이 하나도 없는데 '3'이라고
  // 적혀 있으면 어느 쪽 이야기인지 알 수가 없다.
  //
  // 대체(고대의 축복)는 반영 쪽으로 센다 — 제 수치가 없을 뿐 딜은 움직인다.
  const shownVerdicts = $derived(
    nodes.filter(node => node.group === group).map(node => verdicts.get(node.name)),
  );
  const countIn = $derived(shownVerdicts.filter(v => v === "in" || v === "replace").length);
  const countOut = $derived(shownVerdicts.filter(v => v === "out").length);

  let tip = $state(null);
  let pointer = $state({ x: 0, y: 0 });

  // 격자 칸의 한가운데. 연결선을 여기에 건다.
  const centre = (group, node) => ({
    x: ((node.col - 0.5) / group.info.cols) * 100,
    y: ((node.row - 0.5) / group.info.rows) * 100,
  });

  // 선은 선행만 긋는다. 배타에도 선을 그었더니 '이어짐'과 '못 함께 찍음'이
  // 같은 모양이 됐다 — 정반대 뜻인데. 배타는 실제로 닫힌 노드에 붉은 테두리로 뜬다.
  function links(group) {
    const byId = new Map(group.nodes.map(node => [node.id, node]));
    return group.nodes
      .filter(node => node.requires && byId.has(node.requires.name))
      .map(node => {
        const parent = byId.get(node.requires.name);
        return {
          from: centre(group, parent), to: centre(group, node),
          on: levelOf(parent.id) >= node.requires.level,
        };
      });
  }

  function open(node, event) {
    tip = node;
    pointer = { x: event.clientX, y: event.clientY };
  }

  // 노드마다 지금 상태. 화면이 왜 안 올라가는지 말할 수 있어야 한다.
  //
  // 닫힌 이유를 둘로 가른다. 배타로 닫힌 것은 **내가 방금 다른 쪽을 찍어서**
  // 닫힌 것이라 붉게 세우고, 선행·관문으로 닫힌 것은 아직 순서가 안 온 것이라
  // 흐리게 둔다. 같은 회색이면 되돌릴 수 있는 것과 아닌 것이 구분되지 않는다.
  function stateOf(node) {
    const level = levelOf(node.id);
    const { max, why, reason, rival } = awakeningHeadroom(job, levels, node.id);
    const shut = max === 0 && level === 0;
    return {
      level, max, reason, rival,
      blocked: shut && why === "rival",
      locked: shut && why !== "rival",
      full: level > 0 && level >= node.maxLevel,
    };
  }
</script>

<section class="card awakening-card">
  <div class="card-hd">
    <!-- 이름이 곧 고르는 자리다. 서른 개를 늘 펴 두면 트리 위에 트리가 하나
         더 서고, 직업은 한 번 정하면 거의 안 바꾸는 값이다. -->
    <button class="job-name" type="button" onclick={() => (pickerOpen = true)}>
      <h2>{jobName || "직업 고르기"}</h2>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    <span class="spacer"></span>
    {#if job}
      <span class="eyebrow">클릭 +1 · 우클릭 −1 · Shift 끝까지</span>
      <button class="btn sm" type="button" onclick={() => resetSection("awakening")}>비우기</button>
    {/if}
  </div>

  {#if !job}
    <div class="card-body">
      <p class="empty-note">직업을 고르세요</p>
    </div>
  {:else}
    <!-- 탭. 두 트리는 규칙도 예산도 따로라 나란히 두면 어느 포인트가 어느 쪽
         것인지 헷갈린다. 한 번에 하나만 보여 준다. -->
    <div class="tree-tabs" role="tablist" aria-label="깨달음 · 도약">
      {#each groups as item (item.name)}
        {@const over = item.spent > item.info.budget}
        <button type="button" class="tree-tab" class:active={group === item.name}
                role="tab" aria-selected={group === item.name}
                onclick={() => (group = item.name)}>
          <b>{item.name}</b>
          <span class:over>{formatInteger(item.spent)} / {formatInteger(item.info.budget)}P</span>
        </button>
      {/each}
    </div>

    <div class="card-body awakening-body"
         onmousemove={e => (pointer = { x: e.clientX, y: e.clientY })} role="presentation">
      {#each groups.filter(item => item.name === group) as shown (shown.name)}
        <div class="tree" style:--tree-cols={shown.info.cols} style:--tree-rows={shown.info.rows}>
          <svg class="tree-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {#each links(shown) as link}
              <line x1={link.from.x} y1={link.from.y} x2={link.to.x} y2={link.to.y}
                    class:on={link.on} vector-effect="non-scaling-stroke" />
            {/each}
          </svg>

          {#each shown.nodes as node (node.id)}
            {@const it = stateOf(node)}
            {@const verdict = verdicts.get(node.name)}
            <button type="button" class="tnode"
                    class:on={it.level > 0} class:full={it.full}
                    class:locked={it.locked} class:blocked={it.blocked}
                    class:root={node.cost >= 20} class:trunk={node.cost >= 8 && node.cost < 20}
                    class:counted={verdict === "in" || verdict === "replace"}
                    style:grid-column={node.col} style:grid-row={node.row}
                    aria-label="{node.name} Lv. {it.level}/{node.maxLevel}{it.reason ? ` · ${it.reason}` : ''}"
                    onclick={() => bumpAwakening(node.id, 1, false)}
                    oncontextmenu={e => { e.preventDefault(); bumpAwakening(node.id, -1, e.shiftKey); }}
                    onkeydown={e => { if (e.shiftKey && e.key === "Enter") { e.preventDefault(); bumpAwakening(node.id, 1, true); } }}
                    onmouseenter={e => open(node, e)}
                    onmouseleave={() => (tip = null)}
                    onfocus={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      tip = node; pointer = { x: r.right, y: r.top };
                    }}
                    onblur={() => (tip = null)}>
              <span class="tnode-name">{node.name}</span>
              <span class="tnode-lv">{it.level}/{node.maxLevel}</span>
              {#if verdict === "in" || verdict === "replace"}
                <span class="tnode-dot" class:hollow={verdict === "replace"} aria-hidden="true"></span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}

      <p class="tree-foot">
        {#if modeled}
          딜 반영 <b>{formatInteger(countIn)}</b> · 미반영 {formatInteger(countOut)}
        {:else}
          아직 딜에 반영하지 않는 직업입니다. 배분은 그대로 저장됩니다.
        {/if}
      </p>
    </div>
  {/if}
</section>

<JobPicker bind:open={pickerOpen} />

{#if tip}
  {@const it = stateOf(tip)}
  {@const verdict = verdicts.get(tip.name)}
  {@const branchNote = awakeningBranchNote(job, tip.name)}
  <div class="tip"
       style:left="{Math.min(pointer.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 380)}px"
       style:top="{pointer.y + 18}px">
    <strong>{tip.name}</strong>
    <small>
      {tip.group} {formatInteger(tip.tier)}티어 · {formatInteger(tip.cost)}P/렙 ·
      Lv. {formatInteger(it.level)}/{formatInteger(tip.maxLevel)}
    </small>
    {#if desc}
      {@const line = describe(desc, tip.group, tip.name, it.level)}
      {#if line}<p class="tip-desc">{line}</p>{/if}
    {:else}
      <p class="tip-desc muted">설명 불러오는 중…</p>
    {/if}

    {#if it.blocked}
      <p class="tip-block">{it.rival} 선택 · 동시 선택 불가</p>
    {:else if it.locked}
      <p class="tip-note">{it.reason}</p>
    {/if}

    {#if !modeled}
      <p class="tip-note">아직 수치를 읽지 않은 직업입니다. 딜에 반영되지 않습니다.</p>
    {:else}
      {@const bonus = awakeningBonuses(job, levels)}
      {#if verdict === "in"}
        <ul>
          {#each bonus.applied.filter(row => row.node === tip.name) as row}
            <li>{labelOf(row.key)} +{formatNumber(row.amount)}%{row.replacedBy ? ` · ${row.replacedBy} 적용값` : ""}</li>
          {/each}
        </ul>
      {:else if it.level > 0}
        <ul>
          {#each bonus.skipped.filter(row => row.node === tip.name) as row}
            {#if row.scope === "replace"}
              <li>{row.note}</li>
            {:else}
              <li class="out">미반영 · {SCOPE_WHY[row.scope] ?? row.scope}{row.note && row.scope !== "note" ? ` · ${row.note}` : ""}</li>
            {/if}
          {/each}
        </ul>
      {/if}
      {#if branchNote}<p class="tip-desc muted">{branchNote}</p>{/if}
    {/if}
  </div>
{/if}
