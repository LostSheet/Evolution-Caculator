<script>
  import {
    CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS, CHAOS_CORE_STAGES, CHAOS_CORES,
    GEM_ADDITIONAL_DAMAGE_PER_LEVEL, GEM_MAX_LEVEL, STANDALONE_SOURCES,
    WEAPON_QUALITY_MAX, weaponQualityDamage,
  } from "../core/cores.js";
  import { formatNumber, clamp, readNumber } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();

  const grid = $derived(app.character.arkGrid);

  const chosenCount = $derived(
    CHAOS_CORE_SLOTS.filter(slot => CHAOS_CORES.some(c => c.id === grid.cores[slot.key]?.id)).length,
  );
  const gemDamage = $derived(
    clamp(Math.round(readNumber(grid.gemLevel)), 0, GEM_MAX_LEVEL) * GEM_ADDITIONAL_DAMAGE_PER_LEVEL,
  );
  const weaponDamage = $derived(
    weaponQualityDamage(clamp(Math.round(readNumber(app.character.weapon.quality)), 0, WEAPON_QUALITY_MAX)),
  );

  function coresFor(slotKey) {
    return CHAOS_CORES.filter(core => core.slot === slotKey);
  }

  function selected(slotKey) {
    return CHAOS_CORES.find(core => core.id === grid.cores[slotKey]?.id) ?? null;
  }

  // 고른 포인트까지 실제로 붙는 효과를 한 줄씩 풀어 보여준다.
  function activeLines(core, slotKey) {
    if (!core) return [];
    const chosen = grid.cores[slotKey];
    const points = Math.round(readNumber(chosen.points));
    const stage = clamp(Math.round(readNumber(chosen.stage)), 0, 1);
    const lines = [];

    const describe = (effect, times) => {
      const raw = Array.isArray(effect.amounts) ? effect.amounts[stage] : effect.amount;
      const amount = readNumber(raw) * times;
      const name = effect.kind === "damage" ? effect.key
        : effect.kind === "critOnlyDamage" ? "치명타 시 주는 피해"
        : LABELS[effect.key] ?? effect.key;
      return `${name} +${formatNumber(amount)}%`;
    };

    for (const threshold of [10, 14, 17]) {
      if (points < threshold) continue;
      for (const effect of core.thresholds[threshold] ?? []) {
        lines.push({ at: `${threshold}P`, text: describe(effect, 1) });
      }
    }
    const extra = clamp(points - 17, 0, 3);
    if (extra > 0) {
      for (const effect of core.perPoint) {
        lines.push({ at: `+${extra}P`, text: describe(effect, extra) });
      }
    }
    return lines;
  }

  const LABELS = {
    critRate: "치명타 적중률",
    critDamage: "치명타 피해",
    attackSpeedOnly: "공격 속도",
    moveSpeedOnly: "이동 속도",
    skillCooldownReduction: "쿨타임 감소 (최훈/타지)",
  };

  function setCore(slotKey, id) {
    grid.cores[slotKey].id = id;
    persist();
  }
</script>

<Dialog bind:open title="아크 그리드" subtitle="코어 {chosenCount}/3 · 젬 추가 피해 {formatNumber(gemDamage)}%" width="880px">
  <p class="helper">
    해 · 달 · 별 각 1개씩 고르고, 그 코어에 투자한 <strong>포인트 구간</strong>을 선택합니다.
    구간은 누적이라 17P를 고르면 10P·14P 효과도 함께 붙습니다. 18~20P는 1포인트마다 한 번씩 더 붙습니다.
    <strong>탐색 대상이 아니라 고정</strong>입니다.
  </p>

  {#each CHAOS_CORE_SLOTS as slot}
    {@const core = selected(slot.key)}
    <section class="grid-slot">
      <div class="grid-slot-hd">
        <h3>{slot.label} 코어</h3>
        <select class="boxed" aria-label="{slot.label} 코어 선택"
                value={grid.cores[slot.key].id}
                onchange={e => setCore(slot.key, e.currentTarget.value)}>
          <option value="none">선택 안 함</option>
          {#each coresFor(slot.key) as item}
            <option value={item.id}>{item.name}{item.modeled ? "" : " (미반영)"}</option>
          {/each}
        </select>

        <select class="boxed" aria-label="포인트" disabled={!core?.modeled}
                bind:value={grid.cores[slot.key].points} onchange={persist}>
          {#each CHAOS_CORE_POINTS as point}<option value={point}>{point}P</option>{/each}
        </select>

        <select class="boxed" aria-label="단계" disabled={!core?.modeled}
                bind:value={grid.cores[slot.key].stage} onchange={persist}>
          {#each CHAOS_CORE_STAGES as stage}<option value={stage.value}>{stage.label}</option>{/each}
        </select>
      </div>

      {#if core && !core.modeled}
        <p class="grid-note">{core.note}</p>
      {:else if core}
        {@const lines = activeLines(core, slot.key)}
        {#if lines.length === 0}
          <p class="grid-note">이 포인트 구간에서는 계산에 반영되는 효과가 없습니다.</p>
        {:else}
          <ul class="grid-lines">
            {#each lines as line}
              <li><b>{line.at}</b>{line.text}</li>
            {/each}
          </ul>
        {/if}
        {#if core.note}<p class="grid-note">{core.note}</p>{/if}
      {:else}
        <p class="grid-note">선택 안 함</p>
      {/if}
    </section>
  {/each}

  <section class="grid-slot">
    <div class="grid-slot-hd">
      <h3>무기 · 젬 · 도감</h3>
    </div>
    <div class="fields">
      <div class="field">
        <label for="weapon-q">무기 품질 <em>0~{WEAPON_QUALITY_MAX}</em></label>
        <div class="with-sheet">
          <input id="weapon-q" type="number" min="0" max={WEAPON_QUALITY_MAX} step="1"
                 bind:value={app.character.weapon.quality} onchange={persist} />
          <small>무기 추가 피해 +{formatNumber(weaponDamage)}%</small>
        </div>
      </div>
      <div class="field">
        <label for="gem-lv">젬 추가 피해 레벨 합계</label>
        <div class="with-sheet">
          <input id="gem-lv" type="number" min="0" max={GEM_MAX_LEVEL} step="1"
                 bind:value={grid.gemLevel} onchange={persist} />
          <small>추가 피해 +{formatNumber(gemDamage)}%</small>
        </div>
      </div>
    </div>
    <p class="grid-note">
      젬은 툴팁 표기가 Lv당 0.08%지만 실제 적용값은 <b>Lv당 {GEM_ADDITIONAL_DAMAGE_PER_LEVEL}%</b>이라 적용값으로 계산합니다.
      무기 품질은 <b>y = 0.002x² + 10</b>이며, 이름이 다른 피해 그룹이라
      일반 추가 피해와 합산되지 않고 곱연산됩니다.
    </p>

    <label class="check">
      <input type="checkbox" bind:checked={app.character.collection.ranch} onchange={persist} />
      <span>{STANDALONE_SOURCES.ranchCollection.label} · {STANDALONE_SOURCES.ranchCollection.summary}</span>
    </label>

    <div class="fields">
      {#each [["critStat", "치명"], ["specStat", "특화"], ["swiftStat", "신속"]] as [key, label]}
        <div class="field">
          <label for="col-{key}">도감 · 물약 {label}</label>
          <input id="col-{key}" type="number" min="0" step="1"
                 bind:value={app.character.collection[key]} onchange={persist} />
        </div>
      {/each}
    </div>
  </section>
</Dialog>
