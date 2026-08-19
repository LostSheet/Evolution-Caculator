<script>
  // 세팅 서랍. 이름 붙여 저장하고, 눌러서 갈아끼운다.
  //
  // 파일 내보내기/불러오기는 기기를 옮길 때 쓰는 것이라 여기 같이 두되 아래로
  // 내린다. 자주 하는 일은 "부캐 세팅으로 바꾸기"지 "파일 고르기"가 아니다.
  import {
    app, saveSetup, loadSetup, renameSetup, deleteSetup, describeSave,
    exportState, importState, goTab,
  } from "../store.svelte.js";

  let open = $state(false);
  let root = $state(null);
  let name = $state("");
  let editing = $state(null);
  let editName = $state("");
  let confirming = $state(null);
  let fileInput = $state(null);

  function toggle() {
    open = !open;
    if (open) { name = ""; editing = null; confirming = null; }
  }

  function commitSave() {
    if (!saveSetup(name)) return;
    name = "";
    app.status = "세팅을 저장했습니다.";
  }

  function apply(save) {
    if (!loadSetup(save.id)) return;
    open = false;
    app.status = `'${save.name}' 세팅을 불러왔습니다.`;
    goTab("setup");
  }

  function commitRename(save) {
    renameSetup(save.id, editName);
    editing = null;
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importState(file);
      app.status = "파일에서 불러왔습니다.";
      open = false;
      goTab("setup");
    } catch {
      app.status = "불러오기 파일을 읽지 못했습니다.";
    } finally {
      event.target.value = "";
    }
  }

  const when = iso => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
  };

  $effect(() => {
    if (!open) return;
    const away = event => { if (root && !root.contains(event.target)) open = false; };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  });
</script>

<div class="saves" bind:this={root}>
  <button class="btn sm" type="button" aria-haspopup="dialog" aria-expanded={open} onclick={toggle}>
    세팅{#if app.saves.length > 0}<em>{app.saves.length}</em>{/if}
  </button>

  {#if open}
    <div class="saves-pop" role="dialog" aria-label="저장된 세팅">
      <form class="saves-new" onsubmit={event => { event.preventDefault(); commitSave(); }}>
        <input type="text" placeholder="지금 세팅에 이름 붙이기" aria-label="세팅 이름" bind:value={name} />
        <button class="btn sm primary" type="submit" disabled={!name.trim()}>저장</button>
      </form>

      {#if app.saves.length === 0}
        <p class="saves-empty">저장된 세팅이 없습니다. 이름을 붙여 저장하면 여기서 눌러 바로 갈아끼울 수 있습니다.</p>
      {:else}
        <ul class="saves-list">
          {#each app.saves as save (save.id)}
            <li class="saves-row">
              {#if editing === save.id}
                <form class="saves-rename" onsubmit={event => { event.preventDefault(); commitRename(save); }}>
                  <input type="text" aria-label="새 이름" bind:value={editName} />
                  <button class="btn sm" type="submit">확인</button>
                  <button class="btn sm" type="button" onclick={() => (editing = null)}>취소</button>
                </form>
              {:else if confirming === save.id}
                <div class="saves-confirm">
                  <span>'{save.name}'을(를) 지울까요?</span>
                  <span class="spacer"></span>
                  <button class="btn sm warn" type="button" onclick={() => { deleteSetup(save.id); confirming = null; }}>지우기</button>
                  <button class="btn sm" type="button" onclick={() => (confirming = null)}>취소</button>
                </div>
              {:else}
                <button class="saves-apply" type="button" onclick={() => apply(save)}>
                  <b>{save.name}</b>
                  <small>{describeSave(save)}</small>
                  <u>{when(save.savedAt)}</u>
                </button>
                <button class="btn icon sm" type="button" title="이름 바꾸기" aria-label="{save.name} 이름 바꾸기"
                        onclick={() => { editing = save.id; editName = save.name; }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>
                </button>
                <button class="btn icon sm" type="button" title="지우기" aria-label="{save.name} 지우기"
                        onclick={() => (confirming = save.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2m-7 0 1 13h8l1-13" /></svg>
                </button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <div class="saves-file">
        <span>다른 기기로 옮길 때</span>
        <span class="spacer"></span>
        <button class="btn sm" type="button" onclick={exportState}>파일로 내보내기</button>
        <button class="btn sm" type="button" onclick={() => fileInput?.click()}>파일에서 불러오기</button>
        <input bind:this={fileInput} type="file" accept="application/json" hidden onchange={onImport} />
      </div>
    </div>
  {/if}
</div>
