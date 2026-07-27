// Differential test: the extracted core must reproduce the legacy browser
// scripts exactly. Runs the legacy files in a stubbed-DOM vm context and
// compares calculateMetrics output across randomised states.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY = resolve(HERE, "../legacy");

// --- load legacy globals ----------------------------------------------------
const store = new Map();
const noopElement = () => ({
  addEventListener() {}, replaceChildren() {}, appendChild() {}, setAttribute() {},
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  dataset: {}, style: { setProperty() {} }, textContent: "", value: "", checked: false,
  querySelector: () => null, querySelectorAll: () => [],
});
const sandbox = {
  console,
  performance,
  setTimeout,
  clearTimeout,
  MessageChannel: class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage() {} }; } },
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: noopElement,
    createDocumentFragment: noopElement,
    body: noopElement(),
  },
  window: { confirm: () => false, alert() {} },
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

for (const file of ["data.js", "bracelets.js", "cores.js", "engravings.js", "app.js"]) {
  const code = readFileSync(resolve(LEGACY, file), "utf8");
  try {
    new vm.Script(code, { filename: file }).runInContext(context);
  } catch (error) {
    // app.js calls init() at the bottom, which needs real DOM nodes. Function
    // declarations are hoisted, so everything we test is already defined.
    if (file !== "app.js") throw error;
  }
}

const legacy = vm.runInContext(
  "({ calculateMetrics, DEFAULT_STATE, mergeState, emptyNodeLevels, NODE_LIBRARY, ENGRAVING_LIBRARY, ENGRAVING_TIERS, BRACELET_EFFECTS, BRACELET_GRADES, CHAOS_CORES, CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS })",
  context,
);

// --- load extracted core ----------------------------------------------------
const core = await import("../src/lib/core/metrics.js");

// --- randomised comparison --------------------------------------------------
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const maybe = (p = 0.5) => Math.random() < p;
const grades = ["none", "high", "mid", "low"];

function randomState() {
  const nodeLevels = {};
  for (const node of legacy.NODE_LIBRARY) {
    nodeLevels[node.id] = maybe(0.35) ? Math.floor(Math.random() * (node.maxLevel + 1)) : 0;
  }

  const engravings = {};
  for (const item of legacy.ENGRAVING_LIBRARY) {
    if (maybe(0.25)) engravings[item.id] = pick(legacy.ENGRAVING_TIERS).value;
  }

  const braceletEffects = {};
  for (const item of legacy.BRACELET_EFFECTS) {
    if (maybe(0.3)) braceletEffects[item.id] = pick(legacy.BRACELET_GRADES).value;
  }

  const cores = {};
  for (const slot of legacy.CHAOS_CORE_SLOTS) {
    const pool = legacy.CHAOS_CORES.filter(core => core.slot === slot.key);
    cores[slot.key] = maybe(0.7)
      ? {
          id: pick(pool).id,
          points: pick(legacy.CHAOS_CORE_POINTS),
          stage: Math.floor(Math.random() * 2),
        }
      : { id: "none", points: 20, stage: 1 };
  }

  return {
    base: {
      critStat: Math.floor(Math.random() * 2000),
      specStat: Math.floor(Math.random() * 2000),
      swiftStat: Math.floor(Math.random() * 2000),
      dominationStat: 0, enduranceStat: 0, expertiseStat: 0,


      specDamagePer100: Math.random() * 6,
    },
    settings: {
      pointBudget: 140,
      includeCooldown: maybe(), includeAttackSpeed: maybe(),
      backAttack: maybe(), headAttack: maybe(),
    },
    convenience: {
      petStat: pick(["none", "critStat", "specStat", "swiftStat"]),
      evolutionKarmaRank: Math.floor(Math.random() * 7),
      manaShare: Math.floor(Math.random() * 21) * 5,
      goddessBlessing: maybe(), feast: maybe(),
    },
    accessories: {
      necklace: { additionalDamage: pick(grades) },
      rings: [
        { critRate: pick(grades), critDamage: pick(grades) },
        { critRate: pick(grades), critDamage: pick(grades) },
      ],
    },
    bracelet: {
      stats: {
        critStat: Math.floor(Math.random() * 121),
        specStat: Math.floor(Math.random() * 121),
        swiftStat: Math.floor(Math.random() * 121),
      },
      effects: braceletEffects,
    },
    arkGrid: { cores, gemLevel: Math.floor(Math.random() * 11) },
    weapon: { quality: Math.floor(Math.random() * 101) },
    collection: {
      ranch: maybe(),
      critStat: Math.floor(Math.random() * 200),
      specStat: Math.floor(Math.random() * 200),
      swiftStat: Math.floor(Math.random() * 200),
    },
    engravings,
    nodeLevels,
    baseEffects: [
      { id: "a", label: "카드 추가 피해", category: "damage:추가 피해", customCategory: "", amount: Math.random() * 30 },
      { id: "b", label: "각인 치적", category: "critRate", customCategory: "", amount: Math.random() * 20 },
      { id: "c", label: "추가 치피", category: "critDamage", customCategory: "", amount: Math.random() * 60 },
      { id: "d", label: "커스텀", category: "customDamage", customCategory: "기타 피해", amount: Math.random() * 15 },
    ],
    selectedTier: "전체",
    setupName: "",
  };
}

const FIELDS = [
  "damageIndex", "dpsIndex", "critRateRaw", "critRateCapped", "critDamage",
  "attackSpeed", "moveSpeedBonus", "attackMoveSpeed", "moveSpeed",
  "cooldownReduction", "cooldownIncrease", "damageMultiplier", "critFactor",
  "cooldownFactor", "attackSpeedFactor", "pointsUsed", "raidCaptainDamage", "sonicBonus",
];

let trials = 0;
let failures = 0;
let worst = 0;

for (let i = 0; i < 4000; i += 1) {
  const state = randomState();
  const a = legacy.calculateMetrics(legacy.mergeState(legacy.DEFAULT_STATE, structuredClone(state)));
  const b = core.calculateMetrics(core.mergeState(core.DEFAULT_STATE, structuredClone(state)));
  trials += 1;

  for (const field of FIELDS) {
    const delta = Math.abs(a[field] - b[field]);
    const scale = Math.max(1, Math.abs(a[field]));
    if (delta / scale > 1e-12) {
      failures += 1;
      if (failures === 1) {
        console.log(`MISMATCH on ${field}: legacy=${a[field]} core=${b[field]}`);
        console.log(JSON.stringify(state, null, 1).slice(0, 900));
      }
      break;
    }
    worst = Math.max(worst, delta / scale);
  }

  // Damage group maps must match key-for-key too.
  const ka = Object.keys(a.damageGroups).sort();
  const kb = Object.keys(b.damageGroups).sort();
  if (JSON.stringify(ka) !== JSON.stringify(kb)) {
    failures += 1;
    console.log("damageGroups key mismatch", JSON.stringify(ka), JSON.stringify(kb));
    break;
  }
}

console.log(`legacy vs core: ${failures} failures / ${trials} randomised states (worst relative delta ${worst.toExponential(2)})`);
process.exit(failures === 0 ? 0 : 1);
