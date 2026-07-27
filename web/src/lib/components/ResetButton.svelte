<script>
  let { label, onclick } = $props();
</script>

<button class="section-reset-button" type="button" title={label} aria-label={label} {onclick}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
</button>
