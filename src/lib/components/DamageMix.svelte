<script>
  /**
   * 주력기 딜 비중 · 특화 효율.
   *
   * 둘 다 "이 캐릭터가 무엇으로 딜을 내는가"에 답하는 값이다. 장비가 아니라
   * 스킬 구성이 정하므로 깨달음 옆에 산다. 특화 효율은 장기적으로 자버프 줄로
   * 흡수될 값이다 — 스킬군마다 다르고, 어느 군을 쓰는지가 곧 이 비중이다.
   */
  import { DAMAGE_MIX_KEYS, DAMAGE_MIX_LABELS, getManaShareRatio, getManaCooldownShareRatio } from "../core/metrics.js";
  import { formatInteger, formatNumber, readNumber } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import Hint from "./Hint.svelte";

  const mix = $derived(app.character.convenience.damageMix);
  const mixTotal = $derived(DAMAGE_MIX_KEYS.reduce((sum, key) => sum + Math.max(0, readNumber(mix[key])), 0));
  const manaShare = $derived(getManaShareRatio(app.character.convenience) * 100);
  const manaCooldownShare = $derived(getManaCooldownShareRatio(app.character.convenience) * 100);
  const sharePct = value => `${Math.round(value * 100) / 100}%`;
  // 특화 묶음(별도 카드)이 서면 이 카드의 특화 효율 칸은 물러난다.
  const hasBundles = $derived((app.character.specBundles ?? []).length > 0);
</script>

<section class="card">
  <div class="card-hd">
    <h2>딜 비중</h2>
    <Hint label="주력기 딜 비중">
      <p>주력기가 <b>마나를 쓰는지</b>, <b>자체 쿨인지 아이덴티티인지</b>로 나눕니다.</p>
      <p><b>마나 전용 피해</b> — 마나 효율 증가 각인, 마나 용광로, 금단의 주문 마나 추가분.</p>
      <p>합이 100이 아니어도 됩니다.</p>
    </Hint>
    <span class="spacer"></span>
    <span class="mix-sum" class:off={mixTotal === 100}>합 {formatInteger(mixTotal)}%</span>
  </div>
  <div class="card-body">
    <div class="mix-rows">
      {#each DAMAGE_MIX_KEYS as key}
        <label class="mix-row">
          <span>{DAMAGE_MIX_LABELS[key]}</span>
          <input class="boxed" type="number" min="0" max="100" step="5"
                 bind:value={mix[key]} onchange={persist} />
        </label>
      {/each}
    </div>

    {#if readNumber(mix.identityPlain) > 0}
      <label class="check">
        <input type="checkbox" bind:checked={mix.feederMana} onchange={persist} />
        <span>아덴 수급기가 마나를 씀</span>
      </label>
    {/if}

    <div class="mix-out">
      <div><dt>마나 전용 피해</dt><dd>{sharePct(manaShare)}</dd></div>
      <div><dt>끝마/무마 쿨감</dt><dd>{sharePct(manaCooldownShare)}</dd></div>
    </div>

    {#if !hasBundles}
      <div class="fields">
        <div class="field">
          <span class="field-label">
            <label for="s-spec">특화 효율 % / 100</label>
            <Hint label="특화 효율">
              <p>스킬군마다 다릅니다. 지금 쓰는 주력기의 값을 적습니다.</p>
              <p><b>특화 묶음</b> 카드를 쓰면 이 칸은 안 씁니다.</p>
            </Hint>
          </span>
          <input id="s-spec" type="number" step="0.01"
                 bind:value={app.character.base.specDamagePer100} onchange={persist} />
        </div>
      </div>
    {/if}
  </div>
</section>
