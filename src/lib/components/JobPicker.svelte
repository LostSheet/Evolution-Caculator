<script>
  /**
   * 직업 고르기.
   *
   * 평소엔 이름 하나로 접혀 있다. 서른 개를 늘 펴 두면 트리 위에 트리가
   * 하나 더 서는 꼴이고, 직업은 한 번 정하면 거의 안 바꾸는 값이다.
   *
   * 펴면 계열 → 성별 → 직업으로 줄을 세운다. 게임의 직업 선택 화면이 그
   * 순서라서, 이름을 훑는 것보다 자리로 찾는 편이 빠르다.
   */
  import { ARKPASSIVE_TREE } from "../data/arkpassive-tree.js";
  import { isAwakeningModeled } from "../core/awakening.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();

  // 게임의 계열 구성 그대로. 성별이 갈리는 계열은 줄을 둘로 나눈다 —
  // 무도가의 배틀마스터와 스트라이커는 같은 계열이지만 다른 줄에 있다.
  const FAMILIES = [
    { name: "전사", rows: [
      { label: "남", jobs: ["버서커", "디스트로이어", "워로드", "홀리나이트"] },
      { label: "여", jobs: ["슬레이어", "발키리"] },
    ] },
    { name: "무도가", rows: [
      { label: "여", jobs: ["배틀마스터", "인파이터", "기공사", "창술사"] },
      { label: "남", jobs: ["스트라이커", "브레이커"] },
    ] },
    { name: "헌터", rows: [
      { label: "남", jobs: ["데빌헌터", "블래스터", "호크아이", "스카우터"] },
      { label: "여", jobs: ["건슬링어"] },
    ] },
    { name: "마법사", rows: [
      { label: "여", jobs: ["아르카나", "서머너", "바드", "소서리스"] },
    ] },
    { name: "암살자", rows: [
      { label: "여", jobs: ["데모닉", "블레이드", "리퍼", "소울이터"] },
    ] },
    { name: "스페셜리스트", rows: [
      { label: "여", jobs: ["도화가", "기상술사", "환수사"] },
      { label: "남", jobs: ["차원술사"] },
    ] },
    { name: "오리지널", rows: [
      { label: "", jobs: ["가디언나이트"] },
    ] },
  ];

  // 이름 → 코드. 트리 데이터가 열쇠를 코드로 들고 있어서 되짚어 둔다.
  const CODE_BY_NAME = Object.fromEntries(
    Object.entries(ARKPASSIVE_TREE).map(([code, tree]) => [tree.name, Number(code)]),
  );

  const current = $derived(app.character.awakening?.job ?? 0);

  function pick(name) {
    const code = CODE_BY_NAME[name];
    if (!code) return;
    // 직업이 바뀌면 배분도 유효율도 남을 이유가 없다 — 노드 이름이 다르다.
    if (code !== current) {
      app.character.awakening = { job: code, nodeLevels: {}, uptime: {} };
      persist();
    }
    open = false;
  }
</script>

<Dialog bind:open title="직업" subtitle="계열에서 고릅니다" width="820px">
  <div class="job-picker">
    {#each FAMILIES as family (family.name)}
      <div class="job-family">
        <b>{family.name}</b>
        <div class="job-rows">
          {#each family.rows as row (row.label + family.name)}
            <div class="job-row">
              {#if row.label}<i>{row.label}</i>{/if}
              <div class="job-list">
                {#each row.jobs as name (name)}
                  {@const code = CODE_BY_NAME[name]}
                  {@const on = code === current}
                  <button type="button" class="job-chip" class:on
                          aria-pressed={on}
                          disabled={!code}
                          onclick={() => pick(name)}>
                    {name}
                    <!-- 트리는 있는데 수치가 아직 안 들어간 직업이 있다.
                         고를 수는 있어야 하지만 그 사실을 감추면 안 된다. -->
                    {#if code && !isAwakeningModeled(code)}<em>수치 미입력</em>{/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</Dialog>
