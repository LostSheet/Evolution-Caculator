// Differential test: the extracted core must reproduce the legacy browser
// scripts exactly. Runs the legacy files in a stubbed-DOM vm context and
// compares calculateMetrics output across randomised states.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
// 깨달음 트리의 구조는 생성 데이터다. legacy 쪽은 이걸 전역으로 받아 읽는다 —
// 사람이 손대는 파일에 664개짜리 표를 복사해 둘 이유가 없다.
import { ARKPASSIVE_TREE } from "../src/lib/data/arkpassive-tree.js";
import { AWAKENING_EFFECTS } from "../src/lib/data/awakening-effects/index.js";
import JOB_BUFFS from "../src/lib/data/job-buffs.json" with { type: "json" };
import AWAKENING_SCOPE from "../src/lib/data/awakening-scope.json" with { type: "json" };

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
  ARKPASSIVE_TREE,
  AWAKENING_EFFECTS,
  JOB_BUFFS,
  AWAKENING_SCOPE,
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

for (const file of ["data.js", "bracelets.js", "cores.js", "engravings.js", "awakening.js", "synergy.js", "app.js"]) {
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
  "({ calculateMetrics, DEFAULT_STATE, mergeState, emptyNodeLevels, NODE_LIBRARY, ENGRAVING_LIBRARY, ENGRAVING_TIERS, BRACELET_EFFECTS, BRACELET_GRADES, CHAOS_CORES, CHAOS_CORE_POINTS, CHAOS_CORE_SLOTS, getAwakeningNodes, SYNERGY_JOBS })",
  context,
);

// --- load extracted core ----------------------------------------------------
const core = await import("../src/lib/core/metrics.js");

// --- randomised comparison --------------------------------------------------
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const maybe = (p = 0.5) => Math.random() < p;
const grades = ["none", "high", "mid", "low"];

// 규칙(선행·배타·관문)은 여기서 안 지킨다. 계산이 어긋난 배분에도 같은 답을
// 내야 하는지가 이 검사의 관심사다 — 화면이 막아 주지 못하는 저장본이 온다.
function randomAwakening() {
  const jobs = Object.keys(AWAKENING_EFFECTS).map(Number);
  if (jobs.length === 0 || maybe(0.4)) return { job: 0, nodeLevels: {} };
  const job = pick(jobs);
  const nodeLevels = {};
  for (const node of legacy.getAwakeningNodes(job)) {
    if (maybe(0.35)) nodeLevels[node.id] = 1 + Math.floor(Math.random() * node.maxLevel);
  }
  return { job, nodeLevels };
}

// 파티 시너지. 줄이 곧 사람이다 — 없는 갈래, 겹친 갈래, 범위 밖 가동율까지
// 섞어서 두 구현이 같은 것을 버리고 같은 것을 세는지 본다.
function randomSynergy() {
  const rows = [];
  const count = Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i += 1) {
    const entry = pick(legacy.SYNERGY_JOBS);
    const nodes = (entry.groups ?? []).flatMap(group => group.choices
      .filter(() => maybe(0.5))
      .map(choice => choice.node));
    if (maybe(0.1)) nodes.push("없는 노드");
    // 가동율은 버프마다 붙는다. 빈 열쇠가 직업 몫이고, 갈래 이름이 갈래 몫이다.
    const uptime = {};
    ["", ...nodes].forEach(key => {
      if (maybe(0.4)) uptime[key] = Math.floor(Math.random() * 141) - 20;
    });
    rows.push({
      id: `syn-${i}`,
      job: maybe(0.05) ? 999 : entry.job,
      nodes,
      // 가끔 옛 저장본 모양(숫자 하나)도 섞는다.
      uptime: maybe(0.1) ? Math.floor(Math.random() * 101) : uptime,
    });
  }
  return { rows, ownUptime: maybe(0.3) ? { "": Math.floor(Math.random() * 101) } : {} };
}

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
      backAttack: maybe(), headAttack: maybe(),
    },
    // 깨달음·도약. 표가 있는 직업과 없는 직업(0)을 섞어 양쪽 경로를 훑는다.
    awakening: randomAwakening(),
    // 대난투 딜 비중. 0과 100 양 끝, 그리고 그 사이를 섞는다.
    convenience: maybe(0.5) ? undefined : { staggerShare: maybe(0.3) ? 100 : Math.floor(Math.random() * 101) },
    synergy: randomSynergy(),
    attack: maybe()
      ? { weaponAttack: 0, mainStat: 0, flatAttack: 0 }
      : {
        weaponAttack: 50000 + Math.floor(Math.random() * 200000),
        mainStat: 300000 + Math.floor(Math.random() * 500000),
        flatAttack: 0,
      },
    convenience: {
      petStat: pick(["none", "critStat", "specStat", "swiftStat"]),
      evolutionKarmaRank: Math.floor(Math.random() * 7),
      manaShare: Math.floor(Math.random() * 21) * 5,
      // 절반은 옛 슬라이더(damageMix 없음), 절반은 네 갈래. 양쪽 경로를 다 훑는다.
      damageMix: maybe() ? null : {
        manaCooldown: Math.floor(Math.random() * 11) * 10,
        plainCooldown: Math.floor(Math.random() * 11) * 10,
        identityPlain: Math.floor(Math.random() * 11) * 10,
        identityMana: Math.floor(Math.random() * 11) * 10,
        feederMana: maybe(),
      },
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
    arkGrid: { cores, gems: { attack: Math.floor(Math.random() * 31), additional: Math.floor(Math.random() * 21), boss: Math.floor(Math.random() * 21) } },
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
    specBundles: Math.random() < 0.5 ? [] : [{
      id: "sb", name: "묶음", share: Math.random() * 100, refSpec: 500 + Math.random() * 1500,
      rows: [
        { kind: "damage", base: 0, amount: Math.random() * 250 },
        { kind: "gain", base: 0, amount: Math.random() * 160 },
        { kind: "cooldown", base: Math.random() * 20, amount: 20 + Math.random() * 20 },
        { kind: "damage", base: 0, amount: 0, formula: "(100 + 98.4) * (1 + {{특화}} * 0.02%) - 100" },
      ],
    }],
    selectedTier: "전체",
    setupName: "",
  };
}

const FIELDS = [
  "damageIndex", "dpsIndex", "critRateRaw", "critRateCapped", "critDamage",
  "attackSpeed", "moveSpeedBonus", "attackMoveSpeed", "moveSpeed",
  "cooldownReduction", "cooldownIncrease", "damageMultiplier", "critFactor",
  "cooldownFactor", "attackSpeedFactor", "specBundleFactor", "pointsUsed", "raidCaptainDamage", "sonicBonus",
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
