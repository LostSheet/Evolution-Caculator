<script>
  // 답이 놓이는 자리. 어느 화면에 있든 한 방 딜과 DPS는 늘 보여야 한다 —
  // 노드를 만지든 곡선을 보든 결국 이 두 숫자를 움직이려고 하는 일이므로.
  //
  // 그래서 상세(옆 패널)에서는 뺐다. 같은 숫자가 두 군데 있으면 어느 쪽이
  // 기준인지 흐려지고, 실제로 한쪽만 갱신되는 것처럼 읽힌 적이 있다.
  //
  // 이 막대는 서랍 손잡이이자 비교함의 접힌 모습이다.
  //
  // 예전에는 빌드 하나만 들었다. 그러면 슬롯을 갈아끼우며 숫자를 외워야 해서
  // 비교가 안 됐다. 지금은 비교함에 담은 것을 열로 세운다 — 인게임이 첫 칸에
  // 자동으로 들어가 있으므로 기준 열을 따로 못 박지 않는다.
  //
  // 열이 늘어나면 숫자가 작아진다. 여섯 칸까지는 읽히고, 그 위는 담을 때
  // 막는다(addSlot). 글자가 뭉개지는 편보다 못 담는 편이 낫다.
  import { formatNumber, formatSignedPercent } from "../core/util.js";

  // report/deltas/label — 한 빌드만 드는 옛 모습. 탐색에서 고른 후보가 쓴다.
  // slots — 비교함. 있으면 열로 선다.
  // action: { label, disabled, onClick } · handle: { open, onToggle }
  let {
    report = null, deltas = [], label = "", action = null, handle = null,
    slots = null, activeId = "", onPick = null,
  } = $props();

  const figures = $derived(report ? [
    { key: "damage", label: "한 방 딜", value: report.damageIndex, delta: deltas[0] ?? null },
    { key: "dps", label: "DPS", value: report.dpsIndex, delta: deltas[1] ?? null },
  ] : []);
</script>

<div class="statusbar" class:columns={slots}>
  {#if handle}
    <button class="sb-tag sb-handle" type="button" class:open={handle.open}
            aria-expanded={handle.open} onclick={handle.onToggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14.5 12 9.5l5 5" /></svg>
      <span>{label || "비교함"}</span>
    </button>
  {:else if label}
    <span class="sb-tag">{label}</span>
  {/if}

  {#if slots}
    <!-- 비교함. 칸을 누르면 그 빌드를 만지는 것으로 바뀐다 — 서랍을 열지
         않고도 갈아끼울 수 있어야 곡선을 보다가 바로 손이 간다. -->
    <div class="sb-slots" role="tablist" aria-label="비교함">
      {#each slots as slot (slot.id)}
        {@const on = slot.id === activeId}
        <button class="sb-slot" type="button" class:on class:base={slot.isBase}
                role="tab" aria-selected={on}
                onclick={() => onPick?.(slot.id)}>
          <span class="sb-slot-name">{slot.name}</span>
          <!-- 증감까지 세 줄로 쌓으면 접힌 막대가 80px이 된다. 한 줄로 눕힌다. -->
          <span class="sb-slot-nums">
            <b>{formatNumber(slot.damageIndex)}</b>
            <i>{formatNumber(slot.dpsIndex)}</i>
            {#if slot.delta}
              <em class={slot.delta.value >= 0 ? "up" : "down"}>{formatSignedPercent(slot.delta.value)}</em>
            {:else}
              <em class="ref">기준</em>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {:else}
    {#each figures as figure (figure.key)}
      <dl class="sb-fig">
        <dt>{figure.label}</dt>
        <dd>
          {formatNumber(figure.value)}
          {#if figure.delta}
            <em class={figure.delta.value >= 0 ? "up" : "down"}>{formatSignedPercent(figure.delta.value)}</em>
          {/if}
        </dd>
        {#if figure.delta}<small>{figure.delta.label}</small>{/if}
      </dl>
    {/each}
  {/if}

  {#if action}
    <button class="btn primary sb-go" type="button" disabled={action.disabled} onclick={action.onClick}>
      {action.label}
    </button>
  {/if}
</div>
