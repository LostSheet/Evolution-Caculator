// 창술사 (305) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/305.js
//
// 전역이 없다. 절정 계열은 전부 "난무 · 집중 스탠스 전환 시"가 붙고, 나머지는
// 스킬을 짚는다. 스탠스를 계속 바꾸며 싸우더라도 유지율을 모르는 채로 전역으로
// 세면 치적 · 치피가 부푼다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "절제", note: "집중 스탠스를 버리고 듀얼 게이지를 굴리는 선택지입니다." },
    { name: "절정 I", note: "두 스탠스를 오가며 전환 버프를 받는 선택지입니다. 전환 조건이라 아직 반영하지 않습니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "절제": [note("집중 스탠스 봉인 · 듀얼 게이지 획득량 +50~100%")],
    "절정 I": [
      percent("moveSpeedOnly", [6, 9, 15], "conditional", "난무 스탠스 전환 시"),
      percent("attackSpeedOnly", [6, 9, 15], "conditional", "집중 스탠스 전환 시"),
    ],
    "난무 이동": [percent("cooldownReduction", [2], "conditional", "듀얼 게이지 소모 시 이동기")],
    "절정 II": [percent("critDamage", [23, 46, 70], "conditional", "난무 스탠스 전환 시")],
    "치명적인 베기": [percent("critDamage", [4, 8, 12, 16, 20], "global", "난무 스킬")],
    "난무 강화": [damage("주는 피해", [30, 45, 60], "global", "난무 스킬")],
    "절정 III": [damage("주는 피해", [8, 16, 25], "conditional", "집중 스탠스 전환 시")],
    "강력한 찌르기": [damage("주는 피해", [1.2, 2.4, 3.6, 4.8, 6], "partial", "집중 스킬")],
    "연가표식": [note("연가의 표식 대상이 받는 피해 +1.2~6% (16초)")],
    "연가비기": [
      percent("critRate", [20, 20, 20], "conditional", "연가공법 16초"),
      damage("주는 피해", [0, 100, 200], "partial", "연가비기"),
    ],
    "연가심공": [damage("주는 피해", [25, 50, 75], "conditional", "연가심공 소모 후 다음 스킬")],
    "전환난무": [
      damage("주는 피해", [0.7, 1.4, 2.1, 2.8, 3.5], "global", "난무 스킬"),
      percent("critRate", [0.8, 1.6, 2.4, 3.2, 4], "conditional", "스탠스 전환 후 10초"),
    ],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 마나 소모 −30~90%")],
    "강인한 타격": [damage("주는 피해", [50, 100, 150], "partial", "맹룡난무 마지막 타격")],
    "최후의 판단": [damage("주는 피해", [30, 60, 90], "conditional", "듀얼 게이지 1칸 소모 시 맹룡난무")],
    // 1레벨은 오히려 −10%다. 2레벨부터 +5 · +20%.
    "관통 필살": [
      percent("critRate", [100, 100, 100], "partial", "적룡필살"),
      damage("주는 피해", [10, 5, 20], "partial", "적룡필살 · 1레벨은 감소"),
    ],
    "내지르기": [damage("주는 피해", [25, 50, 75], "partial", "적룡필살")],
  },
};
