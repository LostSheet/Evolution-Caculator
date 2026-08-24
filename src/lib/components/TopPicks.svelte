<script>
  /**
   * 대표 세팅 — 답이 먼저.
   *
   * 결과가 80줄짜리 표로만 나오면 그건 답이 아니라 재료다. 사람이 실제로
   * 들고 오는 질문은 넷이고, 그 넷에 카드 한 장씩으로 답한다.
   *
   * 카드를 누르면 초점이 된다 — 표의 줄이나 곡선의 점을 누른 것과 같은 일이다.
   * 비교는 언제나 닻 대 초점 하나뿐이므로 여기서만 다르게 굴 이유가 없다.
   */
  import { NODE_LIBRARY } from "../core/data.js";
  import { calculateMetrics } from "../core/metrics.js";
  import { sweepCeiling } from "../core/ceiling.js";
  import { formatNumber, formatSignedPercent, percentDelta, readNumber, clamp } from "../core/util.js";
  import {
    app, persist, anchorState, focusResult, boxedSlot, toggleBoxed, adoptResult,
  } from "../store.svelte.js";

  const anchor = $derived(calculateMetrics(anchorState()));
  const sweep = $derived(sweepCeiling(app.results?.pareto ?? []));

  // 내 로테이션이 쿨감 몇 %에서 막히는지. 비워 두면 가장 넓은 구간의 주인이 선다.
  const limit = $derived(readNumber(app.search.ceilingGuess));
  function setLimit(raw) {
    const text = String(raw).trim();
    app.search.ceilingGuess = text === "" ? "" : clamp(readNumber(text), 0, 100);
    persist();
  }

  // 그 쿨감이 든 구간의 주인. 없으면 챔피언(구간이 가장 넓은 것).
  const ceilingPick = $derived.by(() => {
    const front = app.results?.pareto ?? [];
    if (front.length === 0) return null;
    if (limit > 0) {
      const hit = sweep.segments.find(seg => limit >= seg.from && limit <= seg.to);
      if (hit) return hit.entry;
    }
    return front.find(entry => entry.id === sweep.championId) ?? null;
  });

  const ceilingNote = $derived(
    limit > 0 ? `쿨감 ${formatNumber(limit)}%에서` : "구간이 가장 넓음",
  );

  /**
   * 카드 넷. 같은 조합이 여러 기준의 1위면 한 장으로 합치고 이름표를 나란히 단다 —
   * 같은 빌드가 네 번 서면 고를 것이 없어 보인다.
   */
  const cards = $derived.by(() => {
    if (!app.results) return [];
    const wanted = [
      { key: "damage", label: "한 방 딜 최고", entry: app.results.damage?.[0] },
      { key: "dps", label: "DPS 최고", entry: app.results.dps?.[0] },
      { key: "ceiling", label: "쿨감 한계 최강", entry: ceilingPick, note: ceilingNote },
      { key: "stagger", label: "대난투 최강", entry: app.results.stagger?.[0] },
    ].filter(item => item.entry);

    const out = [];
    wanted.forEach(item => {
      const found = out.find(card => card.entry.id === item.entry.id);
      if (found) {
        found.labels.push(item.label);
        if (item.note) found.note = item.note;
        if (item.key === "stagger") found.stagger = true;
        return;
      }
      out.push({
        id: item.entry.id,
        entry: item.entry,
        labels: [item.label],
        note: item.note ?? "",
        stagger: item.key === "stagger",
      });
    });
    return out;
  });

  const rel = (now, base) => percentDelta(now, base);
  const tier1 = entry => NODE_LIBRARY
    .filter(node => node.tier === "진화 1" && (entry.nodeLevels[node.id] || 0) > 0)
    .map(node => `${node.name} ${entry.nodeLevels[node.id]}`)
    .join(" · ");
</script>

{#if cards.length > 0}
  <div class="picks-row">
    {#each cards as card (card.id)}
      {@const boxed = boxedSlot(card.entry)}
      {@const raw = card.entry.critRateRaw ?? card.entry.critRateCapped}
      {@const dmg = rel(card.entry.damageIndex, anchor.damageIndex)}
      {@const dps = rel(card.entry.dpsIndex, anchor.dpsIndex)}
      <section class="pick-card" class:on={app.focus?.kind === "result" && app.focus.id === card.id}>
        <button class="pick-body" type="button" onclick={() => focusResult(card.entry)}>
          <div class="pick-labels">
            {#each card.labels as label}<span class="pick-label">{label}</span>{/each}
          </div>
          <div class="pick-figs">
            <span class="pick-fig">
              <u>한 방</u>
              <b>{formatNumber(card.entry.damageIndex)}</b>
              <em class={dmg >= 0 ? "up" : "down"}>{formatSignedPercent(dmg)}</em>
            </span>
            <span class="pick-fig">
              <u>DPS</u>
              <b>{formatNumber(card.entry.dpsIndex)}</b>
              <em class={dps >= 0 ? "up" : "down"}>{formatSignedPercent(dps)}</em>
            </span>
          </div>

          <dl class="pick-meta">
            <div><dt>쿨감</dt><dd>{formatNumber(card.entry.cooldownReduction)}%</dd></div>
            <div>
              <dt>치적</dt>
              <dd>
                <!-- 표와 같은 표기. 상한에 눌린 줄만 괄호로 상한 전 합산을 단다. -->
                {#if card.entry.bluntThorn && raw > card.entry.critRateCapped + 1e-9}
                  {Math.round(card.entry.critRateCapped * 100) / 100}%<i>({formatNumber(raw)}%)</i>
                {:else}
                  {formatNumber(raw)}%
                {/if}
              </dd>
            </div>
            {#if card.stagger}
              <div><dt>대난투</dt><dd>{formatNumber(card.entry.staggerIndex)}</dd></div>
            {/if}
          </dl>

          <div class="pick-1t">{tier1(card.entry)}</div>
        </button>

        <!-- 쿨감 한계는 사람마다 다르다. 그 값을 묻는 자리는 그 값이 답을
             바꾸는 카드 안이어야 한다 — 밖에 두면 빈 상자 하나가 더 서 있다. -->
        {#if card.labels.includes("쿨감 한계 최강")}
          <label class="pick-limit">
            <span>내 한계</span>
            <input type="number" min="0" max="100" step="1" placeholder="자동"
                   value={app.search.ceilingGuess ?? ""}
                   oninput={event => setLimit(event.currentTarget.value)} />
            <i>%</i>
            <em>{card.note}</em>
          </label>
        {/if}

        <div class="pick-acts">
          <button class="btn sm" type="button" onclick={() => toggleBoxed(card.entry)}>
            {boxed ? "빼기" : "담기"}
          </button>
          <button class="btn sm primary" type="button" onclick={() => adoptResult(card.entry)}>내 빌드로</button>
        </div>
      </section>
    {/each}
  </div>
{/if}
