<script>
  // 네이티브 select 대신 쓰는 목록 상자.
  //
  // 네이티브는 OS가 그리는 팝업이라 폰트도 색도 이 화면과 따로 논다. 폭이 긴
  // 코어 이름은 잘리고, 부가 설명을 곁들일 자리도 없다. 그래서 직접 그린다.
  //
  // 대신 네이티브가 공짜로 주던 것들은 되살려야 한다 — 키보드 이동, 타이핑으로
  // 건너뛰기, 바깥 클릭으로 닫기, 열 때 현재 값으로 스크롤.
  let {
    value = $bindable(),
    options = [],
    label = "",
    disabled = false,
    onchange = () => {},
    align = "right",
  } = $props();

  let open = $state(false);
  let active = $state(-1);
  let root = $state(null);
  let listbox = $state(null);
  let query = "";
  let queryTimer = 0;

  const index = $derived(options.findIndex(item => item.value === value));
  const current = $derived(index >= 0 ? options[index] : null);
  // 목록이 길어지면 눈으로 훑기 어렵다. 그때만 검색칸을 붙인다.
  const searchable = $derived(options.length > 12);
  let filter = $state("");
  const shown = $derived(
    searchable && filter.trim()
      ? options.filter(item => item.label.toLowerCase().includes(filter.trim().toLowerCase()))
      : options,
  );

  function toggle() {
    if (disabled) return;
    // 열기 전에 방향을 정한다. 열고 나서 재면 잘린 채로 한 프레임이 지나간다.
    if (!open) place();
    open = !open;
    if (open) {
      filter = "";
      active = Math.max(0, shown.findIndex(item => item.value === value));
      queueMicrotask(() => {
        listbox?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
      });
    }
  }

  function choose(item) {
    if (item.disabled) return;
    value = item.value;
    open = false;
    root?.querySelector("button")?.focus();
    onchange(item.value);
  }

  function move(step) {
    if (shown.length === 0) return;
    let next = active;
    for (let i = 0; i < shown.length; i += 1) {
      next = (next + step + shown.length) % shown.length;
      if (!shown[next].disabled) break;
    }
    active = next;
    queueMicrotask(() => {
      listbox?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
    });
  }

  function onKey(event) {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        toggle();
      }
      return;
    }

    if (event.key === "Escape") { event.preventDefault(); open = false; root?.querySelector("button")?.focus(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); move(-1); return; }
    if (event.key === "Home") { event.preventDefault(); active = 0; return; }
    if (event.key === "End") { event.preventDefault(); active = shown.length - 1; return; }
    if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      if (shown[active]) choose(shown[active]);
      return;
    }

    // 타이핑으로 건너뛰기. 검색칸이 있으면 그쪽이 맡는다.
    if (!searchable && event.key.length === 1) {
      clearTimeout(queryTimer);
      query += event.key.toLowerCase();
      queryTimer = setTimeout(() => { query = ""; }, 600);
      const hit = shown.findIndex(item => item.label.toLowerCase().startsWith(query));
      if (hit >= 0) {
        active = hit;
        queueMicrotask(() => listbox?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" }));
      }
    }
  }

  // 검색칸은 열리자마자 잡아야 바로 타이핑할 수 있다. autofocus 속성은 페이지
  // 진입 시에도 튀므로, 이 팝업이 열릴 때만 부르는 액션으로 둔다.
  const grabFocus = node => { node.focus(); };

  // 바깥을 누르면 닫힌다. 포커스가 밖으로 나가도 마찬가지.
  $effect(() => {
    if (!open) return;
    const away = event => { if (root && !root.contains(event.target)) open = false; };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  });

  // 아래로만 열면 화면 밑에서 잘린다. 잘린 부분은 목록이 스크롤돼도 안 보인다.
  //
  // 방향은 팝업이 아니라 단추의 자리만 보고 정한다. 팝업 높이를 재서 정하려
  // 하면 '그리고 → 재고 → 다시 그리고' 사이에 잘린 상태가 한 프레임 남는다.
  // 남은 자리를 max-height로 넘겨 주면 어느 쪽으로 열든 화면 안에 들어온다.
  const ROOM_WANTED = 240;
  let drop = $state({ up: false, room: 0 });

  function place() {
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < ROOM_WANTED && above > below;
    drop = { up, room: Math.max(140, Math.floor(up ? above : below)) };
  }

  $effect(() => {
    if (!open) return;
    // 열려 있는 동안 화면이 움직이면 따라간다.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  });
</script>

<div class="sel" class:open bind:this={root}>
  <!-- 키 처리는 실제로 포커스를 받는 요소에만 단다. 감싸는 div에 달면
       역할 없는 요소가 상호작용을 갖게 되어 스크린리더가 길을 잃는다. -->
  <button
    type="button"
    class="sel-btn"
    class:placeholder={!current}
    {disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={label}
    onkeydown={onKey}
    onclick={toggle}>
    <span>{current ? current.label : "선택 안 함"}</span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
  </button>

  {#if open}
    <div class="sel-pop" class:left={align === "left"} class:up={drop.up}
         style="--pop-room: {drop.room}px">
      {#if searchable}
        <input
          class="sel-search"
          type="text"
          placeholder="검색"
          aria-label="{label} 검색"
          bind:value={filter}
          oninput={() => (active = 0)}
          onkeydown={onKey}
          use:grabFocus />
      {/if}

      <ul class="sel-list" role="listbox" aria-label={label} bind:this={listbox}>
        {#if shown.length === 0}
          <li class="sel-empty">일치하는 항목이 없습니다</li>
        {/if}
        {#each shown as item, i (item.value)}
          <li>
            <button
              type="button"
              class="sel-opt"
              class:on={item.value === value}
              class:muted={item.disabled}
              role="option"
              aria-selected={item.value === value}
              data-active={i === active ? "true" : undefined}
              onmouseenter={() => (active = i)}
              onclick={() => choose(item)}>
              <span class="sel-opt-label">{item.label}</span>
              {#if item.hint}<span class="sel-opt-hint">{item.hint}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
