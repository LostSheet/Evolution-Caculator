// 깨달음 · 도약 — 규칙과 계산.
//
// 데이터는 둘 다 여기 없다.
//
//   구조  자리 · 최대 레벨 · 비용 · 선행 · 배타 · 관문. 인벤 원본에서 뽑아
//         ARKPASSIVE_TREE가 들고 있고 30직업이 다 있다 (build-arkpassive.mjs).
//         그래서 **찍고 읽는 것은 전 직업 된다.**
//   수치  그 효과가 딜 전체에 걸리는가. 원본에서 못 꺼내므로 사람이 읽고 적는다.
//         AWAKENING_EFFECTS가 들고 있고, 직업 하나가 파일 하나다
//         (src/lib/data/awakening-effects/). 적은 직업만 계산에 들어간다.
//
// 여기 있는 것은 그 둘을 합쳐 노드 목록을 만들고, 규칙(선행 · 배타 · 관문 ·
// 예산)을 따지고, 찍은 것에서 전역 보너스를 뽑는 일뿐이다.
//
// 열쇠는 노드 이름이다. 직업 안에서 겹치지 않는 것을 30직업 전부 확인했고,
// 무엇보다 사람이 읽을 수 있다. 표를 손으로 늘려 갈 데이터라 그게 중요하다.

const AWAKENING_GROUPS = ["깨달음", "도약"];

/**
 * 이 직업의 노드 전부 — 구조(생성 데이터)에 효과 표(위 손글씨)를 얹어서.
 *
 * 표가 없는 직업도 노드는 다 돌려준다. 찍고 읽는 것은 되고 계산만 안 되는데,
 * 그 둘은 화면에서 갈라 보여야 한다.
 */
/**
 * scope 교정.
 *
 * 손으로 옮긴 표의 scope가 틀린 줄이 있다 — "바람의 길 효과 중 우산 스킬"이
 * 스킬 한정인데 상태 조건(conditional)으로 잡혀 있는 식이다. 원문을 옮긴
 * 파일을 직접 고치면 무엇이 원문이고 무엇이 우리 판단인지 섞인다.
 *
 * 그래서 고친 것만 따로 든다. 열쇠는 "노드 이름|효과 순번"이고, 직업 관리
 * 툴이 이 표를 쓴다. diff에 우리가 바꾼 줄만 남는다.
 */
function awakeningFix(job, nodeName, at) {
  return AWAKENING_SCOPE[String(job)]?.[`${nodeName}|${at}`] ?? null;
}

function getAwakeningNodes(job) {
  const tree = ARKPASSIVE_TREE[job];
  if (!tree) return [];
  const model = AWAKENING_EFFECTS[job];
  const out = [];

  AWAKENING_GROUPS.forEach(group => {
    const entry = tree[group];
    if (!entry) return;
    entry.nodes.forEach(item => {
      const raw = model?.nodes?.[item.name];
      const effects = Array.isArray(raw)
        ? raw.map((effect, at) => {
          const fix = awakeningFix(job, item.name, at);
          if (!fix) return effect;
          const next = { ...effect };
          if (fix.scope) next.scope = fix.scope;
          if (Array.isArray(fix.amounts)) next.amounts = fix.amounts;
          // 이 줄이 어느 1티어 갈래에 딸렸는가. 빈 문자열은 "갈래 무관"이다.
          if (fix.branch !== undefined) next.branch = fix.branch || "";
          return next;
        })
        : raw;
      out.push({
        ...item,
        // 이름이 곧 열쇠다. 저장하는 배분도 이 열쇠로 적힌다.
        id: item.name,
        group,
        tier: item.row,
        budget: entry.budget,
        // 이 줄을 열려면 앞 줄에서 써야 하는 포인트.
        gate: entry.gates?.[item.row] ?? 0,
        effects: effects ?? [],
        modeled: Array.isArray(effects),
      });
    });
  });

  return out;
}

/** 트리가 있는가 — 찍고 읽을 수 있는가. 30직업 전부 참이다. */
function hasAwakeningTree(job) {
  return Boolean(ARKPASSIVE_TREE[job]);
}

/** 딜 계산에 들어가는 표가 있는가. 지금은 서머너뿐이다. */
function isAwakeningModeled(job) {
  return Boolean(AWAKENING_EFFECTS[job]);
}

/** 이 노드가 갈래의 뿌리라면 그 설명. 아니면 빈 문자열. */
function awakeningBranchNote(job, name) {
  return (AWAKENING_EFFECTS[job]?.branches ?? []).find(item => item.name === name)?.note ?? "";
}

function awakeningGroupInfo(job, group) {
  return ARKPASSIVE_TREE[job]?.[group] ?? null;
}

/**
 * 찍은 노드가 만들어 내는 전역 보너스.
 *
 * scope가 global인 것만 센다. 나머지는 skipped에 담아 돌려준다 — 조용히 빼면
 * 왜 수치가 게임과 다른지 알 수가 없다.
 */
/**
 * 유효율.
 *
 * 깨달음 효과의 대부분은 조건부다 — 특정 스킬을 쓴 뒤 8초, 구획 안, 중첩 몇 개.
 * "그래서 내 딜의 몇 퍼센트에 실리느냐"는 이 계산기가 알 수 없고, 사람마다
 * 로테이션마다 다르다. 그래서 정책 하나(시간 비중이냐 딜 비중이냐)를 고르는
 * 대신 줄마다 손으로 적게 한다.
 *
 * 기본은 100이다 — 전부 실린다고 보고 시작해서, 아니라고 아는 줄만 내린다.
 * 안 적힌 줄이 조용히 0이 되면 안 되므로 undefined는 100으로 읽는다.
 */
function awakeningUptimeKey(nodeName, key) {
  return `${nodeName}|${key ?? ""}`;
}

/**
 * 안 적었을 때의 기본 유효율.
 *
 * 예전에는 scope로 실을지 말지를 갈랐다. 그런데 그 태그가 틀린 줄이 많다 —
 * 깨달음 conditional 205줄 중 63줄에 스킬 이름이 섞여 있고("바람의 길 효과 중
 * 우산 스킬"), 도약은 통째로 스킬 한정인데 conditional로 잡혀 있었다.
 * 태그 하나로 0이냐 100이냐를 정하면 그 오분류가 조용히 딜이 된다.
 *
 * 그래서 이제 전부 줄로 세운다. scope는 기본값만 정하고, 맞는지는 화면에서
 * 사람이 본다 — 스킬 한정으로 잡힌 줄은 0에서 시작하고, 전역은 100에서 시작한다.
 */
const AWAKENING_SCOPE_UPTIME = { global: 100, branch: 100, conditional: 100, partial: 0 };

function awakeningUptimeRate(uptime, nodeName, key, scope) {
  const value = uptime?.[awakeningUptimeKey(nodeName, key)];
  if (value === undefined || value === null || value === "") {
    return (AWAKENING_SCOPE_UPTIME[scope] ?? 100) / 100;
  }
  return clamp(readNumber(value), 0, 100) / 100;
}

function awakeningBonuses(job, levels, uptime) {
  const nodes = getAwakeningNodes(job);
  const percentBonuses = {};
  const damageGroups = {};
  const applied = [];
  const skipped = [];
  // 식으로 붙는 효과. 지금은 값을 못 낸다 — 재료가 되는 속도·치적이 아직
  // 정해지지 않았다. 사전 세팅의 직접 입력 효과와 같은 줄에 실어 보내면
  // 계산이 알아서 제 단계에서 푼다.
  const conversions = [];

  const levelOf = item => clamp(Math.round(readNumber(levels?.[item.id])), 0, item.maxLevel);
  const taken = new Set(nodes.filter(item => levelOf(item) > 0).map(item => item.id));

  // 대체 관계를 먼저 푼다. 고대의 축복은 정신 집중의 23%를 47%로 갈아치우는데,
  // 더해 버리면 70%가 되어 두 배 가까이 샌다.
  const overrides = new Map();
  nodes.forEach(item => {
    const level = levelOf(item);
    if (level <= 0) return;
    item.effects.forEach(effect => {
      if (effect.kind !== "replaces") return;
      overrides.set(
        `${effect.target}|${effect.key}`,
        { amount: readNumber(effect.amounts[level - 1]), by: item.name },
      );
    });
  });

  nodes.forEach(item => {
    const level = levelOf(item);
    if (level <= 0) return;

    item.effects.forEach(effect => {
      if (effect.kind === "replaces") {
        // 갈아치운 사실 자체는 보여 준다. 수치는 대상 노드 줄에서 센다.
        skipped.push({
          node: item.name, level, scope: "replace", key: effect.key, amount: null,
          note: `${effect.target}의 ${effect.key} → ${formatAmounts(effect.amounts, level)}%`,
          replacedBy: "",
        });
        return;
      }

      /**
       * 줄로 세울까 말까. 이제 거의 다 세운다.
       *
       * 빼는 것은 둘뿐이다.
       *   - 안 고른 갈래: 적게 실리는 게 아니라 아예 없다.
       *   - 도약: 통째로 스킬 하나짜리라 딜 전체에 얹을 것이 없다.
       *
       * 나머지는 scope와 무관하게 전부 줄이 된다. 실릴지 말지는 유효율이
       * 정하고, scope는 그 기본값만 고른다 — AWAKENING_SCOPE_UPTIME 참고.
       */
      /**
       * 갈래는 scope와 별개다.
       *
       * 예전에는 scope === "branch"로 갈랐는데, 그러면 갈래 이름을 같이
       * 적을 수 없는 곳(직업 관리 툴)에서는 이름이 빈 채로 저장되어
       * taken.has(undefined)가 늘 거짓이 되고, 그 줄이 무엇을 찍든 사라졌다.
       *
       * 이름이 있으면 갈래에 딸린 줄이고, 없으면 아니다. 그게 전부다.
       * 기상술사 단련이 질풍노도면 치적, 이슬비면 치피인 것이 이 칸으로 선다.
       */
      const isGlobal = item.group === "깨달음"
        && (!effect.branch || taken.has(effect.branch));

      if (effect.kind === "formula") {
        const ratio = readNumber(effect.amounts?.[level - 1]);
        const cap = Array.isArray(effect.caps) ? effect.caps[level - 1] : effect.caps;
        const rate = awakeningUptimeRate(uptime, item.name, effect.category, effect.scope);
        const row = {
          node: item.name, level, scope: effect.scope, note: effect.scopeNote,
          key: effect.category, amount: null, formula: effect.expression, ratio,
          kind: "formula", group: item.group,
          uptimeKey: awakeningUptimeKey(item.name, effect.category),
          uptime: Math.round(rate * 100),
          replacedBy: "",
        };
        if (!isGlobal) { skipped.push(row); return; }
        conversions.push({
          id: `awakening:${item.name}`,
          label: item.name,
          category: effect.category,
          customCategory: "",
          // 유효율은 비율에 곱한다. 상한은 그대로 둔다 — 게임의 상한은 그 값에서
          // 잘린다는 뜻이지 유효율만큼 같이 낮아지는 것이 아니다.
          formula: String(effect.expression).replace(/\{n\}/g, String(ratio * rate)),
          cap: cap === null || cap === undefined ? "" : cap,
        });
        applied.push(row);
        return;
      }

      const override = overrides.get(`${item.name}|${effect.key}`);
      const raw = Array.isArray(effect.amounts) ? readNumber(effect.amounts[level - 1]) : null;
      const amount = override ? override.amount : raw;
      const rate = awakeningUptimeRate(uptime, item.name, effect.key, effect.scope);
      const effective = amount === null ? null : amount * rate;
      const row = {
        node: item.name, level, scope: effect.scope, note: effect.scopeNote,
        key: effect.key ?? "", amount,
        kind: effect.kind, group: item.group,
        uptimeKey: awakeningUptimeKey(item.name, effect.key),
        uptime: Math.round(rate * 100), effective,
        replacedBy: override?.by ?? "",
      };

      if (!isGlobal || amount === null) { skipped.push(row); return; }

      if (effect.kind === "damage") {
        damageGroups[effect.key] = readNumber(damageGroups[effect.key]) + effective;
      } else {
        percentBonuses[effect.key] = readNumber(percentBonuses[effect.key]) + effective;
      }
      applied.push(row);
    });
  });

  return { percentBonuses, damageGroups, conversions, applied, skipped };
}

function formatAmounts(amounts, level) {
  return readNumber(amounts[clamp(level, 1, amounts.length) - 1]);
}

/**
 * 찍은 배분이 규칙에 맞는가 — 포인트 예산, 티어 관문, 선행, 배타.
 *
 * 게임에서 불러온 배분은 당연히 맞지만, 손으로 고칠 수 있게 하는 순간
 * 검사가 필요해진다.
 */
function checkAwakening(job, levels) {
  const nodes = getAwakeningNodes(job);
  const byId = new Map(nodes.map(item => [item.id, item]));
  const level = id => clamp(Math.round(readNumber(levels?.[id])), 0, byId.get(id)?.maxLevel ?? 0);
  const problems = [];
  const spent = {};
  const perTier = new Map();

  AWAKENING_GROUPS.forEach(group => { spent[group] = 0; });

  nodes.forEach(item => {
    const used = level(item.id) * item.cost;
    spent[item.group] += used;
    const key = `${item.group}${item.tier}`;
    perTier.set(key, (perTier.get(key) ?? 0) + used);
  });

  AWAKENING_GROUPS.forEach(group => {
    const budget = readNumber(awakeningGroupInfo(job, group)?.budget);
    if (budget > 0 && spent[group] > budget) {
      problems.push(`${group} 포인트 ${spent[group]} / ${budget}`);
    }
  });

  nodes.forEach(item => {
    if (level(item.id) <= 0) return;
    if (item.gate > 0) {
      const before = perTier.get(`${item.group}${item.tier - 1}`) ?? 0;
      if (before < item.gate) {
        problems.push(`${item.name} — ${item.tier - 1}티어 ${item.gate}P 필요 · 현재 ${before}P`);
      }
    }
    if (item.requires) {
      const need = byId.get(item.requires.name);
      if (need && level(need.id) < item.requires.level) {
        problems.push(`${item.name} — ${need.name} ${item.requires.level}레벨 필요`);
      }
    }
    (item.excludes ?? []).forEach(name => {
      if (level(name) > 0) problems.push(`${item.name} · ${name} — 동시 선택 불가`);
    });
  });

  return { spent, problems: [...new Set(problems)] };
}

/**
 * 지금 배분에서 이 노드를 얼마까지 올릴 수 있는가.
 *
 * 판정이 아니라 상한을 돌려준다 — 화면이 "왜 안 올라가는지"를 같이 말해야 해서
 * 이유도 함께 준다.
 */
function awakeningHeadroom(job, levels, nodeId) {
  const nodes = getAwakeningNodes(job);
  const byId = new Map(nodes.map(item => [item.id, item]));
  const item = byId.get(nodeId);
  if (!item) return { max: 0, why: "unknown", reason: "" };

  const level = id => clamp(Math.round(readNumber(levels?.[id])), 0, byId.get(id)?.maxLevel ?? 0);

  // 배타 형제를 하나라도 찍었으면 이 노드는 닫힌다.
  const rival = (item.excludes ?? []).find(name => level(name) > 0);
  if (rival) return { max: 0, why: "rival", rival, reason: `${rival} 선택` };

  // 선행 노드가 요구 레벨에 못 미치면 닫힌다.
  if (item.requires && level(item.requires.name) < item.requires.level) {
    return {
      max: 0, why: "requires",
      reason: `${item.requires.name} ${item.requires.level}레벨 필요`,
    };
  }

  // 앞 줄에서 관문만큼 안 썼으면 닫힌다.
  if (item.gate > 0) {
    const before = nodes
      .filter(other => other.group === item.group && other.tier === item.tier - 1)
      .reduce((sum, other) => sum + level(other.id) * other.cost, 0);
    if (before < item.gate) {
      return {
        max: 0, why: "gate",
        reason: `${item.tier - 1}티어 ${item.gate}P 필요 · 현재 ${before}P`,
      };
    }
  }

  return { max: item.maxLevel, why: "", reason: "" };
}

/**
 * 이 노드를 이 레벨로 내리면 함께 무너지는 노드 전부.
 *
 * 한 겹이 아니라 끝까지 따라간다. 정신 집중을 2로 내리면 고대의 힘이 선행을
 * 잃고, 고대의 힘이 빠지면 고대의 축복도 선행을 잃는다 — 한 겹만 보면 게임에
 * 있을 수 없는 배분이 남는다.
 */
function awakeningDependents(job, levels, nodeId, nextLevel) {
  const nodes = getAwakeningNodes(job);
  const level = id => readNumber(levels?.[id]);
  const gone = new Set();
  const survives = id => (id === nodeId ? nextLevel : (gone.has(id) ? 0 : level(id)));

  // 더 무너질 것이 없을 때까지 훑는다. 노드가 스물 남짓이라 값싸다.
  let moved = true;
  while (moved) {
    moved = false;
    for (const item of nodes) {
      if (gone.has(item.id) || item.id === nodeId || level(item.id) <= 0) continue;
      if (!item.requires) continue;
      if (survives(item.requires.name) < item.requires.level) { gone.add(item.id); moved = true; }
    }
  }

  return nodes.filter(item => gone.has(item.id)).map(item => item.name);
}
