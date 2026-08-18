<script>
  /**
   * 2페이지 — 깨달음.
   *
   * 왼쪽이 트리, 오른쪽이 자버프다. 트리에서 찍은 것이 오른쪽에 줄로 서고
   * 거기서 유효율을 매기므로, 둘은 같은 화면에서 나란히 봐야 한다.
   *
   * 계기판은 뺐다. 여기서 재는 것은 한 방 딜·DPS가 아니라 "이 줄이 몇 퍼센트
   * 실리나"이고, 그 답은 자버프 카드 안에 있다. 딜은 아래 막대가 든다.
   */
  import { app, persist } from "../store.svelte.js";
  import AwakeningTree from "./AwakeningTree.svelte";
  import DamageMix from "./DamageMix.svelte";
  import SpecBundles from "./SpecBundles.svelte";
  import ExtraEffects from "./ExtraEffects.svelte";

  let group = $state("깨달음");
</script>

<div class="awaken-split">
  <AwakeningTree bind:group />

  <div class="awaken-side">
    <!-- 어느 갈래를 탔느냐가 백헤드를 쓸 수 있느냐를 정한다. 그래서 트리 옆이다. -->
    <section class="card compact">
      <div class="card-hd"><h2>공격 방향</h2></div>
      <div class="card-body">
        <div class="checks">
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.backAttack} onchange={persist} /><span>백어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.headAttack} onchange={persist} /><span>헤드어택</span></label>
        </div>
      </div>
    </section>

    <DamageMix />
    <SpecBundles />
    <ExtraEffects />
  </div>
</div>
