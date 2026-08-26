<script>
  /**
   * 파티 시너지 간략 — 개수만 센다.
   *
   * 실제로 적고 싶은 것은 "피증 둘, 치적 하나"이지 "누가 파티에 있나"가 아닐
   * 때가 많다. 그렇다고 간략용 모델을 따로 세우면 같은 시너지가 두 군데서
   * 계산될 위험이 생긴다 — 그래서 이건 별도 모드가 아니라 직업 없는 줄이다.
   * 상세 패널에서도 같은 줄로 보이고, 거기서 가동율을 만질 수 있다.
   */
  import { SYNERGY_TYPES } from "../core/synergy.js";
  import { formatNumber } from "../core/util.js";
  import { genericSynergyCount, setGenericSynergyCount } from "../store.svelte.js";

  // 목록을 손으로 적어 두었더니 넷이 조용히 빠져 있었다 — 치피증·공증·방깎·백헤드.
  // 데이터가 종류를 들고 있으므로 거기서 뽑는다. 새 시너지가 생겨도 따라온다.
  const KINDS = Object.values(SYNERGY_TYPES)
    .filter(type => type.combat)
    .map(type => ({ job: type.key, label: type.short ?? type.label }));


</script>

<div class="brief">
  <div class="brief-steppers">
    {#each KINDS as kind (kind.job)}
      {@const count = genericSynergyCount(kind.job)}
      {@const type = SYNERGY_TYPES[kind.job]}
      <div class="brief-step">
        <span class="brief-name">{kind.label}<em>{type.label} +{formatNumber(type.amount)}%</em></span>
        <div class="stepper">
          <button type="button" aria-label="{kind.label} 하나 빼기" disabled={count === 0}
                  onclick={() => setGenericSynergyCount(kind.job, count - 1)}>−</button>
          <b>{count}</b>
          <button type="button" aria-label="{kind.label} 하나 더하기" disabled={count >= 3}
                  onclick={() => setGenericSynergyCount(kind.job, count + 1)}>+</button>
        </div>
      </div>
    {/each}
  </div>

</div>
