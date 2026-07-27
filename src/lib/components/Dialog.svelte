<script>
  let { open = $bindable(false), title, subtitle = "", width = "900px", children } = $props();

  let element = $state(null);

  $effect(() => {
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  });
</script>

<dialog class="modal" style:--modal-width={width} bind:this={element}
        onclose={() => (open = false)}
        onclick={e => { if (e.target === element) open = false; }}>
  <div class="modal-shell">
    <header class="modal-hd">
      <div>
        <h2>{title}</h2>
        {#if subtitle}<p>{subtitle}</p>{/if}
      </div>
      <span class="spacer"></span>
      <button class="btn icon" type="button" aria-label="닫기" onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div class="modal-body">
      {@render children?.()}
    </div>
  </div>
</dialog>
