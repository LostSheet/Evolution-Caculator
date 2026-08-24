<script>
  /**
   * 후보 하나 자세히.
   *
   * 표에는 주요 노드 넷까지만 적힌다. 담기 전에 "이게 무슨 빌드냐"를 봐야
   * 하는데, 예전에는 그걸 4페이지 오른쪽 세로 레일이 늘 띄우고 있었다.
   * 레일은 한 번에 하나만 보여주면서 가로를 반이나 먹었다 — 여럿을 견주려고
   * 온 화면에서 정작 하나만 보였다.
   *
   * 그래서 눌렀을 때만 연다. 여기서 바로 담을 수도 있다.
   */
  import { NODE_LIBRARY, EVOLUTION_TIERS } from "../core/data.js";
  import { ENGRAVING_LIBRARY, ENGRAVING_TIERS } from "../core/engravings.js";
  import { getEngravingTierIndex } from "../core/metrics.js";
  import { OPTIMIZER_PET_LABELS } from "../core/search.js";
  import { FOODS } from "../core/metrics.js";
  import { formatNumber, formatSignedPercent, percentDelta } from "../core/util.js";
  import { calculateMetrics } from "../core/metrics.js";
  import { boxedSlot, toggleBoxed, adoptResult, anchorState } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false), entry = null } = $props();

  const boxed = $derived(entry ? boxedSlot(entry) : null);

  // 담을지 말지를 여기서 정한다. 그러려면 내 것과 견준 값이 있어야 하는데,
  // 그 숫자를 든 하단 막대는 이 대화상자 뒤에 가려 있다.
  const anchor = $derived(calculateMetrics(anchorState()));
  const rel = (now, base) => percentDelta(now, base);

  // 티어마다 한 줄. 노드를 하나씩 세면 안 찍은 것까지 스물몇 줄이 된다.
  const tiers = $derived.by(() => {
    if (!entry) return [];
    return Object.entries(EVOLUTION_TIERS).map(([tier, meta]) => ({
      label: meta.label,
      lines: NODE_LIBRARY
        .filter(node => node.tier === tier && (entry.nodeLevels?.[node.id] || 0) > 0)
        .map(node => ({ id: node.id, name: node.name, level: entry.nodeLevels[node.id] })),
    })).filter(row => row.lines.length > 0);
  });

  const engravings = $derived.by(() => {
    if (!entry) return [];
    return ENGRAVING_LIBRARY
      .map(item => ({ item, at: getEngravingTierIndex(entry.engravings?.[item.id]) }))
      .filter(row => row.at >= 0)
      .map(row => `${row.item.name} · ${ENGRAVING_TIERS[row.at].label}`);
  });

  const foodLabel = $derived(FOODS.find(food => food.id === (entry?.food || "none"))?.label ?? "안 먹음");
</script>

<Dialog bind:open title="후보 자세히" subtitle={boxed ? `비교함 · ${boxed.name}` : "아직 안 담음"} width="720px">
  {#if entry}
    <!-- @const는 블록의 직계 자식 자리에만 온다 — div 안으로 넣으면 컴파일이 막힌다. -->
    {@const raw = entry.critRateRaw ?? entry.critRateCapped}
    {@const dmg = rel(entry.damageIndex, anchor.damageIndex)}
    {@const dps = rel(entry.dpsIndex, anchor.dpsIndex)}
    <div class="rd-figures">
      <div>
        <dt>한 방 딜</dt>
        <dd>{formatNumber(entry.damageIndex)}<em class={dmg >= 0 ? "up" : "down"}>{formatSignedPercent(dmg)}</em></dd>
      </div>
      <div>
        <dt>DPS</dt>
        <dd>{formatNumber(entry.dpsIndex)}<em class={dps >= 0 ? "up" : "down"}>{formatSignedPercent(dps)}</em></dd>
      </div>
      <div><dt>쿨감</dt><dd>{formatNumber(entry.cooldownReduction)}%</dd></div>
      <!-- 표와 같은 표기다. 상한에 눌린 줄만 괄호로 상한 전 합산을 단다. -->
      <div>
        <dt>치적</dt>
        <dd>
          {#if entry.bluntThorn && raw > entry.critRateCapped + 1e-9}
            {Math.round(entry.critRateCapped * 100) / 100}%<em class="over">({formatNumber(raw)}%)</em>
          {:else}
            {formatNumber(raw)}%
          {/if}
        </dd>
      </div>
    </div>

    <div class="rd-grid">
      <section>
        <h3>진화 노드</h3>
        {#each tiers as row (row.label)}
          <div class="rd-tier">
            <b>{row.label}</b>
            <ul>{#each row.lines as line (line.id)}<li><span>{line.name}</span><em>{line.level}Lv.</em></li>{/each}</ul>
          </div>
        {/each}
        {#if tiers.length === 0}<p class="empty">안 찍음</p>{/if}
      </section>

      <section>
        <h3>각인</h3>
        <div class="summary-line">
          {#if engravings.length === 0}
            <span class="empty">없음</span>
          {:else}
            {#each engravings as text (text)}<span class="chip">{text}</span>{/each}
          {/if}
        </div>

        <h3>펫 · 음식</h3>
        <div class="summary-line">
          <span class="chip">{OPTIMIZER_PET_LABELS[entry.pet] ?? "펫 없음"}</span>
          <span class="chip">{foodLabel}</span>
        </div>
      </section>
    </div>

    <div class="rd-foot">
      <button class="btn" type="button" onclick={() => toggleBoxed(entry)}>
        {boxed ? "비교함에서 빼기" : "비교함에 담기"}
      </button>
      <!-- 쓰던 빌드는 그 자리에 얼린다. 아무것도 안 사라진다. -->
      <button class="btn primary" type="button"
              onclick={() => { adoptResult(entry); open = false; }}>내 빌드로</button>
    </div>
  {/if}
</Dialog>
