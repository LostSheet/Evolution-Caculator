<script>
  // 파티 시너지 — 한 줄이 한 사람, 한 칸이 한 버프.
  //
  // 내 줄은 맨 위에 고정이고 직업도 갈래도 고를 수 없다. 이미 불러온 캐릭터가
  // 정한 것을 다시 물어볼 이유가 없다. 고칠 수 있는 것은 가동율뿐이다.
  //
  // 가동율은 버프마다 붙는다. 파티의 기상술사는 치명타 적중률을 늘 주지만
  // 질풍노도의 공이속은 껐다 켜서 잠깐만 준다 — 한 줄에 한 숫자로는 못 적는다.
  //
  // 딜 시너지 수를 세어 보여 준다. 3딜 1폿이 기본이라 셋이 관례지만 서폿도
  // 딜 시너지를 주므로 넷이 되는 편성이 있다 — 그래서 세기만 하고 막지 않는다.
  import {
    SYNERGY_TYPES, SYNERGY_JOBS, SYNERGY_SLOTS, SYNERGY_UPTIME_FULL, SYNERGY_BASE_KEY,
    getSynergyJob, synergyAmount, synergyBonuses, synergyChoiceNote,
  } from "../core/synergy.js";
  import {
    app, addSynergyRow, removeSynergyRow, setSynergyRowJob, toggleSynergyChoice, setSynergyUptime,
  } from "../store.svelte.js";
  import { formatNumber } from "../core/util.js";
  import Select from "./Select.svelte";

  const result = $derived(synergyBonuses(
    app.character.awakening, app.character.synergy, app.character.settings,
  ));
  const rows = $derived(result.rows);

  const JOB_OPTIONS = SYNERGY_JOBS.map(entry => ({
    value: entry.job,
    label: entry.name,
    hint: summary(entry),
  }));

  // 목록에서 직업이 무엇을 주는지 한 줄로 보여 준다. 이름만 보고 고를 수 없다.
  function summary(entry) {
    const keys = [
      ...(entry.base ?? []),
      ...(entry.groups ?? []).flatMap(group => group.choices.flatMap(choice => choice.types)),
    ];
    return [...new Set(keys)].map(key => SYNERGY_TYPES[key].label).join(" · ");
  }

  const trim = value => `${Math.round(value * 100) / 100}`;
  const gives = parts => parts.map(part => `${part.label} +${trim(part.amount)}%`).join(" · ");
  // 갈래가 무엇을 주는지 칩에 적는다. 이름만으로는 알 수 없다.
  const choiceText = choice => choice.types
    .map(key => `${SYNERGY_TYPES[key].perSource ? `${SYNERGY_TYPES[key].label} ` : ""}+${trim(synergyAmount(choice, key))}%`)
    .join(" · ");

  const groupsOf = job => getSynergyJob(job)?.groups ?? [];
  const buffOf = (row, node) => row.buffs.find(buff => buff.node === node) ?? null;
  const nextJob = $derived(
    SYNERGY_JOBS.find(entry => !rows.some(row => row.job === entry.job)) ?? SYNERGY_JOBS[0],
  );
</script>

<div class="syn">
  <div class="syn-count" class:over={result.over}>
    <span>딜 시너지</span>
    <b>{result.combatCount} / {SYNERGY_SLOTS}</b>
    {#if result.over}<small>막지 않습니다</small>{/if}
  </div>

  {#if rows.length === 0}
    <p class="syn-none">파티원을 추가하세요.</p>
  {/if}

  {#each rows as row (row.id)}
    {@const base = buffOf(row, SYNERGY_BASE_KEY)}
    <div class="syn-row" class:own={row.own}>
      <div class="syn-buff">
        <div class="syn-who">
          {#if row.own}
            <span class="syn-me">내 캐릭터</span>
            <!-- 내가 나에게 주는 몫은 시너지가 아니라 자버프다. 유효율은
                 깨달음 쪽에서 매기고 여기서는 결과만 읽는다. -->
            <b>{row.name}</b>
          {:else if row.generic}
            <!-- 간략 카드가 세운 줄. 직업이 없으니 고를 것도 없다. -->
            <b>{row.name}</b>
          {:else}
            <Select value={row.job} options={JOB_OPTIONS} label="직업" align="left"
                    onchange={job => setSynergyRowJob(row.id, job)} />
          {/if}
        </div>

        {#if base}
          <span class="syn-gives">{gives(base.parts)}</span>
          {#if row.own}
            <span class="syn-up read">{base.uptime}%</span>
          {:else}
            <label class="syn-up" class:cut={base.uptime < SYNERGY_UPTIME_FULL}>
              가동율
              <input type="number" min="0" max="100" step="5" value={base.uptime}
                     oninput={event => setSynergyUptime(row.id, SYNERGY_BASE_KEY, event.currentTarget.value)} />%
            </label>
          {/if}
        {:else}
          <span class="syn-gives dim">갈래를 골라야 붙습니다</span>
          <span class="syn-up-gap"></span>
        {/if}

        {#if row.own}
          <span class="syn-x" aria-hidden="true"></span>
        {:else}
          <button type="button" class="syn-x" aria-label="이 줄 지우기"
                  onclick={() => removeSynergyRow(row.id)}>×</button>
        {/if}
      </div>

      {#each groupsOf(row.job) as group (group.id)}
        {#each group.choices as choice (choice.node)}
          {@const on = row.nodes.includes(choice.node)}
          {@const buff = buffOf(row, choice.node)}
          {#if !row.own || on}
            <div class="syn-buff sub">
              {#if row.own}
                <span class="chip on">{choice.node}</span>
              {:else}
                <button type="button" class="chip syn-pick" class:on
                        onclick={() => toggleSynergyChoice(row.id, choice.node)}>{choice.node}</button>
              {/if}
              <span class="syn-gives" class:dim={!buff}>
                {buff ? gives(buff.parts) : choiceText(choice)}
              </span>
              {#if buff && row.own}
                <span class="syn-up read">{buff.uptime}%</span>
              {:else if buff}
                <label class="syn-up" class:cut={buff.uptime < SYNERGY_UPTIME_FULL}>
                  가동율
                  <input type="number" min="0" max="100" step="5" value={buff.uptime}
                         oninput={event => setSynergyUptime(row.id, choice.node, event.currentTarget.value)} />%
                </label>
              {:else}
                <span class="syn-up-gap"></span>
              {/if}
              <span class="syn-x" aria-hidden="true"></span>
            </div>
          {/if}
        {/each}
      {/each}
    </div>
  {/each}

  <button type="button" class="syn-add" onclick={() => addSynergyRow(nextJob.job)}>+ 파티원 추가</button>

  {#if result.lines.length > 0}
    <div class="syn-total">
      {#each result.lines as line (line.key)}
        <span><b>{line.label}</b> +{formatNumber(line.amount)}%</span>
      {/each}
    </div>
  {/if}
</div>
