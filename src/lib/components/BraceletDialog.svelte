<script>
  import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS, BRACELET_UNSUPPORTED_EFFECTS } from "../core/bracelets.js";
  import { getBraceletGradeIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import { formatInputValue, formatInteger, clamp, readNumber } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";
  import Select from "./Select.svelte";

  let { open = $bindable(false) } = $props();

  // 등급은 라벨로, 실제 수치는 힌트로. 목록에서 두 열로 정렬되어 읽힌다.
  //
  // 무공과 힘민지는 퍼센트가 아니라 숫자로 붙는다. 여기에 %를 달면 +9,000이
  // 9000%로 읽혀서 팔찌 하나가 딜을 백 배로 올리는 것처럼 보인다.
  const gradeOptions = item => [
    { value: "none", label: "미적용" },
    ...BRACELET_GRADES.map((grade, gi) => ({
      value: grade.value,
      label: grade.label,
      hint: item.effects
        .map(e => (e.kind === "flat" ? `+${formatInteger(e.amounts[gi])}` : `${formatInputValue(e.amounts[gi])}%`))
        .join(" / "),
    })),
  ];

  const count = $derived(
    BRACELET_STAT_FIELDS.filter(f => readNumber(app.character.bracelet.stats[f.key]) > 0).length
    + BRACELET_EFFECTS.filter(i => getBraceletGradeIndex(app.character.bracelet.effects[i.id]) >= 0).length,
  );

  function setGrade(item, value) {
    if (value === "none") delete app.character.bracelet.effects[item.id];
    else app.character.bracelet.effects[item.id] = value;
    persist();
  }

  function clampStat(key) {
    app.character.bracelet.stats[key] = clamp(Math.round(readNumber(app.character.bracelet.stats[key])), 0, 120);
    persist();
  }
</script>

<Dialog bind:open title="팔찌" subtitle="{count}개 선택" width="820px">
  <div class="stat-trio">
    {#each BRACELET_STAT_FIELDS as field}
      <label>
        <span style="display:block;margin-bottom:5px;font-size:11.5px;color:var(--txt-3)">{field.label}</span>
        <input class="boxed" type="number" min="0" max="120" step="1"
               bind:value={app.character.bracelet.stats[field.key]} onchange={() => clampStat(field.key)} />
      </label>
    {/each}
    <!-- 힘민지는 등급이 아니라 값이다. 고대 9,600~16,000. -->
    <label>
      <span style="display:block;margin-bottom:5px;font-size:11.5px;color:var(--txt-3)">힘 · 민첩 · 지능</span>
      <input class="boxed" type="number" min="0" max="16000" step="100"
             bind:value={app.character.bracelet.mainStat} onchange={persist} />
    </label>
  </div>

  <div class="pick-list" style="margin-bottom:22px">
    {#each BRACELET_EFFECTS as item (item.id)}
      {@const gradeIndex = getBraceletGradeIndex(app.character.bracelet.effects[item.id])}
      {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
      <div class="pick" class:on={gradeIndex >= 0} class:inactive={gradeIndex >= 0 && !on}
           style="grid-template-columns:150px minmax(0,1fr)">
        <span class="pick-name">{item.name}</span>
        <Select label="{item.name} 등급" options={gradeOptions(item)}
                value={app.character.bracelet.effects[item.id] ?? "none"}
                onchange={next => setGrade(item, next)} />
        {#if gradeIndex >= 0}
          <small>{item.summaries[gradeIndex]}{on ? "" : " · 현재 미적용"}</small>
        {/if}
      </div>
    {/each}
  </div>

  <h3 style="margin-bottom:10px;font-size:11.5px;font-weight:600;color:var(--txt-3)">현재 미반영</h3>
  <div class="unsupported">
    {#each BRACELET_UNSUPPORTED_EFFECTS as item}
      <div><strong>{item.name}</strong><span>{item.summary}</span></div>
    {/each}
  </div>
</Dialog>
