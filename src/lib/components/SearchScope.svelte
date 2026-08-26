<script>
  import { ENGRAVING_TIERS } from "../core/engravings.js";
  import { isDirectionalConditionActive, calculateMetrics, FOODS, PASSION_DANCE_GRADES } from "../core/metrics.js";
  import { formatInteger, formatNumber, clamp, readNumber } from "../core/util.js";
  import {
    OPTIMIZER_ENGRAVING_ROLES, OPTIMIZER_ROLE_LABELS, DIRECTION_REQUIREMENT_LABELS,
    OPTIMIZER_EXHAUSTIVE_LIMIT, OPTIMIZER_PET_LABELS, OPTIMIZER_PET_OPTIONS,
    getModeledEngravings, defaultEngravingRole,
  } from "../core/search.js";
  import {
    getEngravingRole, getEngravingSearchTierIndex, getPickRole,
    SEARCH_FLOOR_FIELDS, capApplies, hasSearchBound,
  } from "../core/runner.js";
  import {
    app, persist, resetSection, basisSummary, isOpen, setFold, goTab,
  } from "../store.svelte.js";
  import Select from "./Select.svelte";
  import NodeBoard from "./NodeBoard.svelte";
  import SynergyPanel from "./SynergyPanel.svelte";
  import SynergyBrief from "./SynergyBrief.svelte";
  import Hint from "./Hint.svelte";

  let { plan, report, budget } = $props();

  // 자버프는 여기서 안 고친다. 무엇이 걸려 있는지만 적고 깨달음으로 보낸다.
  const buffSummary = $derived.by(() => {
    const rows = app.character.baseEffects ?? [];
    if (rows.length === 0) return "없음";
    const bundles = (app.character.specBundles ?? []).length;
    return bundles > 0 ? `${rows.length}줄 · 특화 묶음 ${bundles}` : `${rows.length}줄`;
  });

  const TIER_OPTIONS = ENGRAVING_TIERS.map(tier => ({ value: tier.value, label: tier.label }));
  const TIER1_OPTIONS = [
    { value: "step10", label: "10Lv 단위", hint: "빠름" },
    { value: "step5", label: "5Lv 단위" },
    { value: "step2", label: "2Lv 단위" },
    { value: "step1", label: "1Lv 단위", hint: "느림" },
    { value: "fixed", label: "현재 배분 고정" },
  ];

  const items = getModeledEngravings();
  const engravings = $derived(plan.engravings);
  const optionCount = $derived(engravings.dimensions[0]?.options.length ?? 0);
  // 조합이 적으면 전부 훑고, 많으면 빔으로 자른다. 어느 쪽이었는지가 결과의
  // 신뢰도를 정하므로 돌리기 전에 적어 둔다.
  const exhaustive = $derived(
    app.search.mode === "exhaustive"
      || (app.search.mode === "auto" && plan.totalCombos <= OPTIMIZER_EXHAUSTIVE_LIMIT),
  );

  // 어빌리티 스톤이 얹은 각인. 돌을 바꾸지 않는 한 이 각인은 빠질 수가 없어서
  // 고정이 기본값이다 — 화면에도 그 사실을 적어야 왜 고정인지 알 수 있다.
  const stones = $derived(app.character.engravingStones ?? {});

  /**
   * 펫과 음식 — 각인과 같은 말을 쓴다.
   *
   * 예전에는 '탐색에 맡김'과 갈래 하나를 한 칸에 묶은 선택 상자였다. 그러면
   * "치명만 빼고 나머지는 탐색이 고르게" 같은 것을 아예 적을 수가 없었고,
   * 무엇보다 노드·각인과 다른 말을 써서 같은 판단을 두 번 배워야 했다.
   */
  const PICK_GROUPS = $derived([
    {
      key: "petRoles",
      title: "펫 효과",
      rows: OPTIMIZER_PET_OPTIONS.map(id => ({
        id, name: OPTIMIZER_PET_LABELS[id], note: id === "none" ? "" : "해당 특성 +160",
      })),
    },
    {
      key: "foodRoles",
      title: "음식",
      rows: FOODS.map(food => ({ id: food.id, name: food.label, note: food.summary })),
    },
  ]);

  // 1T를 특화 30으로 못 박으면 펫도 특화를 끼는 것이 보통이다. 켜면 펫 갈래를
  // 특화 하나로 좁히고, 끄면 전부 후보로 되돌린다.
  const petLockedToSpec = $derived(
    OPTIMIZER_PET_OPTIONS.every(id => (id === "specStat") === (getPickRole(app.search.petRoles, id) !== "excluded")),
  );

  function lockPetToSpec(on) {
    app.search.petRoles = on
      ? Object.fromEntries(OPTIMIZER_PET_OPTIONS.map(id => [id, id === "specStat" ? "candidate" : "excluded"]))
      : {};
    persist();
  }

  function togglePick(key, id) {
    const next = { ...(app.search[key] ?? {}) };
    const off = getPickRole(next, id) === "excluded";
    next[id] = off ? "candidate" : "excluded";
    // 전부 끄면 탐색이 고를 것이 없다. 마지막 하나는 못 끄게 막는다 —
    // 갈래가 0인 차원은 조합을 0으로 만들고, 그건 뜻한 바가 아니라 실수다.
    const alive = PICK_GROUPS.find(group => group.key === key)
      .rows.filter(row => getPickRole(next, row.id) !== "excluded");
    if (alive.length === 0) return;
    app.search[key] = next;
    persist();
  }

  // 지금 빌드가 이미 몇인지 옆에 적는다. 하한을 적을 때 기준이 없으면
  // 80이 빠듯한 값인지 불가능한 값인지 알 수가 없다.
  const current = $derived(calculateMetrics(app.character));
  const floored = $derived(hasSearchBound(app.search.floors, app.search.ceilings));

  function setCeiling(field, raw) {
    app.search.ceilings = { ...app.search.ceilings, [field.key]: clamp(readNumber(raw), 0, field.max) };
    persist();
  }

  function setFloor(field, raw) {
    app.search.floors = { ...app.search.floors, [field.key]: clamp(readNumber(raw), 0, field.max) };
    persist();
  }

  // 하한은 사람이 손으로 적은 값이다. 80이라 적었으면 80이라고 되읽어야지
  // 80.00%로 돌려주면 계산이 뭘 한 것처럼 보인다.
  const asTyped = value => `${Math.round(readNumber(value) * 100) / 100}`;

  function setRole(item, role) {
    app.search.engravingRoles = { ...app.search.engravingRoles, [item.id]: role };
    persist();
  }

  function setTier(item, value) {
    app.search.engravingTiers = { ...app.search.engravingTiers, [item.id]: value };
    persist();
  }

  function preset(kind) {
    const roles = {};
    const tiers = { ...app.search.engravingTiers };
    for (const item of items) {
      if (kind === "raid") roles[item.id] = defaultEngravingRole(item);
      else if (kind === "allCandidate") roles[item.id] = "candidate";
      else if (kind === "allExcluded") roles[item.id] = "excluded";
      else if (kind === "fromCurrent") {
        const worn = app.character.engravings?.[item.id];
        const has = ENGRAVING_TIERS.some(t => t.value === worn);
        roles[item.id] = has ? "locked" : "excluded";
        if (has) tiers[item.id] = worn;
      } else if (kind === "allRelic") {
        roles[item.id] = getEngravingRole(item, app.search, stones);
        tiers[item.id] = "relic4";
      }
    }
    app.search.engravingRoles = roles;
    app.search.engravingTiers = tiers;
    persist();
  }
</script>


<!--
  탐색 대상 — "무엇을 굴릴지" 정하는 자리.

  왼쪽은 굴릴 것들(노드 · 펫 · 음식 · 각인), 오른쪽은 그 위에 거는 조건이다.
  파티 시너지는 실행 단추 아래에 있었는데, 그건 다 정하고 난 뒤에 보라는
  자리라서 뜻이 안 맞았다 — 시너지는 탐색이 딛고 서는 판이므로 안으로 들어온다.
-->
<div class="engraving-layout">
  <div class="split-main">
    <!--
      위층 — 확인하는 것.

      카드 일곱 장이 전부 펼쳐진 벽이었다. 무엇이 걸려 있는지 훑으려면 전부
      읽어야 했고, 그러느니 안 읽게 된다. 자주 만지는 것만 펴 두고 나머지는
      접는다 — 접힌 줄의 요약이 곧 지금 걸린 조건이다.
    -->
    <!--
      기준 — 탐색이 깔고 앉는 것들.

      "지금 돌리면 무엇을 기준으로 도는가"가 화면 어디에도 없었다. 그래서 빌드를
      맞바꿔도 기준이 바뀐 줄 모르고, 무엇이 고정이고 무엇이 후보인지도 몰랐다.
      여기 적힌 것이 고정부이고, 여기 없는 것(노드·각인·펫·음식)이 후보다.
    -->
    <section class="card basis-card">
      <div class="card-hd">
        <h2>기준</h2>
        <span class="basis-name">{app.buildName}</span>
        <span class="spacer"></span>
        <span class="eyebrow">여기 없는 것은 탐색이 고릅니다</span>
      </div>
      <div class="card-body">
        <div class="summary-line">
          {#each basisSummary() as item (item.label)}
            <span class="summary-chip">{item.label} <b>{item.value}</b></span>
          {/each}
        </div>
      </div>
    </section>

    <!--
      각인 후보.

      예전에는 '지금 낀 각인'과 '나머지'로 갈라 놓고 낀 것보다 높은 단계를
      고르면 경고까지 띄웠다. 낀 각인이 무엇인지는 어차피 돌 배지와 '낀 각인만
      고정' 단추가 말해 주고, 단계 경고는 있지도 않은 규칙을 지어낸 것이었다 —
      각인은 갈아끼우면 그만이다. 목록 하나로 되돌린다.
    -->
    <section class="card">
      <div class="card-hd">
        <h2>각인 후보</h2>
        <!-- 캐릭터마다 따로 기억한다. 직업이 다르면 낄 수 없는 각인이라
             앞 캐릭터의 후보가 그대로 남으면 안 된다. -->
        {#if app.characterName}
          <span class="eyebrow">{app.characterName} 것으로 저장됨</span>
        {/if}
        <span class="spacer"></span>
        <span class="eyebrow">{items.length}종</span>
      </div>

      <div class="toolbar">
        <button class="btn sm" type="button" onclick={() => preset("raid")}>레이드 기본값</button>
        <button class="btn sm" type="button" onclick={() => preset("allCandidate")}>전체 후보</button>
        <button class="btn sm" type="button" onclick={() => preset("allExcluded")}>전체 제외</button>
        <button class="btn sm" type="button" onclick={() => preset("fromCurrent")}>낀 각인만 고정</button>
        <button class="btn sm" type="button" onclick={() => preset("allRelic")}>전부 유물로</button>
      </div>

      <div class="pool-list">
        {#each items as item (item.id)}
          {@const role = getEngravingRole(item, app.search, stones)}
          {@const tierIndex = getEngravingSearchTierIndex(item, app.search)}
          {@const on = isDirectionalConditionActive(item.condition, app.character.settings)}
          {@const stoned = readNumber(stones[item.id]) > 0}
          <div class="pool-row" data-role={role} class:inactive={role !== "excluded" && !on}>
            <!-- 이름 한 줄이면 족하다. 예전에는 각인마다 효과 요약을 두 줄로
                 깔았는데, 스물두 줄이 그러면 정작 고정·후보·제외가 안 읽혔다.
                 조건이 안 맞는 각인만 !를 달고 까닭은 툴팁이 답한다. -->
            <div class="pool-name">
              <strong>{item.name}</strong>
              {#if !on}
                <em class="warnmark" title="{DIRECTION_REQUIREMENT_LABELS[item.condition]} · 지금은 효과 없음">!</em>
              {/if}
              {#if stoned}<em class="owned">스톤</em>{/if}
            </div>

            <div class="seg" role="group" aria-label="{item.name} 탐색 역할">
              {#each OPTIMIZER_ENGRAVING_ROLES as option}
                <button type="button" class:on={role === option}
                        aria-pressed={role === option}
                        onclick={() => setRole(item, option)}>{OPTIMIZER_ROLE_LABELS[option]}</button>
              {/each}
            </div>

            <div class="pool-tier">
              <Select label="{item.name} 단계" options={TIER_OPTIONS}
                      disabled={role === "excluded"}
                      value={ENGRAVING_TIERS[tierIndex].value}
                      onchange={next => setTier(item, next)} />
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- 고정 노드. 빈 판이라 지금 빌드를 안 읽고 고정한 칸만 채운다. -->
    <!-- 빈 판이다. 지금 빌드를 안 읽고 고정한 칸만 채운다. -->
    <NodeBoard {report} {budget} mode="scope" />

    <section class="card">
      <div class="card-hd">
        <h2>탐색 범위</h2>
        <span class="spacer"></span>
        <button class="reset" type="button" aria-label="탐색 범위 초기화" title="탐색 범위 초기화"
                onclick={() => resetSection("searchScope")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="fields">
          <!-- 각인 슬롯은 게임이 5개로 못 박아 둔다. 고를 것이 아니었다. -->
          <div class="field">
            <span>1T 배분</span>
            <Select label="1T 배분" options={TIER1_OPTIONS}
                    bind:value={app.search.tier1Mode} onchange={persist} />
          </div>
          <div class="checks">
            <label class="check">
              <input type="checkbox" bind:checked={app.search.tier1SpecLock} onchange={persist} />
              <span>1T 특화 30 고정</span>
            </label>
            <!-- 1T를 특화로 못 박은 사람은 펫도 특화를 낀다. 그 둘이 늘 같이
                 가므로 여기서 한 번에 정한다. -->
            {#if app.search.tier1SpecLock}
              <label class="check">
                <input type="checkbox" checked={petLockedToSpec}
                       onchange={e => lockPetToSpec(e.currentTarget.checked)} />
                <span>펫도 특화로</span>
              </label>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <!-- 파티가 무엇을 깔아 주느냐가 찍을 노드를 바꾼다 — 치적을 받쳐 주면
         치명 노드가 덜 급하다. 그래서 이것도 탐색이 딛고 서는 판이다. -->
    <section class="card">
      <div class="card-hd">
        <h2>파티 시너지</h2>
        <Hint label="헷갈리는 둘">
          <p><b>치명타 시 피해 증가</b>는 치명타 피해가 아닙니다. 회심과 곱해집니다.</p>
          <p><b>백 · 헤드어택 피해 증가</b>는 전투 상황을 켜야 9%가 됩니다.</p>
        </Hint>
        <span class="spacer"></span>
        <button class="reset" type="button" aria-label="파티 시너지 초기화" title="파티 시너지 초기화"
                onclick={() => resetSection("synergy")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        </button>
      </div>
      <div class="card-body">
        <SynergyBrief />
        <!-- 간략과 상세가 따로 있었다. 같은 파티를 두 군데서 읽게 되고,
             한쪽에서 고친 것이 다른 쪽에 어떻게 비치는지 매번 확인하게 된다. -->
        <SynergyPanel />
        <!-- 셋 다 파티가 깔아 주는 것이다. 하나만 드롭다운이면 같은 성격인 줄
             셋이 서로 다른 물건처럼 보인다 — 켜고 끄는 칩으로 맞춘다. -->
        <div class="picks">
          <div class="pick-row">
            <b>파티 버프</b>
            <div class="pick-chips">
              <button type="button" class="pick-chip" class:on={app.character.convenience.goddessBlessing}
                      aria-pressed={app.character.convenience.goddessBlessing}
                      onclick={() => { app.character.convenience.goddessBlessing = !app.character.convenience.goddessBlessing; persist(); }}>
                축복의 여신<em>공속 +9%</em>
              </button>
              <button type="button" class="pick-chip" class:on={app.character.convenience.feast}
                      aria-pressed={app.character.convenience.feast}
                      onclick={() => { app.character.convenience.feast = !app.character.convenience.feast; persist(); }}>
                만찬<em>공속 +5%</em>
              </button>
            </div>
            <span class="pick-count"></span>
          </div>
          <div class="pick-row">
            <b>정열의 춤사위</b>
            <div class="pick-chips">
              {#each PASSION_DANCE_GRADES as grade (grade.value)}
                {@const on = (app.character.convenience.passionDance ?? 0) === grade.value}
                <button type="button" class="pick-chip" class:on
                        aria-pressed={on}
                        onclick={() => { app.character.convenience.passionDance = grade.value; app.character.convenience.passionDanceSet = true; persist(); }}>
                  {grade.label}{#if grade.amount > 0}<em>진화형 +{grade.amount}%</em>{/if}
                </button>
              {/each}
            </div>
            <span class="pick-count"></span>
          </div>
        </div>
      </div>
    </section>

    <!--
      자버프는 여기서 안 고친다 — 편집 자리는 깨달음 페이지 하나다.
      두 군데서 고칠 수 있으면 어느 쪽이 진짜인지 매번 확인하게 된다.
    -->
    <section class="card">
      <div class="card-hd">
        <h2>자버프</h2>
        <span class="fold-note">{buffSummary}</span>
        <span class="spacer"></span>
        <button class="btn sm" type="button" onclick={() => goTab("awakening")}>깨달음으로 →</button>
      </div>
    </section>

    <!--
      아래층 — 파고드는 것. 처음에는 전부 접혀 있다.
    -->
    <div class="scope-deep">
    <details class="card card-fold" open={isOpen("bounds", false)} ontoggle={e => setFold("bounds", e.currentTarget.open)}>
      <summary>
        <h2>하한 · 상한</h2>
        <span class="spacer"></span>
        <button class="reset" type="button" aria-label="하한 · 상한 초기화" title="하한 · 상한 초기화"
                onclick={() => SEARCH_FLOOR_FIELDS.forEach(field => { setFloor(field, 0); setCeiling(field, 0); })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        </button>
      </summary>
      <div class="card-body">
        <div class="bounds">
          <div class="bounds-hd"><span></span><span>이상</span><span>이하</span></div>
          {#each SEARCH_FLOOR_FIELDS as field (field.key)}
            {@const need = readNumber(app.search.floors[field.key])}
            {@const cap = readNumber(app.search.ceilings[field.key])}
            {@const now = field.read(current)}
            <!-- 치적 상한은 뭉가 있는 줄과 없는 줄이 따로 선다.
                 지금 빌드에 뭉가가 없어도 탐색은 뭉가 낀 후보를 만들어 내므로
                 이 줄을 흐리게 두면 안 된다 — 지금 값 대신 무엇에 걸리는지를
                 적는다. -->
            {@const on = capApplies(field, current)}
            <div class="bounds-row"
                 class:short={(!field.capOnly && need > 0 && now < need) || (on && cap > 0 && now > cap)}>
              <span class="bounds-name">
                <label for="ceil-{field.key}">{field.label}</label>
                <em class="now">{on ? `지금 ${formatNumber(now)}%` : "뭉가 낀 후보만"}</em>
              </span>
              {#if field.capOnly}
                <span></span>
              {:else}
                <input class="boxed" id="floor-{field.key}" type="number" min="0" max={field.max} step="1"
                       aria-label="{field.label} 하한"
                       value={need} oninput={event => setFloor(field, event.currentTarget.value)} />
              {/if}
              <input class="boxed" id="ceil-{field.key}" type="number" min="0" max={field.max} step="1"
                     aria-label="{field.label} 상한"
                     value={cap} oninput={event => setCeiling(field, event.currentTarget.value)} />
            </div>
          {/each}
        </div>
        <p class="hint">0이면 안 겁니다 · 치적 상한은 뭉가 유무로 갈립니다</p>
      </div>
    </details>

    <!--
      하한 조건. 실전 세팅은 DPS 하나로 정해지지 않는다 — 치명타는 일정
      수준을 깔고 시작하는 게 먼저고, 그 밑은 아예 후보가 아니다.
    -->
    <details class="card card-fold" open={isOpen("stagger", false)} ontoggle={e => setFold("stagger", e.currentTarget.open)}>
      <summary>
        <h2>대난투</h2>
        <span class="eyebrow">제압 · 부러진 뼈 적용</span>
      </summary>
      <div class="card-body">
        <div class="fields">
          <div class="field">
            <label for="s-stagger">딜 비중 %</label>
            <input class="boxed" id="s-stagger" type="number" step="5" min="0" max="100"
                   bind:value={app.character.convenience.staggerShare} onchange={persist} />
          </div>
        </div>
      </div>
    </details>

    <!--
      펫과 음식. 갈래가 하나뿐인 차원이라 '고정 · 후보 · 제외' 세 갈래가 필요 없다.

      켠 것이 후보고, 하나만 켜면 그게 곧 고정이다. 줄마다 단추 셋을 두었더니
      여덟 줄에 스물넷이 늘어서서, 정작 "무엇을 켰나"는 한눈에 안 들어왔다.
      켜고 끄는 칩 한 줄이면 그 질문에 바로 답한다.
    -->
    <details class="card card-fold" open={isOpen("petsFood", false)} ontoggle={e => setFold("petsFood", e.currentTarget.open)}>
      <summary>
        <h2>펫 · 음식</h2>
        <span class="eyebrow">켠 것 중에서 고릅니다 · 하나만 켜면 그것으로 고정</span>
      </summary>
      <div class="card-body">
        <div class="picks">
          {#each PICK_GROUPS as group (group.key)}
            {@const on = group.rows.filter(row => getPickRole(app.search[group.key], row.id) !== "excluded")}
            <div class="pick-row">
              <b>{group.title}</b>
              <div class="pick-chips">
                {#each group.rows as row (row.id)}
                  {@const active = getPickRole(app.search[group.key], row.id) !== "excluded"}
                  <button type="button" class="pick-chip" class:on={active}
                          aria-pressed={active}
                          title={row.note}
                          onclick={() => togglePick(group.key, row.id)}>
                    {row.name}
                    {#if row.note}<em>{row.note}</em>{/if}
                  </button>
                {/each}
              </div>
              <span class="pick-count">{on.length === 1 ? "고정" : `${on.length}가지`}</span>
            </div>
          {/each}
        </div>
      </div>
    </details>
    </div>
  </div>

  <aside class="scope-rail">
    <section class="card">
      <div class="card-hd"><h2>이번 탐색</h2></div>
      <div class="card-body">
        {#if engravings.overflow}
          <p class="warn">
            고정 {engravings.locked.length}개가 슬롯 {engravings.slots}개를 넘습니다.
            개수를 늘리거나 고정을 줄여 주세요.
          </p>
        {/if}
        <!-- 켜 두고도 안 걸리는 경우가 있다. 조용히 지나가면 켠 줄 알고 결과를 믿는다. -->
        {#if plan.tier1SpecLock?.wanted && !plan.tier1SpecLock.applied}
          <p class="warn">
            1T 특화 고정이 안 걸렸습니다 — 1T가 현재 배분 고정이거나 특화를 뺐습니다.
          </p>
        {/if}
        <dl class="tally">
          <div><dt>각인 슬롯</dt><dd>{engravings.slots}개</dd></div>
          <div><dt>각인 고정</dt><dd>{engravings.locked.length}개</dd></div>
          <div><dt>각인 후보</dt><dd>{engravings.candidates.length}종</dd></div>
          <div><dt>각인 조합</dt><dd>{formatInteger(optionCount)}가지</dd></div>
          <div><dt>1T 배분</dt><dd>{formatInteger(plan.dimensions[0].options.length)}가지</dd></div>
          <div><dt>훑는 법</dt><dd>{exhaustive ? "전수" : `빔 ${formatInteger(app.search.beamWidth)}`}</dd></div>
          <div class="wide"><dt>전체 조합</dt><dd>{formatInteger(plan.totalCombos)}가지</dd></div>
        </dl>
        {#if engravings.locked.length > 0 || floored}
          <div class="summary-line">
            {#each engravings.locked as entry (entry.item.id)}
              <span class="chip locked">{entry.item.name} · {ENGRAVING_TIERS[entry.tierIndex].label}</span>
            {/each}
            {#each SEARCH_FLOOR_FIELDS as field (field.key)}
              {#if readNumber(app.search.floors[field.key]) > 0}
                <span class="chip locked">{field.label} {asTyped(app.search.floors[field.key])}% 이상</span>
              {/if}
              {#if readNumber(app.search.ceilings[field.key]) > 0}
                <span class="chip locked">{field.label} {asTyped(app.search.ceilings[field.key])}% 이하</span>
              {/if}
            {/each}
          </div>
        {/if}

      </div>
    </section>
  </aside>
</div>
