<script>
  // 비교함 — 빌드를 열로 세우고 항목을 행으로 놓는다.
  //
  // 빌드를 행에 놓으면 열이 폭발한다. 진화 노드만 서른 개다. 열이 빌드면
  // 항목을 아무리 늘려도 세로로만 길어지고, 가로는 빌드 수로 묶인다.
  //
  // 첫 열이 내 빌드다. 언제나 편집 대상이자 증감의 기준이라 별도 표시가
  // 필요 없다 — 예전에는 '활성'과 '기준'이 따로 다녀서 각인 하나를 만질 때마다
  // 어느 열이 바뀌는지 확인해야 했다.
  //
  // 나머지 열은 얼려져 있다. 고치고 싶으면 '내 빌드로' 올린다. 그 순간 지금
  // 내 빌드가 그 자리에 얼려져 들어가므로 아무것도 안 사라진다.
  import {
    app, buildState, keepBuild, makeMine, dropCompare,
    renameCompare, renameBuild,
  } from "../store.svelte.js";
  import { calculateMetrics, getEngravingTierIndex } from "../core/metrics.js";
  import { NODE_LIBRARY, EVOLUTION_TIERS } from "../core/data.js";
  import { ENGRAVING_LIBRARY, ENGRAVING_TIERS } from "../core/engravings.js";
  import { BRACELET_STAT_FIELDS, BRACELET_EFFECTS, BRACELET_GRADES } from "../core/bracelets.js";
  import { CHAOS_CORES, CHAOS_CORE_SLOTS, ARK_GRID_GEM_EFFECTS } from "../core/cores.js";
  import { ARKPASSIVE_TREE } from "../core/../data/arkpassive-tree.js";
  import { OPTIMIZER_PET_LABELS } from "../core/search.js";
  import { formatNumber, percentDelta, readNumber } from "../core/util.js";

  // 서랍 안에서는 서랍을 또 열 수 없다. 무엇을 할지는 부르는 쪽이 정한다.
  let { onEdit = null } = $props();

  let diffOnly = $state(true);
  let editing = $state(null);
  let draft = $state("");

  const STATS = [
    { key: "critStat", label: "치명" },
    { key: "specStat", label: "특화" },
    { key: "swiftStat", label: "신속" },
    { key: "dominationStat", label: "제압" },
    { key: "enduranceStat", label: "인내" },
    { key: "expertiseStat", label: "숙련" },
  ];

  // 첫 칸은 내 빌드(산 값), 나머지는 얼린 것.
  const columns = $derived([
    { id: null, name: app.buildName, build: app.character, mine: true },
    ...app.compare.map(item => ({ id: item.id, name: item.name, build: item.build, mine: false })),
  ]);

  const builds = $derived(columns.map(column => column.build));
  const metrics = $derived(builds.map(build => calculateMetrics(buildState(build))));
  // 기준은 언제나 내 빌드다. 고를 것이 아니다.
  const baseAt = 0;

  const rows = $derived.by(() => {
    const out = [];
    const add = (group, label, cells, opts = {}) => out.push({ group, label, cells, ...opts });

    add("성과", "한 방 딜", metrics.map(m => ({ text: formatNumber(m.damageIndex), num: m.damageIndex })), { mode: "pct", pin: true });
    add("성과", "DPS", metrics.map(m => ({ text: formatNumber(m.dpsIndex), num: m.dpsIndex })), { mode: "pct", pin: true });
    add("성과", "쿨감", metrics.map(m => ({ text: `${m.cooldownReduction.toFixed(2)}%`, num: m.cooldownReduction })), { mode: "diff", unit: "%p", pin: true });
    add("성과", "치명타 적중", metrics.map(m => ({ text: `${m.critRateCapped.toFixed(2)}%`, num: m.critRateCapped })), { mode: "diff", unit: "%p" });

    // 전투 특성은 정수다. 248.25 같은 지수와 달리 소수점이 붙으면 잡음이다.
    STATS.forEach(stat => {
      add("주특성", stat.label, metrics.map(m => {
        const value = m.totalStats[stat.key] ?? 0;
        return { text: Math.round(value).toLocaleString("ko-KR"), num: value };
      }), { mode: "diff" });
    });

    // 아래부터는 빌드의 나머지 부위다. 슬롯이 캐릭터 전체를 들게 되면서
    // 열마다 따로 설 수 있게 됐다 — 예전에는 장비를 공유해서 비교가 안 됐다.
    add("장비", "무기 품질", builds.map(build => {
      const q = readNumber(build.weapon?.quality);
      return { text: `${q}`, num: q };
    }), { mode: "diff", tab: "setup" });

    add("장비", "아크 그리드 코어", builds.map(build => ({
      text: CHAOS_CORE_SLOTS.map(slot => {
        const core = build.arkGrid?.cores?.[slot.key];
        const found = CHAOS_CORES.find(item => item.id === core?.id);
        return found ? `${found.name} ${readNumber(core.points)}P` : "";
      }).filter(Boolean).join(" · ") || "없음",
    })), { tab: "setup" });

    add("장비", "젬", builds.map(build => ({
      text: ARK_GRID_GEM_EFFECTS
        .map(effect => `${effect.label} ${readNumber(build.arkGrid?.gems?.[effect.key])}`)
        .join(" · "),
    })), { tab: "setup" });

    add("장비", "팔찌 특성", builds.map(build => ({
      text: BRACELET_STAT_FIELDS
        .map(field => [field.label, readNumber(build.bracelet?.stats?.[field.key])])
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${label} ${value}`)
        .join(" · ") || "없음",
    })), { tab: "setup" });

    // 팔찌 효과는 한 줄에 하나다.
    //
    // 넷을 가운뎃점으로 이어 한 칸에 넣었더니 세 줄로 접혀서, 같은 효과가
    // 열마다 다른 높이에 놓였다 — 나란히 놓고 보는 표에서 그건 비교가 아니다.
    // 줄로 가르면 '무기 공격력'이 세 열에서 같은 눈금에 선다.
    BRACELET_EFFECTS.forEach(effect => {
      const cells = builds.map(build => {
        const at = BRACELET_GRADES.findIndex(
          item => item.value === build.bracelet?.effects?.[effect.id],
        );
        // 팔찌 효과가 든 칸은 name이다. label로 읽으면 undefined가 찍힌다.
        return { text: at < 0 ? "없음" : BRACELET_GRADES[at].label };
      });
      // 아무도 안 낀 효과는 줄을 안 만든다 — '없음'만 스물몇 줄이 된다.
      if (cells.every(cell => cell.text === "없음")) return;
      add("장비", effect.name, cells, { tab: "setup" });
    });

    add("깨달음", "직업", builds.map(build => ({
      text: ARKPASSIVE_TREE[build.awakening?.job]?.name ?? "안 고름",
    })), { tab: "awakening" });

    add("깨달음", "배분", builds.map(build => ({
      text: Object.entries(build.awakening?.nodeLevels ?? {})
        .filter(([, level]) => readNumber(level) > 0)
        .map(([name, level]) => `${name} ${level}`)
        .join(" · ") || "안 찍음",
    })), { tab: "awakening" });

    add("깨달음", "자버프", builds.map(build => ({
      text: (build.baseEffects ?? [])
        .filter(effect => readNumber(effect.amount) !== 0 || effect.formula)
        .map(effect => `${effect.label} ${effect.formula || readNumber(effect.amount)}`)
        .join(" · ") || "없음",
    })), { tab: "awakening" });

    add("깨달음", "특화 묶음", builds.map(build => ({
      text: (build.specBundles ?? [])
        .filter(bundle => readNumber(bundle.share) > 0)
        .map(bundle => `${bundle.name || "묶음"} ${readNumber(bundle.share)}%`)
        .join(" · ") || "없음",
    })), { tab: "awakening" });

    add("펫 · 음식", "펫 효과", builds.map(build => ({
      text: OPTIMIZER_PET_LABELS[build.convenience?.petStat] ?? "없음",
    })), { tab: "nodes" });

    // 노드는 티어마다 한 줄이다.
    //
    // 예전에는 노드 하나가 한 줄이었다. 그러면 안 찍은 노드까지 0으로 깔려서
    // 스물몇 줄이 나오고, 찍은 것 서넛을 그 사이에서 골라 읽어야 했다.
    // 게임에서 진화 배분을 말할 때도 '치명 30 신속 10'이라고 하지 노드를
    // 하나씩 세지 않는다.
    Object.entries(EVOLUTION_TIERS).forEach(([tier, meta]) => {
      const nodes = NODE_LIBRARY.filter(node => node.tier === tier);
      const levels = builds.map(build => Object.fromEntries(nodes.map(node => [node.id, build.nodeLevels?.[node.id] || 0])));
      const cells = levels.map((own, at) => {
        // 기준이 찍었는데 여기는 안 찍은 노드도 줄로 남긴다. 그냥 사라지면
        // 무엇을 뺐는지가 안 보인다.
        const lines = nodes
          .filter(node => own[node.id] > 0 || (at !== baseAt && levels[baseAt][node.id] > 0))
          .map(node => ({ id: node.id, name: node.name, level: own[node.id], text: `${own[node.id]}Lv.` }));
        return { lines, text: lines.map(line => `${line.name} ${line.level}`).join(" · "), levels: own };
      });
      // 티어의 최대 포인트와 레벨당 값은 여기서 할 일이 없다. 이 표가 답하는
      // 것은 "무엇이 다른가"이고, 그 수치는 세 열에 똑같이 적히는 규칙이다.
      add("진화 노드", meta.label, cells, { kind: "levels", tab: "nodes" });
    });

    // 각인은 한 줄이다.
    //
    // 종류마다 줄을 냈더니 낀 것 다섯을 보려고 '없음'이 깔린 줄들을 지나야
    // 했다. 게임에서도 각인은 낀 다섯을 목록으로 읽지, 안 낀 것을 세지 않는다.
    // 진화 노드와 같은 꼴이라 눈이 한 번만 배우면 된다.
    const worn = builds.map(build => Object.fromEntries(
      ENGRAVING_LIBRARY
        .map(item => [item.id, getEngravingTierIndex(build.engravings?.[item.id])])
        .filter(([, at]) => at >= 0)
        .map(([id, at]) => [id, ENGRAVING_TIERS[at].label]),
    ));
    add("각인", "낀 각인", worn.map((own, at) => {
      // 기준이 낀 것을 여기서 안 꼈으면 '없음'으로 줄을 남긴다 — 노드와 같은
      // 규칙이다. 뺀 것이 그냥 사라지면 무엇을 내줬는지 알 수가 없다.
      const lines = ENGRAVING_LIBRARY
        .filter(item => own[item.id] || (at !== baseAt && worn[baseAt][item.id]))
        .map(item => ({ id: item.id, name: item.name, level: own[item.id] ?? "없음", text: own[item.id] ?? "없음" }));
      return {
        lines,
        text: lines.map(line => `${line.name} ${line.level}`).join(" · ") || "없음",
        levels: own,
      };
    }), { kind: "levels", empty: "없음", tab: "nodes" });

    return out;
  });

  const differs = row => new Set(row.cells.map(cell => cell.text)).size > 1;
  const shown = $derived(diffOnly ? rows.filter(row => row.pin || differs(row)) : rows);
  const hidden = $derived(rows.length - shown.length);

  function delta(row, at) {
    if (at === baseAt || !row.mode) return null;
    const now = row.cells[at]?.num;
    const was = row.cells[baseAt]?.num;
    if (!Number.isFinite(now) || !Number.isFinite(was)) return null;
    const value = row.mode === "pct" ? percentDelta(now, was) : now - was;
    if (Math.abs(value) < 0.005) return null;
    const size = Math.abs(value);
    const body = row.mode === "pct"
      ? `${size.toFixed(2)}%`
      : `${(Math.round(size * 100) / 100).toLocaleString("ko-KR")}${row.unit ?? ""}`;
    return { up: value > 0, text: `${value > 0 ? "+" : "−"}${body}` };
  }

  // 이 열을 내 빌드로 올린다. 지금 내 빌드는 그 자리에 얼려져 들어간다.
  function lift(column) {
    if (column.mine) return;
    makeMine(column.id);
    onEdit?.(column);
  }

  function startRename(column) {
    editing = column.id ?? "mine";
    draft = column.name;
  }

  function commitRename() {
    if (editing === "mine") renameBuild(draft);
    else if (editing) renameCompare(editing, draft);
    editing = null;
  }
</script>

<section class="card compare">
  <div class="card-hd">
    <!-- 제목은 서랍 머리가 이미 들고 있다. 여기 또 적으면 '비교함'이 두 번이다. -->
    <span class="spacer"></span>
    {#if hidden > 0}<span class="eyebrow">{hidden}줄 접힘</span>{/if}
    <label class="check">
      <input type="checkbox" bind:checked={diffOnly} />
      차이 나는 것만
    </label>
  </div>

  <div class="compare-scroll">
    <table class="compare-table">
      <colgroup>
        <col class="c-head" />
        {#each columns as column (column.id ?? "mine")}<col class="c-slot" />{/each}
        <col class="c-add" />
      </colgroup>

      <thead>
        <tr class="c-title">
          <th scope="row"></th>
          {#each columns as column (column.id ?? "mine")}
            <th scope="col" class:base={column.mine}>
              <div class="c-name">
                {#if editing === (column.id ?? "mine")}
                  <input class="slot-name-input" type="text" bind:value={draft} autofocus
                         onblur={commitRename}
                         onkeydown={event => {
                           if (event.key === "Enter") commitRename();
                           if (event.key === "Escape") editing = null;
                         }} />
                {:else}
                  <!-- 이름을 누르면 이름을 고친다. 제일 짐작하기 쉬운 자리다. -->
                  <button class="c-open" type="button" title="이름 바꾸기"
                          onclick={() => startRename(column)}>{column.name}</button>
                {/if}
              </div>

              <div class="c-under">
                <div class="c-meta">
                  <!-- 내 빌드는 지금 고치고 있는 것, 나머지는 얼린 것. 그 둘뿐이라
                       출처를 따로 적지 않는다. -->
                  <span>{column.mine ? "편집 중 · 기준" : "얼림"}</span>
                </div>
                <div class="c-acts">
                  {#if !column.mine}
                    <!-- 화살표 하나로 두면 무엇이 일어나는지 짐작해야 한다.
                         이 앱에서 제일 큰 동작이라 글자로 적는다. -->
                    <button type="button" class="c-lift" title="지금 내 빌드는 이 자리에 얼립니다"
                            aria-label="{column.name}을 내 빌드로"
                            onclick={() => lift(column)}>내 빌드로</button>
                    <button type="button" class="rm" title="비교함에서 빼기" aria-label="{column.name} 빼기"
                            onclick={() => dropCompare(column.id)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 7h14M10 7V4.8h4V7" /><path d="M6.8 7 7.6 19.2h8.8L17.2 7" />
                      </svg>
                    </button>
                  {/if}
                </div>
              </div>
            </th>
          {/each}
          <th scope="col" class="c-add-head">
            <!-- 팔찌를 바꿔 보기 직전에 누르는 단추. 지금 모습이 옆에 얼려지고,
                 그다음 고치는 것은 내 빌드에만 걸린다. -->
            <button class="slot-add" type="button" onclick={() => keepBuild()}
                    disabled={app.compare.length >= 5}
                    aria-label="지금 빌드를 비교함에 남기기">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" /></svg>
              지금 빌드 남기기
            </button>
          </th>
        </tr>
      </thead>

      <tbody>
        {#each shown as row, i (row.group + row.label)}
          {#if i === 0 || shown[i - 1].group !== row.group}
            <tr class="c-group">
              <!--
                고치기 지름길이 여기 있었다. 그런데 이 표는 얼린 것들을 견주는
                자리이고, 그 단추는 내 빌드의 탭으로 갔다 — 지금 읽고 있는 열과
                상관없는 데로 데려간다. 게다가 머리가 전 열을 가로질러서 어느
                열에 대한 것인지도 안 보였다. 고치려면 서랍을 닫고 가면 된다.

                row.tab은 그대로 둔다. 무엇을 어디서 고치는지는 여전히 사실이고,
                나중에 열 단위로 데려갈 자리가 생기면 그때 쓴다.
              -->
              <!-- 전폭 셀은 sticky가 붙을 여유가 없어 그대로 흘러간다.
                   글자를 감싼 span이 대신 왼쪽에 붙는다. -->
              <td colspan={columns.length + 2}><span>{row.group}</span></td>
            </tr>
          {/if}
          <tr class:tall={row.kind === "levels"}>
            <th scope="row">
              {row.label}
              {#if row.note}<small>{row.note}</small>{/if}
            </th>
            {#each row.cells as cell, at}
              {@const d = delta(row, at)}
              {@const moved = at !== baseAt && cell.text !== row.cells[baseAt]?.text}
              <td class:base={at === baseAt} class:moved>
                {#if row.kind === "levels"}
                  {#if cell.lines.length === 0}
                    <span class="c-none">{row.empty ?? "안 찍음"}</span>
                  {:else}
                    <ul class="c-levels">
                      {#each cell.lines as line (line.id)}
                        <li class:moved={at !== baseAt && row.cells[baseAt].levels[line.id] !== line.level}>
                          <!-- 줄이 제 표기를 들고 온다. 노드는 '3Lv.', 각인은
                               '유물 4단계'라 여기서 단위를 붙일 수가 없다. -->
                          <span>{line.name}</span><b>{line.text}</b>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                {:else}
                  <span class="c-value">{cell.text}</span>
                  {#if d}<em class:down={!d.up}>{d.text}</em>{/if}
                {/if}
              </td>
            {/each}
            <td></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
