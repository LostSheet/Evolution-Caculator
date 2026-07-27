<script>
  import { EFFECT_CATEGORIES } from "../core/data.js";
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS } from "../core/bracelets.js";
  import { getEngravingTierIndex, getBraceletGradeIndex, isDirectionalConditionActive, getManaShareRatio } from "../core/metrics.js";
  import { makeId, formatInteger, clamp, readNumber } from "../core/util.js";
  import { app, persist, resetSection } from "../store.svelte.js";
  import ResetButton from "./ResetButton.svelte";

  let { onOpenEngravings, onOpenBracelet } = $props();

  const manaShare = $derived(clamp(Math.round(readNumber(app.character.convenience.manaShare)), 0, 100));

  const activeEngravings = $derived(
    ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(app.character.engravings[item.id]) >= 0),
  );
  const braceletChips = $derived([
    ...BRACELET_STAT_FIELDS
      .map(item => ({ label: item.label, amount: clamp(readNumber(app.character.bracelet.stats[item.key]), 0, 120) }))
      .filter(item => item.amount > 0)
      .map(item => `${item.label} +${formatInteger(item.amount)}`),
    ...BRACELET_EFFECTS
      .map(item => ({ item, gradeIndex: getBraceletGradeIndex(app.character.bracelet.effects[item.id]) }))
      .filter(entry => entry.gradeIndex >= 0)
      .map(entry => {
        const active = isDirectionalConditionActive(entry.item.condition, app.character.settings);
        return `${entry.item.name} · ${BRACELET_GRADES[entry.gradeIndex].label}${active ? "" : " · 미적용"}`;
      }),
  ]);

  function addEffect() {
    app.character.baseEffects.push({ id: makeId(), label: "새 효과", category: "damage:진화형 피해", customCategory: "", amount: 0 });
    persist();
  }

  function removeEffect(id) {
    app.character.baseEffects = app.character.baseEffects.filter(effect => effect.id !== id);
    persist();
  }
</script>

<aside class="panel settings-panel" aria-label="아크 그리드 적용 전 캐릭터 설정">
  <div class="panel-heading">
    <h2>캐릭터 사전 설정</h2>
    <span>자동 저장됨</span>
  </div>

  <section class="config-section">
    <div class="config-section-heading">
      <h3>전투 특성</h3>
      <ResetButton label="전투 특성 초기화" onclick={() => resetSection("combat")} />
    </div>
    <div class="stat-field-grid">
      <label><span>치명</span><input type="number" min="0" step="1" bind:value={app.character.base.critStat} onchange={persist} /></label>
      <label><span>특화</span><input type="number" min="0" step="1" bind:value={app.character.base.specStat} onchange={persist} /></label>
      <label><span>신속</span><input type="number" min="0" step="1" bind:value={app.character.base.swiftStat} onchange={persist} /></label>
    </div>
    <div class="field-grid compact-fields">
      <label><span>기본 치적 %</span><input type="number" step="0.01" bind:value={app.character.base.baseCritRate} onchange={persist} /></label>
      <label><span>추가 치피 %</span><input type="number" step="0.01" bind:value={app.character.base.critDamageBonus} onchange={persist} /></label>
      <label><span>특화 효율 % / 100</span><input type="number" step="0.01" bind:value={app.character.base.specDamagePer100} onchange={persist} /></label>
      <label><span>진화 포인트</span><input type="number" min="0" step="1" bind:value={app.character.settings.pointBudget} onchange={persist} /></label>
    </div>
  </section>

  <section class="config-section">
    <div class="config-section-heading">
      <h3>편의 설정</h3>
      <ResetButton label="편의 설정 초기화" onclick={() => resetSection("convenience")} />
    </div>
    <div class="field-grid compact-fields">
      <label>
        <span>펫 효과</span>
        <select bind:value={app.character.convenience.petStat} onchange={persist}>
          <option value="none">사용 안 함</option>
          <option value="critStat">치명 +160</option>
          <option value="specStat">특화 +160</option>
          <option value="swiftStat">신속 +160</option>
        </select>
      </label>
      <label>
        <span>진화 카르마</span>
        <select bind:value={app.character.convenience.evolutionKarmaRank} onchange={persist}>
          {#each [0, 1, 2, 3, 4, 5, 6] as rank}
            <option value={rank}>{rank}랭크{rank > 0 ? ` · +${rank}%` : ""}</option>
          {/each}
        </select>
      </label>
    </div>

    <label class="slider-field">
      <span>마나 스킬 딜 비중 <strong class:muted-value={manaShare >= 100}>{manaShare}%</strong></span>
      <input type="range" min="0" max="100" step="5" bind:value={app.character.convenience.manaShare} onchange={persist} />
      <small>전체 딜 중 마나를 소모하는 스킬이 차지하는 비율. <strong>마나 효율 증가 각인, 마나 용광로, 금단의 주문 마나 추가분</strong>에만 적용됩니다.</small>
    </label>
    <details class="mana-guide">
      <summary>끝없는 마나 · 무한한 마력 쿨감은 왜 안 깎이나요?</summary>
      <ul>
        <li>쿨감이 30% 당겨지면 스택·게이지 축적 속도도 같이 30% 빨라져 사이클 전체가 당겨집니다.</li>
        <li>따라서 주력기가 마나를 쓰지 않아도 끝마/무마 쿨감은 그대로 이득이며, 비중으로 깎지 않습니다.</li>
      </ul>
    </details>

    <div class="switch-row compact-switches" role="group" aria-label="캐릭터 버프">
      <label class="switch"><input type="checkbox" bind:checked={app.character.convenience.goddessBlessing} onchange={persist} /><span>축복의 여신 9%</span></label>
      <label class="switch"><input type="checkbox" bind:checked={app.character.convenience.feast} onchange={persist} /><span>만찬 5%</span></label>
    </div>
    <div class="switch-row compact-switches" role="group" aria-label="공격 방향">
      <label class="switch"><input type="checkbox" bind:checked={app.character.settings.backAttack} onchange={persist} /><span>백어택</span></label>
      <label class="switch"><input type="checkbox" bind:checked={app.character.settings.headAttack} onchange={persist} /><span>헤드어택</span></label>
    </div>
    <div class="switch-row compact-switches" role="group" aria-label="DPS 보정">
      <label class="switch"><input type="checkbox" bind:checked={app.character.settings.includeCooldown} onchange={persist} /><span>쿨감 반영</span></label>
      <label class="switch"><input type="checkbox" bind:checked={app.character.settings.includeAttackSpeed} onchange={persist} /><span>공속 반영</span></label>
    </div>
  </section>

  <section class="config-section accessory-section">
    <div class="config-section-heading">
      <h3>악세서리</h3>
      <ResetButton label="악세서리 초기화" onclick={() => resetSection("accessories")} />
    </div>
    <div class="accessory-list">
      <div class="accessory-row necklace-row">
        <strong>목걸이</strong>
        <label>
          <span>추가 피해</span>
          <select bind:value={app.character.accessories.necklace.additionalDamage} onchange={persist}>
            <option value="none">없음</option><option value="high">상 · 2.60%</option>
            <option value="mid">중 · 1.60%</option><option value="low">하 · 0.60%</option>
          </select>
        </label>
      </div>
      <div class="accessory-row muted-accessory"><strong>귀걸이 1</strong><span>현재 계산 옵션 없음</span></div>
      <div class="accessory-row muted-accessory"><strong>귀걸이 2</strong><span>현재 계산 옵션 없음</span></div>
      {#each [0, 1] as ring}
        <div class="accessory-row ring-row">
          <strong>반지 {ring + 1}</strong>
          <label>
            <span>치적</span>
            <select bind:value={app.character.accessories.rings[ring].critRate} onchange={persist}>
              <option value="none">없음</option><option value="high">상 · 1.55%</option>
              <option value="mid">중 · 0.95%</option><option value="low">하 · 0.40%</option>
            </select>
          </label>
          <label>
            <span>치피</span>
            <select bind:value={app.character.accessories.rings[ring].critDamage} onchange={persist}>
              <option value="none">없음</option><option value="high">상 · 4.00%</option>
              <option value="mid">중 · 2.40%</option><option value="low">하 · 1.10%</option>
            </select>
          </label>
        </div>
      {/each}
    </div>
  </section>

  <section class="config-section bracelet-summary-section">
    <div class="config-section-heading">
      <h3>팔찌</h3>
      <div class="section-heading-actions">
        <ResetButton label="팔찌 초기화" onclick={() => resetSection("bracelet")} />
        <button class="mini-button" type="button" onclick={onOpenBracelet}>설정</button>
      </div>
    </div>
    <div class="selected-bracelet-list">
      {#if braceletChips.length === 0}
        <span class="selected-bracelet-empty">선택 없음</span>
      {:else}
        {#each braceletChips as chip}<span class="selected-bracelet">{chip}</span>{/each}
      {/if}
    </div>
  </section>

  <section class="config-section engraving-summary-section">
    <div class="config-section-heading">
      <h3>각인</h3>
      <div class="section-heading-actions">
        <ResetButton label="각인 초기화" onclick={() => resetSection("engravings")} />
        <button class="mini-button" type="button" onclick={onOpenEngravings}>설정</button>
      </div>
    </div>
    <div class="selected-engraving-list">
      {#if activeEngravings.length === 0}
        <span class="selected-engraving-empty">선택 없음</span>
      {:else}
        {#each activeEngravings as item (item.id)}
          {@const tier = ENGRAVING_TIERS[getEngravingTierIndex(app.character.engravings[item.id])]}
          {@const active = isDirectionalConditionActive(item.condition, app.character.settings)}
          <span class="selected-engraving">{item.name} · {tier.label}{active ? "" : " · 미적용"}</span>
        {/each}
      {/if}
    </div>
  </section>

  <details class="config-disclosure">
    <summary>직접 입력 효과</summary>
    <div class="subheading">
      <h3>기본 효과</h3>
      <div class="section-heading-actions">
        <ResetButton label="직접 입력 효과 초기화" onclick={() => resetSection("baseEffects")} />
        <button class="mini-button" type="button" onclick={addEffect}>추가</button>
      </div>
    </div>
    <div class="effect-list">
      {#each app.character.baseEffects as effect (effect.id)}
        <div class="effect-row">
          <input type="text" aria-label="효과 이름" bind:value={effect.label} onchange={persist} />
          <select aria-label="효과 종류" bind:value={effect.category} onchange={persist}>
            {#each EFFECT_CATEGORIES as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
          {#if effect.category === "customDamage"}
            <input type="text" aria-label="피해 그룹 이름" bind:value={effect.customCategory} onchange={persist} />
          {/if}
          <input type="number" step="0.01" aria-label="수치" bind:value={effect.amount} onchange={persist} />
          <button class="icon-button small" type="button" aria-label="삭제" onclick={() => removeEffect(effect.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14" /></svg>
          </button>
        </div>
      {/each}
    </div>
  </details>
</aside>
