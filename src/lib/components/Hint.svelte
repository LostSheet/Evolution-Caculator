<script>
  // 설명은 설명 대상 옆에 있어야 설명이다. 카드 맨 아래 접힌 글은
  // 세 줄 떨어진 다른 얘기가 된다.
  //
  // 팝오버는 레이아웃을 차지하지 않으므로, 펼쳐도 카드 높이가 안 변한다 —
  // 격자가 흔들리던 문제도 여기서 같이 사라진다.
  // float은 가로로 스크롤되는 칸 안에서 쓴다. 표가 그렇다 — 그 안에서
  // 절대 배치를 하면 팝오버가 칸에 잘려 반쪽만 보인다. 화면 기준으로 띄운다.
  let { label = "설명", float = false, wide = false, children } = $props();

  let open = $state(false);
  let anchor = $state(null);
  let box = $state(null);
  // 말풍선 높이는 일부러 반응형이 아니다. place()가 이걸 상태에서 읽으면
  // 자기가 쓴 값을 자기가 다시 읽는 꼴이 되고, 그 순간 Svelte가 갱신 고리를
  // 끊어 버린다 — 화면 전체의 반응이 그 자리에서 멎는다.
  let popHeight = 0;

  function toggle(event) {
    event.stopPropagation();
    open = !open;
  }

  function place() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(wide ? 380 : 300, window.innerWidth - 24);
    // 오른쪽에 자리가 없으면 왼쪽으로 넘긴다.
    let left = rect.right + 8;
    if (left + width > window.innerWidth - 12) left = Math.max(12, rect.left - 8 - width);

    // 아래가 모자라면 위로 뒤집는다. 글이 길어서 표 아래쪽 열에서는
    // 그냥 두면 화면 밖으로 흘러나간다.
    const below = window.innerHeight - rect.bottom - 16;
    const top = popHeight > 0 && below < popHeight && rect.top > popHeight + 16
      ? rect.top - 8 - popHeight
      : rect.bottom + 8;
    box = { left, top, width };
  }

  // 높이는 그려 봐야 안다. 그린 직후, 화면에 칠해지기 전에 재서 다시 놓는다.
  function measure(node) {
    const height = node.getBoundingClientRect().height;
    if (height > 0 && height !== popHeight) {
      popHeight = height;
      place();
    }
  }

  $effect(() => {
    if (!open) return;
    const close = event => {
      if (!anchor?.contains(event.target)) open = false;
    };
    const escape = event => {
      if (event.key === "Escape") open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);

    if (!float) {
      return () => {
        document.removeEventListener("pointerdown", close);
        document.removeEventListener("keydown", escape);
      };
    }

    place();
    // 표를 옆으로 밀거나 창을 줄여도 말풍선이 단추를 따라간다.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });
</script>

<span class="hint-anchor" bind:this={anchor}>
  <button class="hint-btn" type="button" aria-label={label} aria-expanded={open} onclick={toggle}>?</button>
  {#if open}
    <div class="hint-pop" class:float
         use:measure
         style={float && box ? `left:${box.left}px; top:${box.top}px; right:auto; width:${box.width}px` : ""}
         role="dialog" aria-label={label}>
      <strong>{label}</strong>
      {@render children()}
    </div>
  {/if}
</span>
