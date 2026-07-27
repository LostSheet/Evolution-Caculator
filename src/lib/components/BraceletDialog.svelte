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

<Dialog bind:open title="팔찌" subtitle="{count}개 선택" width="820px">
  <div class="stat-trio">
    {#each BRACELET_STAT_FIELDS as field}
      <label>
        <span style="display:block;margin-bottom:5px;font-size:11.5px;color:var(--txt-3)">{field.label}</span>
        <input class="boxed" type="number" min="0" max="120" step="1"
               bind:value={app.character.bracelet.stats[field.key]} onchange={() => clampStat(field.key)} />
      </label>
    {/each}
  </div>

  <div class="pick-list" style="margin-bottom:22px">
    {#each BRACELET_EFFECTS as item (item.id)}
      {@const gradeIndex = getBraceletGradeIndex(app.character.bracelet.effects[item.id])}
      {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
      <div class="pick" class:on={gradeIndex >= 0} class:inactive={gradeIndex >= 0 && !on}
           style="grid-template-columns:150px minmax(0,1fr)">
        <label for="br-{item.id}">{item.name}</label>
        <select id="br-{item.id}" class="boxed"
                value={app.character.bracelet.effects[item.id] ?? "none"}
                onchange={e => setGrade(item, e.currentTarget.value)}>
          <option value="none">미적용</option>
          {#each BRACELET_GRADES as grade, gi}
            <option value={grade.value}>
              {grade.label} · {item.effects.map(e => `${formatInputValue(e.amounts[gi])}%`).join(" / ")}
            </option>
          {/each}
        </select>
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
