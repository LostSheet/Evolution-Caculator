<script>
  import { ARC_PASSIVE_CONSTANTS, EFFECT_CATEGORIES } from "../core/data.js";
  import { ENGRAVING_TIERS, ENGRAVING_LIBRARY } from "../core/engravings.js";
  import { getEngravingTierIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import { makeId, formatNumber, clamp, readNumber } from "../core/util.js";
  import { app, persist, resetSection, fixedRow, customRows, SNAPSHOT_ROWS } from "../store.svelte.js";

  let { open = $bindable(false), onOpenEngravings } = $props();

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

  // 창 표시값에는 특성 기여가 이미 섞여 있다. 입력칸은 잔여분을 받고,
  // 여기서 "게임에는 이렇게 뜬다"를 되짚어줘서 대조할 수 있게 한다.
  const sheet = $derived.by(() => {
    const base = app.character.base;
    const swiftSpeed = readNumber(base.swiftStat) * ARC_PASSIVE_CONSTANTS.attackSpeedPerSwift;
    return {
      critRate: readNumber(base.critStat) * ARC_PASSIVE_CONSTANTS.critRatePerCrit + readNumber(base.baseCritRate),
      critDamage: ARC_PASSIVE_CONSTANTS.baseCritDamage + readNumber(base.critDamageBonus),
      attackSpeedOnly: 100 + swiftSpeed + readNumber(fixedRow("attackSpeedOnly").amount),
      moveSpeedOnly: 100 + swiftSpeed + readNumber(fixedRow("moveSpeedOnly").amount),
      cooldownReduction: readNumber(base.swiftStat) * ARC_PASSIVE_CONSTANTS.cooldownPerSwift
        + readNumber(fixedRow("cooldownReduction").amount),
    };
  });

  const activeEngravings = $derived(
    ENGRAVING_LIBRARY.filter(item => getEngravingTierIndex(app.character.engravings[item.id]) >= 0),
  );

  function addCustom() {
    app.character.baseEffects.push({
      id: makeId(), label: "새 그룹", category: "customDamage", customCategory: "기타 피해", amount: 0,
    });
    persist();
  }

  function removeCustom(id) {
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
          <h3>진화 전 스냅샷</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="스냅샷 초기화" onclick={() => resetSection("snapshot")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>

        <p class="procedure">
          <b>진화 노드를 0으로 뒀을 때의 내 스펙</b>
          인게임에서 <b>노드 초기화 · 펫 해제 · 각인 해제</b> 후 전투 정보 창을 읽어 옮깁니다.
          젬 · 혼돈 코어 · 카드 · 악세서리 · 팔찌 · 진화 카르마는 <b>출처를 쪼개지 말고</b>
          도착지 한 칸에 합산해 넣으세요. 카르마 6%는 진화형 피해에 들어갑니다.
        </p>

        <div class="fields">
          {#each STATS as stat}
            <div class="field">
              <label for="d-{stat.key}">{stat.label}</label>
              <input id="d-{stat.key}" type="number" min="0" step="1"
                     bind:value={app.character.base[stat.key]} onchange={persist} />
            </div>
          {/each}

          <div class="field">
            <label for="d-crit">치명타 확률 <em>특성 제외</em></label>
            <div class="with-sheet">
              <input id="d-crit" type="number" step="0.01"
                     bind:value={app.character.base.baseCritRate} onchange={persist} />
              <small>창 {formatNumber(sheet.critRate)}%</small>
            </div>
          </div>

          <div class="field">
            <label for="d-cd">치명타 피해 <em>추가분</em></label>
            <div class="with-sheet">
              <input id="d-cd" type="number" step="0.01"
                     bind:value={app.character.base.critDamageBonus} onchange={persist} />
              <small>창 {formatNumber(sheet.critDamage)}%</small>
            </div>
          </div>

          {#each SNAPSHOT_ROWS as row}
            {@const effect = fixedRow(row.category)}
            <div class="field">
              <label for="d-{row.category}">
                {row.label}
                {#if row.sheet}<em>특성 제외</em>{/if}
              </label>
              {#if row.sheet}
                <div class="with-sheet">
                  <input id="d-{row.category}" type="number" step="0.01"
                         bind:value={effect.amount} onchange={persist} />
                  <small>창 {formatNumber(sheet[row.category])}%</small>
                </div>
              {:else}
                <input id="d-{row.category}" type="number" step="0.01"
                       bind:value={effect.amount} onchange={persist} />
              {/if}
            </div>
          {/each}

          {#each customRows() as effect (effect.id)}
            <div class="field custom">
              <input class="row-label" type="text" aria-label="그룹 이름"
                     bind:value={effect.customCategory} onchange={persist} />
              <div class="with-sheet">
                <select class="row-kind" aria-label="피해 그룹" bind:value={effect.category} onchange={persist}>
                  {#each EFFECT_CATEGORIES as category}<option value={category.value}>{category.label}</option>{/each}
                </select>
                <input type="number" step="0.01" aria-label="수치"
                       bind:value={effect.amount} onchange={persist} />
                <button class="reset" type="button" aria-label="삭제" onclick={() => removeCustom(effect.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14" />
                  </svg>
                </button>
              </div>
            </div>
          {/each}

          <div class="field">
            <label for="d-spec">특화 효율 % / 100</label>
            <input id="d-spec" type="number" step="0.01"
                   bind:value={app.character.base.specDamagePer100} onchange={persist} />
          </div>
          <div class="field">
            <label for="d-budget">진화 포인트</label>
            <input id="d-budget" type="number" min="0" step="1"
                   bind:value={app.character.settings.pointBudget} onchange={persist} />
          </div>
        </div>

        <button class="btn sm add-group" type="button" onclick={addCustom}>피해 그룹 추가</button>
      </section>

      <section class="section">
        <div class="section-hd">
          <h3>전투 조건</h3>
          <span class="spacer"></span>
          <button class="reset" type="button" aria-label="전투 조건 초기화" onclick={() => resetSection("convenience")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>

        <div class="checks">
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.backAttack} onchange={persist} /><span>백어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.headAttack} onchange={persist} /><span>헤드어택</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.convenience.goddessBlessing} onchange={persist} /><span>축복의 여신 9%</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.convenience.feast} onchange={persist} /><span>만찬 5%</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.includeCooldown} onchange={persist} /><span>쿨감 반영</span></label>
          <label class="check"><input type="checkbox" bind:checked={app.character.settings.includeAttackSpeed} onchange={persist} /><span>공속 반영</span></label>
        </div>

        <div class="fields">
          <div class="field">
            <label for="d-pet">펫 효과 <em>탐색 대상</em></label>
            <select id="d-pet" bind:value={app.character.convenience.petStat} onchange={persist}>
              <option value="none">사용 안 함</option>
              <option value="critStat">치명 +160</option>
              <option value="specStat">특화 +160</option>
              <option value="swiftStat">신속 +160</option>
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
      </section>

      <section class="section">
        <div class="section-hd">
          <h3>각인 <em class="tag">탐색 대상</em></h3>
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
    </div>
  </div>
</dialog>
