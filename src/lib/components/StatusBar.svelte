<script>
  /**
   * 하단 막대 — 닻과 초점, 그리고 서랍 손잡이.
   *
   * 어느 화면에 있든 한 방 딜과 DPS는 늘 보여야 한다. 노드를 만지든 곡선을
   * 보든 결국 이 두 숫자를 움직이려고 하는 일이므로.
   *
   *   닻    왼쪽 붙박이. 내 빌드이자 모든 증감의 기준. 전제가 실물을 넘으면
   *         같은 전제를 입은 '내 배분'이 그 자리를 잇고, 실물은 꼬리표로 남는다.
   *   초점  하나뿐이고 크다. 표 줄이든 곡선 점이든 고르면 여기로 온다.
   *         비교는 언제나 '닻 대 초점'이라 화살표가 둘로 갈리지 않는다.
   *
   * 담아 둔 것들을 여기 작은 칸으로 늘어놓아 봤다. 이름이 '탐색 1·2·3'이라
   * 서로 구분이 안 되고, 증감 둘만 떠 있어서 읽히는 것이 없었다. 여럿을
   * 견주는 일은 서랍이 표로 제대로 한다 — 막대는 지금 고른 하나만 든다.
   */
  import { formatNumber, formatSignedPercent } from "../core/util.js";

  let {
    anchor = null, focus = null, count = 0, label = "", handle = null,
    onKeep = null, status = "",
  } = $props();

  const sign = value => (value >= 0 ? "up" : "down");

  /**
   * 서랍을 열면 막대는 손잡이만 남는다.
   *
   * 펼친 표가 이미 닻도 고른 것도 열로 보여준다. 그런데도 막대가 축약본을
   * 또 들고 있으면 같은 숫자가 한 화면에 두 번이다.
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
      {#if count > 0}<em>{count}</em>{/if}
    </button>
  {/if}

  {#if folded}
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
</div>
