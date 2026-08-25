<script>
  /**
   * 악세 — 무엇을 살까.
   *
   * 앞 두 축은 가진 포인트를 어떻게 나눌지 묻는다. 여기서는 자원이 골드다.
   * 그래서 답도 "몇 퍼센트 오르나"가 아니라 "만 골드당 몇 퍼센트 오르나"다.
   *
   * 화면은 경매장 목록 한 장이다. 조합별 격자를 그려 봤는데, 칸마다 최저가를
   * 하나씩 놓으니 "어느 칸이 싼가"는 보여도 "지금 살 것은 무엇인가"가 안
   * 보였다 — 답은 1,000골드짜리 치피 상 한 장인데 그건 어느 칸의 얼굴도
   * 아니었다. 열여섯 조합을 다 훑되 결과는 한 목록으로 합쳐 골드당으로 세운다.
   */
  import { app, marketPart, wornAt, wornOfPart, setMarket, sweepMarket } from "../store.svelte.js";
  import {
    ACCESSORY_PARTS, GRADE_LABEL, FIELD_LABEL, GRADE_VALUES, partSlots, orderedLines,
    comboOf, frontierPicks, cellStats, PART_CONTEXT,
  } from "../core/accessory.js";
  import { formatInteger, readNumber } from "../core/util.js";
  import { calculateMetrics } from "../core/metrics.js";
  import Select from "./Select.svelte";
  import MarketChart from "./MarketChart.svelte";

  // 그래프에서 찍은 매물. 표에서 그 줄만 빛난다 — 점 하나가 어느 줄인지
  // 짚어 주지 않으면 그래프는 예쁜 구름일 뿐이다.
  let picked = $state(null);
  const pickKey = row => (row ? row.listing.name + row.price + row.listing.quality + row.listing.mainStat : "");

  // 귀걸이는 아직 없다. 서폿 공증이 평면으로 내 공격력에 더해지는 자리라
  // 공격력%·무공%의 값이 파티 구성에 따라 흔들린다 — 그걸 세기 전에 내놓으면
  // 틀린 숫자를 확신에 차서 보여주게 된다.
  const GRADE_OPTIONS = [{ value: "고대", label: "고대" }, { value: "유물", label: "유물" }];
  const SORTS = [
    { value: "perGold", label: "만골당" },
    { value: "gain", label: "딜 상승" },
    { value: "price", label: "가격" },
  ];

  const part = $derived(marketPart());
  const worn = $derived(wornOfPart(part));
  const found = $derived(app.market.found[part.key]);
  const all = $derived(found?.items ?? []);

  // 연마 조건은 값으로 적는다. '상'이라고만 쓰면 그게 1.55%인지 4%인지 모른다.
  const pickOptions = field => [
    { value: "any", label: "무관" },
    ...["high", "mid", "low"].map(grade => ({
      value: grade,
      label: `${GRADE_LABEL[grade]} ${GRADE_VALUES[field][grade].toFixed(2)}%`,
    })),
    { value: "none", label: "없음" },
  ];

  const rows = $derived.by(() => {
    const [a, b] = app.market.filter;
    const keep = all.filter(row => part.fields.every((field, at) => {
      const want = at === 0 ? a : b;
      if (want === "any") return true;
      return (row.listing.options[field] ?? "none") === want;
    }));
    const key = app.market.sort;
    return keep.sort((x, y) => {
      if (key === "price") return x.price - y.price;
      if (key === "gain") return y.gain - x.gain;
      return (y.perGold ?? -Infinity) - (x.perGold ?? -Infinity);
    });
  });
  const rising = $derived(rows.filter(row => row.gain > 0).length);

  // 답 띠 — 예산별로 지금 사면 제일 나은 한 장씩. 걸어 둔 조건을 그대로 딛는다.
  const picks = $derived(frontierPicks(rows));

  /**
   * 조합 격자.
   *
   * 목록은 "지금 살 것"을 답하지만 "어떤 조합이 효율이 좋은가"는 못 답한다 —
   * 맨 위 열 줄이 전부 같은 조합이면 나머지 열다섯 칸을 못 본 것이다. 이미
   * 받아 둔 매물을 조합별로 묶는다. 경매장을 또 쏘지 않으므로 '없음'도
   * 짐작이 아니라 사실이다.
   */
  const VIEWS = [
    { value: "median", label: "중앙값" },
    { value: "mean", label: "평균" },
    { value: "best", label: "최고" },
  ];
  const cells = $derived.by(() => {
    const pooled = new Map();
    all.forEach(row => {
      const key = comboOf(part, row.listing).join(":");
      if (!pooled.has(key)) pooled.set(key, []);
      pooled.get(key).push(row);
    });
    const out = new Map();
    pooled.forEach((group, key) => out.set(key, cellStats(group)));
    return out;
  });
  const seatOf = seat => seat[app.market.cellView];

  /**
   * 범례 — 조합마다 한 줄.
   *
   * 잘 사는 조합 다섯에만 색을 준다. 열여섯 색을 눈으로 가르는 사람은 없고,
   * 나머지는 회색 구름으로 남아도 "그 위쪽에 뭐가 있나"는 그대로 보인다.
   */
  const LEGEND_COLORS = 5;
  const legend = $derived.by(() => {
    const list = [...cells.entries()]
      .map(([key, seat]) => ({ key, seat, view: seatOf(seat), combo: key.split(":") }))
      .sort((a, b) => b.view.rate - a.view.rate);
    return list.map((item, at) => ({ ...item, color: at < LEGEND_COLORS ? at : null }));
  });
  const colorByCombo = $derived(new Map(legend.map(item => [item.key, item.color])));
  const colorOf = row => colorByCombo.get(comboOf(part, row.listing).join(":")) ?? null;

  // 이 부위의 옵션이 딛고 서는 현재 스펙. 없으면 +0.64%가 어디서 왔는지 모른다.
  const context = $derived.by(() => {
    const report = calculateMetrics(app.character);
    return (PART_CONTEXT[part.key] ?? [])
      .map(item => ({ label: item.label, value: readNumber(item.read(report)) }))
      .filter(item => item.value > 0);
  });
  const topCell = $derived(Math.max(0, ...[...cells.values()].map(seat => seatOf(seat).rate)));
  const cellHeat = per => (per > 0 && topCell > 0 ? (per / topCell) ** 0.35 : 0);

  /**
   * 비어 있으면 스스로 훑는다.
   *
   * 부위를 고르고 나서 "훑기"를 또 눌러야 뭔가 나오는 건 걸음이 하나 남는
   * 것이다. 차 있으면 손대지 않는다 — 시세는 사람이 갱신할 때만 바뀐다.
   */
  $effect(() => {
    if (found || app.market.running || app.market.error || !app.api.key) return;
    sweepMarket();
  });
  const gradeText = (field, grade) =>
    (grade === "none" ? "없음" : `${GRADE_LABEL[grade]} ${GRADE_VALUES[field][grade].toFixed(2)}%`);
  const onCell = (a, b) =>
    setMarket({ filter: app.market.filter[0] === a && app.market.filter[1] === b ? ["any", "any"] : [a, b] });
  const topPerGold = $derived(Math.max(0, ...rows.map(row => readNumber(row.perGold))));

  const money = gold => (gold >= 10000
    ? `${(gold / 10000).toFixed(gold >= 100000 ? 0 : 1).replace(/\.0$/, "")}만`
    : formatInteger(gold));
  const pct = value => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  const amount = line => (line.percent ? `+${line.value.toFixed(2)}%` : `+${formatInteger(line.value)}`);

  // 만골당은 자릿수가 벌어진다 — 1,000골드짜리와 170만짜리가 한 표에 있다.
  // 선형으로 칠하면 맨 위 한 줄만 색이 든다.
  const heat = per => (per > 0 && topPerGold > 0 ? (per / topPerGold) ** 0.35 : 0);
</script>

<section class="card market-head">
  <div class="market-slots">
    {#each ACCESSORY_PARTS as item (item.key)}
      <button type="button" class="market-slot" class:on={app.market.part === item.key}
              onclick={() => setMarket({ part: item.key })}>{item.label}</button>
    {/each}
  </div>

  <!-- 뺄셈의 기준. 이게 없으면 주스탯을 못 세고, 답이 통째로 낮게 나온다. -->
  <div class="market-worn">
    {#each worn as { slot, worn: mine } (slot.label)}
      {@const target = slot.key === "necklace"
        ? app.character.accessories.necklace
        : app.character.accessories[slot.key][slot.index]}
      <div class="worn-row">
        <b>{slot.label}</b>
        {#if mine}
          <span>{mine.name}</span>
          {#each part.fields as field (field)}
            <span class="worn-opt">
              {FIELD_LABEL[field]}
              {#if target[field] && target[field] !== "none"}
                +{GRADE_VALUES[field][target[field]].toFixed(2)}% <em>{GRADE_LABEL[target[field]]}</em>
              {:else}
                <em>없음</em>
              {/if}
            </span>
          {/each}
          <span class="worn-stat">주스탯 {formatInteger(mine.mainStat)}</span>
          {#if mine.flat.weaponAttack > 0}<span class="worn-stat">무기 공격력 +{formatInteger(mine.flat.weaponAttack)}</span>{/if}
          {#if mine.flat.attackPower > 0}<span class="worn-stat">공격력 +{formatInteger(mine.flat.attackPower)}</span>{/if}
        {:else}
          <span class="market-warn">주스탯 안 셈 — 캐릭터 불러오기 필요</span>
        {/if}
      </div>
    {/each}
  </div>

  {#if context.length > 0}
    <div class="market-context">
      <b>지금</b>
      {#each context as item (item.label)}
        <span>{item.label} <em>{item.value.toFixed(item.value >= 100 ? 0 : 2)}%</em></span>
      {/each}
    </div>
  {/if}

  <div class="market-filters">
    <label>등급
      <Select options={GRADE_OPTIONS} value={app.market.grade}
              onchange={value => setMarket({ grade: value })} />
    </label>
    <label>품질 <input type="number" min="0" max="100" value={app.market.quality}
                     oninput={e => setMarket({ quality: readNumber(e.currentTarget.value) })} /> 이상</label>
    <span class="filter-gap"></span>
    {#each part.fields as field, at (field)}
      <label>{FIELD_LABEL[field]}
        <Select options={pickOptions(field)} value={app.market.filter[at]}
                onchange={value => setMarket({ filter: app.market.filter.map((old, i) => (i === at ? value : old)) })} />
      </label>
    {/each}
    <label>정렬
      <Select options={SORTS} value={app.market.sort} onchange={value => setMarket({ sort: value })} />
    </label>
  </div>
</section>

{#if app.market.error}
  <section class="card market-error">{app.market.error}</section>
{:else if !app.api.key}
  <section class="card market-error">API 키가 없습니다 — 상단 <b>캐릭터</b>에서 넣습니다</section>
{/if}

<section class="card market-list">
  <div class="market-legend">
    <span class="lg-title">{part.label} 매물 {formatInteger(rows.length)}장</span>
    {#if rows.length > 0}<span class="lg-sub">오르는 것 {rising}장</span>{/if}
    <span class="lg-sub">연마 조합 16가지 × 최저가 10장</span>
    {#if app.market.running}<span class="lg-run">{app.market.done}/16</span>{/if}
  </div>

  {#if picks.length > 0}
    <!-- 답 띠. 표는 순서를, 그래프는 거리를 주지만 "그래서 뭘 사냐"는 둘 다 안 답한다. -->
    <div class="mk-picks">
      {#each picks as pick, at (at)}
        <button type="button" class="mk-pick" class:on={picked && pickKey(picked) === pickKey(pick)}
                onclick={() => (picked = pick)}>
          <span class="p-price">{money(pick.price)}</span>
          <span class="p-gain">+{pick.gain.toFixed(2)}%</span>
          <span class="p-combo">
            {#each part.fields as field (field)}
              <span>{FIELD_LABEL[field]} {gradeText(field, pick.listing.options[field] ?? "none")}</span>
            {/each}
          </span>
          <span class="p-per">품질 {pick.listing.quality} · 만골당 {pick.perGold.toFixed(4)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if rows.length > 0}
    <MarketChart {rows} {part} {colorOf} onpick={row => { picked = row; }} />
  {/if}

  {#if cells.size > 0}
    <div class="mk-gridbar">
      <span class="g-cap">조합별 경향 — 만골당 · 딜 · 최저가</span>
      <span class="g-views">
        {#each VIEWS as view (view.value)}
          <button type="button" class:on={app.market.cellView === view.value}
                  onclick={() => setMarket({ cellView: view.value })}>{view.label}</button>
        {/each}
      </span>
    </div>
    <table class="mk-legend">
      <tbody>
        {#each legend as item (item.key)}
          {@const on = app.market.filter[0] === item.combo[0] && app.market.filter[1] === item.combo[1]}
          <tr class:on>
            <td class="l-dot"><i class="dot c{item.color ?? 'x'}"></i></td>
            <td class="l-combo">
              <button type="button" onclick={() => onCell(item.combo[0], item.combo[1])}>
                {#each part.fields as field, at (field)}
                  <span>{FIELD_LABEL[field]} {gradeText(field, item.combo[at])}</span>
                {/each}
              </button>
            </td>
            <td class="i-num l-per">
              <span class:down={item.view.rate < 0} style="--heat:{cellHeat(item.view.rate)}">
                {item.view.rate > 0 ? item.view.rate.toFixed(4) : "—"}
              </span>
            </td>
            <td class="i-num l-gain" class:down={item.view.gain < 0}>{pct(item.view.gain)}</td>
            <td class="i-num l-price">{money(Math.round(item.view.price))}</td>
            <td class="i-num l-n">{item.seat.n}장</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if rows.length > 0}
    <MarketChart {rows} {part} onpick={row => { picked = row; }} />
  {/if}

  {#if rows.length === 0}
    <p class="market-empty">
      {#if app.market.running}읽는 중…{:else if found}조건에 맞는 매물 없음{:else}상단 <b>훑기</b>{/if}
    </p>
  {:else}
    <div class="market-scroll">
      <table class="market-items">
        <thead>
          <tr>
            <th class="i-num">품질</th>
            <th>연마 효과</th>
            <th class="i-num">주스탯</th>
            <th class="i-num">즉시 구매가</th>
            <th class="i-num">딜</th>
            <th class="i-num">만골당</th>
            {#if partSlots(part).length > 1}<th>바꿀 자리</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, at (at)}
            <tr class:down={row.gain < 0} class:picked={picked && pickKey(picked) === pickKey(row)}>
              <td class="i-num i-quality">{row.listing.quality}</td>
              <td class="i-grind">
                {#each orderedLines(part, row.listing) as line, at (at)}
                  <span class="grind" class:skip={!line.counted}>
                    {line.name} {amount(line)}{#if line.grade}<em>{GRADE_LABEL[line.grade]}</em>{/if}
                  </span>
                {/each}
              </td>
              <td class="i-num">{formatInteger(row.listing.mainStat)}</td>
              <td class="i-num">{money(row.price)}</td>
              <td class="i-num i-gain">{pct(row.gain)}</td>
              <td class="i-num i-per">
                {#if row.perGold === null}
                  <span class="i-dash">—</span>
                {:else}
                  <span style="--heat:{heat(row.perGold)}">{row.perGold.toFixed(4)}</span>
                {/if}
              </td>
              {#if partSlots(part).length > 1}<td class="i-slot">{row.slot.label}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
