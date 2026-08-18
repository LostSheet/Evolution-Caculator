// SYNERGY_JOBS + job-profile.json → job-buffs.json 한 표로 합친다.
//
// 왜 합치나: "이 직업이 거는 버프"가 두 군데 있으면 툴에서 한쪽만 보고
// 이미 있는 것을 또 적게 된다. 실제로 둘의 차이는 '파티에도 가느냐' 하나뿐이라
// 표를 나눌 이유가 없었다 — 칸을 하나 두면 될 일이었다.
//
// 한 번만 돌리는 스크립트다. 이후로는 직업 관리 툴이 이 JSON을 고친다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { SYNERGY_JOBS } from "../src/lib/core/synergy.js";

const PROFILE = "src/lib/data/job-profile.json";
const OUT = "src/lib/data/job-buffs.json";

const profiles = existsSync(PROFILE) ? JSON.parse(readFileSync(PROFILE, "utf8")) : {};
const out = {};

for (const entry of SYNERGY_JOBS) {
  const buffs = [];

  // 갈래와 무관하게 늘 붙는 것.
  if (entry.base?.length) {
    buffs.push({
      id: "base", label: entry.name, branch: "", group: "",
      types: [...entry.base], amounts: {},
      self: true, party: true,
      selfNote: "", partyNote: "", partyUptime: null, pick: false,
    });
  }

  // 갈래로 갈리는 것.
  for (const group of entry.groups ?? []) {
    for (const choice of group.choices) {
      buffs.push({
        id: choice.node, label: choice.node, branch: choice.node, group: group.id,
        types: [...choice.types], amounts: { ...(choice.amounts ?? {}) },
        self: true, party: true,
        selfNote: choice.selfNote ?? "", partyNote: choice.partyNote ?? "",
        partyUptime: choice.partyUptime ?? null,
        pick: group.pick === choice.node,
      });
    }
  }

  out[String(entry.job)] = {
    name: entry.name,
    stat: profiles[String(entry.job)]?.stat ?? "",
    buffs,
  };
}

// 시너지 표에 없는 직업도 자리를 만든다 — 자버프만 있는 직업이 나올 수 있다.
for (const [code, profile] of Object.entries(profiles)) {
  if (out[code]) continue;
  out[code] = { name: profile.name, stat: profile.stat ?? "", buffs: [] };
}

writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`job-buffs.json — 직업 ${Object.keys(out).length} · 버프 ${Object.values(out).reduce((n, j) => n + j.buffs.length, 0)}`);
