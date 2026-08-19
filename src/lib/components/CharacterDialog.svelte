<script>
  // 캐릭터 불러오기 — 로스트아크 오픈 API.
  //
  // 사전 세팅을 통째로 갈아엎는다. 체크를 끈 항목은 '남기기'가 아니라 '비우기'다.
  import { NODE_LIBRARY, EFFECT_CATEGORIES, ARC_PASSIVE_CONSTANTS } from "../core/data.js";
  import { ENGRAVING_LIBRARY, ENGRAVING_TIERS } from "../core/engravings.js";
  import { CHAOS_CORES, CHAOS_CORE_SLOTS, ARK_GRID_GEM_EFFECTS, arkGridGemDamage } from "../core/cores.js";
  import { fetchCharacter, readCharacter, LostArkError, BASE_URL } from "../core/lostark.js";
  // baseAttackPower/calculateMetrics는 맞춰 보기와 함께 떼어 냈다.
  import { getAwakeningNodes } from "../core/awakening.js";
  import {
    app, saveApiKey, applyCharacter, previewCharacter,
    IMPORT_SECTIONS, openDrawer, enableSpecLock,
  } from "../store.svelte.js";
  import { formatInteger, readNumber } from "../core/util.js";
  import Dialog from "./Dialog.svelte";
  import Hint from "./Hint.svelte";

  let { open = $bindable(false) } = $props();

  let keyDraft = $state("");
  let editingKey = $state(false);
  let name = $state("");
  let loading = $state(false);
  let error = $state("");
  let read = $state(null);
  let applied = $state(null);
  let picks = $state(Object.fromEntries(IMPORT_SECTIONS.map(section => [section.key, true])));

  const PET_STAT_BONUS = ARC_PASSIVE_CONSTANTS.petStatBonus;

  const hasKey = $derived(Boolean(app.api.key));
  const showKeyForm = $derived(!hasKey || editingKey);

  // 다이얼로그를 다시 열면 앞선 결과는 지운다. 캐릭터가 바뀌었을 수 있다.
  $effect(() => {
    if (open) return;
    read = null;
    applied = null;
    error = "";
    editingKey = false;
  });

  const GRADE_LABEL = { high: "상", mid: "중", low: "하", none: "" };
  // 계기판이 쓰는 이름과 같아야 한다. 화면 두 곳이 같은 수치를 다른 이름으로
  // 부르면 같은 것인지 알 수가 없다.
  const KEY_LABEL = {
    critRate: "치명타 적중률", critDamage: "추가 치명타 피해",
    attackSpeed: "공격 · 이동 속도", attackSpeedOnly: "공격 속도", moveSpeedOnly: "이동 속도",
    cooldownReduction: "쿨타임 감소", cooldownIncrease: "쿨타임 증가",
    manaCooldownReduction: "끝마/무마 쿨감", skillCooldownReduction: "최훈/타지 쿨감",
    critOnlyDamage: "치명타 시 주는 피해",
  };
  const keyLabel = key => KEY_LABEL[key] ?? key;
  const STAT_LABEL = {
    critStat: "치명", specStat: "특화", swiftStat: "신속",
    dominationStat: "제압", enduranceStat: "인내", expertiseStat: "숙련",
  };

  function storeKey() {
    saveApiKey(keyDraft);
    keyDraft = "";
    editingKey = false;
  }

  async function load() {
    const target = name.trim();
    if (!target || loading) return;
    loading = true;
    error = "";
    read = null;
    applied = null;
    try {
      read = readCharacter(await fetchCharacter(app.api.key, target));
      app.api.characterName = target;
    } catch (cause) {
      error = cause instanceof LostArkError ? cause.message : "불러오지 못했습니다.";
    } finally {
      loading = false;
    }
  }

  function apply(force) {
    if (!read || (stale && !force)) return;
    applied = applyCharacter(read, picks, force);
  }

  // 적용하기 전에 미리 재 본다.
  //
  // 게임에 접속한 채로 조회하면 API가 노드는 옛것, 전투 특성은 바꾼 것으로
  // 준다. 그러면 노드·팔찌가 만드는 특성이 캐릭터 합계보다 커져 도감 몫이
  // 음수가 되는데, 그대로 적용하면 특성이 통째로 어긋난 빌드가 만들어진다.
  // 다른 조회 서비스에서도 같은 일이 난다.
  const stale = $derived(read ? previewCharacter(read, picks).stale : null);

  // 갈래마다 "무엇이 들어오는지"를 한 줄로 보여준다. 체크만 있고 내용이 없으면
  // 무엇을 덮어쓰는지 모르는 채로 누르게 된다.
  const previews = $derived.by(() => {
    if (!read) return {};

    const nodes = NODE_LIBRARY
      .filter(node => (read.nodeLevels[node.id] ?? 0) > 0)
      .map(node => `${node.name} ${read.nodeLevels[node.id]}`);

    const engravings = ENGRAVING_LIBRARY
      .filter(item => read.engravings[item.id])
      .map(item => {
        const tier = ENGRAVING_TIERS.find(entry => entry.value === read.engravings[item.id]);
        return `${item.name} ${tier?.label ?? ""}`.trim();
      });

    const grind = [];
    const necklace = read.accessories.necklace;
    if (necklace.dealtDamage !== "none") grind.push(`목걸이 적주피 ${GRADE_LABEL[necklace.dealtDamage]}`);
    if (necklace.additionalDamage !== "none") grind.push(`목걸이 추피 ${GRADE_LABEL[necklace.additionalDamage]}`);
    read.accessories.earrings.forEach((earring, index) => {
      if (earring.attackPower !== "none") grind.push(`귀걸이${index + 1} 공격력 ${GRADE_LABEL[earring.attackPower]}`);
      if (earring.weaponAttack !== "none") grind.push(`귀걸이${index + 1} 무공 ${GRADE_LABEL[earring.weaponAttack]}`);
    });
    read.accessories.rings.forEach((ring, index) => {
      if (ring.critRate !== "none") grind.push(`반지${index + 1} 치적 ${GRADE_LABEL[ring.critRate]}`);
      if (ring.critDamage !== "none") grind.push(`반지${index + 1} 치피 ${GRADE_LABEL[ring.critDamage]}`);
    });

    const cores = CHAOS_CORE_SLOTS
      .map(slot => {
        const chosen = read.arkGrid.cores[slot.key];
        const core = CHAOS_CORES.find(item => item.id === chosen?.id);
        return core ? `${core.name} ${chosen.points}P` : null;
      })
      .filter(Boolean);
    ARK_GRID_GEM_EFFECTS.forEach(effect => {
      const level = read.arkGrid.gems?.[effect.key] ?? 0;
      if (level > 0) cores.push(`젬 ${effect.label} Lv${level} (+${arkGridGemDamage(effect.key, level)}%)`);
    });

    const bracelet = read.braceletStats
      ? [
        ...Object.entries(read.braceletStats).filter(([, value]) => value > 0).map(([key, value]) => `${STAT_LABEL[key]} ${value}`),
        ...(read.braceletFound ?? []),
      ]
      : [];

    const weapon = read.weaponQuality === null || read.weaponQuality === undefined
      ? []
      : [`품질 ${read.weaponQuality}`];

    // 쿨감형 보석만 센다. 몇 개 중 몇 개인지 밝혀야 제안값을 믿을지 정할 수 있다.
    const jewel = read.jewel
      ? [`쿨감 ${read.jewel.percent}%`, `보석 ${read.jewel.count}/${read.jewel.total}개 · Lv${[...new Set(read.jewel.levels)].join("·")}`]
      : [];

    const combat = Object.entries(read.profile.combat)
      .map(([key, value]) => `${STAT_LABEL[key]} ${formatInteger(value)}`);

    // 무공·힘민지를 어디서 구했는지는 반드시 밝힌다. 장비 툴팁 합산은 카르마
    // 도약과 도약 노드 몫을 놓치므로 그대로 믿으면 안 된다.
    const attack = [
      `무기 공격력 ${formatInteger(read.attack.weaponAttack)}`,
      `${read.profile.mainStatType ?? "힘민지"} ${formatInteger(read.attack.mainStat)}`,
    ];
    if (read.attackDetail) attack.push(`기본 공격력 ${formatInteger(read.attackDetail.baseAttackPower)}`);

    // 특화 효율 — 스킬군마다 다르다. 주력을 앞에 놓고 나머지도 보여준다.
    const spec = (read.specEfficiency?.lines ?? []).map(
      line => `${line.label} ${line.per100}%/100`,
    );

    // 노드와 레벨만. 어느 효과가 딜에 실리는지는 2페이지 자버프가 답한다.
    const awake = [];
    const nodes2 = getAwakeningNodes(read.awakening?.job ?? 0);
    const levels = read.awakening?.nodeLevels ?? {};
    nodes2.forEach(item => {
      const level = levels[item.id] ?? 0;
      if (level > 0) awake.push(`${item.name} ${level}`);
    });

    const karma = [];
    if (read.karma?.["진화"]) karma.push(`진화 ${read.karma["진화"].rank}랭크`);
    if (read.karma?.["깨달음"]) karma.push(`깨달음 ${read.karma["깨달음"].level}Lv`);

    return { nodes, awakening: awake, engravings, attack, specDamage: spec, accessories: grind, bracelet, arkGrid: cores, weapon, jewel, karma, stats: combat };
  });

  // 카드는 그룹이 문장으로 정해진다 — 이제 고를 여지가 없다.

  const empty = $derived.by(() => {
    if (!read) return new Set();
    return new Set(
      IMPORT_SECTIONS
        .filter(section => (previews[section.key] ?? []).length === 0)
        .map(section => section.key),
    );
  });
</script>

<Dialog bind:open title="캐릭터 불러오기" subtitle="로스트아크 오픈 API" width="820px">
  {#if showKeyForm}
    <section class="api-key">
      <div class="field">
        <span class="field-label">
          <label for="api-key">API 키</label>
          <Hint label="키 발급">
            <p><b>{BASE_URL.replace("https://", "")}</b> 에서 스토브 계정으로 로그인 후 발급합니다.</p>
            <p>키는 이 브라우저에만 저장됩니다. 서버로 전송하지 않고, 세팅 내보내기 파일에도 포함하지 않습니다.</p>
            <p>요청 한도는 분당 100회입니다.</p>
          </Hint>
        </span>
        <div class="key-row">
          <!-- 키는 비밀번호가 아니라 발급받은 문자열이다. 가리면 오타를 못 잡는다. -->
          <input id="api-key" type="text" spellcheck="false" autocomplete="off"
                 placeholder="eyJhbGciOi…" bind:value={keyDraft}
                 onkeydown={e => { if (e.key === "Enter") storeKey(); }} />
          <button class="btn primary" type="button" disabled={!keyDraft.trim()} onclick={storeKey}>저장</button>
          {#if hasKey}
            <button class="btn" type="button" onclick={() => { editingKey = false; keyDraft = ""; }}>취소</button>
          {/if}
        </div>
      </div>
      <p class="key-note">
        <a href="{BASE_URL}/" target="_blank" rel="noreferrer noopener">developer-lostark.game.onstove.com</a>
        에서 발급합니다.
      </p>
    </section>
  {:else}
    <section class="lookup">
      <div class="field">
        <label for="api-name">캐릭터 이름</label>
        <div class="key-row">
          <input id="api-name" type="text" spellcheck="false" autocomplete="off"
                 placeholder="전투 정보가 공개된 캐릭터" bind:value={name}
                 onkeydown={e => { if (e.key === "Enter") load(); }} />
          <button class="btn primary" type="button" disabled={loading || !name.trim()} onclick={load}>
            {loading ? "읽는 중…" : "불러오기"}
          </button>
          <button class="btn sm" type="button" onclick={() => { editingKey = true; keyDraft = app.api.key; }}>키 바꾸기</button>
        </div>
      </div>
    </section>
  {/if}

  {#if error}
    <p class="api-error">{error}</p>
  {/if}

  {#if applied}
    <section class="applied">
      <div class="card-hd"><h2>적용했습니다</h2></div>
      <div class="summary-line">
        {#each applied.changed as item}<span class="chip">{item}</span>{/each}
      </div>

      {#if applied.specNudge}
        <!-- 특화 효율을 안 넣으므로 탐색은 특화를 낮게 보고 치명으로 몰아 준다.
             이미 특화를 깊게 찍은 캐릭터에게는 그게 답이 아니다. -->
        <p class="nudge">
          1T 특화가 <b>{applied.specNudge.level}레벨</b>입니다. 특화 캐릭일 경우 특화 {applied.specNudge.target} 고정을 활성화 하세요.
          {#if app.search.tier1SpecLock}
            <span class="nudge-on">특화 {applied.specNudge.target} 고정이 켜져 있습니다.</span>
          {:else}
            <button class="btn sm" type="button" onclick={enableSpecLock}>
              특화 {applied.specNudge.target} 고정 켜기
            </button>
          {/if}
        </p>
      {/if}

      {#if applied.statLines.length > 0}
        {@const petLine = applied.statLines.find(line => line.withPet)}
        <!-- 전투 특성의 뺄셈. 이걸 안 보여주면 도감·물약 칸의 숫자가 어디서
             왔는지 알 수가 없고, 다음에 손으로 고칠 때 근거가 사라진다. -->
        <table class="stat-split">
          <thead>
            <tr>
              <th>특성</th><th>캐릭터</th><th>노드 · 팔찌</th>
              {#if petLine}<th>펫</th>{/if}
              <th>도감 · 물약으로</th>
            </tr>
          </thead>
          <tbody>
            {#each applied.statLines as line}
              <tr class:warn={line.rest < 0}>
                <td>{STAT_LABEL[line.key] ?? line.key}</td>
                <td>{formatInteger(line.total)}</td>
                <!-- 뺄 것이 없으면 뺄셈 기호도 없다. '−0'은 읽는 사람을 멈추게 한다. -->
                <td>{line.owned === 0 ? "0" : `−${formatInteger(line.owned)}`}</td>
                {#if petLine}
                  <td class="pet-cell">{line.withPet ? `−${formatInteger(PET_STAT_BONUS)}` : "·"}</td>
                {/if}
                <td><b>{formatInteger(line.rest)}</b></td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if applied.statLines.some(line => line.rest < 0)}
          <p class="api-warn">노드와 팔찌 몫이 캐릭터 합계보다 큽니다. 팔찌 특성이나 노드 레벨이 실제와 다를 수 있습니다.</p>
        {:else if petLine}
          <!-- 펫이 API 수치에 들어 있을 때도, 없을 때도 있다. 넘겨받은 숫자만으로는
               못 가르니 값으로 갈랐다 — 그 판정을 숨기지 않고 적는다. -->
          <p class="stat-note">
            <b>{STAT_LABEL[petLine.key] ?? petLine.key}</b>에 펫 버프 {formatInteger(PET_STAT_BONUS)}이 포함된 것으로 판단해 제외했습니다.
            사전 세팅의 펫도 <b>{STAT_LABEL[petLine.key] ?? petLine.key}</b>로 맞췄습니다.
          </p>
        {:else}
          <p class="stat-note">펫 버프는 포함되지 않았습니다. 펫은 사전 세팅에서 지정합니다.</p>
        {/if}
      {/if}

      <div class="applied-actions">
        <button class="btn" type="button" onclick={() => (open = false)}>닫기</button>
        <button class="btn primary" type="button" onclick={() => { open = false; openDrawer(); }}>빌드 보기 →</button>
      </div>
    </section>
  {:else if read}
    <section class="found">
      <div class="who">
        {#if read.profile.image}
          <img src={read.profile.image} alt="" loading="lazy" />
        {/if}
        <div>
          <strong>{read.profile.name}</strong>
          <span>{read.profile.server} · {read.profile.className} · Lv {read.profile.itemLevel}</span>
        </div>
        {#if read.arkPassivePoints["진화"]}
          <span class="eyebrow">진화 {read.arkPassivePoints["진화"]}P · 깨달음 {read.arkPassivePoints["깨달음"] ?? 0}P · 도약 {read.arkPassivePoints["도약"] ?? 0}P</span>
        {/if}
      </div>

      <div class="card-hd"><h2>가져올 것</h2></div>
      <ul class="import-list">
        {#each IMPORT_SECTIONS as section}
          {@const items = previews[section.key] ?? []}
          <li class:blank={empty.has(section.key)}>
            {#if section.readonly}
              <!-- 세팅에 안 들어가는 항목. 고를 것이 없으니 체크칸도 없다. -->
              <span class="check readonly">{section.label}</span>
            {:else}
              <label class="check">
                <input type="checkbox" bind:checked={picks[section.key]} disabled={empty.has(section.key)} />
                <span>{section.label}</span>
              </label>
            {/if}
            <div class="import-detail">
              {#if items.length === 0}
                <span class="empty">읽은 것이 없습니다</span>
              {:else}
                {#each items.slice(0, 8) as item}<b>{item}</b>{/each}
                {#if items.length > 8}<span class="more">외 {items.length - 8}개</span>{/if}
              {/if}
              {#if section.key === "attack" && read.attackDetail}
                <span class="src">기본 {formatInteger(read.attackDetail.baseAttackPower)} · 게임 {formatInteger(read.attackDetail.attackPower)}</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>

      {#if read.notes.length > 0}
        <div class="card-hd"><h2>못 읽은 것</h2></div>
        <ul class="import-notes">
          {#each read.notes as note}<li>{note}</li>{/each}
        </ul>
      {/if}

      {#if stale}
        <p class="api-block">
          <b>불러올 수 없습니다.</b> 캐릭터 접속을 종료하고 다시 불러오세요.
          <span>{stale.lines.map(line => `${STAT_LABEL[line.key] ?? line.key} ${formatInteger(line.rest)}`).join(" · ")}</span>
          <button class="btn sm" type="button" onclick={() => apply(true)}>그래도 불러오기</button>
        </p>
      {/if}

      <div class="applied-actions">
        <button class="btn" type="button" onclick={() => (open = false)}>취소</button>
        <button class="btn primary" type="button"
                disabled={Boolean(stale) || !Object.entries(picks).some(([key, on]) => on && !empty.has(key))}
                onclick={() => apply(false)}>적용</button>
      </div>
    </section>
  {/if}
</Dialog>
