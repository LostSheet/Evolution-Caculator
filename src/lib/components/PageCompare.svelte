<script>
  // 5페이지 — 슬롯을 열로 세우고 항목을 행으로 놓는다.
  //
  // 슬롯을 행에 놓으면 열이 폭발한다. 진화 노드만 서른 개다. 열이 슬롯이면
  // 항목을 아무리 늘려도 세로로만 길어지고, 가로는 슬롯 수로 묶인다.
  import {
    app, goPage, PAGE, buildState, selectSlot, addSlot, renameSlot, revertSlot, removeSlot, openDrawer,
    slotDirty, slotOriginLabel,
  } from "../store.svelte.js";
  import { calculateMetrics, getEngravingTierIndex } from "../core/metrics.js";
  import { NODE_LIBRARY, EVOLUTION_TIERS } from "../core/data.js";
  import { ENGRAVING_LIBRARY, ENGRAVING_TIERS } from "../core/engravings.js";
  import { OPTIMIZER_PET_LABELS } from "../core/search.js";
  import { formatNumber, percentDelta } from "../core/util.js";
  import SlotStar from "./SlotStar.svelte";

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

  // 활성 슬롯은 살아 있는 빌드를 쓴다. 슬롯에 적힌 값은 마지막 저장 시점이라
  // 방금 만진 노드가 표에 안 나타난다.
  const builds = $derived(app.slots.map(slot => (
    slot.id === app.activeSlotId
      ? {
          nodeLevels: app.character.nodeLevels,
          engravings: app.character.engravings || {},
          pet: app.character.convenience.petStat || "none",
        }
      : slot.build
  )));

  const metrics = $derived(builds.map(build => calculateMetrics(buildState(build))));
  const baseAt = $derived(Math.max(0, app.slots.findIndex(slot => slot.id === app.baseSlotId)));

  const engravingLabel = (build, item) => {
    const at = getEngravingTierIndex(build.engravings?.[item.id]);
    return at < 0 ? "없음" : ENGRAVING_TIERS[at].label;
  };

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

    add("펫", "펫 효과", builds.map(build => ({ text: OPTIMIZER_PET_LABELS[build.pet] ?? "없음" })));

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
          .map(node => ({ id: node.id, name: node.name, level: own[node.id] }));
        return { lines, text: lines.map(line => `${line.name} ${line.level}`).join(" · "), levels: own };
      });
      add("진화 노드", meta.label, cells, { kind: "levels", note: `최대 ${meta.maxPoints}P · ${meta.cost}P/Lv` });
    });

    ENGRAVING_LIBRARY.forEach(item => {
      const cells = builds.map(build => ({ text: engravingLabel(build, item) }));
      if (cells.every(cell => cell.text === "없음")) return;
      add("각인", item.name, cells);
    });

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

  function edit(slot) {
    selectSlot(slot.id);
    openDrawer();
  }

  function startRename(slot) {
    editing = slot.id;
    draft = slot.name;
  }

  function commitRename() {
    if (editing) renameSlot(editing, draft);
    editing = null;
  }
</script>

<section class="card compare">
  <div class="card-hd">
    <h2>슬롯 비교</h2>
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
        {#each app.slots as slot (slot.id)}<col class="c-slot" />{/each}
        <col class="c-add" />
      </colgroup>

      <thead>
        <tr class="c-title">
          <th scope="row"></th>
          {#each app.slots as slot, at (slot.id)}
            <th scope="col" class:base={at === baseAt} class:live={slot.id === app.activeSlotId}>
              <div class="c-name">
                <SlotStar {slot} />
                {#if editing === slot.id}
                  <input class="slot-name-input" type="text" bind:value={draft} autofocus
                         onblur={commitRename}
                         onkeydown={event => {
                           if (event.key === "Enter") commitRename();
                           if (event.key === "Escape") editing = null;
                         }} />
                {:else}
                  <!-- 이름을 누르면 이름을 고친다. 제일 짐작하기 쉬운 자리다. -->
                  <button class="c-open" type="button" title="이름 바꾸기"
                          onclick={() => startRename(slot)}>{slot.name}</button>
                {/if}
              </div>

              <!-- 아랫줄 하나를 둘이 나눠 쓴다: 평소엔 출처, 가리키면 잔일.
                   겹쳐 두므로 가리켜도 줄이 안 밀린다. -->
              <div class="c-under">
                <div class="c-meta">
                  <span>{slot.id === app.activeSlotId ? "편집 중" : slotOriginLabel(slot)}</span>
                  {#if slotDirty(slot)}<i class="slot-dot" title="담은 뒤로 손댔습니다"></i>{/if}
                </div>
                <div class="c-acts">
                  <button type="button" title="빌드에서 편집" aria-label="{slot.name} 편집"
                          onclick={() => edit(slot)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5v4Z" /><path d="m14 6 4 4" />
                    </svg>
                  </button>
                  <button type="button" title="담았을 때로" aria-label="{slot.name} 되돌리기"
                          disabled={!slotDirty(slot)} onclick={() => revertSlot(slot.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 11a7.5 7.5 0 1 1 2 6" /><path d="M4.5 5.5v5.5h5.5" />
                    </svg>
                  </button>
                  <button type="button" class="rm" title="지우기" aria-label="{slot.name} 지우기"
                          disabled={app.slots.length <= 1} onclick={() => removeSlot(slot.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 7h14M10 7V4.8h4V7" /><path d="M6.8 7 7.6 19.2h8.8L17.2 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </th>
          {/each}
          <th scope="col" class="c-add-head">
            <button class="slot-add" type="button" onclick={() => addSlot({})} disabled={app.slots.length >= 6}
                    aria-label="지금 빌드를 새 슬롯으로 담기">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" /></svg>
              현재 세팅 저장
            </button>
          </th>
        </tr>
      </thead>

      <tbody>
        {#each shown as row, i (row.group + row.label)}
          {#if i === 0 || shown[i - 1].group !== row.group}
            <tr class="c-group"><td colspan={app.slots.length + 2}>{row.group}</td></tr>
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
                    <span class="c-none">안 찍음</span>
                  {:else}
                    <ul class="c-levels">
                      {#each cell.lines as line (line.id)}
                        <li class:moved={at !== baseAt && row.cells[baseAt].levels[line.id] !== line.level}>
                          <span>{line.name}</span><b>{line.level}Lv.</b>
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
