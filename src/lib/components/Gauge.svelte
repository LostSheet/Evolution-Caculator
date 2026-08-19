<script>
  // 계기판. 숫자와 그 숫자가 나온 산술을 함께 보여준다.
  // 합은 출처에 +를, 곱은 ×배수를 붙여 표기하고 "합연산/곱연산"이라 쓰지 않는다.
  import { formatNumber, formatInteger, formatSignedPercent, readNumber } from "../core/util.js";
  import { STAGGER_DAMAGE_GROUPS } from "../core/metrics.js";
  import { NODE_LIBRARY } from "../core/data.js";

  // showHead=false는 서랍처럼 바깥에 이미 제목이 있는 자리에서 쓴다.
  //
  // showLead=false는 한 방 딜·DPS를 아래 고정 막대가 들고 있는 자리에서 쓴다.
  // 같은 숫자를 두 군데 띄우면 어느 쪽이 기준인지 흐려진다.
  let {
    report, deltas = [], title = "상세", note = "", meta = "",
    showHead = true, showLead = true,
  } = $props();

  // 진화 배분을 바꿔도 안 움직이는 항목은 접어 둔다. 무기 공격력 같은 것은
  // 어느 배분에나 똑같이 곱해져서 순위를 안 바꾸는데, 펼쳐 두면 움직이는 줄과
  // 섞여서 무엇을 봐야 하는지 흐려진다.
  //
  // 무엇이 움직이는지는 NODE_LIBRARY에서 뽑는다. 손으로 목록을 들면 노드가
  // 바뀔 때 조용히 어긋난다.
  const nodeKeys = kind => new Set(
    NODE_LIBRARY.flatMap(node => (node.effects ?? []).filter(e => e.kind === kind).map(e => e.key)),
  );
  const NODE_DAMAGE = nodeKeys("damage");

  // 식으로 만들어지는 그룹도 움직인다.
  //
  // 서머너 교감처럼 '신속 1당 주는 피해 0.15%'가 걸리면, 주는 피해는 어느
  // 배분에나 똑같이 곱해지는 값이 아니다 — 신속을 얼마나 사느냐가 그 값을
  // 정한다. 노드 표만 보면 그걸 알 수 없으니 실제로 걸린 식에서 읽는다.
  // 깨달음 식(기민함 · 성검 개방)도 같은 자리로 들어온다.
  const groupOf = item => (item.category === "customDamage"
    ? (item.customCategory || item.label || "기타 피해").trim()
    : String(item.category ?? "").replace(/^damage:/, ""));
  const FORMULA_DAMAGE = $derived(new Set(
    (report.metrics?.formulaResults ?? [])
      .filter(item => !item.invalid
        && (String(item.category ?? "").startsWith("damage:") || item.category === "customDamage"))
      .map(groupOf),
  ));
  // 무력화 그룹은 대난투 딜 비중만큼만 실린다. 곱셈 줄에 그냥 끼워 넣으면
  // 곱이 안 맞아서 계기판이 거짓말을 한다.
  const staggerShare = $derived(readNumber(report.metrics?.staggerShare));
  const isStagger = key => STAGGER_DAMAGE_GROUPS.has(key);

  // 비중을 적었으면 제압 노드가 무력화 그룹을 움직인다. 제압은 stat 효과라
  // NODE_DAMAGE에 안 잡히므로 여기서 따로 얹는다.
  const moves = key => NODE_DAMAGE.has(key)
    || FORMULA_DAMAGE.has(key)
    || (staggerShare > 0 && isStagger(key));

  // 쿨감은 접지 않는다. 피해 그룹과 달리 분리되지 않는다.
  //
  //   · 80% 상한이 있다. 상한에 닿으면 쿨감 노드의 값이 0이 되어 순위가 뒤집힌다.
  //     보석 쿨감 78%에서 두 빌드의 DPS비가 0.874 → 0.827로 움직이는 것을 확인했다.
  //   · 임계 쿨감(한계 구간)을 읽으려면 보석까지 더한 총합이 보여야 한다.
  //     내 로테이션이 몇 %에서 막히는지와 견주는 것이 그 열의 용도다.
  const shown = $derived(report.damage.filter(group => group.total !== 0));
  const damage = $derived(shown.filter(group => moves(group.key)));
  const damageFixed = $derived(shown.filter(group => !moves(group.key)));
  const emptyGroups = $derived(report.damage.length - shown.length);
  const cooldown = $derived(report.cooldown);
  const speed = $derived(report.speed);

  let openDamage = $state(false);

  const mul = value => `×${value.toFixed(3)}`;
  // 합연산 항목은 "더해진다"는 뜻으로 +를 달고, 곱연산 항목은 옆의 ×배수가
  // 그 역할을 하므로 +를 달지 않는다.
  const pct = value => `${value >= 0 ? "+" : ""}${formatNumber(value)}%`;
  const plain = value => `${formatNumber(value)}%`;
</script>

{#snippet cooldownGroup(group)}
  {@render row(group.label, plain(group.total), mul(group.remain), "sum")}
  {#if group.sources.length > 0 || group.scaled}
    <div class="g-src">
      {#each group.sources as source}
        {@render row(source.label, plain(source.amount), "")}
      {/each}
      <!-- 끝마/무마는 마나 스킬에만 붙는다. 그만큼만 사이클이 당겨진다. -->
      {#if group.scaled}
        {@render row(
          `쿨감 수혜 딜 ${formatInteger(group.share * 100)}%`,
          plain(group.raw),
          `→ ${plain(group.total)}`,
        )}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet damageGroup(group)}
  {@render row(group.key, group.multiplicative ? plain(group.total) : pct(group.total), mul(group.multiplier), "sum")}
  <!-- 무공·힘민지는 제곱근으로 접힌다. 합계 +12.86%와 배수 ×1.062를 그냥
       나란히 두면 계산이 틀린 것처럼 읽히므로 그 사이에 근거를 끼운다. -->
  {#if group.rooted}
    <div class="g-root">√(1 + {(group.total / 100).toFixed(4)}) — 무기 공격력과 힘민지는 기본 공격력의 제곱근 안쪽입니다</div>
  {/if}
  {#if group.sources.length > 0 || group.residual !== 0}
    <div class="g-src" class:mul={group.multiplicative}>
      {#each group.sources as source}
        {#if group.multiplicative}
          {@render row(source.label, plain(source.amount), mul(source.multiplier))}
        {:else}
          {@render row(source.label, pct(source.amount), source.capNote ?? "", source.capNote ? "hit-cap" : "")}
        {/if}
        <!-- 뭉툭한 가시·음속 돌파는 한 노드가 여러 갈래로 준다. 갈래마다 한 줄. -->
        {#if source.parts}
          <div class="g-part">
            {#each source.parts as part}
              {#if part.raw !== null && part.raw !== undefined}
                {@render capped(part.label, part.raw, part.amount)}
              {:else}
                {@render row(part.label, pct(part.amount), part.note)}
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
      {#if Math.abs(group.residual) > 1e-9}
        {@render row("기타", group.multiplicative ? plain(group.residual) : pct(group.residual), "")}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet row(label, value, factor, cls = "")}
  <div class="g-ln {cls}"><span>{label}</span><b>{value}</b><u>{factor}</u></div>
{/snippet}

<!--
  상한에 걸린 값. 예전에는 "노드 상한 24%로 잘림" 같은 문장을 오른쪽 칸에
  넣었는데, 300px 레일에서 세 줄로 접혀 읽을 수가 없었다. 값 칸 안에서
  `깎이기 전 → 적용값`으로 보이면 한 줄에 들어가고, 화살표 하나가
  계기판 전체에서 '상한에 잘렸다'는 뜻으로 통일된다.
-->
{#snippet capped(label, before, after, cls = "")}
  <div class="g-ln {cls}">
    <span>{label}</span>
    <b class="g-cut"><i>{formatNumber(before)}</i>{plain(after)}</b>
    <u></u>
  </div>
{/snippet}

<aside class="gauge">
  {#if showHead}
    <div class="g-hd">
      <h3>{title}</h3>
      <span class="spacer"></span>
      {#if meta}<span class="g-meta">{meta}</span>{/if}
    </div>
  {/if}

  {#if showLead}
  <div class="g-lead">
    <dl class="g-fig lead">
      <dt>한 방 딜</dt>
      <dd>
        {formatNumber(report.damageIndex)}
        {#if deltas[0]}<em class={deltas[0].value >= 0 ? "up" : "down"}>{formatSignedPercent(deltas[0].value)}</em>{/if}
      </dd>
      <div class="g-formula">
        {#if deltas[0]}{deltas[0].label}{:else}100 × 치명 <b>{report.crit.factor.toFixed(3)}</b> × 피해 <b>{report.damageMultiplier.toFixed(3)}</b>{/if}
      </div>
    </dl>
    <dl class="g-fig">
      <dt>DPS</dt>
      <dd>
        {formatNumber(report.dpsIndex)}
        {#if deltas[1]}<em class={deltas[1].value >= 0 ? "up" : "down"}>{formatSignedPercent(deltas[1].value)}</em>{/if}
      </dd>
      <div class="g-formula">
        {#if deltas[1]}{deltas[1].label}{:else}한 방 딜 × 쿨감 <b>{report.cooldown.factor.toFixed(3)}</b>{/if}
      </div>
    </dl>
  </div>
  {/if}

  {#if note}
    <p class="g-note">{note}</p>
  {/if}

  <!--
    출처 목록만 안에서 구른다.

    예전에는 계기판 전체가 페이지를 따라 늘어났다. 진화형 피해부터 치명 배율까지
    블록이 열 몇 개라 화면 세 배 높이가 되고, 아래로 내려가면 위쪽의 한 방 딜과
    DPS가 사라진다 — 출처를 읽는 내내 무엇을 재고 있는지가 화면에서 없어졌다.
    머리와 대표값은 붙박이로 두고 목록만 구르게 한다.
  -->
  <div class="g-scroll">

  <!-- 전투 특성 -->
  <section class="g-blk">
    <div class="g-blk-hd"><h4>전투 특성</h4></div>
    {#each report.stats as stat (stat.key)}
      {@render row(stat.label, formatInteger(stat.total), "", "sum")}
      {#if stat.sources.length > 0}
        <div class="g-src">
          {#each stat.sources as source}
            {@render row(source.label, formatInteger(source.amount), "")}
          {/each}
        </div>
      {/if}
    {/each}
  </section>

  <!-- 피해 그룹 -->
  <section class="g-blk">
    <div class="g-blk-hd">
      <h4>피해 그룹</h4>
      <span class="spacer"></span>
      <span class="g-tot">{mul(report.damageMultiplier)}</span>
    </div>

    {#each damage as group (group.key)}{@render damageGroup(group)}{/each}

    {#if damageFixed.length > 0}
      <button class="g-more" type="button" aria-expanded={openDamage}
              onclick={() => (openDamage = !openDamage)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" class:open={openDamage}><path d="m9 6 6 6-6 6" /></svg>
        진화 배분과 무관 {formatInteger(damageFixed.length)}
        <span class="g-more-keys">{damageFixed.map(group => group.key).join(" · ")}</span>
      </button>
      {#if openDamage}
        {#each damageFixed as group (group.key)}{@render damageGroup(group)}{/each}
      {/if}
    {/if}

    <div class="g-roll">
      <span>{shown.filter(group => !isStagger(group.key)).map(group => group.multiplier.toFixed(3)).join(" × ")}</span>
      {#if shown.some(group => isStagger(group.key))}
        <!-- 대난투 몫은 곱이 아니라 섞음이다. 비중을 드러내야 곱이 맞아 보인다. -->
        <span>× (1 − {staggerShare.toFixed(2)} + {staggerShare.toFixed(2)} × {report.metrics.staggerMultiplier.toFixed(3)})</span>
      {/if}
      <b>= {report.damageMultiplier.toFixed(3)}</b>
      {#if emptyGroups > 0}<small>비어 있는 그룹 {emptyGroups}개</small>{/if}
    </div>
  </section>

  <!-- 쿨타임 감소 -->
  <section class="g-blk">
    <div class="g-blk-hd">
      <h4>쿨타임 감소</h4>
      <span class="spacer"></span>
      <span class="g-tot">{formatNumber(cooldown.final)}%</span>
    </div>

    <!-- 그룹 안에서는 더하고, 그룹끼리는 곱한다. 다섯 다 적용된다. -->
    {#each cooldown.groups as group (group.key)}{@render cooldownGroup(group)}{/each}

    <div class="g-roll">
      {#if cooldown.groups.length > 0}
        <span>{cooldown.groups.map(group => group.remain.toFixed(3)).join(" × ")} = {(1 - cooldown.final / 100).toFixed(3)}</span>
      {/if}
      <b>쿨감 {formatNumber(cooldown.final)}% → {mul(cooldown.factor)}</b>
      {#if cooldown.capped}<small>80% 상한 적용</small>{/if}
    </div>
  </section>

  <!-- 공격 · 이동 속도 -->
  {#if speed.attack.sources.length > 0 || speed.move.sources.length > 0}
    <section class="g-blk">
      <div class="g-blk-hd">
        <h4>공격 · 이동 속도</h4>
        <span class="spacer"></span>
        <span class="g-tot">{formatNumber(speed.attack.total)}% · {formatNumber(speed.move.total)}%</span>
      </div>

      {#each [["공격 속도", speed.attack], ["이동 속도", speed.move]] as [name, axis]}
        <!-- 상한에 걸렸으면 `합 → 적용값`. 이 블록은 속도만 말한다. 초과분이
             음속 돌파로 간다는 설명은 그 값을 실제로 쓰는 진화형 피해 쪽에서
             한 번만 한다 — 여기에 또 적으면 공속·이속 두 줄에 붙어 두 번
             들어가는 것처럼 읽힌다. 실제로는 합쳐서 한 번 쓰인다. -->
        {#if axis.capped}
          {@render capped(name, 100 + axis.bonus, axis.total, "sum")}
        {:else}
          {@render row(name, plain(axis.total), "", "sum")}
        {/if}
        <!-- 초과분은 따로 적지 않는다. 위의 `합 → 적용값` 두 숫자의 차이가 곧 그것이다. -->
        {#if axis.sources.length > 0}
          <div class="g-src">
            {#each axis.sources as source}
              {@render row(source.label, pct(source.amount), "")}
            {/each}
            {#if Math.abs(axis.residual) > 1e-9}
              {@render row("기타", pct(axis.residual), "")}
            {/if}
          </div>
        {/if}
      {/each}
    </section>
  {/if}

  <!-- 치명타 -->
  <section class="g-blk">
    <div class="g-blk-hd">
      <h4>치명타</h4>
      <span class="spacer"></span>
      <span class="g-tot">{mul(report.crit.factor)}</span>
    </div>
    <!-- 상한에 걸렸으면 `합 → 적용값`. 초과분을 뭉툭한 가시가 어떻게 쓰는지는
         진화형 피해 쪽 갈래에 이미 적혀 있다. 여기서는 치적만 말한다. -->
    {#if report.crit.capped}
      {@render capped("적중률", report.crit.rateRaw, report.crit.rateCapped, "sum")}
    {:else}
      {@render row("적중률", plain(report.crit.rateCapped), "", "sum")}
    {/if}
    {#if report.crit.rateSources.length > 1}
      <div class="g-src">
        {#each report.crit.rateSources as source}
          {@render row(source.label, pct(source.amount), "")}
        {/each}
      </div>
    {/if}
    {@render row("치명타 피해", `${formatNumber(report.crit.damage)}%`, mul(report.crit.damage / 100), "sum")}
    {#if report.crit.damageSources.length > 0}
      <div class="g-src">
        {#each report.crit.damageSources as source}
          {@render row(source.label, pct(source.amount), "")}
        {/each}
      </div>
    {/if}
    <!-- 이것만 출처끼리 곱한다. 그래서 출처마다 ×배수를 달아 준다 —
         피해 그룹의 곱연산 목록과 같은 표기다. 안 달면 옆의 %들이 더해질 것처럼
         읽히고, 실제로 회심 12 + 현란한 일격 11이 23으로 읽혔었다. -->
    {#if report.crit.critOnly !== 0}
      {@render row("치명타 시 주는 피해", plain(report.crit.critOnly), mul(1 + report.crit.critOnly / 100), "sum")}
      {#if report.crit.critOnlySources.length > 0}
        <div class="g-src mul">
          {#each report.crit.critOnlySources as source}
            {@render row(source.label, plain(source.amount), mul(1 + source.amount / 100))}
          {/each}
        </div>
      {/if}
    {/if}
    <div class="g-roll">
      <span>
        {(1 - report.crit.rateCapped / 100).toFixed(3)}
        + {(report.crit.rateCapped / 100).toFixed(3)} × {(report.crit.damage / 100).toFixed(3)}
        {#if report.crit.critOnly !== 0}× {(1 + report.crit.critOnly / 100).toFixed(3)}{/if}
      </span>
      <b>= {report.crit.factor.toFixed(3)}</b>
    </div>
  </section>

  </div>
</aside>
