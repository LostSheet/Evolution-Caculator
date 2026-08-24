// 파티 시너지.
//
// 한 줄이 한 사람이다. 직업을 고르면 그 직업이 주는 것이 붙고, 갈래로 갈리는
// 것만 줄 안에서 고른다. 예전에는 종류별로 32개 칩을 늘어놓고 골랐는데,
// 실제로 하는 일은 "누가 파티에 있나"를 적는 것이지 "무슨 버프가 있나"를
// 훑는 것이 아니었다.
//
// --- 갈래를 언제 물어보나 -------------------------------------------------
//
// 딜 시너지는 직업이 정한다. 호크아이는 두 번째 동료를 찍든 죽음의 습격을
// 찍든 피해 증가 6%를 주므로 물어볼 이유가 없다. 하지만 이동속도 8%는 두 번째
// 동료만 준다 — 그래서 그것만 줄 안에서 고르게 한다.
//
// 워로드처럼 갈래마다 딜 시너지가 다른 직업은 고르게 하되, 흔한 쪽을 미리
// 켜 둔다. 같은 groups에 든 것은 게임에서 서로 배타라 하나만 켜진다.
//
// --- 나에게 걸리는 것과 남에게 주는 것 ------------------------------------
//
// 같은 버프인데 나와 남이 받는 방식이 다른 경우가 있다. 기상술사의 질풍노도가
// 그렇다 — Z(여우비)를 켜면 파티에는 유지되는 동안만 공이속 12%가 깔리는데,
// 자신은 그 순간 30초짜리 버프를 받는다. 중첩되지 않는다.
//
// 요즘은 게이지를 다시 쌓으려고 Z를 바로 끈다. 그래서 남에게는 잠깐이고
// 자신에게는 사실상 상시다. 이 계산기는 **내 딜만** 계산하므로, 내 줄에서는
// 30초 자버프를 보고 파티 줄에서는 오라 유지 시간을 봐야 한다. 한 숫자로
// 묶으면 내가 기상술사일 때 남에게 주는 유효율이 내 딜을 깎는다.
//
// 그래서 갈래마다 두 벌의 설명과 두 벌의 기본 가동율을 둔다.
//
// --- 합쳐지는 법 ---------------------------------------------------------
//
// 가동율은 버프마다 붙는다. 사람마다 끊기는 때가 다르고, 한 사람 안에서도
// 버프마다 다르다 — 파티의 기상술사는 치명타 적중률은 늘 주지만 질풍노도의
// 공이속은 껐다 켜서 잠깐만 준다. 자기 자신은 30초를 다 받는다.
//
// 합쳐 놓고 한 번 곱하면 없는 딜이 생긴다. 치피증 8%짜리 둘 중 하나만 반만
// 들어오면 16%×50%(=8%)가 아니라 8%+4%(=12%)다.
//
// 버프마다 가동율을 곱한 다음 같은 종류끼리 더한다. 종류가 다르면 서로
// 곱한다 — 계산기의 피해 그룹이 원래 그렇게 동작한다.
//
// 치명타 시 피해 증가만 다르다. 회심(진화 노드)과 **곱**해야 하므로
// 시너지끼리 먼저 더한 다음 한 덩이로 넘긴다.
//
// 백헤드는 두 몫이다. 피해 증가 4%는 늘 붙고, 백어택 · 헤드어택 스킬 피해
// 증가 5%는 그 방향으로 때릴 때만 붙는다. 둘 다 피증과 같은 주머니에 들어간다.

const SYNERGY_TYPES = {
  // combat이 붙은 것이 자리를 센다. 파티에 딜 시너지는 셋까지가 관례다.
  damage: { key: "damage", label: "피해 증가", amount: 6, group: "시너지 피해 증가", combat: true },
  attack: { key: "attack", label: "공격력 증가", amount: 6, group: "시너지 공격력", combat: true },
  defense: { key: "defense", label: "방어력 감소", amount: 12, group: "시너지 방어력 감소", combat: true },
  critRate: { key: "critRate", label: "치명타 적중률", amount: 10, percent: "critRate", combat: true },
  // 치피가 아니다. 회심과 같은 자리이고 회심과는 곱해진다.
  critOnly: { key: "critOnly", label: "치명타 시 피해 증가", amount: 8, critOnly: true, combat: true },
  // 4% + (백/헤드일 때) 5%. 둘 다 피증 주머니로 들어간다.
  backHead: {
    key: "backHead", label: "백 · 헤드어택 피해 증가",
    amount: 4, directional: 5, group: "시너지 피해 증가", combat: true,
  },
  // 속도는 값이 출처마다 다르다. 균등하게 배정된 딜 시너지와 달리 서포터가
  // 곁다리로 얹어 주는 것이라, 표에 못 박지 않고 갈래가 제 값을 들고 온다.
  attackSpeed: { key: "attackSpeed", label: "공격 속도", percent: "attackSpeedOnly", perSource: true },
  moveSpeed: { key: "moveSpeed", label: "이동 속도", percent: "moveSpeedOnly", perSource: true },
};

const SYNERGY_TYPE_ORDER = [
  "damage", "backHead", "attack", "defense", "critRate", "critOnly", "attackSpeed", "moveSpeed",
];

// 누가 무엇을 주는가 — job-buffs.json이 원본이다.
//
// 예전에는 이 표를 여기 직접 적었고, '나에게만 거는 자버프'는 또 다른 표에
// 있었다. 그러면 툴에서 한쪽만 보고 이미 있는 것을 또 적게 된다. 둘의 차이는
// '파티에도 가느냐' 하나뿐이라, 표 하나에 self · party 칸을 두는 것으로 합쳤다.
//
// 이 파일은 그 JSON에서 파티 쪽만 뽑아 예전과 같은 모양으로 세운다 —
// base는 갈래와 무관한 것, groups는 갈래로 갈리는 것.
const SYNERGY_JOBS = Object.entries(JOB_BUFFS).flatMap(([code, entry]) => {
  const party = entry.buffs.filter(buff => buff.party);
  // 시너지를 아예 안 주는 직업이 있다(차원술사). 그런 직업은 목록에 안 넣는다 —
  // 파티원으로 고를 수 있는 척하면 안 된다.
  if (party.length === 0) return [];
  const base = party.filter(buff => !buff.branch).flatMap(buff => buff.types);

  const groups = [];
  party.filter(buff => buff.branch).forEach(buff => {
    let group = groups.find(item => item.id === buff.group);
    if (!group) {
      group = { id: buff.group || "tier1", label: "1티어", choices: [] };
      groups.push(group);
    }
    if (buff.pick) group.pick = buff.branch;
    const choice = { node: buff.branch, types: [...buff.types] };
    if (Object.keys(buff.amounts ?? {}).length > 0) choice.amounts = { ...buff.amounts };
    if (buff.partyUptime !== null && buff.partyUptime !== undefined) choice.partyUptime = buff.partyUptime;
    if (buff.selfUptime !== null && buff.selfUptime !== undefined) choice.selfUptime = buff.selfUptime;
    group.choices.push(choice);
  });

  const out = { job: Number(code), name: entry.name };
  if (base.length > 0) out.base = base;
  if (groups.length > 0) out.groups = groups;
  return [out];
});

/** 이 직업이 자신에게 거는 것. 파티에도 가는지는 안 따진다. */
function jobSelfBuffs(job) {
  return (JOB_BUFFS[String(job)]?.buffs ?? []).filter(buff => buff.self);
}

/**
 * 갈래가 정하는 것 — 주력 특성과 공격 방향.
 *
 * 직업이 아니라 갈래 단위다. 기상술사의 질풍노도와 이슬비는 배타이고 스타일이
 * 달라서, 한쪽은 특화 · 헤드고 다른 쪽은 치신 · 타대일 수 있다. 직업 하나에
 * 값 하나를 두면 그 차이를 아예 적을 수가 없다.
 *
 * 갈래는 깨달음 1티어 배타 둘이다 — 30직업 전부 정확히 둘이다.
 */
function jobBranches(job) {
  return JOB_BUFFS[String(job)]?.branches ?? [];
}

/** 지금 찍은 갈래. 1티어 배타 둘 중 찍은 쪽. */
function takenBranch(job, nodeLevels) {
  return jobBranches(job).find(branch => readNumber(nodeLevels?.[branch.node]) > 0) ?? null;
}

/** 이 배분이 쌓는 것 — "spec" | "critSwift" | "". 갈래를 안 찍었으면 빈 값. */
function jobStat(job, nodeLevels) {
  return takenBranch(job, nodeLevels)?.stat ?? "";
}

/** 이 배분의 공격 방향 — "back" | "head" | "none" | "". */
function jobDirection(job, nodeLevels) {
  return takenBranch(job, nodeLevels)?.direction ?? "";
}

// 딜 시너지는 셋까지가 관례다. 넘겨도 막지는 않는다 — 8인 레이드에서 넷이
// 겹치는 편성이 없지는 않고, 막아 버리면 그 편성을 계산해 볼 수가 없다.
const SYNERGY_SLOTS = 3;
const SYNERGY_UPTIME_FULL = 100;
// 직업이 갈래와 무관하게 주는 몫. 가동율 열쇠로도 쓴다.
const SYNERGY_BASE_KEY = "";
const SYNERGY_OWN_ID = "own";

/**
 * 직업 없는 줄 — 표준 시너지 하나만 주는 파티원.
 *
 * "피증 둘, 치적 하나"만 적고 싶은데 직업을 세 번 고르게 하면 물어보는 것이
 * 다르다. 그렇다고 간략용 모델을 따로 세우면 같은 시너지가 두 군데서 계산될
 * 위험이 생긴다 — 그래서 별도 모드가 아니라 그냥 줄이다. 직업 코드 자리에
 * 종류 이름이 들어가고, 나머지는 여느 줄과 똑같이 흐른다.
 */
const GENERIC_SYNERGY_JOBS = ["damage", "critRate"];
const isGenericSynergyJob = job => GENERIC_SYNERGY_JOBS.includes(job);
const genericSynergyName = job => `${SYNERGY_TYPES[job]?.label ?? job} · 표준`;

function getSynergyJob(job) {
  const code = readNumber(job);
  return SYNERGY_JOBS.find(entry => entry.job === code) ?? null;
}

/** 이 갈래가 이 종류로 주는 값. 표에 없으면 갈래가 들고 온 값을 쓴다. */
function synergyAmount(choice, key) {
  const type = SYNERGY_TYPES[key];
  if (!type) return 0;
  if (type.perSource) return readNumber(choice?.amounts?.[key]);
  return readNumber(type.amount);
}

/** 이 직업의 갈래 중 이름이 이것인 것. */
function findSynergyChoice(entry, node) {
  for (const group of entry?.groups ?? []) {
    const choice = group.choices.find(item => item.node === node);
    if (choice) return { group, choice };
  }
  return null;
}

/**
 * 줄 하나가 실제로 주는 것. base에 켠 갈래를 얹는다.
 *
 * 같은 groups 안에서는 하나만 센다 — 게임에서 서로 배타라 둘 다 찍을 수 없다.
 */
function synergyRowParts(job, nodes) {
  // 직업 없는 줄은 제 종류 하나만 준다. 갈래도 없다.
  if (isGenericSynergyJob(job)) return [{ key: job, choice: null, node: "" }];
  const entry = getSynergyJob(job);
  if (!entry) return [];
  const parts = [];
  (entry.base ?? []).forEach(key => parts.push({ key, choice: null, node: "" }));

  const list = Array.isArray(nodes) ? nodes : [];
  (entry.groups ?? []).forEach(group => {
    const node = list.find(name => group.choices.some(choice => choice.node === name));
    const choice = group.choices.find(item => item.node === node);
    if (!choice) return;
    choice.types.forEach(key => parts.push({ key, choice, node: choice.node }));
  });
  return parts;
}

/** 줄을 새로 만들 때의 갈래. 흔한 쪽을 미리 켜 둔다. */
function defaultSynergyNodes(job) {
  const entry = getSynergyJob(job);
  return (entry?.groups ?? []).filter(group => group.pick).map(group => group.pick);
}

/**
 * 내 줄. 직업과 찍은 깨달음이 정하므로 고르는 것이 아니다.
 *
 * 갈래는 실제로 찍은 노드를 읽어 온다 — 워로드가 고독한 기사를 찍었으면
 * 전투 태세가 아니라 고독한 기사가 켜진다.
 */
function ownSynergyRow(awakening, synergy) {
  const entry = getSynergyJob(awakening?.job);
  if (!entry) return null;
  const levels = awakening?.nodeLevels ?? {};
  const nodes = [];
  (entry.groups ?? []).forEach(group => {
    const choice = group.choices.find(item => readNumber(levels[item.node]) > 0);
    if (choice) nodes.push(choice.node);
  });
  return {
    id: SYNERGY_OWN_ID, own: true, job: entry.job, nodes,
    uptime: normalizeUptimeMap(synergy?.ownUptime),
  };
}

function normalizeUptime(value) {
  if (value === undefined || value === null || value === "") return SYNERGY_UPTIME_FULL;
  const amount = readNumber(value);
  if (amount < 0) return 0;
  if (amount > SYNERGY_UPTIME_FULL) return SYNERGY_UPTIME_FULL;
  return amount;
}

/**
 * 버프별 가동율. 열쇠는 갈래 이름이고, 직업이 그냥 주는 몫은 빈 문자열이다.
 *
 * 예전에는 줄 하나에 숫자 하나였다. 그 저장본은 직업 몫의 가동율로 읽는다.
 */
function normalizeUptimeMap(value) {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object") return { [SYNERGY_BASE_KEY]: normalizeUptime(value) };
  const out = {};
  Object.keys(value).forEach(key => { out[key] = normalizeUptime(value[key]); });
  return out;
}

/**
 * 이 버프의 가동율. 안 적었으면 기본값을 쓴다.
 *
 * 기본값은 내 줄과 파티 줄이 다를 수 있다 — 질풍노도는 자신에게 30초 자버프라
 * 상시지만 남에게는 여우비를 켜 둔 동안만이다. 갈래가 partyUptime을 들고 있으면
 * 파티 줄에서 그 값으로 시작한다.
 */
function synergyRowUptime(row, node) {
  const at = row?.uptime?.[node ?? SYNERGY_BASE_KEY];
  if (at !== undefined) return normalizeUptime(at);
  return defaultChoiceUptime(row?.job, node, row?.own);
}

/**
 * 안 적었을 때 쓸 값.
 *
 * 나와 남이 다르다. 질풍노도는 자신에게 30초 자버프라 사실상 상시지만 남에게는
 * 여우비를 켜 둔 동안만 깔린다. 한 숫자로 묶으면 내가 기상술사일 때 남에게
 * 주는 유효율이 내 딜을 깎는다.
 *
 * 둘 다 안 적었으면 상시다 — 모르는 것을 0으로 놓으면 그것도 답을 고른 것이다.
 */
function defaultChoiceUptime(job, node, own) {
  if (!node) return SYNERGY_UPTIME_FULL;
  const found = findSynergyChoice(getSynergyJob(job), node);
  const preset = own ? found?.choice?.selfUptime : found?.choice?.partyUptime;
  return preset === undefined ? SYNERGY_UPTIME_FULL : normalizeUptime(preset);
}

/** 이 갈래에 붙는 설명. 내 줄과 파티 줄이 다르다. */
function synergyChoiceNote(choice, own) {
  return (own ? choice?.selfNote : choice?.partyNote) ?? choice?.note ?? "";
}

/** 저장본을 믿지 않는다. 없는 직업, 없는 갈래, 범위 밖 가동율을 걸러낸다. */
function normalizeSynergyRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      // 직업 없는 줄도 줄이다. 여기서 걸러 버리면 간략 스테퍼가 아무것도 못 남긴다.
      if (isGenericSynergyJob(row?.job)) {
        return {
          id: String(row.id ?? ""), own: false, job: row.job,
          nodes: [], uptime: normalizeUptimeMap(row.uptime),
        };
      }
      const entry = getSynergyJob(row?.job);
      if (!entry) return null;
      const nodes = (Array.isArray(row.nodes) ? row.nodes : [])
        .filter(node => findSynergyChoice(entry, node));
      return {
        id: String(row.id ?? ""), own: false, job: entry.job,
        nodes, uptime: normalizeUptimeMap(row.uptime),
      };
    })
    .filter(Boolean);
}

/**
 * 시너지가 만들어 내는 보너스.
 *
 * 버프마다 가동율을 곱한 다음 같은 종류끼리 더한다. 종류끼리는 계산기의 피해
 * 그룹이 알아서 곱한다. 무엇이 얼마나 붙었는지 rows·lines에 남긴다 —
 * 계기판과 카드가 그대로 쓴다.
 *
 * 줄 안에서 버프별로 묶어 돌려준다(buffs). 카드가 버프마다 가동율 칸을
 * 그려야 하는데, 종류별로 흩어 놓으면 어느 칸이 어느 버프의 것인지 모른다.
 */
function synergyBonuses(awakening, synergy, settings) {
  const own = ownSynergyRow(awakening, synergy);
  const rows = [...(own ? [own] : []), ...normalizeSynergyRows(synergy?.rows)];
  const directional = Boolean(settings?.backAttack) || Boolean(settings?.headAttack);

  const totals = {};
  let combatCount = 0;
  const detailed = rows.map(row => {
    const generic = isGenericSynergyJob(row.job);
    const entry = generic ? null : getSynergyJob(row.job);
    const parts = synergyRowParts(row.job, row.nodes).map(part => {
      const type = SYNERGY_TYPES[part.key];
      const uptime = synergyRowUptime(row, part.node);
      const raw = synergyAmount(part.choice, part.key) + (type.directional && directional ? type.directional : 0);
      const amount = raw * uptime / SYNERGY_UPTIME_FULL;
      totals[part.key] = readNumber(totals[part.key]) + amount;
      return { key: part.key, label: type.label, node: part.node, uptime, raw, amount };
    });
    if (parts.some(part => SYNERGY_TYPES[part.key].combat)) combatCount += 1;

    // 버프 단위로 묶는다. 직업이 그냥 주는 몫이 먼저, 켠 갈래가 뒤에 온다.
    const buffs = [];
    parts.forEach(part => {
      const at = buffs.find(buff => buff.node === part.node);
      if (at) at.parts.push(part);
      else buffs.push({ node: part.node, uptime: part.uptime, parts: [part] });
    });
    return {
      ...row,
      generic,
      name: generic ? genericSynergyName(row.job) : (entry?.name ?? ""),
      parts,
      buffs,
    };
  });

  const damageGroups = {};
  const percentBonuses = {};
  let critOnly = 0;
  const lines = [];

  SYNERGY_TYPE_ORDER.forEach(key => {
    const amount = readNumber(totals[key]);
    if (amount === 0) return;
    const type = SYNERGY_TYPES[key];
    lines.push({ key, label: type.label, amount });
    if (type.critOnly) critOnly += amount;
    else if (type.percent) percentBonuses[type.percent] = readNumber(percentBonuses[type.percent]) + amount;
    else damageGroups[type.group] = readNumber(damageGroups[type.group]) + amount;
  });

  return {
    own, rows: detailed, directional,
    combatCount, over: combatCount > SYNERGY_SLOTS,
    damageGroups, percentBonuses, critOnly, lines,
  };
}
