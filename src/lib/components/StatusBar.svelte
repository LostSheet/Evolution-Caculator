<script>
  /**
   * 하단 막대 — 닻 · 초점 · 타일.
   *
   * 어느 화면에 있든 한 방 딜과 DPS는 늘 보여야 한다. 노드를 만지든 곡선을
   * 보든 결국 이 두 숫자를 움직이려고 하는 일이므로.
   *
   * 세 구획이 하는 일이 다르다.
   *
   *   닻    왼쪽 붙박이. 내 빌드이자 모든 증감의 기준. 전제가 실물을 넘으면
   *         같은 전제를 입은 '내 배분'이 그 자리를 잇고, 실물은 꼬리표로 남는다.
   *   초점  하나뿐이고 크다. 표 줄·곡선 점·타일 어디서 골라도 여기로 온다.
   *         비교는 언제나 '닻 대 초점'이라 화살표가 둘로 갈리지 않는다.
   *   타일  담아 둔 것들. 작아도 숫자를 잃지 않고, 누르면 초점이 된다.
   *
   * 한동안 담아 둔 것들이 닻과 같은 크기로 늘어서 있었다. 그러면 매 순간
   * 읽어야 할 한 쌍(고른 것의 증감)이 배경에 묻혀서, 줄을 옮겨 다니며
   * 견주는 일이 느려진다. 초점을 크게 떼어 놓는 이유다.
   */
  import { formatNumber, formatSignedPercent } from "../core/util.js";

  let {
    anchor = null, focus = null, tiles = [], label = "", handle = null,
    onFocusTile = null, onKeep = null, status = "",
  } = $props();

  const sign = value => (value >= 0 ? "up" : "down");

  /**
   * 서랍을 열면 막대는 손잡이만 남는다.
   *
   * 펼친 표가 이미 같은 것을 더 잘 보여준다 — 닻도 초점도 타일도 저 위에 열로
   * 서 있다. 그런데도 막대가 축약본을 또 들고 있으면 같은 숫자가 한 화면에
   * 두 번 나오고, 어느 쪽을 봐야 하는지 매번 고르게 된다.
   */
  const folded = $derived(Boolean(handle?.open));
</script>

<div class="statusbar" class:folded>
  <!-- 어느 화면에서 무슨 일이 있었는지. 잠깐 떴다 사라진다. -->
  {#if status}
    <div class="sb-toast" role="status">{status}</div>
  {/if}

  {#if handle}
    <button class="sb-tag sb-handle" type="button" class:open={handle.open}
            aria-expanded={handle.open} onclick={handle.onToggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14.5 12 9.5l5 5" /></svg>
      <span>{label || "비교함"}</span>
      {#if tiles.length > 0}<em>{tiles.length}</em>{/if}
    </button>
  {/if}

  {#if folded}
    <!-- 펼친 표가 다 보여주고 있다. 여기서는 닫는 길만 남긴다. -->
    <span class="sb-folded">비교표를 보는 중</span>
  {/if}

  {#if anchor && !folded}
    <div class="sb-anchor" class:premise={anchor.premise}>
      <span class="sb-anchor-name">
        {anchor.name}
        {#if anchor.premise}<em class="sb-badge" title="낀 각인보다 높은 단계로 탐색 중입니다">전제 적용</em>{/if}
      </span>
      <span class="sb-nums">
        <span class="sb-fig-pair"><u>한 방</u><b>{formatNumber(anchor.damageIndex)}</b></span>
        <span class="sb-fig-pair"><u>DPS</u><i>{formatNumber(anchor.dpsIndex)}</i></span>
      </span>
      <!-- 실물은 증감 자격을 잃었을 뿐 사라진 것이 아니다. 이 차이가 곧
           "각인서를 올리면 이만큼"이라는 답이기도 하다. -->
      {#if anchor.real}
        <span class="sb-real">
          실물
          <em class={sign(anchor.real.damage)}>{formatSignedPercent(anchor.real.damage)}</em>
          <em class={sign(anchor.real.dps)}>{formatSignedPercent(anchor.real.dps)}</em>
        </span>
      {/if}
    </div>
  {/if}

  {#if focus && !folded}
    <div class="sb-focus" class:temp={focus.temp}>
      <span class="sb-focus-name">{focus.name}</span>
      <span class="sb-nums big">
        <span class="sb-fig-pair">
          <u>한 방</u>
          <em class={sign(focus.damageDelta)}>{formatSignedPercent(focus.damageDelta)}</em>
        </span>
        <span class="sb-fig-pair">
          <u>DPS</u>
          <em class={sign(focus.dpsDelta)}>{formatSignedPercent(focus.dpsDelta)}</em>
        </span>
      </span>
      {#if focus.temp && onKeep}
        <button class="btn sm" type="button" onclick={onKeep}>담기</button>
      {/if}
    </div>
  {/if}

  <div class="sb-tiles" aria-label="비교함에 담은 빌드">
    {#each folded ? [] : tiles as tile (tile.id)}
      <button class="sb-tile" type="button" class:on={tile.focused}
              title="'{tile.name}'을 초점으로"
              onclick={() => onFocusTile?.(tile.id)}>
        <span class="sb-tile-name">{tile.name}</span>
        <span class="sb-tile-nums">
          <u>한 방</u><em class={sign(tile.damageDelta)}>{formatSignedPercent(tile.damageDelta)}</em>
          <u>DPS</u><em class={sign(tile.dpsDelta)}>{formatSignedPercent(tile.dpsDelta)}</em>
        </span>
      </button>
    {/each}
  </div>
</div>
