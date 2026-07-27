<script>
  let { name = "sigil" } = $props();

  const PATHS = {
    focus: ["M12 3v18M3 12h18M6 6l12 12M18 6 6 18"],
    surge: ["M5 19 12 3l7 16-7-4-7 4Z"],
    wind: ["M4 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M5 18h7"],
    eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"],
    flare: ["m12 2 2 7 7 3-7 3-2 7-2-7-7-3 7-3 2-7Z"],
    spark: ["M13 2 5 14h6l-1 8 9-13h-6l0-7Z"],
    blade: ["M14 3 4 16l4 4L21 10l-7-7Z", "m4 16-2 6 6-2"],
    target: ["M12 3a9 9 0 1 0 9 9", "M12 8a4 4 0 1 0 4 4", "M22 2 12 12"],
    mark: ["M12 2 9 9l-7 3 7 3 3 7 3-7 7-3-7-3-3-7Z", "M12 8v8"],
    cycle: ["M20 12a8 8 0 0 1-13 6", "M4 12a8 8 0 0 1 13-6", "M17 3v3h-3M7 21v-3h3"],
    crown: ["M4 18h16l1-10-5 4-4-8-4 8-5-4 1 10Z", "M5 22h14"],
    sigil: ["m12 2 9 10-9 10-9-10 9-10Z", "m12 7 4 5-4 5-4-5 4-5Z"],
  };

  const paths = $derived(PATHS[name] ?? PATHS.sigil);
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
  {#each paths as d}<path {d} />{/each}
</svg>
