<script>
  import { EFFECT_CATEGORIES, ARC_PASSIVE_CONSTANTS } from "../core/data.js";
  import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS } from "../core/bracelets.js";
  import {
    CHAOS_CORE_SLOTS, CHAOS_CORES, STANDALONE_SOURCES,
    WEAPON_QUALITY_MAX, weaponQualityDamage,
  } from "../core/cores.js";
  import {
    getBraceletGradeIndex, isDirectionalConditionActive,
    DAMAGE_MIX_KEYS, DAMAGE_MIX_LABELS, getManaShareRatio, getManaCooldownShareRatio,
    FORMULA_VARIABLES, getFormulaStage, evaluateFormula, buildFormulaVariables, calculateMetrics,
    assembleAttack, baseAttackPower, RANCH_GRADES, resolveRanchMainStat, ranchResidual, JEWEL_MAX_LEVEL, jewelCooldown,
    AVATAR_SLOTS, AVATAR_GRADES, avatarTotal,
  } from "../core/metrics.js";
  import { makeId, formatNumber, formatInteger, formatSignedPercent, clamp, readNumber } from "../core/util.js";
  import { braceletValue } from "../core/explain.js";
  import { app, persist, resetSection, isOpen, setFold } from "../store.svelte.js";
  import Hint from "./Hint.svelte";
  import Select from "./Select.svelte";
  import ArkGridPanel from "./ArkGridPanel.svelte";

  let { onOpenBracelet, onOpenCharacter } = $props();

  // 딜 비중 — 네 갈래의 합이 100이 아니어도 비율로 환산해 쓴다. 합을 강제하면
  // 한 칸을 고칠 때마다 다른 칸이 튀어서 입력이 불가능해진다.
  const mix = $derived(app.character.convenience.damageMix);
  const mixTotal = $derived(DAMAGE_MIX_KEYS.reduce((sum, key) => sum + Math.max(0, readNumber(mix[key])), 0));
  const manaShare = $derived(getManaShareRatio(app.character.convenience) * 100);
  const manaCooldownShare = $derived(getManaCooldownShareRatio(app.character.convenience) * 100);
  // 100.00%는 잡음이다. 딱 떨어지면 정수로, 아니면 소수 둘째까지.
  const sharePct = value => `${Math.round(value * 100) / 100}%`;
  const weaponDamage = $derived(
    weaponQualityDamage(clamp(Math.round(readNumber(app.character.weapon.quality)), 0, WEAPON_QUALITY_MAX)),
  );

  // 공격력 축. 기준값이 비면 평면 증가를 못 세는데, 무엇을 못 셌는지는
  // 계산이 이미 알고 있다 — 여기서 다시 세지 않고 그대로 받아 적는다.
  // 적어 넣은 퍼센트가 어느 보석 레벨에 해당하는지 되짚어 보여준다.
  // 숫자만 있으면 8레벨을 낀 건지 9레벨을 낀 건지 알 수가 없다.
  const jewelHint = $derived.by(() => {
    const value = readNumber(app.character.jewel.cooldown);
    if (value <= 0) return "안 낌";
    const exact = [...Array(JEWEL_MAX_LEVEL + 1).keys()].find(level => jewelCooldown(level) === value);
    return exact ? `= ${exact}레벨` : "레벨이 섞임";
  });

  // 조립한 값으로 잰다 — 아바타·목장·카르마가 곱해진 뒤라야 게임 값과 맞는다.
  const attack = $derived(assembleAttack(app.character));
  const attackPower = $derived(baseAttackPower(attack));
  const awakeningKarmaPercent = $derived(
    Math.max(0, readNumber(app.character.convenience.awakeningKarmaLevel)) * ARC_PASSIVE_CONSTANTS.awakeningKarmaWeaponPerLevel,
  );
  // 목장 등급은 API가 안 알려 준다. 그래서 되짚기를 기본값으로 둔다 —
  // 게임이 알려 준 기본 공격력에서 힘민지 총합을 풀면, 아바타 몫을 뺀 나머지가
  // 목장이다. 되짚은 값을 그대로 옆에 적어 두므로 어긋나면 눈에 보인다.
  const RANCH_GRADE_OPTIONS = RANCH_GRADES.map(grade => ({ value: grade.value, label: grade.label }));
  const RANCH_OPTIONS = [{ value: "auto", label: "자동", hint: "역산" }, ...RANCH_GRADE_OPTIONS];
  const ranchPercent = $derived(resolveRanchMainStat(app.character));
  const ranchGuess = $derived(ranchResidual(app.character));

  const AVATAR_OPTIONS = AVATAR_GRADES.map(grade => ({
    value: grade.value,
    label: grade.label,
    hint: grade.amount > 0 ? `+${grade.amount}%` : "",
  }));
  const avatarPercent = $derived(avatarTotal(app.character.attack));

  function setAvatar(key, value) {
    app.character.attack.avatars = { ...app.character.attack.avatars, [key]: value };
    persist();
  }
  const staggerShare = $derived(readNumber(app.character.convenience.staggerShare));
  const dominationStat = $derived(calculateMetrics(app.character).totalStats.dominationStat);
  const staggerFromDomination = $derived(dominationStat * ARC_PASSIVE_CONSTANTS.staggerDamagePerDomination);
  const droppedFlat = $derived(calculateMetrics(app.character).droppedFlat ?? []);

  const STATS = [
    { key: "critStat", label: "치명" },
    { key: "specStat", label: "특화" },
    { key: "swiftStat", label: "신속" },
  ];
  const GRADES = ["none", "high", "mid", "low"];
  const CRIT_RATE_LABELS = { none: "없음", high: "상", mid: "중", low: "하" };
  const CRIT_DMG_LABELS = { none: "없음", high: "상", mid: "중", low: "하" };
  // 등급과 수치를 라벨/힌트로 나눠 두면 목록에서 두 열로 정렬되어 읽기 쉽다.
  const RING_CRIT_RATE_HINTS = { none: "", high: "1.55%", mid: "0.95%", low: "0.40%" };
  const RING_CRIT_DMG_HINTS = { none: "", high: "4.00%", mid: "2.40%", low: "1.10%" };

  const RING_CRIT_RATE_OPTIONS = GRADES.map(g => ({ value: g, label: CRIT_RATE_LABELS[g], hint: RING_CRIT_RATE_HINTS[g] }));
  const RING_CRIT_DMG_OPTIONS = GRADES.map(g => ({ value: g, label: CRIT_DMG_LABELS[g], hint: RING_CRIT_DMG_HINTS[g] }));
  // 연마 옵션은 값이 등급마다 못 박혀 있다. 목록에 수치를 같이 띄워야
  // 게임 툴팁과 눈으로 맞춰 볼 수 있다.
  const grindOptions = hints => GRADES.map(g => ({ value: g, label: CRIT_RATE_LABELS[g], hint: hints[g] ?? "" }));
  const NECKLACE_ADD_OPTIONS = grindOptions({ high: "2.60%", mid: "1.60%", low: "0.60%" });
  const NECKLACE_DEALT_OPTIONS = grindOptions({ high: "2.00%", mid: "1.20%", low: "0.55%" });
  const EARRING_ATTACK_OPTIONS = grindOptions({ high: "1.55%", mid: "0.95%", low: "0.40%" });
  const EARRING_WEAPON_OPTIONS = grindOptions({ high: "3.00%", mid: "1.80%", low: "0.80%" });
  // 접어 둔 악세서리 카드가 요약으로 내놓는 줄. 등급 열 개를 그대로 세면
  // 접은 보람이 없으므로 '상 몇 개'로 센다 — 연마를 볼 때 실제로 세는 단위다.
  const GRADE_ORDER = ["high", "mid", "low"];
  const accessoryChips = $derived.by(() => {
    const acc = app.character.accessories;
    const grades = [
      acc.necklace.additionalDamage, acc.necklace.dealtDamage,
      ...acc.earrings.flatMap(item => [item.attackPower, item.weaponAttack]),
      ...acc.rings.flatMap(item => [item.critRate, item.critDamage]),
    ];
    return GRADE_ORDER
      .map(grade => ({ grade, n: grades.filter(value => value === grade).length }))
      .filter(item => item.n > 0)
      .map(item => `${CRIT_RATE_LABELS[item.grade]} ${item.n}`);
  });

  const KARMA_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map(rank => ({
    value: rank,
    label: `${rank}랭크`,
    hint: rank > 0 ? `진화형 +${rank}%` : "",
  }));
  // 속도를 재료로 쓰는 줄은 속도 자체를 대상으로 삼을 수 없다. 속도가 정해진
  // 뒤에 걸리므로 되먹임이 없고, 아무 일도 안 일어난 것처럼 보이기 때문이다.
  const SPEED_TARGETS = new Set(["attackSpeedOnly", "moveSpeedOnly"]);
  const CATEGORY_OPTIONS = EFFECT_CATEGORIES.map(c => ({ value: c.value, label: c.label }));
  const CONVERSION_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter(c => !SPEED_TARGETS.has(c.value));

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

  // 팔찌를 껴서 얼마나 세졌나. 줄마다 그것만 뺐을 때와 견준다.
  const braceletWorth = $derived(braceletChips.length > 0 ? braceletValue(app.character) : null);

  const gridChips = $derived.by(() => {
    const grid = app.character.arkGrid;
    const chips = CHAOS_CORE_SLOTS
      .map(slot => ({ slot, core: CHAOS_CORES.find(c => c.id === grid.cores[slot.key]?.id) }))
      .filter(entry => entry.core)
      .map(entry => `${entry.slot.label} ${entry.core.name} ${grid.cores[entry.slot.key].points}P`);
    const gem = clamp(Math.round(readNumber(grid.gems?.additional)), 0, 60);
    if (gem > 0) chips.push(`젬 Lv${gem}`);
    return chips;
  });

</script>

{#snippet resetButton(label, section)}
  <!-- summary 안에 서는 단추라 기본 동작을 막아야 한다. 안 막으면 초기화할
       때마다 카드가 같이 접힌다. -->
  <button class="reset" type="button" aria-label={label} title={label}
          onclick={e => { e.preventDefault(); e.stopPropagation(); resetSection(section); }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
  </button>
{/snippet}

<!--
  이 페이지의 첫 걸음은 아래 칸을 하나씩 채우는 게 아니라 게임에서 읽어 오는
  것이다. 그 단추가 상단바 구석에만 있어서 처음 온 사람은 빈 칸부터 손으로
  메우기 시작했다. 흐름의 첫 줄로 옮긴다 — 상단바 것은 아무 데서나 쓰는
  지름길로 남는다.
-->
<section class="card lead-load">
  <div class="lead-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6" /><path d="M5 20.2a7.2 7.2 0 0 1 14 0" /></svg>
  </div>
  <div class="lead-text">
    <b>캐릭터 정보를 불러옵니다</b>
  </div>
  <span class="spacer"></span>
  <button class="btn primary" type="button" onclick={onOpenCharacter}>캐릭터 불러오기</button>
</section>

<div class="setup-grid">
  <div class="setup-col">
    <!-- 1 · 무기 · 도감 -->
    <details class="card card-fold" open={isOpen("gear")} ontoggle={e => setFold("gear", e.currentTarget.open)}>
        <summary>
          <h2>무기 · 도감</h2>
          <span class="fold-note">품질 {formatInteger(readNumber(app.character.weapon.quality))} · 보석 쿨감 {formatNumber(readNumber(app.character.jewel.cooldown))}%</span>
          <span class="spacer"></span>
          {@render resetButton("무기 · 도감 초기화", "gear")}
        </summary>
        <div class="card-body">
          <div class="fields">
            <div class="field">
              <span class="field-label">
                <label for="s-quality">무기 품질 <em>0~{WEAPON_QUALITY_MAX}</em></label>
                <Hint label="무기 품질 계산">
                  <p><b>y = 0.002x² + 10</b> — 품질 0에서 10%, 100에서 30%.</p>
                  <p>일반 추가 피해와 같은 그룹으로 합산됩니다.</p>
                </Hint>
              </span>
              <div class="with-sheet">
                <input id="s-quality" type="number" min="0" max={WEAPON_QUALITY_MAX} step="1"
                       bind:value={app.character.weapon.quality} onchange={persist} />
                <small class="derived">→ 추가 피해 +{formatNumber(weaponDamage)}%</small>
              </div>
            </div>
            <div class="field">
              <span class="field-label">
                <label for="s-jewel">보석 쿨감 <em>%</em></label>
                <Hint label="보석 쿨감">
                  <p>작열 · 광휘 보석. <b>(레벨 + 2) × 2</b> — 7레벨 18%, 8레벨 20%.</p>
                  <p>다른 쿨감과 <b>곱연산</b>입니다.</p>
                </Hint>
              </span>
              <div class="with-sheet">
                <input id="s-jewel" type="number" min="0" max="100" step="0.01"
                       bind:value={app.character.jewel.cooldown} onchange={persist} />
                <small class="derived">{jewelHint}</small>
              </div>
            </div>
            {#each STATS as stat}
              <div class="field">
                <label for="s-col-{stat.key}">도감 · 물약 {stat.label}</label>
                <input id="s-col-{stat.key}" type="number" min="0" step="1"
                       bind:value={app.character.collection[stat.key]} onchange={persist} />
              </div>
            {/each}
          </div>
          <!-- 목장 한 등급이 추가 피해와 힘민지 양쪽에 같은 퍼센트로 붙는다.
               힘민지 쪽은 아바타와 합연산이라 assembleAttack이 같이 받는다. -->
          <!-- 목장은 둘이다. 추가 피해를 주는 것과 힘민지를 주는 것이 따로 있고
               등급도 따로 매긴다. -->
          <div class="field">
            <span>펫 목장 · 추가 피해</span>
            <Select label="추가 피해 목장" options={RANCH_GRADE_OPTIONS}
                    value={app.character.collection.ranchDamage ?? 0}
                    onchange={next => { app.character.collection.ranchDamage = next; persist(); }} />
          </div>
          <div class="field">
            <span class="field-label">
              <span>펫 목장 · 힘민지</span>
              <Hint label="힘민지 목장">
                <p>기본 공격력에서 역산할 수 있어 <b>자동</b>이 기본값입니다.</p>
                <p>도감 · 물약 힘민지가 섞여 한 등급 높게 잡힐 수 있습니다.</p>
              </Hint>
            </span>
            <Select label="힘민지 목장" options={RANCH_OPTIONS}
                    value={app.character.collection.ranchMainStat ?? "auto"}
                    onchange={next => { app.character.collection.ranchMainStat = next; persist(); }} />
            <small class="derived">
              {ranchGuess === null ? `${formatNumber(ranchPercent)}%` : `역산 ${formatNumber(ranchGuess)}% → ${formatNumber(ranchPercent)}%`}
            </small>
          </div>
        </div>
      </details>

    <!-- 2.4 · 아바타 — 힘민지 퍼센트만 딜에 온다. -->
    <details class="card card-fold" open={isOpen("avatar")} ontoggle={e => setFold("avatar", e.currentTarget.open)}>
      <summary>
        <h2>아바타</h2>
        <span class="fold-note">{formatNumber(avatarPercent)}%</span>
        <Hint label="아바타">
          <p>무기 · 머리 · 상의 · 하의 네 부위만 힘민지를 줍니다.</p>
          <p>전설 <b>2%</b>, 영웅 <b>1%</b>. <b>부위당 하나</b>만 셉니다 — 속옷과 겉옷을 다 세면 넘칩니다.</p>
          <p>펫 목장과 <b>합연산</b>입니다. 전설 4부위 8% + 목장 1% = 힘민지 ×1.09.</p>
        </Hint>
        <span class="spacer"></span>
      </summary>
      <div class="card-body">
        <!-- 퍼센트 한 칸이 아니라 부위 넷이다. 8%만 남으면 어느 자리가 비었는지,
             영웅 하나를 전설로 갈면 얼마가 오르는지 알 수가 없었다. -->
        <div class="fields">
          {#each AVATAR_SLOTS as slot (slot.key)}
            <div class="field">
              <span>{slot.label}</span>
              <Select label="{slot.label} 아바타" options={AVATAR_OPTIONS}
                      value={app.character.attack.avatars?.[slot.key] ?? "none"}
                      onchange={next => setAvatar(slot.key, next)} />
            </div>
          {/each}
          <div class="field">
            <span>네 부위 합</span>
            <span class="derived">
              {formatNumber(avatarPercent)}% · 목장까지 합쳐 ×{formatNumber(1 + (avatarPercent + ranchPercent) / 100)}
            </span>
          </div>
        </div>
      </div>
    </details>

    <!-- 2.5 · 공격력 — 접어 둔다.
         이 계산기가 정하는 것은 진화 배분이고, 무기 공격력은 그 배분을 안 바꾼다.
         팔찌의 평면 무공을 퍼센트로 환산할 때만 쓰는 기준값이라 늘 펴 둘 이유가
         없다. 지우지도 않는다 — 없으면 평면 항목이 조용히 빠진다. -->
      <details class="card card-fold" open={isOpen("attack")} ontoggle={e => setFold("attack", e.currentTarget.open)}>
        <summary>
          <h2>공격력</h2>
          {#if attackPower > 0}
            <span class="fold-note">기본 {formatInteger(attackPower)}</span>
          {:else}
            <span class="fold-note">비어 있음</span>
          {/if}
          <span class="spacer"></span>
          {@render resetButton("공격력 초기화", "attack")}
        </summary>
        <div class="card-body">
          <!-- 불러오기가 조각을 채웠으면 그것으로 쌓는다. 예전에는 게임이 알려 준
               기본 공격력에서 √식을 뒤집어 되짚었는데, 그 값이 실제와 32%
               어긋났다 — 그 식은 지금 게임을 재현하지 못한다. -->
          {#if app.character.attack.mainFlat > 0 || app.character.attack.weaponFlat > 0}
            <dl class="attack-parts">
              <div>
                <dt>무기 공격력</dt>
                <dd>
                  {formatInteger(app.character.attack.weaponFlat)}
                  <em>× (1 + 연마 {formatNumber(app.character.attack.weaponPercent)}% + 카르마 {formatNumber(awakeningKarmaPercent)}%)</em>
                  <b>{formatInteger(attack.weaponAttack)}</b>
                </dd>
              </div>
              <div>
                <dt>힘 · 민첩 · 지능</dt>
                <dd>
                  {formatInteger(app.character.attack.mainFlat)}
                  <em>× (1 + 아바타 {formatNumber(app.character.attack.avatarPercent)}% + 목장 {formatNumber(ranchPercent)}%)</em>
                  <b>{formatInteger(attack.mainStat)}</b>
                </dd>
              </div>
            </dl>
          {:else}
            <div class="fields">
              <div class="field">
                <label for="s-weapon-attack">무기 공격력</label>
                <input id="s-weapon-attack" type="number" min="0" step="1" placeholder="0"
                       bind:value={app.character.attack.weaponAttack} onchange={persist} />
              </div>
              <div class="field">
                <label for="s-main-stat">힘 · 민첩 · 지능</label>
                <input id="s-main-stat" type="number" min="0" step="1" placeholder="0"
                       bind:value={app.character.attack.mainStat} onchange={persist} />
              </div>
            </div>
          {/if}
          {#if attackPower === 0}
            <div class="summary-line">
              <span class="empty">둘 다 채워야 평면 증가를 셀 수 있습니다</span>
            </div>
          {/if}
          {#if droppedFlat.length > 0}
            <!-- 조용히 빠지면 왜 수치가 안 맞는지 알 수가 없다. -->
            <p class="setup-warn">
              기준값이 없어 {droppedFlat.map(item => `${item.label} +${formatInteger(item.amount)}`).join(", ")} 을(를) 못 셌습니다.
            </p>
          {/if}
        </div>
      </details>

  </div>

  <div class="setup-col">
    <!-- 2 · 악세서리 — 접을 수는 있게 두되 펴 놓고 시작한다.
         칸이 열 개라 접고 싶어지지만, 이 열에는 팔찌밖에 없어서 접으면 2열이
         통째로 비고 1열만 길어진다. 밀도를 줄이려다 읽는 흐름이 깨진다. -->
    <details class="card card-fold" open={isOpen("accessories")} ontoggle={e => setFold("accessories", e.currentTarget.open)}>
        <summary>
          <h2>악세서리</h2>
          <span class="fold-note">
            {accessoryChips.length > 0 ? accessoryChips.join(" · ") : "비어 있음"}
          </span>
          <span class="spacer"></span>
          {@render resetButton("악세서리 초기화", "accessories")}
        </summary>
        <div class="card-body">
          <div class="fields">
            <div class="slot">
              <strong>목걸이</strong>
              <div class="pair">
                <div class="pair-item">
                  <span>추가 피해</span>
                  <Select label="목걸이 추가 피해" options={NECKLACE_ADD_OPTIONS}
                          bind:value={app.character.accessories.necklace.additionalDamage} onchange={persist} />
                </div>
                <div class="pair-item">
                  <span>적주피</span>
                  <Select label="목걸이 적에게 주는 피해" options={NECKLACE_DEALT_OPTIONS}
                          bind:value={app.character.accessories.necklace.dealtDamage} onchange={persist} />
                </div>
              </div>
            </div>
            {#each [0, 1] as earring}
              <div class="slot">
                <strong>귀걸이 {earring + 1}</strong>
                <div class="pair">
                  <div class="pair-item">
                    <span>공격력</span>
                    <Select label="귀걸이 {earring + 1} 공격력" options={EARRING_ATTACK_OPTIONS}
                            bind:value={app.character.accessories.earrings[earring].attackPower} onchange={persist} />
                  </div>
                  <div class="pair-item">
                    <span>무공</span>
                    <Select label="귀걸이 {earring + 1} 무기 공격력" options={EARRING_WEAPON_OPTIONS}
                            bind:value={app.character.accessories.earrings[earring].weaponAttack} onchange={persist} />
                  </div>
                </div>
              </div>
            {/each}
            {#each [0, 1] as ring}
              <div class="slot">
                <strong>반지 {ring + 1}</strong>
                <div class="pair">
                  <div class="pair-item">
                    <span>치적</span>
                    <Select label="반지 {ring + 1} 치적" options={RING_CRIT_RATE_OPTIONS}
                            bind:value={app.character.accessories.rings[ring].critRate} onchange={persist} />
                  </div>
                  <div class="pair-item">
                    <span>치피</span>
                    <Select label="반지 {ring + 1} 치피" options={RING_CRIT_DMG_OPTIONS}
                            bind:value={app.character.accessories.rings[ring].critDamage} onchange={persist} />
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </details>

    <details class="card card-fold" open={isOpen("bracelet")} ontoggle={e => setFold("bracelet", e.currentTarget.open)}>
        <summary>
          <h2>팔찌</h2>
          <span class="fold-note">{braceletChips.length > 0 ? braceletChips.join(" · ") : "선택 없음"}</span>
          <span class="spacer"></span>
          {@render resetButton("팔찌 초기화", "bracelet")}
          <button class="btn sm" type="button"
                  onclick={e => { e.preventDefault(); e.stopPropagation(); onOpenBracelet(); }}>편집</button>
        </summary>
        <div class="card-body">
          <!--
            팔찌는 적어 넣고 마는 칸이 아니다. 리롤할지 말지를 정하려면 지금 낀
            것이 나에게 무엇을 해주고 있는지가 보여야 한다. 기준은 팔찌를 안 낀
            나이고, 줄마다도 그 줄만 뺀 나와 견준다.
          -->
          {#if braceletChips.length === 0}
            <div class="summary-line"><span class="empty">선택 없음</span></div>
          {:else if braceletWorth}
            <div class="worth">
              <div class="worth-head">
                <span>이 팔찌를 껴서</span>
                <b>{formatSignedPercent(braceletWorth.total)}</b>
              </div>
              <ul class="worth-lines">
                {#each braceletWorth.lines as line (line.key)}
                  <li>
                    <span>{line.label}</span>
                    <em>{formatSignedPercent(line.gain)}</em>
                  </li>
                {/each}
              </ul>
              <!-- 줄들의 합이 위 숫자와 딱 안 맞는다. 피해 그룹이 곱으로
                   얽혀 있어서 그렇지 빠진 몫이 있는 것이 아니다. -->
              <small>줄마다 그것만 뺐을 때와 견준 값입니다</small>
            </div>
          {:else}
            <div class="summary-line">
              {#each braceletChips as chip}<span class="chip">{chip}</span>{/each}
            </div>
          {/if}
        </div>
      </details>

    <!-- 카르마는 팔찌와 아무 관계가 없다. 둘 다 한두 줄이라 한 카드에 붙여
         두었을 뿐인데, 그러면 카드 이름이 두 낱말을 접속사로 잇게 된다. -->
    <details class="card card-fold" open={isOpen("karma")} ontoggle={e => setFold("karma", e.currentTarget.open)}>
        <summary>
          <h2>카르마</h2>
          <span class="fold-note">
            진화 {readNumber(app.character.convenience.evolutionKarmaRank)}랭크 ·
            깨달음 {readNumber(app.character.convenience.awakeningKarmaLevel)}Lv
          </span>
          <span class="spacer"></span>
        </summary>
        <div class="card-body">
          <div class="fields">
            <div class="field">
              <span>진화 랭크</span>
              <Select label="진화 카르마" options={KARMA_OPTIONS}
                      bind:value={app.character.convenience.evolutionKarmaRank} onchange={persist} />
            </div>
            <div class="field">
              <label for="s-awk-karma">깨달음 레벨</label>
              <input id="s-awk-karma" type="number" min="0" max="30" step="1" placeholder="0"
                     bind:value={app.character.convenience.awakeningKarmaLevel} onchange={persist} />
              <small class="derived">무기 공격력 +{formatNumber(awakeningKarmaPercent)}%</small>
            </div>
          </div>
        </div>
      </details>

    <!-- 5 · 아크 그리드 — 모달로 뺄 이유가 없다. 해·달·별 세 줄이면 카드에 들어간다.
         3열에 혼자 서 있었는데, 직접 입력 효과가 깨달음 쪽으로 가면서 그 열이
         통째로 비었다. 악세서리·팔찌와 같은 열로 내려온다. -->
    <details class="card card-fold wide-card" open={isOpen("arkGrid")} ontoggle={e => setFold("arkGrid", e.currentTarget.open)}>
        <summary>
          <h2>아크 그리드</h2>
          <span class="fold-note">{gridChips.length > 0 ? gridChips.join(" · ") : "비어 있음"}</span>
          <Hint label="포인트 구간">
            <p>구간 효과는 누적됩니다 — 17P면 10P · 14P가 함께 붙습니다.</p>
            <p>코어는 <b>탐색 대상이 아닙니다.</b></p>
          </Hint>
          <span class="spacer"></span>
          {@render resetButton("아크 그리드 초기화", "arkGrid")}
        </summary>
        <div class="card-body">
          <ArkGridPanel />
        </div>
      </details>
  </div>
</div>

