<script>
  /**
   * 깨달음 검수.
   *
   * 트리 모양으로 세운다. 목록으로 늘어놓으면 "이게 몇 티어의 어느 칸인지"를
   * 알 수가 없는데, 그걸 모르면 갈래 조건이 맞는지 판단할 수가 없다.
   *
   * 노드를 고르면 그 노드의 효과만 아래에 편다. 한 번에 하나씩 보는 편이
   * 열네 줄을 한꺼번에 늘어놓는 것보다 낫다.
   *
   * 고치는 것은 둘이다.
   *   scope    전역 · 갈래 · 상태 · 스킬 · 설명
   *   amounts  레벨별 수치. 옮겨 적다 틀린 것을 바로잡는다
   *
   * 둘 다 원문 표를 안 건드리고 덮어쓰기로 쌓는다. 원문 전사와 우리 판단이
   * 섞이면 무엇이 게임 값이고 무엇이 우리 손인지 알 수 없게 된다.
   */
  import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
  import { getAwakeningNodes } from "../src/lib/core/awakening.js";
  import { loadDesc, getLoadedDesc } from "../src/lib/core/arkpassive-desc.js";

  let { job, overrides, onscope, onamounts, onbranch } = $props();

  /**
   * 줄마다 정하는 것은 둘이다.
   *
   *   갈래   이 줄이 1티어 배타 둘 중 어느 쪽에 딸렸나. 안 찍으면 줄이 없다.
   *   얹음   안 건드린 유저에게 100에서 시작할지 0에서 시작할지
   *
   * 기상술사 단련이 이 둘을 다 쓴다 — 질풍노도면 치적, 이슬비면 치피이고
   * 게임에서 동시 적용이 안 된다. 갈래 칸이 없으면 둘 다 100%로 겹쳐 실린다.
   *
   * 유효율 숫자 자체는 앱의 자버프 카드에서 유저가 적는다. 여기서 정하는
   * 것은 그 칸이 빈 채로 남았을 때의 값이다.
   */
  const branchNodes = $derived((tree?.nodes ?? []).filter(node => node.row === 1 && (node.excludes?.length ?? 0) > 0));

  // 노드 이름이 받침으로 끝나는지 — '질풍노도을'이라고 쓰면 읽다가 걸린다.
  const eul = word => {
    const code = String(word).charCodeAt(String(word).length - 1);
    const hangul = code >= 0xac00 && code <= 0xd7a3;
    return hangul && (code - 0xac00) % 28 !== 0 ? "을" : "를";
  };

  const stateOf = row => {
    const branch = row.branch;
    if (row.effect.kind === "note" || row.amounts.length === 0) {
      return { kind: "none", why: "숫자가 없어 앱에 줄이 안 뜬다" };
    }
    const on = row.scope !== "partial";
    return {
      kind: "toggle", on,
      why: [
        branch ? `${branch}${eul(branch)} 찍었을 때만 줄이 선다` : "갈래와 무관하게 늘 줄이 선다",
        on ? "안 건드리면 100%" : "안 건드리면 0% — 그 스킬 피해라 딜 전체에 얹으면 거짓말이 된다",
      ].join(" · "),
    };
  };

  // 원본과 같아지면 교정을 지운다 — 안 바꾼 줄이 diff에 남으면 안 된다.
  function toggle(row, on) {
    const sourceOn = row.effect.scope !== "partial";
    onscope(row.key, on === sourceOn ? null : (on ? "global" : "partial"));
  }
  function setBranch(row, name) {
    onbranch(row.key, name === (row.effect.branch ?? "") ? null : name);
  }

  /**
   * 의심스러운 줄.
   *
   * 스킬 이름이 섞였는데 상태로 잡힌 것을 찾는다. 다만 '스킬'이라는 글자만
   * 보면 안 된다 — "해방 스킬 사용 중 치명타 적중률 +6%"는 해방 중에 얻는
   * 전역 특성이지 해방 스킬의 피해가 아니다.
   *
   * 가르는 것은 무엇이 오르느냐다. 피해 그룹이 오르면서 스킬 이름이 붙어
   * 있으면 그 스킬의 피해일 공산이 크다. 치적 · 공속 · 쿨감이 오르면 상태다.
   *
   * partial로 이미 접은 줄은 안 센다 — 그건 판단이 끝난 줄이다.
   */
  const SKILLISH = /스킬|초각성|각성기|블레이드|메소드|슬래시|우산/;
  const suspicious = effect => effect.kind === "damage"
    && effect.scope !== "partial"
    && SKILLISH.test(effect.scopeNote ?? "");

  const tree = $derived(ARKPASSIVE_TREE[job]?.["깨달음"] ?? null);
  const nodes = $derived(getAwakeningNodes(job).filter(node => node.group === "깨달음"));
  const byName = $derived(new Map(nodes.map(node => [node.name, node])));

  let picked = $state("");
  // 직업을 바꾸면 고른 노드는 다른 트리의 것이라 놓는다.
  $effect(() => {
    void job;
    picked = "";
  });

  /**
   * 게임 원문.
   *
   * 검수는 "우리가 적은 수치와 scope가 게임 툴팁과 맞는가"를 보는 일이다.
   * 원문이 화면에 없으면 볼 것이 없다. 청크가 직업마다 따로라 받아 온다.
   */
  let desc = $state(null);
  $effect(() => {
    const code = job;
    desc = getLoadedDesc(code);
    let alive = true;
    loadDesc(code).then(next => { if (alive && job === code) desc = next; });
    return () => { alive = false; };
  });

  const source = $derived(picked ? (desc?.["깨달음"]?.[picked] ?? []) : []);
  // 수치를 눈으로 맞춰야 하니 숫자만 도드라지게 쪼갠다.
  const chop = line => String(line).split(/(\d+(?:\.\d+)?\s*%)/);

  const rowsOf = name => {
    const node = byName.get(name);
    if (!node) return [];
    return (node.effects ?? []).map((effect, at) => {
      const key = `${name}|${at}`;
      const scope = overrides?.scope?.[key] ?? effect.scope;
      const branch = overrides?.branch?.[key] ?? effect.branch ?? "";
      return {
        key, at, effect, scope, branch,
        amounts: overrides?.amounts?.[key] ?? effect.amounts ?? [],
        edited: Boolean(overrides?.scope?.[key] || overrides?.amounts?.[key]
          || overrides?.branch?.[key] !== undefined),
        suspect: suspicious({ ...effect, scope }),
      };
    });
  };

  // 칸마다 표시할 것 — 손댄 줄이 있나, 의심스러운 줄이 있나.
  const marksOf = name => {
    const rows = rowsOf(name);
    return {
      suspect: rows.some(row => row.suspect),
      edited: rows.some(row => row.edited),
      count: rows.length,
      modeled: byName.get(name)?.modeled ?? false,
    };
  };

  const grid = $derived.by(() => {
    if (!tree) return [];
    const out = [];
    for (let row = 1; row <= tree.rows; row += 1) {
      const cells = [];
      for (let col = 1; col <= tree.cols; col += 1) {
        cells.push(tree.nodes.find(node => node.row === row && node.col === col) ?? null);
      }
      out.push({ row, cells, gate: tree.gates?.[row] ?? 0 });
    }
    return out;
  });

  const suspects = $derived(nodes.reduce((n, node) => n + rowsOf(node.name).filter(r => r.suspect).length, 0));
  const shown = $derived(picked ? rowsOf(picked) : []);

  const label = effect => (effect.kind === "formula"
    ? String(effect.expression ?? "")
    : (effect.key ?? effect.category ?? effect.kind));

  function setAmount(row, at, raw) {
    const next = [...row.amounts];
    next[at] = raw === "" ? 0 : Number(raw);
    onamounts(row.key, next);
  }
</script>

<section class="card">
  <div class="card-hd">
    <h2>깨달음</h2>
    <span class="spacer"></span>
    {#if suspects > 0}
      <span class="eyebrow warnish">의심 {suspects}줄</span>
    {/if}
    <span class="eyebrow">{tree?.budget ?? 0}P</span>
  </div>

  <div class="card-body">
    {#if !tree}
      <div class="summary-line"><span class="empty">트리가 없습니다</span></div>
    {:else}
      <div class="tool-tree">
        {#each grid as line (line.row)}
          <div class="tool-tree-row">
            <span class="tool-tree-tier">
              {line.row}T
              {#if line.gate > 0}<i>{line.gate}P</i>{/if}
            </span>
            {#each line.cells as cell, at (at)}
              {#if cell}
                {@const mark = marksOf(cell.name)}
                <button type="button" class="tool-node"
                        class:on={picked === cell.name}
                        class:suspect={mark.suspect}
                        class:edited={mark.edited}
                        class:blank={!mark.modeled}
                        onclick={() => (picked = picked === cell.name ? "" : cell.name)}>
                  <b>{cell.name}</b>
                  <small>{cell.maxLevel}Lv · {cell.cost}P{#if cell.excludes?.length} · 배타{/if}</small>
                </button>
              {:else}
                <span class="tool-node empty"></span>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if picked}
    <div class="tool-effects">
      <div class="tool-effects-hd">
        <b>{picked}</b>
        <span>{shown.length}줄</span>
        <span class="spacer"></span>
        <span class="tool-legend">유효율은 앱에서 유저가 적습니다 · 여기서 정하는 건 안 적었을 때의 값</span>
      </div>

      <!-- 게임 원문. 판단의 근거라 맨 위에 편다. -->
      {#if source.length > 0}
        <ol class="tool-source">
          {#each source as line, at (at)}
            <li><b>{at + 1}</b><span>{#each chop(line) as bit, i (i)}{#if i % 2}<em>{bit}</em>{:else}{bit}{/if}{/each}</span></li>
          {/each}
        </ol>
      {:else if desc}
        <p class="tool-status">원문이 없습니다.</p>
      {:else}
        <p class="tool-status">원문 불러오는 중…</p>
      {/if}

      {#if shown.length === 0}
        <p class="tool-status">이 노드의 표가 아직 없습니다.</p>
      {/if}

      {#each shown as row (row.key)}
        {@const meta = stateOf(row)}
        <div class="tool-awk" class:suspect={row.suspect} class:edited={row.edited}>
          <div class="tool-awk-head">
            <span class="tool-awk-key">{label(row.effect)}</span>
            <span class="tool-awk-note">{row.effect.scopeNote ?? ""}</span>
            {#if meta.kind === "toggle"}
              <!-- 갈래. 기상술사 단련이 질풍노도면 치적, 이슬비면 치피다. -->
              <select class="boxed" class:set={row.branch} aria-label="{picked} {label(row.effect)} 갈래"
                      value={row.branch} onchange={e => setBranch(row, e.currentTarget.value)}>
                <option value="">갈래 무관</option>
                {#each branchNodes as node (node.name)}
                  <option value={node.name}>{node.name}</option>
                {/each}
              </select>
              <label class="check">
                <input type="checkbox" checked={meta.on}
                       aria-label="{picked} {label(row.effect)} 딜 전체에 얹음"
                       onchange={e => toggle(row, e.currentTarget.checked)} />
                <span>딜 전체에 얹음</span>
              </label>
            {:else}
              <span class="tool-fixed">수치 없음</span>
            {/if}
          </div>

          <div class="tool-levels">
            <span class="tool-why">{meta.why}</span>
            {#each row.amounts as amount, at (at)}
              <label class="tool-level">
                <span>{at + 1}</span>
                <input class="boxed" type="number" step="0.01"
                       aria-label="{picked} {at + 1}레벨" value={amount}
                       oninput={e => setAmount(row, at, e.currentTarget.value)} />
              </label>
            {/each}
            <span class="spacer"></span>
            {#if row.edited}
              <button type="button" class="tool-revert"
                      onclick={() => { onscope(row.key, null); onamounts(row.key, null); onbranch(row.key, null); }}>원문으로</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
