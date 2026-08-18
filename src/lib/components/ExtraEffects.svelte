<script>
  /**
   * 자버프.
   *
   * 이 계산기가 오래 못 풀던 질문이 하나 있었다 — "그 효과가 내 딜의 몇
   * 퍼센트에 실리느냐". 깨달음 효과의 대부분은 조건부라(스킬 쓴 뒤 8초, 구획
   * 안, 중첩 몇 개) 답이 사람마다 로테이션마다 다르다. 정책을 하나 고르려던
   * 시도가 여러 번 흐지부지됐다.
   *
   * 그래서 정책을 안 고른다. 전부 100%로 실어 놓고 줄마다 유효율을 손으로
   * 적게 한다. 깨달음이 주는 줄은 여기에 미리 서 있고, 트리에 없는 것 —
   * 아이덴티티, 스킬 자버프(사신화, 용맹의 포효) — 은 손으로 더한다.
   *
   * 깨달음 줄을 여기서 두 번 세지 않는다. 트리가 합산할 때 이미 유효율을
   * 곱하므로, 위 목록은 그 합산을 눈으로 보고 손대는 창일 뿐이다.
   */
  import { EFFECT_CATEGORIES } from "../core/data.js";
  import { awakeningBonuses } from "../core/awakening.js";
  import { synergyBonuses, SYNERGY_OWN_ID, SYNERGY_BASE_KEY, SYNERGY_UPTIME_FULL } from "../core/synergy.js";
  import { setSynergyUptime } from "../store.svelte.js";
  import {
    FORMULA_VARIABLES, getFormulaStage, evaluateFormula, buildFormulaVariables, calculateMetrics,
  } from "../core/metrics.js";
  import { makeId, formatNumber, readNumber } from "../core/util.js";
  import { app, persist, resetSection } from "../store.svelte.js";
  import Hint from "./Hint.svelte";
  import Select from "./Select.svelte";

  // 속도를 재료로 쓰는 줄은 속도 자체를 대상으로 삼을 수 없다. 속도가 정해진
  // 뒤에 걸리므로 되먹임이 없고, 아무 일도 안 일어난 것처럼 보이기 때문이다.
  const SPEED_TARGETS = new Set(["attackSpeedOnly", "moveSpeedOnly"]);
  const CATEGORY_OPTIONS = EFFECT_CATEGORIES.map(c => ({ value: c.value, label: c.label }));
  const CONVERSION_CATEGORY_OPTIONS = CATEGORY_OPTIONS.filter(c => !SPEED_TARGETS.has(c.value));

  // 식에 쓸 수 있는 재료값들. 지금 빌드 기준으로 실제 숫자를 같이 보여 줘야
  // 값이 몇인지 몰라서 못 쓰는 일이 없다.
  const formulaVars = $derived.by(() => {
    const metrics = calculateMetrics(app.character);
    return buildFormulaVariables(metrics.attackSpeed, metrics.moveSpeedBonus, metrics.totalStats, {
      rateCapped: metrics.critRateCapped, rateRaw: metrics.critRateRaw, damage: metrics.critDamage,
    });
  });
  const preview = formula => evaluateFormula(formula, formulaVars);

  // 깨달음이 실제로 얹고 있는 줄. 트리가 계산한 그대로를 받아 적는다 —
  // 여기서 다시 세면 두 곳이 어긋난다.
  //
  // 도약은 뺀다. awakeningBonuses는 두 트리를 같이 훑는데, 도약이 딜에
  // 얹는 것은 거의 전부 스킬 하나짜리(초각성기 · 각성기)라 애초에 안 실린다.
  const awakeningRows = $derived(
    awakeningBonuses(
      app.character.awakening?.job,
      app.character.awakening?.nodeLevels,
      app.character.awakening?.uptime,
    ).applied.filter(row => row.group === "깨달음"),
  );

  function setUptime(key, raw) {
    const next = { ...(app.character.awakening?.uptime ?? {}) };
    if (String(raw).trim() === "") delete next[key];
    else next[key] = Math.max(0, Math.min(100, Math.round(readNumber(raw))));
    app.character.awakening = { ...app.character.awakening, uptime: next };
    persist();
  }

  // 손으로 적은 줄에도 같은 칸을 단다. 사신화처럼 '쓸 때만'인 것이 대부분이라
  // 유효율이 없으면 늘 켜져 있는 것으로 읽힌다.
  function setEffectUptime(effect, raw) {
    effect.uptime = String(raw).trim() === "" ? "" : Math.max(0, Math.min(100, Math.round(readNumber(raw))));
    persist();
  }

  /**
   * 내 직업이 나에게 주는 몫.
   *
   * 파티 시너지 표에 '내 캐릭터' 줄로 서 있지만, 그건 남에게 주는 것과 같은
   * 표에 있을 뿐 성격이 다르다 — 남이 주는 버프는 파티 편성이 정하고, 내 것은
   * 내 깨달음이 정한다. 기상술사의 질풍노도가 그렇다. 그래서 유효율을 매기는
   * 자리도 여기다. 파티 시너지 쪽에서는 결과만 읽는다.
   */
  const ownSynergy = $derived.by(() => {
    const result = synergyBonuses(app.character.awakening, app.character.synergy, app.character.settings);
    const row = result.rows.find(item => item.own);
    if (!row) return [];
    return row.buffs.map(buff => ({
      key: buff.node ?? SYNERGY_BASE_KEY,
      name: buff.node || row.name,
      what: buff.parts.map(part => `${part.label} +${formatNumber(part.amount)}%`).join(" · "),
      uptime: buff.uptime,
    }));
  });

  const rowValue = row => (row.kind === "formula"
    ? String(row.formula ?? "").replace(/\{n\}/g, formatNumber(row.ratio))
    : `${row.key} +${formatNumber(row.amount)}`);

  // 계층이 있다. 치명타를 만드는 식은 치명타를 읽을 수 없다 — 그 순간 순환이다.
  // 피해를 만드는 식은 속도도 치명타도 읽을 수 있다.
  const variablesFor = category => {
    const stage = getFormulaStage(category);
    return FORMULA_VARIABLES
      .filter(v => v.stage < stage)
      .map(v => ({ value: v.name, label: v.name, hint: v.hint }));
  };

  // 식은 문자열로 저장하지만 손으로 치게 두지 않는다. 변수 이름을 오타 내면
  // 조용히 0이 되어 왜 안 맞는지 알 수 없기 때문이다.
  //
  // 예전에는 임의의 n항을 조립하게 했다 — 항마다 드롭다운·연산자·상수·종류
  // 전환 단추가 붙어서, 두 낱말짜리 식 하나에 칸이 여섯이었다. 그런데 실제
  // 게임 노드는 전부 같은 모양이다:
  //
  //   기민함     공격속도 × 120%        성검 개방  치적 × 55%, 최대 55
  //   기민함     이동속도 × 30%         돌격대장   이동속도 × 48%
  //
  // 그래서 모양을 `변수 × 비율`의 합으로 좁혔다. 나눗셈은 비율로 적으면 되고
  // (÷2 = ×50%), 괄호가 필요한 식은 아직 하나도 안 나왔다. 못 읽는 옛 식은
  // 예전처럼 읽기 전용으로 보여 준다.
  //
  //   {{공격속도}} * 120%  +  {{이동속도}} * 30%

  function parseFactors(formula) {
    const text = String(formula ?? "").trim();
    if (!text) return [];
    const pattern = /\s*([+-])?\s*\{\{([^}]+)\}\}\s*(?:\*\s*(\d+(?:\.\d+)?)(%?))?\s*/gy;
    const out = [];
    let at = 0;
    while (at < text.length) {
      pattern.lastIndex = at;
      const match = pattern.exec(text);
      if (!match) return null;
      // 비율을 안 적었으면 그 값 그대로(100%). `* 0.55`처럼 %가 없으면 배수다.
      const raw = match[3];
      const ratio = raw === undefined ? 100 : (match[4] === "%" ? Number(raw) : Number(raw) * 100);
      out.push({ op: out.length === 0 ? "+" : (match[1] ?? "+"), name: match[2].trim(), ratio });
      at = pattern.lastIndex;
    }
    return out.length > 0 ? out : null;
  }

  const trimRatio = value => `${Math.round(readNumber(value) * 1000) / 1000}`;

  const factorsToFormula = factors => factors
    .map((factor, i) => `${i === 0 ? "" : `${factor.op} `}{{${factor.name}}} * ${trimRatio(factor.ratio)}%`)
    .join(" ")
    .trim();

  function writeFactors(effect, factors) {
    effect.formula = factorsToFormula(factors);
    persist();
  }

  const OP_OPTIONS = [{ value: "+", label: "+" }, { value: "-", label: "−" }];

  function addFactor(effect) {
    const factors = parseFactors(effect.formula) ?? [];
    const allowed = variablesFor(effect.category);
    if (allowed.length === 0) return;
    writeFactors(effect, [...factors, { op: "+", name: allowed[0].value, ratio: 100 }]);
  }
  function removeFactor(effect, index) {
    const factors = parseFactors(effect.formula) ?? [];
    writeFactors(effect, factors.filter((_, i) => i !== index));
  }
  function setFactor(effect, index, patch) {
    const factors = parseFactors(effect.formula) ?? [];
    factors[index] = { ...factors[index], ...patch };
    writeFactors(effect, factors);
  }


  function addEffect() {
    app.character.baseEffects.push({
      id: makeId(), label: "새 효과", category: "damage:진화형 피해", customCategory: "",
      amount: 0, formula: "", cap: "",
    });
    persist();
  }

  // 계산 방식은 아이콘이 아니라 드롭다운으로 고른다. 예전에는 ⇄ 아이콘 하나에
  // 숨어 있어서, 이 줄이 식이 될 수 있다는 사실 자체를 발견할 수가 없었다.
  const MODE_OPTIONS = [
    { value: "fixed", label: "고정 수치" },
    { value: "ratio", label: "수식" },
  ];

  // 미리보기 두 줄. 위는 "내가 뭘 만들었나", 아래는 "그게 맞나"에 답한다.
  //   공격속도 × 120% + 이동속도 × 30%
  //   38.91 × 120% + 40.00 × 30% = 58.69
  const SIGN = { "+": "+", "-": "−" };
  const joinTerms = (factors, head) => factors
    .map((factor, i) => `${i === 0 ? "" : `${SIGN[factor.op] ?? "+"} `}${head(factor)} × ${trimRatio(factor.ratio)}%`)
    .join(" ");
  const previewSymbols = factors => joinTerms(factors, factor => factor.name);
  const previewNumbers = factors => joinTerms(factors, factor => formatNumber(formulaVars[factor.name] ?? 0));

  function setMode(effect, mode) {
    if (mode === "ratio") {
      // 속도를 대상으로 삼으면 되먹임이 없어 아무 일도 안 일어난다. 대상을 옮긴다.
      if (SPEED_TARGETS.has(effect.category)) effect.category = "critDamage";
      const allowed = variablesFor(effect.category);
      effect.formula = `{{${allowed[0]?.value ?? "공격속도"}}} * 100%`;
    } else {
      effect.formula = "";
      effect.cap = "";
    }
    persist();
  }

  function removeEffect(id) {
    app.character.baseEffects = app.character.baseEffects.filter(effect => effect.id !== id);
    persist();
  }
</script>
<section class="card">
  <div class="card-hd">
    <h2>자버프</h2>
    <Hint label="유효율">
      <p>줄마다 <b>유효율</b>을 적습니다 — 그 효과가 내 딜의 몇 퍼센트에 실리는지.</p>
      <p>비워 두면 <b>100%</b>입니다. 전부 실린다고 보고 시작해서, 아니라고 아는 줄만 내립니다.</p>
      <p>깨달음이 주는 줄은 미리 서 있습니다. 트리에 없는 것 — 아이덴티티, 사신화, 용맹의 포효 — 은 아래에 더합니다.</p>
      <p><b>⇄</b> 를 누르면 <b>식</b>으로 바꿉니다 — 공격속도 × 120% → 치명타 피해 같은 것.</p>
      <p><b>공격속도</b>는 상한 40%를 먹인 뒤의 값입니다. 상한 전 값은 <b>공격속도합</b>.</p>
    </Hint>
    <span class="spacer"></span>
    <button class="reset" type="button" aria-label="손으로 적은 줄 초기화" title="손으로 적은 줄 초기화"
            onclick={() => resetSection("baseEffects")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
    </button>
    <button class="btn sm" type="button" onclick={addEffect}>추가</button>
  </div>

  <!--
    깨달음이 주는 줄. 값은 트리가 정하고 여기서는 유효율만 만진다.

    왜 여기 있는가: 트리에서는 노드 하나가 효과 셋을 갖기도 해서 "어느 효과가
    얼마나 실리는가"를 노드 칸 안에서 물을 자리가 없다. 효과를 한 줄씩 펴 놓아야
    그 질문에 답할 칸이 생긴다.
  -->
  <!-- 내 직업의 자버프. 파티 시너지 표가 아니라 여기서 정한다. -->
  {#if ownSynergy.length > 0}
    <div class="pool-head"><b>내 직업</b><span>{ownSynergy.length}줄</span></div>
    <div class="uptime-list">
      {#each ownSynergy as row (row.key)}
        <div class="uptime-row" class:dimmed={row.uptime === 0}>
          <span class="uptime-name">{row.name}</span>
          <span class="uptime-what"><i>{row.what}</i></span>
          <label class="uptime-rate">
            <input class="boxed" type="number" min="0" max="100" step="5"
                   aria-label="{row.name} 유효율" placeholder="100"
                   value={row.uptime === SYNERGY_UPTIME_FULL ? "" : row.uptime}
                   oninput={e => setSynergyUptime(SYNERGY_OWN_ID, row.key, e.currentTarget.value === "" ? SYNERGY_UPTIME_FULL : e.currentTarget.value)} />
            <em>%</em>
          </label>
        </div>
      {/each}
    </div>
  {/if}

  {#if awakeningRows.length > 0}
    <div class="pool-head"><b>깨달음</b><span>{awakeningRows.length}줄</span></div>
    <div class="uptime-list">
      {#each awakeningRows as row (row.uptimeKey)}
        <div class="uptime-row" class:dimmed={row.uptime === 0}>
          <span class="uptime-name">{row.node}</span>
          <span class="uptime-what">
            <i>{rowValue(row)}</i>{row.note ? ` · ${row.note}` : ""}
          </span>
          <label class="uptime-rate">
            <input class="boxed" type="number" min="0" max="100" step="5"
                   aria-label="{row.node} 유효율"
                   value={app.character.awakening?.uptime?.[row.uptimeKey] ?? ""}
                   placeholder={row.uptime}
                   oninput={e => setUptime(row.uptimeKey, e.currentTarget.value)} />
            <em>%</em>
          </label>
        </div>
      {/each}
    </div>
  {/if}

  <div class="card-body">
    {#if app.character.baseEffects.length === 0}
      <div class="summary-line"><span class="empty">없음</span></div>
    {:else}
      <div class="effect-list">
        {#each app.character.baseEffects as effect (effect.id)}
          {@const isFormula = !!effect.formula?.trim()}
          {@const rawValue = isFormula ? preview(effect.formula) : null}
          {@const hasCap = effect.cap !== "" && effect.cap !== null && effect.cap !== undefined}
          {@const value = rawValue !== null && hasCap ? Math.min(rawValue, readNumber(effect.cap)) : rawValue}
          <div class="effect-row" class:custom={effect.category === "customDamage"}>
            <input class="boxed" type="text" aria-label="효과 이름" bind:value={effect.label} onchange={persist} />
            <Select label="효과 종류" align="left"
                    options={isFormula ? CONVERSION_CATEGORY_OPTIONS : CATEGORY_OPTIONS}
                    bind:value={effect.category} onchange={persist} />
            {#if effect.category === "customDamage"}
              <input class="boxed" type="text" aria-label="피해 그룹 이름"
                     bind:value={effect.customCategory} onchange={persist} />
            {/if}
            <!-- 계산 방식. 아이콘이 아니라 드롭다운이어야 '식이 될 수 있다'는
                 사실이 화면에 보인다. -->
            <Select label="{effect.label} 계산 방식" options={MODE_OPTIONS}
                    value={isFormula ? "ratio" : "fixed"}
                    onchange={mode => setMode(effect, mode)} />
            <!-- 칸 수가 바뀌면 바깥 그리드가 흐트러지므로 한 칸으로 감싼다. -->
            <div class="effect-value">
              {#if isFormula}
                <span class="formula-out" class:bad={value === null}>
                  {value === null ? "식 오류" : formatNumber(value)}
                </span>
              {:else}
                <input class="boxed" type="number" step="0.01" aria-label="수치"
                       bind:value={effect.amount} onchange={persist} />
              {/if}
            </div>
            <!-- 깨달음 줄과 같은 칸. 사신화처럼 '쓸 때만'인 것이 대부분이라
                 유효율이 없으면 늘 켜져 있는 것으로 읽힌다. -->
            <label class="uptime-rate">
              <input class="boxed" type="number" min="0" max="100" step="5"
                     aria-label="{effect.label} 유효율" placeholder="100"
                     value={effect.uptime ?? ""}
                     oninput={e => setEffectUptime(effect, e.currentTarget.value)} />
              <em>%</em>
            </label>
            <button class="btn icon" type="button" aria-label="삭제" onclick={() => removeEffect(effect.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7h14M10 11v6M14 11v6M9 7l1-3h4l1 3M7 7l1 14h8l1-14" />
              </svg>
            </button>

            <!--
              비례 줄. 한 문장으로 읽혀야 한다 — "공격속도 38.91%의 120%".
              항마다 종류 전환 단추를 달지 않는다. 변수는 드롭다운, 비율은
              숫자 칸, 그 둘이 한 항의 전부다.
            -->
            {#if isFormula}
              {@const factors = parseFactors(effect.formula)}
              <div class="formula">
                {#if factors === null}
                  <p class="formula-raw">손으로 적은 식입니다 — <code>{effect.formula}</code></p>
                {:else}
                  <!-- 미리보기 두 줄. 위는 "내가 뭘 만들었나", 아래는 "그게 맞나". -->
                  <div class="ratio-peek">
                    <p class="peek-symbols">{previewSymbols(factors)}</p>
                    <p class="peek-numbers">
                      {previewNumbers(factors)}
                      {#if rawValue === null}
                        <b class="bad">식 오류</b>
                      {:else}
                        <b>= {formatNumber(rawValue)}</b>
                        {#if hasCap && value !== rawValue}<i>→ 최대 {formatNumber(readNumber(effect.cap))}</i>{/if}
                      {/if}
                    </p>
                  </div>

                  <!-- 항은 한 행씩. 첫 행에도 부호 칸을 비워 두어야 열이 맞는다. -->
                  <div class="ratio">
                    {#each factors as factor, i (i)}
                      <div class="ratio-term">
                        {#if i > 0}
                          <Select label="{i + 1}번째 부호" options={OP_OPTIONS}
                                  value={factor.op} onchange={op => setFactor(effect, i, { op })} />
                        {:else}
                          <span></span>
                        {/if}
                        <Select label="{i + 1}번째 항" align="left" options={variablesFor(effect.category)}
                                value={factor.name} onchange={name => setFactor(effect, i, { name })} />
                        <span class="ratio-now">{formatNumber(formulaVars[factor.name] ?? 0)}</span>
                        <span class="ratio-of">의</span>
                        <input class="boxed mono ratio-pct" type="number" step="0.1"
                               aria-label="{i + 1}번째 비율"
                               value={factor.ratio}
                               onchange={e => setFactor(effect, i, { ratio: readNumber(e.currentTarget.value) })} />
                        <span class="ratio-of">%</span>
                        {#if factors.length > 1}
                          <button type="button" class="term-del" aria-label="{i + 1}번째 항 지우기"
                                  onclick={() => removeFactor(effect, i)}>×</button>
                        {:else}
                          <span></span>
                        {/if}
                      </div>
                    {/each}

                    <div class="ratio-add">
                      <button type="button" class="term-add" onclick={() => addFactor(effect)}>+ 항</button>
                    </div>

                    <!-- 게임 노드는 대개 "최대 55%까지"가 붙는다. 식 안에 min()을
                         넣게 하는 것보다 칸 하나가 읽고 고치기 쉽다.
                         항들과 같은 줄에 두면 마지막 항에만 걸리는 것처럼 읽혀서
                         선을 긋고 자기 행으로 내린다 — 결과 전체에 걸리는 값이다. -->
                    <label class="ratio-cap">
                      <span>최대</span>
                      <input class="boxed mono" type="number" step="0.01" placeholder="없음"
                             aria-label="{effect.label} 상한"
                             bind:value={effect.cap} onchange={persist} />
                      <em>결과 전체에 걸립니다</em>
                    </label>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
