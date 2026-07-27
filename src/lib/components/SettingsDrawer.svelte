<script>
  import { EFFECT_CATEGORIES, NODE_LIBRARY } from "../core/data.js";
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS } from "../core/bracelets.js";
  import {
    CHAOS_CORE_SLOTS, CHAOS_CORES, STANDALONE_SOURCES,
    WEAPON_QUALITY_MAX, weaponQualityDamage,
  } from "../core/cores.js";
  import {
    getEngravingTierIndex, getBraceletGradeIndex, isDirectionalConditionActive, getNodeCost,
  } from "../core/metrics.js";
  import { makeId, formatNumber, formatInteger, clamp, readNumber } from "../core/util.js";
  import { app, persist, resetSection } from "../store.svelte.js";

  let { open = $bindable(false), onOpenEngravings, onOpenBracelet, onOpenArkGrid } = $props();

  let element = $state(null);

  $effect(() => {
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  });

  const manaShare = $derived(clamp(Math.round(readNumber(app.character.convenience.manaShare)), 0, 100));
  const nodePoints = $derived(
    NODE_LIBRARY.reduce(
      (sum, node) => sum + (app.character.nodeLevels[node.id] || 0) * getNodeCost(node),
      0,
    ),
  );
  const weaponDamage = $derived(
    weaponQualityDamage(clamp(Math.round(readNumber(app.character.weapon.quality)), 0, WEAPON_QUALITY_MAX)),
  );

  const STATS = [
    { key: "critStat", label: "치명" },
    { key: "specStat", label: "특화" },
    { key: "swiftStat", label: "신속" },
  ];
  const GRADES = ["none", "high", "mid", "low"];
  const CRIT_RATE_LABELS = { none: "없음", high: "상 1.55%", mid: "중 0.95%", low: "하 0.40%" };
  const CRIT_DMG_LABELS = { none: "없음", high: "상 4.00%", mid: "중 2.40%", low: "하 1.10%" };

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
        const on = isDirectionalConditionActive(entry.item.condition, app.character.settings);
        return `${entry.item.name} · ${BRACELET_GRADES[entry.gradeIndex].label}${on ? "" : " · 미적용"}`;
      }),
  ]);
  const gridChips = $derived.by(() => {
    const grid = app.character.arkGrid;
    const chips = CHAOS_CORE_SLOTS
      .map(slot => ({ slot, core: CHAOS_CORES.find(c => c.id === grid.cores[slot.key]?.id) }))
      .filter(entry => entry.core)
      .map(entry => `${entry.slot.label} ${entry.core.name} ${grid.cores[entry.slot.key].points}P`);
    const gem = clamp(Math.round(readNumber(grid.gemLevel)), 0, 10);
    if (gem > 0) chips.push(`젬 Lv${gem}`);
    return chips;
  });

  function addEffect() {
    app.character.baseEffects.push({
      id: makeId(), label: "새 효과", category: "damage:진화형 피해", customCategory: "", amount: 0,
    });
    persist();
  }

  function removeEffect(id) {
    app.character.baseEffects = app.character.baseEffects.filter(effect => effect.id !== id);
    persist();
  }
</script>

{#snippet resetButton(label, section)}
  <button class="reset" type="button" aria-label={label} onclick={() => resetSection(section)}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
  </button>
{/snippet}

<dialog class="drawer" bind:this={element} onclose={() => (open = false)}
        onclick={e => { if (e.target === element) open = false; }}>
  <div class="drawer-shell">
    <header class="drawer-hd">
      <h2>캐릭터 설정</h2>
      <span class="spacer"></span>
      <span class="eyebrow">탐색 중 고정</span>
      <button class="btn icon" type="button" aria-label="닫기" onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>

    <div class="drawer-body">
      <!-- 탐색이 바꾸는 것 -->
      <section class="section">
        <div class="section-hd">
          <h3>탐색 대상 <em class="tag">노드 · 각인 · 펫</em></h3>
        </div>
        <div class="fields">
          <div class="field">
            <span>진화 노드</span>
            <div class="readout">
              <b>{formatInteger(nodePoints)} / {formatInteger(app.character.settings.pointBudget)}P</b>
              <button class="btn sm" type="button" onclick={() => (open = false)}>보드에서 편집</button>
            </div>
          </div>
          <div class="field">
            <label for="d-pet">펫 효과</label>
            <select id="d-pet" bind:value={app.character.convenience.petStat} onchange={persist}>
              <option value="none">사용 안 함</option>
              <option value="critStat">치명 +160</option>
              <option value="specStat">특화 +160</option>
              <option value="swiftStat">신속 +160</option>
            </select>
          </div>
        </div>

        <div class="section-hd" style="margin-top:12px">
          <h4 class="sub">각인</h4>
          <span class="spacer"></span>
          {@render resetButton("각인 초기화", "engravings")}
          <button class="btn sm" type="button" onclick={onOpenEngravings}>편집</button>
        </div>
        <div class="summary-line">
          {#if activeEngravings.length === 0}
            <span class="empty">선택 없음</span>
          {:else}
            {#each activeEngravings as item (item.id)}
              {@const tier = ENGRAVING_TIERS[getEngravingTierIndex(app.character.engravings[item.id])]}
              {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
              <span class="chip">{item.name} · {tier.label}{on ? "" : " · 미적용"}</span>
            {/each}
          {/if}
        </div>
      </section>

      <!-- 1 · 무기 · 도감 -->
      <section class="section">
        <div class="section-hd">
          <h3>무기 · 도감</h3>
          <span class="spacer"></span>
          {@render resetButton("무기 · 도감 초기화", "gear")}
        </div>
        <div class="fields">
          <div class="field">
            <label for="d-quality">무기 품질 <em>0~{WEAPON_QUALITY_MAX}</em></label>
            <div class="with-sheet">
              <input id="d-quality" type="number" min="0" max={WEAPON_QUALITY_MAX} step="1"
                     bind:value={app.character.weapon.quality} onchange={persist} />
              <small class="derived">→ 무기 추가 피해 +{formatNumber(weaponDamage)}%</small>
            </div>
          </div>
          {#each STATS as stat}
            <div class="field">
              <label for="d-col-{stat.key}">도감 · 물약 {stat.label}</label>
              <input id="d-col-{stat.key}" type="number" min="0" step="1"
                     bind:value={app.character.collection[stat.key]} onchange={persist} />
            </div>
          {/each}
        </div>
        <label class="check">
          <input type="checkbox" bind:checked={app.character.collection.ranch} onchange={persist} />
          <span>{STANDALONE_SOURCES.ranchCollection.label} · {STANDALONE_SOURCES.ranchCollection.summary}</span>
        </label>
        <details class="note">
          <summary>무기 품질 계산</summary>
          <p>
            <b>y = 0.002x² + 10</b> — 품질 0에서도 10%, 100에서 30%입니다.
            이름이 다른 피해 그룹이라 일반 추가 피해와 합산되지 않고 곱연산됩니다.
          </p>
        </details>
      </section>

      <!-- 2 · 악세서리 -->
      <section class="section">
        <div class="section-hd">
          <h3>악세서리</h3>
          <span class="spacer"></span>
          {@render resetButton("악세서리 초기화", "accessories")}
        </div>
        <div class="fields">
          <div class="slot">
            <strong>목걸이</strong>
            <div class="pair">
              <label>
                <span>추가 피해</span>
                <select bind:value={app.character.accessories.necklace.additionalDamage} onchange={persist}>
                  <option value="none">없음</option>
                  <option value="high">상 2.60%</option>
                  <option value="mid">중 1.60%</option>
                  <option value="low">하 0.60%</option>
                </select>
              </label>
            </div>
          </div>
          <div class="slot empty"><strong>귀걸이</strong><span>계산 옵션 없음</span></div>
          {#each [0, 1] as ring}
            <div class="slot">
              <strong>반지 {ring + 1}</strong>
              <div class="pair">
                <label>
                  <span>치적</span>
                  <select bind:value={app.character.accessories.rings[ring].critRate} onchange={persist}>
                    {#each GRADES as grade}<option value={grade}>{CRIT_RATE_LABELS[grade]}</option>{/each}
                  </select>
                </label>
                <label>
                  <span>치피</span>
                  <select bind:value={app.character.accessories.rings[ring].critDamage} onchange={persist}>
                    {#each GRADES as grade}<option value={grade}>{CRIT_DMG_LABELS[grade]}</option>{/each}
                  </select>
                </label>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- 3 · 팔찌 -->
      <section class="section">
        <div class="section-hd">
          <h3>팔찌</h3>
          <span class="spacer"></span>
          {@render resetButton("팔찌 초기화", "bracelet")}
          <button class="btn sm" type="button" onclick={onOpenBracelet}>편집</button>
        </div>
        <div class="summary-line">
          {#if braceletChips.length === 0}
            <span class="empty">선택 없음</span>
          {:else}
            {#each braceletChips as chip}<span class="chip">{chip}</span>{/each}
          {/if}
        </div>
      </section>

      <!-- 4 · 진화 카르마 -->
      <section class="section">
        <div class="section-hd">
          <h3>진화 카르마</h3>
          <span class="spacer"></span>
          {@render resetButton("진화 카르마 초기화", "karma")}
        </div>
        <div class="fields">
          <div class="field">
            <label for="d-karma">랭크</label>
            <select id="d-karma" bind:value={app.character.convenience.evolutionKarmaRank} onchange={persist}>
              {#each [0, 1, 2, 3, 4, 5, 6] as rank}
                <option value={rank}>{rank}랭크{rank > 0 ? ` · 진화형 피해 +${rank}%` : ""}</option>
              {/each}
            </select>
          </div>
        </div>
      </section>

      <!-- 5 · 아크 그리드 -->
      <section class="section">
        <div class="section-hd">
          <h3>아크 그리드</h3>
          <span class="spacer"></span>
          {@render resetButton("아크 그리드 초기화", "arkGrid")}
          <button class="btn sm" type="button" onclick={onOpenArkGrid}>편집</button>
        </div>
        <div class="summary-line">
          {#if gridChips.length === 0}
            <span class="empty">선택 없음</span>
          {:else}
            {#each gridChips as chip}<span class="chip">{chip}</span>{/each}
          {/if}
        </div>
      </section>

      <!-- 전투 상황 -->
      <section class="section">
        <div class="section-hd">
          <h3>전투 상황</h3>
          <span class="spacer"></span>
          {@render resetButton("전투 상황 초기화", "convenience")}
        </div>
        <div class="checks">
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.backAttack} onchange={persist} /><span>백어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.headAttack} onchange={persist} /><span>헤드어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.convenience.goddessBlessing} onchange={persist} /><span>축복의 여신 9%</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.convenience.feast} onchange={persist} /><span>만찬 5%</span></label>
        </div>
        <details class="note">
          <summary>방향 설정이 바꾸는 것</summary>
          <p>
            방향성 각인(결투의 대가 · 기습의 대가 · 타격의 대가)과 팔찌의 방향 옵션이 여기에 걸립니다.
            조건이 맞지 않으면 수치를 반영하지 않습니다.
          </p>
        </details>
      </section>

      <!-- 계산 기준 -->
      <section class="section">
        <div class="section-hd">
          <h3>계산 기준</h3>
        </div>
        <div class="checks single">
          <label class="check">
            <input type="checkbox" bind:checked={app.character.settings.includeCooldown} onchange={persist} />
            <span>쿨감을 DPS에 반영</span>
          </label>
        </div>
        <div class="fields">
          <div class="field">
            <label for="d-spec">특화 효율 % / 100</label>
            <input id="d-spec" type="number" step="0.01"
                   bind:value={app.character.base.specDamagePer100} onchange={persist} />
          </div>
        </div>
        <label class="slider" for="d-mana">
          <span class="slider-top">
            마나 스킬 딜 비중
            <strong class:off={manaShare >= 100}>{manaShare}%</strong>
          </span>
          <input id="d-mana" type="range" min="0" max="100" step="5"
                 bind:value={app.character.convenience.manaShare} onchange={persist} />
        </label>
        <details class="note">
          <summary>마나 스킬 딜 비중</summary>
          <p>
            전체 딜 중 마나를 소모하는 스킬이 차지하는 비율.
            <b>마나 효율 증가 각인 · 마나 용광로 · 금단의 주문 마나 추가분</b>에만 적용됩니다.
          </p>
          <p>
            끝없는 마나 · 무한한 마력의 <b>쿨감은 이 비중으로 깎지 않습니다</b>.
            쿨감이 30% 당겨지면 스택·게이지 축적도 30% 빨라져 사이클 전체가 당겨지므로,
            주력기가 마나를 쓰지 않아도 그대로 이득입니다.
          </p>
        </details>
      </section>

      <section class="section">
        <div class="section-hd">
          <h3>직접 입력 효과</h3>
          <span class="spacer"></span>
          {@render resetButton("직접 입력 효과 초기화", "baseEffects")}
          <button class="btn sm" type="button" onclick={addEffect}>추가</button>
        </div>
        <details class="note">
          <summary>언제 쓰나요</summary>
          <p>위 항목에 자리가 없는 출처를 그룹으로 만들어 넣습니다. 치적 · 치피도 여기로 받습니다.</p>
        </details>
        <div class="effect-list">
          {#each app.character.baseEffects as effect (effect.id)}
            <div class="effect-row">
              <input class="boxed" type="text" aria-label="효과 이름" bind:value={effect.label} onchange={persist} />
              <select class="boxed" aria-label="효과 종류" bind:value={effect.category} onchange={persist}>
                {#each EFFECT_CATEGORIES as category}<option value={category.value}>{category.label}</option>{/each}
              </select>
              {#if effect.category === "customDamage"}
                <input class="boxed" type="text" aria-label="피해 그룹 이름"
                       bind:value={effect.customCategory} onchange={persist} />
              {/if}
              <input class="boxed" type="number" step="0.01" aria-label="수치"
                     bind:value={effect.amount} onchange={persist} />
              <button class="btn icon" type="button" aria-label="삭제" onclick={() => removeEffect(effect.id)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
</dialog>
