<script>
  /**
   * 특화 묶음 — 아이덴티티류의 특화 가치.
   *
   * 서머너의 고대 정령, 만월의 사신화, 기공사의 금강선공. "한 방이 세지고
   * 그 한 방을 더 자주 쓰는" 구조라 특화가 피해 그룹 하나로 안 잡힌다.
   * 직업마다 다 달라서 코드가 아는 척하지 않고 유저가 게임 툴팁을 옮겨 적는다.
   *
   * 기준 특화에서 배율이 정확히 1이다 — 비중을 잰 로그에 이 효과가 이미 켜져
   * 있었으므로, 기준점에서 아무 일도 안 해야 이중계상이 없다. 탐색이 특화를
   * 움직인 만큼만 갈리고, 묶음이 있으면 특화가 탐색 후보에 자동으로 오른다.
   */
  import {
    SPEC_BUNDLE_KINDS, specBundleBlend, specBundleVariables, evaluateFormula, calculateMetrics,
  } from "../core/metrics.js";
  import { formatInteger, formatNumber, makeId } from "../core/util.js";
  import { app, persist } from "../store.svelte.js";
  import Hint from "./Hint.svelte";

  const bundles = $derived(app.character.specBundles ?? []);
  // 지금 특성 합. 묶음마다 "이 특화에서 배율 얼마"를 바로 보여줘야 값이 맞는지 안다.
  const stats = $derived.by(() => calculateMetrics(app.character).totalStats);
  const specNow = $derived(stats.specStat);
  const multiplierOf = $derived.by(() => {
    const map = new Map();
    specBundleBlend(bundles, stats).applied.forEach(item => map.set(item.id, item.multiplier));
    return map;
  });

  // 수식 줄의 즉석 검산. 오타가 조용히 0이 되면 안 되므로 값이 바로 보여야 한다.
  const evalAt = (formula, spec) => evaluateFormula(formula, specBundleVariables(stats, spec));

  function writeBundles(next) {
    app.character.specBundles = next;
    persist();
  }
  function addBundle() {
    // 묶음이 서면 옛 특화 효율 칸은 물러난다 — 같은 것을 두 번 세면 안 된다.
    app.character.base.specDamagePer100 = 0;
    writeBundles([...bundles, {
      id: makeId(), name: "", share: 0, refSpec: Math.round(specNow),
      // 특화 툴팁의 기본 꼴 — 피해 한 줄, 수급 한 줄. 칸이 처음부터 보여야
      // 무엇을 적는 물건인지 안다. 안 쓰는 줄은 지우면 된다.
      rows: [
        { kind: "damage", base: 0, amount: 0 },
        { kind: "gain", base: 0, amount: 0 },
      ],
    }]);
  }
  const patchBundle = (id, part) => writeBundles(bundles.map(b => (b.id === id ? { ...b, ...part } : b)));
  const num = raw => (String(raw).trim() === "" ? 0 : Number(raw));
</script>

<section class="card">
  <div class="card-hd">
    <h2>특화 묶음</h2>
    <Hint label="특화 묶음">
      <p>특화가 미는 스킬 묶음 — 고대 정령 · 사신화 · 금강선공.</p>
      <p><b>비중</b> — 이 묶음이 딜에서 차지하는 몫. <b>기준 특화</b>에서 잰 값.</p>
      <p><b>줄</b> — 특화 툴팁의 항목. 기준 특화에서의 값을 그대로 적습니다.
         특화 0에서도 있는 기본값(금강선공)은 왼쪽 칸에.</p>
      <p><b>수식</b> — 값 두 개로 못 적는 꼴. <code>{"{{특화}}"}</code> 변수를 쓰고,
         결과는 %포인트. 기공사: <code>(100 + 98.4) * (1 + {"{{특화}}"} * 0.0215%) - 100</code></p>
      <p>기준점에서 배율 1. 탐색이 특화를 움직인 만큼만 갈립니다.</p>
    </Hint>
    <span class="spacer"></span>
    <button class="btn sm" type="button" onclick={addBundle}>추가</button>
  </div>
  <div class="card-body">
    {#if bundles.length === 0}
      <div class="summary-line"><span class="empty">없음 · 특화 효율 칸이 대신 섭니다</span></div>
    {/if}

    {#each bundles as bundle (bundle.id)}
      <div class="spec-bundle">
        <div class="spec-bundle-hd">
          <input class="boxed" type="text" placeholder="이름" aria-label="묶음 이름"
                 value={bundle.name}
                 oninput={e => patchBundle(bundle.id, { name: e.currentTarget.value })} />
          <label class="spec-bundle-field">
            <span>비중</span>
            <input class="boxed" type="number" min="0" max="100" step="5" aria-label="딜 비중"
                   value={bundle.share === 0 ? "" : bundle.share} placeholder="0"
                   oninput={e => patchBundle(bundle.id, { share: num(e.currentTarget.value) })} />
            <em>%</em>
          </label>
          <label class="spec-bundle-field">
            <span>기준 특화</span>
            <input class="boxed" type="number" min="0" step="1" aria-label="기준 특화"
                   value={bundle.refSpec}
                   oninput={e => patchBundle(bundle.id, { refSpec: num(e.currentTarget.value) })} />
          </label>
          <span class="spacer"></span>
          {#if multiplierOf.has(bundle.id)}
            <span class="spec-bundle-out">특화 {formatInteger(specNow)} → ×{formatNumber(multiplierOf.get(bundle.id))}</span>
          {/if}
          <button class="btn icon" type="button" aria-label="묶음 지우기"
                  onclick={() => writeBundles(bundles.filter(b => b.id !== bundle.id))}>×</button>
        </div>

        {#each bundle.rows as row, at (at)}
          {@const patchRow = part => patchBundle(bundle.id, { rows: bundle.rows.map((r, i) => (i === at ? { ...r, ...part } : r)) })}
          {@const isFormula = String(row.formula ?? "") !== ""}
          <div class="spec-bundle-row">
            <select class="boxed" aria-label="종류" value={row.kind}
                    onchange={e => patchRow({ kind: e.currentTarget.value })}>
              {#each SPEC_BUNDLE_KINDS as kind (kind.value)}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
            <!-- 값 두 개로 못 적는 꼴(기본 × 증폭)은 수식으로 적는다. -->
            <select class="boxed" aria-label="적는 방식" value={isFormula ? "formula" : "plain"}
                    onchange={e => patchRow(e.currentTarget.value === "formula"
                      ? { formula: "{{특화}} * 0%" }
                      : { formula: "" })}>
              <option value="plain">값</option>
              <option value="formula">수식</option>
            </select>

            {#if isFormula}
              {@const vRef = evalAt(row.formula, bundle.refSpec)}
              {@const vNow = evalAt(row.formula, specNow)}
              <input class="boxed mono spec-bundle-formula" type="text" aria-label="수식"
                     value={row.formula}
                     oninput={e => patchRow({ formula: e.currentTarget.value })} />
              <span class="spec-bundle-peek" class:bad={vRef === null}>
                {#if vRef === null}식 오류{:else}기준 {formatNumber(vRef)}% · 지금 {formatNumber(vNow ?? 0)}%{/if}
              </span>
            {:else}
              <label class="spec-bundle-field">
                <span>특화 0</span>
                <input class="boxed" type="number" step="0.01" aria-label="특화 0일 때"
                       value={row.base === 0 ? "" : row.base} placeholder="0"
                       oninput={e => patchRow({ base: num(e.currentTarget.value) })} />
                <em>%</em>
              </label>
              <label class="spec-bundle-field">
                <span>기준에서</span>
                <input class="boxed" type="number" step="0.01" aria-label="기준 특화에서"
                       value={row.amount === 0 ? "" : row.amount} placeholder="0"
                       oninput={e => patchRow({ amount: num(e.currentTarget.value) })} />
                <em>%</em>
              </label>
            {/if}
            <span class="spacer"></span>
            <button class="btn icon" type="button" aria-label="줄 지우기"
                    onclick={() => patchBundle(bundle.id, { rows: bundle.rows.filter((_, i) => i !== at) })}>×</button>
          </div>
        {/each}
        <button class="btn sm spec-bundle-add" type="button"
                onclick={() => patchBundle(bundle.id, { rows: [...bundle.rows, { kind: "damage", base: 0, amount: 0 }] })}>
          줄 추가
        </button>
      </div>
    {/each}
  </div>
</section>
