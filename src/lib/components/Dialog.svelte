<script>
  let { open = $bindable(false), title, subtitle = "", width = "820px", children } = $props();

  let element = $state(null);

  $effect(() => {
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  });
</script>

<dialog
  class="engraving-dialog"
  style:--dialog-width={width}
  bind:this={element}
  onclose={() => (open = false)}
  onclick={e => { if (e.target === element) open = false; }}
>
  <div class="engraving-dialog-shell">
    <header class="engraving-dialog-header">
      <div>
        <h2>{title}</h2>
        {#if subtitle}<span>{subtitle}</span>{/if}
      </div>
      <button class="icon-button" type="button" aria-label="닫기" onclick={() => (open = false)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    {@render children?.()}
  </div>
</dialog>
