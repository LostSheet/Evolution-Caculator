<script>
  import { BRACELET_GRADES, BRACELET_STAT_FIELDS, BRACELET_EFFECTS, BRACELET_UNSUPPORTED_EFFECTS } from "../core/bracelets.js";
  import { getBraceletGradeIndex, isDirectionalConditionActive } from "../core/metrics.js";
  import { formatInputValue, clamp, readNumber } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false) } = $props();

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

<Dialog bind:open title="팔찌 설정" subtitle="{count}개 선택" width="900px">
  <div class="engraving-dialog-body bracelet-dialog-body">
    <section class="engraving-group">
      <h3>계산 반영</h3>
      <div class="bracelet-stat-grid" aria-label="팔찌 전투 특성">
        {#each BRACELET_STAT_FIELDS as field}
          <label>
            <span>{field.label}</span>
            <input type="number" min="0" max="120" step="1" bind:value={app.character.bracelet.stats[field.key]} onchange={() => clampStat(field.key)} />
          </label>
        {/each}
      </div>
      <div class="engraving-list bracelet-option-list">
        {#each BRACELET_EFFECTS as item (item.id)}
          {@const gradeIndex = getBraceletGradeIndex(app.character.bracelet.effects[item.id])}
          {@const conditionActive = isDirectionalConditionActive(item.condition, app.character.settings)}
          <div class="engraving-row bracelet-option-row" class:active={gradeIndex >= 0} class:condition-inactive={gradeIndex >= 0 && !conditionActive}>
            <label for="br-{item.id}"><strong>{item.name}</strong></label>
            <select id="br-{item.id}" value={app.character.bracelet.effects[item.id] ?? "none"} onchange={e => setGrade(item, e.currentTarget.value)}>
              <option value="none">미적용</option>
              {#each BRACELET_GRADES as grade, gi}
                <option value={grade.value}>
                  {grade.label} · {item.effects.map(e => `${formatInputValue(e.amounts[gi])}%`).join(" / ")}
                </option>
              {/each}
            </select>
            {#if gradeIndex >= 0}
              <small class="engraving-current-effect bracelet-current-effect">
                {item.summaries[gradeIndex]}{conditionActive ? "" : " · 현재 미적용"}
              </small>
            {/if}
          </div>
        {/each}
      </div>
    </section>
    <section class="engraving-group utility-engraving-group">
      <h3>현재 미반영</h3>
      <div class="bracelet-unsupported-list">
        {#each BRACELET_UNSUPPORTED_EFFECTS as item}
          <div class="bracelet-unsupported-item"><strong>{item.name}</strong><span>{item.summary}</span></div>
        {/each}
      </div>
    </section>
  </div>
</Dialog>
