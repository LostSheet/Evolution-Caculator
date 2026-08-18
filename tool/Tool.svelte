<script>
  /**
   * 직업 관리 툴.
   *
   * 유저 앱과 따로 선다 — 여기서 고치는 것은 코드에 커밋될 데이터이고,
   * 유저가 볼 이유도 유저 번들에 실릴 이유도 없다. `npm run tool`로만 뜬다.
   *
   * 고치면 파일에 바로 쓴다. 내려받아 손으로 옮기는 방식은 30직업 × 여러 갈래를
   * 오가다 보면 어느 파일이 최신인지 알 수 없게 된다.
   *
   * 고치는 파일은 둘이다.
   *   job-buffs.json      직업 성격 · 이 직업이 거는 버프(나에게 · 파티에도)
   *   awakening-scope.json  깨달음 효과 scope 교정. 원문 표는 안 건드린다.
   */
  import { JOB_FAMILIES } from "../src/lib/data/job-families.js";
  import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
  import { readFile, writeFile } from "./store.js";
  import Buffs from "./Buffs.svelte";
  import Awakening from "./Awakening.svelte";

  const BUFFS_PATH = "src/lib/data/job-buffs.json";
  const SCOPE_PATH = "src/lib/data/awakening-scope.json";

  const CODE_BY_NAME = Object.fromEntries(
    Object.entries(ARKPASSIVE_TREE).map(([code, tree]) => [tree.name, Number(code)]),
  );

  // 주력 특성과 공격 방향은 갈래가 정한다. 질풍노도와 이슬비는 배타이고
  // 스타일이 달라서, 한쪽은 특화 · 헤드고 다른 쪽은 치신 · 타대일 수 있다.
  const STATS = [
    { value: "", label: "안 정함" },
    { value: "spec", label: "특화" },
    { value: "critSwift", label: "치신" },
  ];
  const DIRECTIONS = [
    { value: "", label: "안 정함" },
    { value: "back", label: "백" },
    { value: "head", label: "헤드" },
    { value: "none", label: "타대" },
  ];

  let buffs = $state({});
  let scopes = $state({});
  let job = $state(102);
  let tab = $state("buffs");
  let status = $state("");
  let dirty = $state(false);

  const TABS = [
    { key: "buffs", label: "버프 · 시너지" },
    { key: "awakening", label: "깨달음 검수" },
  ];

  const current = $derived(buffs[String(job)] ?? null);
  const jobName = $derived(ARKPASSIVE_TREE[job]?.name ?? "");
  const branches = $derived(current?.branches ?? []);
  // 갈래 예순 개 중 아직 안 채운 것. 훑는 일이라 남은 수가 보여야 한다.
  const left = $derived(
    Object.values(buffs)
      .flatMap(entry => entry.branches ?? [])
      .filter(branch => !branch.stat || !branch.direction).length,
  );

  function editBranch(node, part) {
    editJob({
      branches: branches.map(branch => (branch.node === node ? { ...branch, ...part } : branch)),
    });
  }

  async function load() {
    try {
      buffs = JSON.parse(await readFile(BUFFS_PATH));
      scopes = JSON.parse((await readFile(SCOPE_PATH)) ?? "{}");
      status = "";
    } catch (cause) {
      status = `못 읽었습니다 — ${cause.message}`;
    }
  }

  async function save() {
    try {
      await writeFile(BUFFS_PATH, `${JSON.stringify(buffs, null, 2)}\n`);
      await writeFile(SCOPE_PATH, `${JSON.stringify(scopes, null, 2)}\n`);
      dirty = false;
      // 생성된 core는 이 JSON을 읽는다. 앱에 반영하려면 한 번 돌려야 한다.
      status = "저장했습니다 · 앱에 반영하려면 npm run extract:core";
    } catch (cause) {
      status = `못 썼습니다 — ${cause.message}`;
    }
  }

  function editJob(patch) {
    buffs[String(job)] = { ...current, ...patch };
    dirty = true;
  }

  // 교정은 덮어쓰기다 — 원문 표는 안 건드린다. null을 주면 그 줄을 되돌린다.
  function editFix(key, part) {
    const forJob = { ...(scopes[String(job)] ?? {}) };
    const merged = { ...(forJob[key] ?? {}), ...part };
    // 남는 것이 없으면 열쇠째 지운다. 빈 껍데기가 diff에 남으면 안 된다.
    if (merged.scope === null) delete merged.scope;
    if (merged.amounts === null) delete merged.amounts;
    if (merged.branch === null) delete merged.branch;
    if (Object.keys(merged).length === 0) delete forJob[key];
    else forJob[key] = merged;
    scopes[String(job)] = forJob;
    dirty = true;
  }

  const fixes = $derived.by(() => {
    const forJob = scopes[String(job)] ?? {};
    const scope = {}, amounts = {}, branch = {};
    for (const [key, fix] of Object.entries(forJob)) {
      if (fix.scope) scope[key] = fix.scope;
      if (fix.amounts) amounts[key] = fix.amounts;
      // 빈 문자열도 뜻이 있다 — "원문은 갈래인데 갈래 무관으로 고쳤다".
      if (fix.branch !== undefined) branch[key] = fix.branch;
    }
    return { scope, amounts, branch };
  });

  load();
</script>

<header class="tool-top">
  <div class="wordmark">직업 관리 <b>툴</b></div>
  <span class="spacer"></span>
  <span class="eyebrow">갈래 미정 {left} / 60</span>
  <button class="btn primary" type="button" disabled={!dirty} onclick={save}>
    {dirty ? "저장" : "저장됨"}
  </button>
</header>

{#if status}
  <p class="tool-status" class:bad={status.startsWith("못")}>{status}</p>
{/if}

<div class="tool-split">
  <nav class="tool-jobs" aria-label="직업">
    {#each JOB_FAMILIES as family (family.name)}
      <b>{family.name}</b>
      {#each family.rows as row (row.label + family.name)}
        {#each row.jobs as name (name)}
          {@const code = CODE_BY_NAME[name]}
          <button type="button" class="tool-job" class:on={code === job}
                  onclick={() => (job = code)}>
            {name}
            {#if (buffs[String(code)]?.branches ?? []).some(b => !b.stat || !b.direction)}<i>·</i>{/if}
          </button>
        {/each}
      {/each}
    {/each}
  </nav>

  <main class="tool-main">
    <div class="tool-hd">
      <h1>{jobName}</h1>
      <span class="eyebrow">{job}</span>
      <span class="spacer"></span>
      <div class="tool-tabs" role="tablist">
        {#each TABS as item (item.key)}
          <button type="button" class="tool-tab" class:on={tab === item.key}
                  role="tab" aria-selected={tab === item.key}
                  onclick={() => (tab = item.key)}>{item.label}</button>
        {/each}
      </div>
    </div>

    {#if !current}
      <p class="tool-status">표가 없습니다.</p>
    {:else if tab === "buffs"}
      <section class="card">
        <div class="card-hd">
          <h2>갈래</h2>
          <span class="eyebrow">깨달음 1티어 배타 둘</span>
        </div>
        <div class="card-body">
          {#each branches as branch (branch.node)}
            <div class="tool-branch">
              <b>{branch.node}</b>
              <div class="picks">
                <div class="pick-row">
                  <b>주력 특성</b>
                  <div class="pick-chips">
                    {#each STATS as option (option.value)}
                      <button type="button" class="pick-chip" class:on={branch.stat === option.value}
                              aria-pressed={branch.stat === option.value}
                              onclick={() => editBranch(branch.node, { stat: option.value })}>{option.label}</button>
                    {/each}
                  </div>
                  <span class="pick-count"></span>
                </div>
                <div class="pick-row">
                  <b>공격 방향</b>
                  <div class="pick-chips">
                    {#each DIRECTIONS as option (option.value)}
                      <button type="button" class="pick-chip" class:on={branch.direction === option.value}
                              aria-pressed={branch.direction === option.value}
                              onclick={() => editBranch(branch.node, { direction: option.value })}>{option.label}</button>
                    {/each}
                  </div>
                  <span class="pick-count"></span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <Buffs entry={current} {branches} onchange={editJob} />
    {:else}
      <Awakening {job} overrides={fixes}
                 onscope={(key, scope) => editFix(key, { scope })}
                 onamounts={(key, amounts) => editFix(key, { amounts })}
                 onbranch={(key, branch) => editFix(key, { branch })} />
    {/if}
  </main>
</div>
