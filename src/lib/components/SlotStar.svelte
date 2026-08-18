<script>
  // 기준 표식이자 기준을 옮기는 단추.
  //
  // 예전에는 '기준으로'라는 글자 고리가 메뉴 밖에 따로 붙어 있었다. 별은
  // 이미 어느 슬롯이 기준인지 말하고 있으므로, 그 별을 누르면 기준이 오게
  // 하면 글자 하나가 통째로 없어진다.
  import { app, setBaseSlot } from "../store.svelte.js";

  let { slot } = $props();
  const on = $derived(slot.id === app.baseSlotId);
</script>

<button class="slot-star" type="button" class:on aria-pressed={on}
        title={on ? "이 슬롯이 기준입니다" : "기준으로 삼기"}
        aria-label={on ? "{slot.name} — 기준" : "{slot.name}을 기준으로"}
        onclick={event => { event.stopPropagation(); setBaseSlot(slot.id); }}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 3.6 2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.8l5.8-.9Z" />
  </svg>
</button>
