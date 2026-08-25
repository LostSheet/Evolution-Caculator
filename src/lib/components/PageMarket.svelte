<script>
  /**
   * 악세 — 무엇을 살까.
   *
   * 앞 두 축은 가진 포인트를 어떻게 나눌지 묻는다. 여기서는 자원이 골드다.
   * 그래서 답도 "몇 퍼센트 오르나"가 아니라 "만 골드당 몇 퍼센트 오르나"다.
   *
   * 격자로 두는 이유는 답이 지형이기 때문이다. 상상 반지가 제일 세지만
   * 만골당으로는 상중이 네 배다 — 줄로 세우면 그게 안 보인다.
   */
  import { app, marketSlot, wornAt, setMarket, openCell } from "../store.svelte.js";
  import { ACCESSORY_SLOTS, GRADES, GRADE_PICK, GRADE_LABEL, FIELD_LABEL, wornCombo } from "../core/accessory.js";
  import { formatInteger, readNumber } from "../core/util.js";
  import Select from "./Select.svelte";

  // 귀걸이는 아직 없다. 서폿 공증이 평면으로 내 공격력에 더해지는 자리라
  // 공격력%·무공%의 값이 파티 구성에 따라 흔들린다 — 그걸 세기 전에 내놓으면
  // 틀린 숫자를 확신에 차서 보여주게 된다.
  const SLOTS = ACCESSORY_SLOTS.filter(slot => slot.part !== "귀걸이");
  const GRADE_OPTIONS = [{ value: "고대", label: "고대" }, { value: "유물", label: "유물" }];

  const slot = $derived(marketSlot());
  const worn = $derived(wornAt(slot));
  const mine = $derived(wornCombo(app.character, slot));
  const cells = $derived(app.market.cells);
  const label = field => FIELD_LABEL[field];
  // 지금 낀 것의 두 갈래를 사람이 읽는 말로. 격자에서는 '무관'인 칸이
  // 실물에서는 '없음'이다 — 조건을 안 건 것과 옵션이 없는 것은 다르다.
  const wornGrades = $derived(
    slot.fields
      .map((field, at) => `${label(field)} ${mine[at] === "any" ? "없음" : GRADE_PICK[mine[at]]}`)
      .join(" · "),
  );

  // 색을 매기는 기준. 제일 잘 사는 칸을 1로 두고 나머지를 비율로 칠한다.
  const topPerGold = $derived(
    Math.max(0, ...Object.values(cells).map(cell => readNumber(cell?.perGold))),
  );

  const key = combo => combo.join(":");
  const rowLabel = grade => GRADE_PICK[grade];
  const money = gold => (gold >= 10000 ? `${Math.round(gold / 10000).toLocaleString("ko-KR")}만` : formatInteger(gold));
  const pct = value => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  // 만골당은 자릿수가 벌어진다 — 1,000골드짜리와 170만짜리가 한 표에 있다.
  // 선형으로 칠하면 맨 위 한 칸만 색이 들고 나머지는 전부 흰 칸이 된다.
  function heat(cell) {
    const per = readNumber(cell?.perGold);
    if (!(per > 0) || !(topPerGold > 0)) return 0;
    return (per / topPerGold) ** 0.35;
  }

  function grindText(listing) {
    const modeled = Object.entries(listing.options)
      .map(([field, grade]) => `${FIELD_LABEL[field]} ${GRADE_LABEL[grade]}`);
    const flat = Object.entries(listing.flat)
      .filter(([, amount]) => amount > 0)
      .map(([field, amount]) => `${field === "attackPower" ? "공격력" : "무기 공격력"} +${formatInteger(amount)}`);
    return [...modeled, ...flat].join(" · ");
  }
</script>

<section class="card market-head">
  <div class="market-slots">
    {#each SLOTS as item (item.label)}
      {@const value = `${item.key}:${item.index}`}
      <button type="button" class="market-slot" class:on={app.market.slot === value}
              onclick={() => setMarket({ slot: value, cells: {}, open: null, listings: null })}>
        {item.label}
      </button>
    {/each}
  </div>

  <div class="market-worn">
    {#if worn}
      <b>{worn.name}</b>
      <span>{wornGrades}</span>
      <span>주스탯 {formatInteger(worn.mainStat)}</span>
      {#if worn.flat.weaponAttack > 0}<span>무기 공격력 +{formatInteger(worn.flat.weaponAttack)}</span>{/if}
      {#if worn.flat.attackPower > 0}<span>공격력 +{formatInteger(worn.flat.attackPower)}</span>{/if}
    {:else}
      <span class="market-warn">주스탯 안 셈 — 캐릭터 불러오기 필요</span>
    {/if}
  </div>

  <div class="market-filters">
    <label>등급
      <Select options={GRADE_OPTIONS} value={app.market.grade}
              onchange={value => setMarket({ grade: value, cells: {}, open: null, listings: null })} />
    </label>
    <label>품질 <input type="number" min="0" max="100" value={app.market.quality}
                     oninput={e => setMarket({ quality: readNumber(e.currentTarget.value) })} /> 이상</label>
  </div>
</section>

{#if app.market.error}
  <section class="card market-error">{app.market.error}</section>
{:else if !app.api.key}
  <section class="card market-error">API 키가 없습니다 — 상단 <b>캐릭터</b>에서 넣습니다</section>
{/if}

<section class="card market-grid-card">
  <div class="market-legend">
    <span class="lg-title">만 골드당 딜 상승</span>
    <span class="lg-sub">세로 {label(slot.fields[0])} · 가로 {label(slot.fields[1])}</span>
    <span class="lg-sub">조건마다 최저가 10장 중 제일 잘 사는 한 장</span>
  </div>

  <table class="market-grid">
    <thead>
      <tr>
        <th></th>
        {#each GRADES as b (b)}<th>{rowLabel(b)}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each GRADES as a (a)}
        <tr>
          <th>{rowLabel(a)}</th>
          {#each GRADES as b (b)}
            {@const cell = cells[key([a, b])]}
            {@const on = app.market.open === key([a, b])}
            {@const here = mine[0] === a && mine[1] === b}
            <td class:on class:here>
              <button type="button" disabled={!cell || cell.empty} onclick={() => openCell([a, b])}>
                {#if !cell}
                  <span class="c-wait">·</span>
                {:else if cell.empty}
                  <span class="c-wait">매물 없음</span>
                {:else}
                  <span class="c-per" style="--heat:{heat(cell)}">
                    {cell.perGold === null ? "—" : cell.perGold.toFixed(4)}
                  </span>
                  <span class="c-gain" class:down={cell.gain < 0}>{pct(cell.gain)}</span>
                  <span class="c-price">{money(cell.price)}</span>
                {/if}
              </button>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</section>

{#if app.market.open}
  <section class="card market-list">
    <h2>{app.market.open.split(":").map(rowLabel).join(" · ")} — 최저가 10장</h2>
    {#if !app.market.listings}
      <p class="market-empty">읽는 중…</p>
    {:else}
      <table class="market-items">
        <thead>
          <tr><th>이름</th><th>품질</th><th>주스탯</th><th>연마</th><th>가격</th><th>딜</th><th>만골당</th></tr>
        </thead>
        <tbody>
          {#each app.market.listings as row, index (index)}
            <tr>
              <td class="i-name">{row.listing.name}</td>
              <td class="i-num">{row.listing.quality}</td>
              <td class="i-num">{formatInteger(row.listing.mainStat)}</td>
              <td class="i-grind">
                {grindText(row.listing)}
                {#if row.listing.unmodeled.length > 0}
                  <span class="i-skip">안 셈 · {row.listing.unmodeled.join(", ")}</span>
                {/if}
              </td>
              <td class="i-num">{money(row.price)}</td>
              <td class="i-num" class:down={row.gain < 0}>{pct(row.gain)}</td>
              <td class="i-num i-per">{row.perGold === null ? "—" : row.perGold.toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}
