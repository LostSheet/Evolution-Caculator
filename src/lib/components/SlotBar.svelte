<script>
  // 슬롯 줄 — 빌드 화면 맨 위. 갈아끼우고, 담고, 되돌린다.
  //
  // 탭이 숫자를 들고 있다. 이름만 있을 때는 갈아끼워 봐야 결과가 하단 막대에
  // 한 번에 하나씩만 떠서, 비교하려면 왔다 갔다 하며 숫자를 외워야 했다.
  // 그럴 바에는 5페이지를 보는 게 나았고, 그러면 이 줄은 그냥 스위치였다 —
  // 스위치에 지우기와 되돌리기가 붙어 있을 이유가 없다.
  //
  // 기준 탭은 제 값을 적고, 나머지는 기준 대비 증감을 적는다. 네 숫자를 다
  // 늘어놓으면 탭이 이름보다 숫자로 뒤덮인다.
  import {
    app, goPage, PAGE, activeSlot, selectSlot, addSlot, renameSlot,
    revertSlot, removeSlot, slotDirty, buildState,
  } from "../store.svelte.js";
  import { calculateMetrics } from "../core/metrics.js";
  import { formatNumber, percentDelta } from "../core/util.js";
  import SlotStar from "./SlotStar.svelte";

  // 서랍 안에서는 '나란히 보기'가 서랍 머리에 이미 있다. 같은 단추가 두 줄
  // 건너 두 번 있으면 어느 쪽이 진짜인지 묻게 된다.
  let { inDrawer = false } = $props();

  let editing = $state(null);
  let draft = $state("");

  const current = $derived(activeSlot());

  // 지금 만지고 있는 슬롯은 살아 있는 빌드를 쓴다. 슬롯에 적힌 값은 마지막
  // 저장 시점이라 방금 올린 노드가 숫자에 안 나타난다.
  const scores = $derived(app.slots.map(slot => calculateMetrics(buildState(
    slot.id === app.activeSlotId
      ? {
          nodeLevels: app.character.nodeLevels,
          engravings: app.character.engravings || {},
          pet: app.character.convenience.petStat || "none",
        }
      : slot.build,
  ))));

  const baseAt = $derived(Math.max(0, app.slots.findIndex(slot => slot.id === app.baseSlotId)));

  function delta(at, key) {
    const was = scores[baseAt]?.[key];
    const now = scores[at]?.[key];
    if (!Number.isFinite(was) || !Number.isFinite(now) || was === 0) return null;
    const value = percentDelta(now, was);
    if (Math.abs(value) < 0.005) return { flat: true, text: "±0" };
    return { up: value > 0, text: `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%` };
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

<div class="slotbar">
  <div class="slot-tabs" role="tablist" aria-label="진화 세팅 슬롯">
    {#each app.slots as slot, at (slot.id)}
      {@const on = slot.id === app.activeSlotId}
      {@const isBase = at === baseAt}
      <div class="slot-tab" class:on>
        {#if editing === slot.id}
          <input class="slot-name-input" type="text" bind:value={draft} autofocus
                 onblur={commitRename}
                 onkeydown={event => {
                   if (event.key === "Enter") commitRename();
                   if (event.key === "Escape") editing = null;
                 }} />
        {:else}
          <SlotStar {slot} />
          <button class="slot-pick" type="button" role="tab" aria-selected={on}
                  ondblclick={() => startRename(slot)}
                  onclick={() => selectSlot(slot.id)}>
            <span class="slot-line">
              <b>{slot.name}</b>
              {#if slotDirty(slot)}<i class="slot-dot" title="담은 뒤로 손댔습니다"></i>{/if}
            </span>
            <span class="slot-score">
              {#if isBase}
                <span>한방 <b>{formatNumber(scores[at].damageIndex)}</b></span>
                <span>DPS <b>{formatNumber(scores[at].dpsIndex)}</b></span>
              {:else}
                {@const d = delta(at, "damageIndex")}
                {@const p = delta(at, "dpsIndex")}
                <span>한방 <em class:up={d?.up} class:down={d && !d.up && !d.flat}>{d?.text ?? "—"}</em></span>
                <span>DPS <em class:up={p?.up} class:down={p && !p.up && !p.flat}>{p?.text ?? "—"}</em></span>
              {/if}
            </span>
          </button>
          <!-- 잔일은 가리킬 때만. 늘 보이면 탭 세 개가 단추 아홉 개가 된다.
               여기 이름은 탭이라 누르면 갈아끼운다 — 이름 고치기는 두 번 누르기. -->
          <span class="slot-acts">
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
          </span>
        {/if}
      </div>
    {/each}

    <button class="slot-add" type="button" onclick={() => addSlot({})}
            disabled={app.slots.length >= 6} aria-label="지금 빌드를 새 슬롯으로 담기">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" /></svg>
      현재 세팅 저장
    </button>
  </div>

  <span class="spacer"></span>

  {#if current && slotDirty(current)}
    <button class="btn sm" type="button" onclick={() => revertSlot(current.id)}>담았을 때로</button>
  {/if}
  {#if !inDrawer}
    <button class="btn sm" type="button" onclick={() => goPage(PAGE.compare)}>나란히 보기</button>
  {/if}
</div>
