// 손으로 확인한 깨달음 · 도약 수치 표를 모은다.
//
// 초안(status: "draft")은 여기 실리지만 계산에는 안 들어간다. scope를 다 보고
// "confirmed"로 바꾼 직업만 AWAKENING_EFFECTS에 나타난다 — 틀린 표가 조용히
// 숫자를 망치는 것보다 낫다.
//
//   node scripts/awakening-draft.mjs   초안을 만든다
//   node scripts/awakening-audit.mjs   적은 것을 원문과 대조한다
//
// 이 파일은 awakening-draft.mjs가 다시 짠다. 직접 고치지 않는다.
import job102 from "./102.js";
import job103 from "./103.js";
import job104 from "./104.js";
import job105 from "./105.js";
import job112 from "./112.js";
import job113 from "./113.js";
import job202 from "./202.js";
import job203 from "./203.js";
import job204 from "./204.js";
import job205 from "./205.js";
import job302 from "./302.js";
import job303 from "./303.js";
import job304 from "./304.js";
import job305 from "./305.js";
import job312 from "./312.js";
import job313 from "./313.js";
import job402 from "./402.js";
import job403 from "./403.js";
import job404 from "./404.js";
import job405 from "./405.js";
import job502 from "./502.js";
import job503 from "./503.js";
import job504 from "./504.js";
import job505 from "./505.js";
import job512 from "./512.js";
import job602 from "./602.js";
import job603 from "./603.js";
import job604 from "./604.js";
import job612 from "./612.js";
import job702 from "./702.js";

const ALL = {
  102: job102,
  103: job103,
  104: job104,
  105: job105,
  112: job112,
  113: job113,
  202: job202,
  203: job203,
  204: job204,
  205: job205,
  302: job302,
  303: job303,
  304: job304,
  305: job305,
  312: job312,
  313: job313,
  402: job402,
  403: job403,
  404: job404,
  405: job405,
  502: job502,
  503: job503,
  504: job504,
  505: job505,
  512: job512,
  602: job602,
  603: job603,
  604: job604,
  612: job612,
  702: job702,
};

export const AWAKENING_DRAFTS = ALL;

export const AWAKENING_EFFECTS = Object.fromEntries(
  Object.entries(ALL).filter(([, entry]) => entry.status === "confirmed"),
);

export const AWAKENING_MODELED = Object.keys(AWAKENING_EFFECTS).map(Number);
