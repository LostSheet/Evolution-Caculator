<script>
  import { EFFECT_CATEGORIES } from "../core/data.js";
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS } from "../core/bracelets.js";
  import { CHAOS_CORE_SLOTS, CHAOS_CORES } from "../core/cores.js";
  import { getEngravingTierIndex, getBraceletGradeIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import { makeId, formatInteger, clamp, readNumber } from "../core/util.js";
  import { app, persist, resetSection } from "../store.svelte.js";

  let { open = $bindable(false), onOpenEngravings, onOpenBracelet, onOpenArkGrid } = $props();

  let element = $state(null);

  $effect(() => {
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  });

  const manaShare = $derived(clamp(Math.round(readNumber(app.character.convenience.manaShare)), 0, 100));

  const STATS = [
    { key: "critStat", label: "치명" },
    { key: "specStat", label: "특화" },
    { key: "swiftStat", label: "신속" },
  ];
  const TUNING = [
    { key: "baseCritRate", label: "기본 치적 %" },
    { key: "critDamageBonus", label: "추가 치피 %" },
    { key: "specDamagePer100", label: "특화 효율 % / 100" },
  ];
  const GRADES = ["none", "high", "mid", "low"];
  const CRIT_RATE_LABELS = { none: "없음", high: "상 1.55%", mid: "중 0.95%", low: "하 0.40%" };
  const CRIT_DMG_LABELS = { none: "없음", high: "상 4.00%", mid: "중 2.40%", low: "하 1.10%" };

  const activeEngravings = $derived(
    ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(app.character.engravings[item.id]) >= 0),
  );

  const gridChips = $derived.by(() => {
    const grid = app.character.arkGrid;
    const chips = CHAOS_CORE_SLOTS
      .map(slot => ({ slot, core: CHAOS_CORES.find(c => c.id === grid.cores[slot.key]?.id) }))
      .filter(entry => entry.core)
      .map(entry => `${entry.slot.label} ${entry.core.name} ${grid.cores[entry.slot.key].points}P`);
    const gem = clamp(Math.round(readNumber(grid.gemLevel)), 0, 10);
    if (gem > 0) chips.push(`젬 Lv${gem}`);
    if (app.character.collection.ranch) chips.push("목장 도감");
    const stats = [["critStat", "치명"], ["specStat", "특화"], ["swiftStat", "신속"]]
      .filter(([key]) => readNumber(app.character.collection[key]) > 0)
      .map(([key, label]) => `${label} +${formatInteger(app.character.collection[key])}`);
    if (stats.length > 0) chips.push(`도감·물약 ${stats.join(" ")}`);
    return chips;
  });
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
      <section class="section">
        <div class="section-hd">
          <h3>전투 특성</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="전투 특성 초기화" onclick={() => resetSection("combat")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>
        <div class="fields">
          {#each STATS as stat}
            <div class="field">
              <label for="d-{stat.key}">{stat.label}</label>
              <input id="d-{stat.key}" type="number" min="0" step="1"
                     bind:value={app.character.base[stat.key]} onchange={persist} />
            </div>
          {/each}
          {#each TUNING as tune}
            <div class="field">
              <label for="d-{tune.key}">{tune.label}</label>
              <input id="d-{tune.key}" type="number" step="0.01"
                     bind:value={app.character.base[tune.key]} onchange={persist} />
            </div>
          {/each}
          <div class="field">
            <label for="d-budget">진화 포인트</label>
            <input id="d-budget" type="number" min="0" step="1"
                   bind:value={app.character.settings.pointBudget} onchange={persist} />
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-hd">
          <h3>편의 설정</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="편의 설정 초기화" onclick={() => resetSection("convenience")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>
        <div class="fields">
          <div class="field">
            <label for="d-pet">펫 효과</label>
            <select id="d-pet" bind:value={app.character.convenience.petStat} onchange={persist}>
              <option value="none">사용 안 함</option>
              <option value="critStat">치명 +160</option>
              <option value="specStat">특화 +160</option>
              <option value="swiftStat">신속 +160</option>
            </select>
          </div>
          <div class="field">
            <label for="d-karma">진화 카르마</label>
            <select id="d-karma" bind:value={app.character.convenience.evolutionKarmaRank} onchange={persist}>
              {#each [0, 1, 2, 3, 4, 5, 6] as rank}
                <option value={rank}>{rank}랭크{rank > 0 ? ` · +${rank}%` : ""}</option>
              {/each}
            </select>
          </div>
        </div>

        <label class="slider" for="d-mana">
          <span class="slider-top">
            마나 스킬 딜 비중
            <strong class:off={manaShare >= 100}>{manaShare}%</strong>
          </span>
          <input id="d-mana" type="range" min="0" max="100" step="5"
                 bind:value={app.character.convenience.manaShare} onchange={persist} />
          <p>
            전체 딜 중 마나를 소모하는 스킬이 차지하는 비율.
            <strong>마나 효율 증가 각인, 마나 용광로, 금단의 주문 마나 추가분</strong>에만 적용됩니다.
          </p>
        </label>
        <details class="aside">
          <summary>끝없는 마나 · 무한한 마력 쿨감은 왜 안 깎이나요?</summary>
          <ul>
            <li>쿨감이 30% 당겨지면 스택·게이지 축적 속도도 같이 30% 빨라져 사이클 전체가 당겨집니다.</li>
            <li>주력기가 마나를 쓰지 않아도 끝마/무마 쿨감은 그대로 이득이라 비중으로 깎지 않습니다.</li>
          </ul>
        </details>

        <div class="checks">
          <label class="check"><input type="checkbox" bind:checked={app.character.convenience.goddessBlessing} onchange={persist} /><span>축복의 여신 9%</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.convenience.feast} onchange={persist} /><span>만찬 5%</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.backAttack} onchange={persist} /><span>백어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.headAttack} onchange={persist} /><span>헤드어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.includeCooldown} onchange={persist} /><span>쿨감 반영</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.includeAttackSpeed} onchange={persist} /><span>공속 반영</span></label>
        </div>
      </section>

      <section class="section">
        <div class="section-hd">
          <h3>아크 그리드</h3>
          <span class="spacer"></span>
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

      <section class="section">
        <div class="section-hd">
          <h3>악세서리</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="악세서리 초기화" onclick={() => resetSection("accessories")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
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

      <section class="section">
        <div class="section-hd">
          <h3>팔찌</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="팔찌 초기화" onclick={() => resetSection("bracelet")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
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

      <section class="section">
        <div class="section-hd">
          <h3>각인</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="각인 초기화" onclick={() => resetSection("engravings")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
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

      <section class="section">
        <div class="section-hd">
          <h3>직접 입력 효과</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="직접 입력 효과 초기화" onclick={() => resetSection("baseEffects")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
          <button class="btn sm" type="button" onclick={addEffect}>추가</button>
        </div>
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
