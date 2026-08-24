<script>
  /**
   * 3페이지 — 탐색 설정. 규칙만 산다.
   *
   * 여기는 지금 빌드와도, 곡선에서 고른 후보와도 상관이 없다. 무엇을 고정할지,
   * 무엇을 후보로 둘지, 어디를 하한·상한으로 막을지만 정한다. 그래서 곡선도
   * 순위표도 없다 — 그건 결과 화면의 일이다.
   *
   * 요약 카드도 없앴다. 거기 적히던 것은 전부 아래 판과 목록에 이미 그려져
   * 있었다 — 같은 사실을 두 군데 적으면 고칠 곳이 두 군데가 된다.
   */
  import SearchScope from "./SearchScope.svelte";

  let { report, plan, budget } = $props();
</script>

<SearchScope {plan} {report} {budget} />
