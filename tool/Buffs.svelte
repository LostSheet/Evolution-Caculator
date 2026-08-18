<script>
  /**
   * 이 직업이 거는 버프 — 한 표.
   *
   * 예전에는 '파티 시너지'와 '자버프'가 다른 표였다. 그러면 질풍노도가 자버프
   * 목록에 안 보여서 같은 것을 또 적게 된다. 둘의 차이는 '파티에도 가느냐'
   * 하나뿐이라 칸 두 개로 합쳤다.
   *
   *   나에게  → 앱의 자버프 카드에 뜬다
   *   파티에도 → 앱의 파티 시너지 표에 뜬다
   *   갈래     → 그 갈래를 찍었을 때만. 비면 갈래와 무관
   *
   * 가동율은 나와 남이 따로다. 질풍노도는 자신에게 30초 자버프라 사실상 상시고
   * 남에게는 여우비를 켜 둔 동안만이다 — 한 칸으로 두면 남에게 주는 유효율이
   * 내 딜을 깎는다.
   */
  import { SYNERGY_TYPES, SYNERGY_TYPE_ORDER } from "../src/lib/core/synergy.js";

  let { entry, branches, onchange } = $props();

  const buffs = $derived(entry.buffs ?? []);
  const write = next => onchange({ buffs: next });
  const patch = (index, part) => write(buffs.map((buff, i) => (i === index ? { ...buff, ...part } : buff)));

  function add() {
    write([...buffs, {
      id: `buff${buffs.length + 1}`, label: "새 버프", branch: "", group: "tier1",
      types: [], amounts: {}, self: true, party: false,
      selfUptime: null, partyUptime: null, pick: false,
    }]);
  }

  function toggleType(index, key) {
    const buff = buffs[index];
    const on = buff.types.includes(key);
    patch(index, { types: on ? buff.types.filter(item => item !== key) : [...buff.types, key] });
  }

  function setAmount(index, key, raw) {
    const amounts = { ...buffs[index].amounts };
    if (String(raw).trim() === "") delete amounts[key];
    else amounts[key] = Number(raw);
    patch(index, { amounts });
  }

  const num = raw => (String(raw).trim() === "" ? null : Number(raw));
  // 표에 값이 못 박힌 종류와 갈래가 값을 들고 오는 종류가 따로다.
  const perSource = key => Boolean(SYNERGY_TYPES[key]?.perSource);
</script>

<section class="card">
  <div class="card-hd">
    <h2>버프</h2>
    <span class="spacer"></span>
    <span class="eyebrow">{buffs.length}줄</span>
    <button class="btn sm" type="button" onclick={add}>추가</button>
  </div>
  <div class="card-body">
    {#if buffs.length === 0}
      <div class="summary-line"><span class="empty">없음</span></div>
    {/if}

    {#each buffs as buff, index (index)}
      <div class="tool-buff">
        <div class="tool-buff-hd">
          <input class="boxed" type="text" aria-label="이름" value={buff.label}
                 oninput={e => patch(index, { label: e.currentTarget.value })} />

          <!-- 갈래는 깨달음 1티어 배타 둘뿐이다. 손으로 치게 두면 오타가
               조용히 '아무도 안 고른 갈래'가 되어 효과가 사라진다. -->
          <select class="boxed" aria-label="갈래" value={buff.branch}
                  onchange={e => patch(index, { branch: e.currentTarget.value })}>
            <option value="">갈래 무관</option>
            {#each branches as branch (branch.node)}
              <option value={branch.node}>{branch.node}</option>
            {/each}
          </select>

          <label class="check"><input type="checkbox" checked={buff.self}
                 onchange={e => patch(index, { self: e.currentTarget.checked })} /><span>나에게</span></label>
          <label class="check"><input type="checkbox" checked={buff.party}
                 onchange={e => patch(index, { party: e.currentTarget.checked })} /><span>파티에도</span></label>
          {#if buff.branch}
            <label class="check"><input type="checkbox" checked={buff.pick}
                   onchange={e => patch(index, { pick: e.currentTarget.checked })} /><span>기본 갈래</span></label>
          {/if}

          <span class="spacer"></span>
          <button class="btn icon" type="button" aria-label="지우기"
                  onclick={() => write(buffs.filter((_, i) => i !== index))}>×</button>
        </div>

        <div class="tool-types">
          {#each SYNERGY_TYPE_ORDER as key (key)}
            {@const on = buff.types.includes(key)}
            <button type="button" class="pick-chip" class:on
                    aria-pressed={on} onclick={() => toggleType(index, key)}>
              {SYNERGY_TYPES[key].label}
              {#if !perSource(key)}<em>+{SYNERGY_TYPES[key].amount}</em>{/if}
            </button>
            {#if on && perSource(key)}
              <input class="boxed tool-amount" type="number" step="0.1"
                     aria-label="{SYNERGY_TYPES[key].label} 수치"
                     value={buff.amounts?.[key] ?? ""}
                     oninput={e => setAmount(index, key, e.currentTarget.value)} />
            {/if}
          {/each}
        </div>

        <!-- 가동율 둘. 라벨 없이 한 칸만 두면 '나에게도 30%'로 읽힌다. -->
        <div class="tool-uptimes">
          {#if buff.self}
            <label class="tool-uptime">
              <span>나에게</span>
              <input class="boxed" type="number" min="0" max="100" step="5" placeholder="100"
                     aria-label="나에게 기본 가동율" value={buff.selfUptime ?? ""}
                     oninput={e => patch(index, { selfUptime: num(e.currentTarget.value) })} />
              <em>%</em>
            </label>
          {/if}
          {#if buff.party}
            <label class="tool-uptime">
              <span>파티에</span>
              <input class="boxed" type="number" min="0" max="100" step="5" placeholder="100"
                     aria-label="파티에 기본 가동율" value={buff.partyUptime ?? ""}
                     oninput={e => patch(index, { partyUptime: num(e.currentTarget.value) })} />
              <em>%</em>
            </label>
          {/if}
          <span class="tool-uptime-note">비우면 상시</span>
        </div>
      </div>
    {/each}
  </div>
</section>
