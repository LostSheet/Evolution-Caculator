<script>
  // 답이 놓이는 자리. 어느 화면에 있든 한 방 딜과 DPS는 늘 보여야 한다 —
  // 노드를 만지든 곡선을 보든 결국 이 두 숫자를 움직이려고 하는 일이므로.
  //
  // 그래서 상세(옆 패널)에서는 뺐다. 같은 숫자가 두 군데 있으면 어느 쪽이
  // 기준인지 흐려지고, 실제로 한쪽만 갱신되는 것처럼 읽힌 적이 있다.
  //
  // 이 막대는 서랍 손잡이이자 비교함의 접힌 모습이다.
  //
  // 첫 칸이 내 빌드다 — 편집 대상이자 증감의 기준. 나머지는 얼린 것이고,
  // 누르면 내 빌드로 올라오면서 쓰던 것이 그 자리에 얼려진다(맞바꾸기).
  //
  // 열이 늘어나면 숫자가 작아진다. 여섯 칸까지는 읽히고, 그 위는 담을 때
  // 막는다. 글자가 뭉개지는 편보다 못 담는 편이 낫다.
  import { formatNumber, formatSignedPercent } from "../core/util.js";

  // report/deltas/label — 한 빌드만 드는 옛 모습. 탐색에서 고른 후보가 쓴다.
  // slots — 비교함. 있으면 열로 선다.
  // action: { label, disabled, onClick } · handle: { open, onToggle }
  let {
    report = null, deltas = [], label = "", action = null, handle = null,
    slots = null, onPick = null,
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
    <!-- 비교함. 얼린 칸을 누르면 그것이 내 빌드로 올라오고, 쓰던 것은 그 자리에
         얼려져 들어간다 — 맞바꾸기라 아무것도 안 사라진다. -->
    <div class="sb-slots" role="tablist" aria-label="비교함">
      {#each slots as slot (slot.id ?? "mine")}
        {@const on = slot.isBase}
        <button class="sb-slot" type="button" class:on class:frozen={!on && !slot.preview}
                class:preview={slot.preview}
                role="tab" aria-selected={on} disabled={on}
                title={on
                  ? "지금 고치고 있는 빌드"
                  : slot.preview
                    ? "눌러서 비교함에 담기 — 지금은 고른 줄을 잠깐 세워 둔 것입니다"
                    : `'${slot.name}'을 내 빌드로 — 쓰던 것은 이 자리에 얼립니다`}
                onclick={() => onPick?.(slot.id)}>
          <span class="sb-slot-name">{slot.name}</span>
          <!-- 지표마다 제 증감을 옆에 붙인다. 하나만 적으면 두 숫자 중 어느 쪽
               것인지 알 수 없고, 실제로 둘이 서로 다른 방향으로 움직인다. -->
          <span class="sb-slot-nums">
            <span class="sb-fig-pair">
              <b>{formatNumber(slot.damageIndex)}</b>
              {#if slot.damageDelta}
                <em class={slot.damageDelta.value >= 0 ? "up" : "down"}>{formatSignedPercent(slot.damageDelta.value)}</em>
              {/if}
            </span>
            <span class="sb-fig-pair">
              <i>{formatNumber(slot.dpsIndex)}</i>
              {#if slot.dpsDelta}
                <em class={slot.dpsDelta.value >= 0 ? "up" : "down"}>{formatSignedPercent(slot.dpsDelta.value)}</em>
              {/if}
            </span>
            {#if slot.isBase}<em class="ref">기준</em>{/if}
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
