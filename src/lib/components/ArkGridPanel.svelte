<script>
  // 해 · 달 · 별 세 줄과 젬 한 줄. 모달로 뺄 만큼 크지 않다.
  import {
    CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS, CHAOS_CORE_STAGES, CHAOS_CORES,
    ORDER_CORE_SLOTS,
    ARK_GRID_GEM_EFFECTS, arkGridGemDamage, GEM_MAX_LEVEL,
  } from "../core/cores.js";
  import { formatNumber, formatInteger, clamp, readNumber } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import Hint from "./Hint.svelte";
  import Select from "./Select.svelte";

  // 코어 이름이 길고 개수도 많아 검색칸이 붙는다. '미반영'은 옆에 힌트로 뺀다.
  const coreOptions = slotKey => [
    { value: "none", label: "선택 안 함" },
    ...CHAOS_CORES.filter(core => core.slot === slotKey).map(core => ({
      value: core.id,
      label: core.name,
      hint: core.modeled ? "" : "미반영",
    })),
  ];
  const pointOptions = CHAOS_CORE_POINTS.map(point => ({ value: point, label: `${point}P` }));
  const stageOptions = CHAOS_CORE_STAGES.map(stage => ({ value: stage.value, label: stage.label }));

  const grid = $derived(app.character.arkGrid);
  const order = $derived(app.character.arkGrid.order);

  const LABELS = {
    critRate: "치명타 적중률",
    critDamage: "치명타 피해",
    attackSpeedOnly: "공격 속도",
    moveSpeedOnly: "이동 속도",
    skillCooldownReduction: "쿨타임 감소 (최훈/타지)",
    // 평면 공격력. 키 이름이 그대로 화면에 뜨던 자리다.
    attackPower: "공격력",
    weaponAttack: "무기 공격력",
    mainStat: "힘·민첩·지능",
  };

  const coresFor = slotKey => CHAOS_CORES.filter(core => core.slot === slotKey);
  const selected = slotKey => CHAOS_CORES.find(core => core.id === grid.cores[slotKey]?.id) ?? null;

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
      // 평면은 퍼센트가 아니다. 붙이면 '+900.00%'가 되어 900배로 읽힌다.
      if (effect.kind === "flat") return `${name} +${formatInteger(amount)}`;
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

  function setCore(slotKey, id) {
    grid.cores[slotKey].id = id;
    persist();
  }
</script>

<div class="grid-panel">
  <!-- 질서가 먼저다. 게임의 그리드도 질서 해·달·별 다음에 혼돈이 온다. -->
  <p class="grid-family">질서 <small>미적용</small></p>
  {#each ORDER_CORE_SLOTS as slot (slot.key)}
    <section class="grid-slot">
      <div class="grid-slot-hd">
        <h3>{slot.label}</h3>
        <!-- 이름은 고르는 게 아니라 적는다 — 직업 전용이라 목록을 못 세운다.
             캐릭터를 불러오면 게임이 준 이름이 그대로 들어온다. -->
        <input class="order-name" type="text" placeholder="안 낌"
               aria-label="질서 {slot.label} 코어 이름"
               bind:value={order[slot.key].name} onchange={persist} />
        <Select label="질서 {slot.label} 포인트" disabled={!order[slot.key].name}
                options={pointOptions}
                bind:value={order[slot.key].points} onchange={persist} />
        <Select label="질서 {slot.label} 단계" disabled={!order[slot.key].name}
                options={stageOptions}
                bind:value={order[slot.key].stage} onchange={persist} />
      </div>
    </section>
  {/each}

  <p class="grid-family">혼돈</p>
  {#each CHAOS_CORE_SLOTS as slot (slot.key)}
    {@const core = selected(slot.key)}
    <section class="grid-slot">
      <div class="grid-slot-hd">
        <h3>{slot.label}</h3>
        <Select label="{slot.label} 코어 선택" align="left"
                options={coreOptions(slot.key)}
                value={grid.cores[slot.key].id}
                onchange={id => setCore(slot.key, id)} />
        <Select label="{slot.label} 포인트" disabled={!core?.modeled}
                options={pointOptions}
                bind:value={grid.cores[slot.key].points} onchange={persist} />
        <Select label="{slot.label} 단계" disabled={!core?.modeled}
                options={stageOptions}
                bind:value={grid.cores[slot.key].stage} onchange={persist} />

        <!-- 붙는 효과는 같은 줄 오른쪽에. 아래로 흘리면 카드가 길어진다. -->
        {#if core && !core.modeled}
          <p class="grid-note">{core.note}</p>
        {:else if core}
          {@const lines = activeLines(core, slot.key)}
          {#if lines.length === 0}
            <p class="grid-note">이 구간에서는 계산에 반영되는 효과가 없습니다.</p>
          {:else}
            <ul class="grid-lines">
              {#each lines as line}<li><b>{line.at}</b>{line.text}</li>{/each}
            </ul>
          {/if}
        {/if}
      </div>
    </section>
  {/each}

  <section class="grid-slot">
    <div class="grid-slot-hd gem">
      <h3>젬</h3>
      <Hint label="젬 레벨" wide>
        <p>효과별로 레벨을 따로 셉니다.</p>
        <p><b>값(%) = ⌊레벨 × 계수⌋ / 100</b></p>
        <p>{#each ARK_GRID_GEM_EFFECTS as effect, i}{i > 0 ? " · " : ""}{effect.label} {effect.factor}{/each}</p>
      </Hint>
      <!-- 셋을 격자에 그냥 풀어 놓으면 열이 모자라 다음 줄 첫 칸으로 넘어간다.
           한 덩이로 묶어 제 격자를 갖게 한다. -->
      <div class="gem-fields">
        {#each ARK_GRID_GEM_EFFECTS as effect (effect.key)}
          <label class="gem-field">
            <span>{effect.label}</span>
            <input class="boxed" type="number" min="0" max={GEM_MAX_LEVEL} step="1"
                   bind:value={grid.gems[effect.key]} onchange={persist} />
            <small class="derived">+{formatNumber(arkGridGemDamage(effect.key, grid.gems[effect.key]))}%</small>
          </label>
        {/each}
      </div>
    </div>
  </section>
</div>
