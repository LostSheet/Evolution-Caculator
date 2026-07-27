<script>
  import { formatInteger, clamp, readNumber } from "../core/util.js";
  import { OPTIMIZER_EXHAUSTIVE_LIMIT, getModeledEngravings } from "../core/search.js";
  import { buildSearchPlan, getEngravingRole } from "../core/runner.js";
  import { app, persist, startSearch, cancelSearch } from "../store.svelte.js";
  import EngravingPoolDialog from "./EngravingPoolDialog.svelte";

  let poolOpen = $state(false);

  const plan = $derived(buildSearchPlan(app.character, app.search));
  const exhaustive = $derived(
    app.search.mode === "exhaustive"
      || (app.search.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT),
  );

  const notes = $derived.by(() => {
    const out = [`1T는 ${plan.dimensions[0].options.length}가지 배분을 탐색합니다.`];
    if (plan.skippedNodes.length > 0) {
      out.push(`딜 기여가 없는 노드 ${plan.skippedNodes.length}개는 후보에서 제외됩니다.`);
    }
    if (app.search.engravingSlots !== "fixed") {
      const e = plan.engravings;
      if (e.overflow) out.push(`고정 각인 ${e.locked.length}개가 슬롯 ${e.slots}개를 넘습니다.`);
      else if (e.locked.length > 0) {
        out.push(`각인 ${e.slots}슬롯 중 고정 ${e.locked.length}개를 두고 후보 ${e.candidates.length}종에서 ${e.pickCount}개를 고릅니다.`);
      } else {
        out.push(`각인 후보 ${e.candidates.length}종에서 ${e.pickCount}개를 골라 ${e.slots}슬롯을 채웁니다.`);
      }
      const excluded = getModeledEngravings().filter(i => getEngravingRole(i, app.search) === "excluded").length;
      if (excluded > 0) out.push(`제외 각인 ${excluded}종은 후보에서 빠집니다.`);
    }
    const share = clamp(Math.round(readNumber(app.character.convenience.manaShare)), 0, 100);
    if (share < 100) {
      out.push(`마나 스킬 딜 비중 ${share}% 기준으로 마나 전용 피해 효과를 축소 반영합니다. 끝마/무마 쿨감은 그대로입니다.`);
    }
    return out;
  });
</script>

<section class="card searchbar">
  <div class="searchbar-main">
    {#if app.running}
      <button class="btn" type="button" onclick={cancelSearch}>중지</button>
    {:else}
      <button class="btn primary" type="button" onclick={startSearch}>탐색 실행</button>
    {/if}

    <div class="searchbar-status">
      {#if app.running}
        <b>{app.progress.phase}</b>
        <span>{formatInteger(app.progress.evaluated)}개 평가</span>
      {:else}
        <span>{app.status}</span>
      {/if}
    </div>

    <div class="searchbar-scope">
      <span class="eyebrow">{formatInteger(plan.totalCombos)}조합 · {exhaustive ? "전수" : `빔 ${formatInteger(app.search.beamWidth)}`}</span>

      <label class="field" style="border:0;min-height:0;padding:0">
        <span style="font-size:11.5px;color:var(--txt-3)">1T</span>
        <select bind:value={app.search.tier1Mode} onchange={persist}>
          <option value="fixed">현재 고정</option>
          <option value="step10">10Lv 단위</option>
          <option value="step5">5Lv 단위</option>
          <option value="step2">2Lv 단위</option>
        </select>
      </label>

      <label class="field" style="border:0;min-height:0;padding:0">
        <span style="font-size:11.5px;color:var(--txt-3)">각인</span>
        <select bind:value={app.search.engravingSlots} onchange={persist}>
          <option value="fixed">탐색 안 함</option>
          {#each [1, 2, 3, 4, 5] as n}<option value={String(n)}>{n}개</option>{/each}
        </select>
      </label>

      <button class="btn sm" type="button" onclick={() => (poolOpen = true)}>후보 설정</button>

      <label class="check" style="min-height:28px">
        <input type="checkbox" bind:checked={app.search.petSearch} onchange={persist} />
        <span>펫 탐색</span>
      </label>
    </div>
  </div>

  <div class="progress" aria-hidden="true">
    <div style:width="{(app.running ? app.progress.progress : app.results ? 1 : 0) * 100}%"></div>
  </div>

  <ul class="scope-note">
    {#each notes as note}<li>{note}</li>{/each}
  </ul>
</section>

<EngravingPoolDialog bind:open={poolOpen} />
