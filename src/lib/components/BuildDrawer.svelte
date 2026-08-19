<script>
  /**
   * 비교함 서랍.
   *
   * 접으면 하단 막대, 펼치면 표 — 같은 물건의 두 상태다. 그래서 손잡이도
   * 그 막대이고, 아래에서 위로 올라온다.
   *
   * 여기서는 아무것도 못 고친다. 고치는 곳은 페이지다. 예전에는 서랍이
   * 편집 반 비교 반이었는데, 그러면 편집 자리가 페이지와 서랍 둘로 갈려서
   * "지금 뭘 고치고 있나"를 매번 확인해야 했다.
   */
  import { app, closeDrawer } from "../store.svelte.js";
  import CompareTable from "./CompareTable.svelte";

  // 윗 모서리를 끌어내려 닫는다.
  //
  // 예전에는 오른쪽에서 밀려 들어왔다. 그런데 이 서랍을 여는 손잡이는 화면
  // 맨 아래 막대다 — 아래를 눌렀는데 옆에서 나오면 같은 물건으로 안 읽힌다.
  // 아래에서 올라오면 막대가 그대로 자라나는 것이 된다.
  let dragY = $state(0);
  let dragging = $state(false);

  function grab(event) {
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    dragY = 0;
    const startY = event.clientY;
    const move = e => { dragY = Math.max(0, e.clientY - startY); };
    const drop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      dragging = false;
      // 화면 높이의 6분의 1쯤 끌어내리면 닫는다. 그보다 짧으면 제자리로.
      if (dragY > window.innerHeight / 6) closeDrawer();
      dragY = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
  }

  function onKey(event) {
    if (event.key === "Escape") closeDrawer();
  }
</script>

<svelte:window onkeydown={app.drawer.open ? onKey : undefined} />

{#if app.drawer.open}
  <!-- 뒤 화면은 살아 있다. 어두워지되 클릭하면 닫힌다. -->
  <button class="bd-scrim" type="button" aria-label="빌드 서랍 닫기" onclick={closeDrawer}></button>
{/if}

<aside class="build-drawer" class:open={app.drawer.open} class:dragging
       style:transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
       aria-hidden={!app.drawer.open}
       inert={!app.drawer.open || undefined}>
  <div class="bd-grip" onpointerdown={grab} role="presentation" title="끌어내려 닫기"></div>

  <header class="bd-hd">
    <b class="bd-title">비교함</b>
    <small class="bd-who">내 빌드 · {app.buildName}</small>
    <span class="spacer"></span>
    <button class="btn icon" type="button" aria-label="닫기" onclick={closeDrawer}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </header>

  <div class="bd-body">
    <CompareTable onEdit={() => closeDrawer()} />
  </div>
</aside>
