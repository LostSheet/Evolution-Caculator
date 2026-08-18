// 환수사 (604) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/604.js
//
// 전역이 없다. 모든 수치가 둔갑 · 환수 · 금술 스킬을 짚거나 환수 각성 상태를
// 조건으로 건다. 결속 강화의 치피 205%는 두둥실 여우곰 한 스킬 것이라,
// 전역으로 세면 치피가 통째로 뒤틀린다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "야성", note: "둔갑 스킬로 야성을 쌓는 선택지입니다. 둔갑 스킬 한정이라 아직 반영하지 않습니다." },
    { name: "환수 각성", note: "환수 각성 상태를 쓰는 선택지입니다. 각성 상태 조건이라 아직 반영하지 않습니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "야성": [
      percent("attackSpeedOnly", [3, 6, 10], "conditional", "야성 효과 중첩"),
      note("둔갑 스킬 마나 소모량 −50%"),
    ],
    "환수 각성": [
      note("환수의 기운 100%에서 환수 각성 상태 진입"),
      percent("attackSpeedOnly", [20], "conditional", "환수 각성 상태"),
    ],
    "깨어난 잠재력": [
      percent("critRate", [10, 20, 30], "global", "둔갑 스킬"),
      note("곰 둔갑 : 받는 피해 −10%"),
      percent("attackSpeedOnly", [6, 12, 20], "conditional", "여우 둔갑"),
    ],
    "활기": [
      damage("주는 피해", [18, 25, 32], "global", "환수 스킬"),
      note("환수의 기운 획득량 +15~45% · 치명타 적중 시 추가 획득"),
    ],
    // 1레벨에는 피해 증가 절이 없다.
    "야수의 공명": [
      damage("주는 피해", [0, 1, 2, 3, 4], "global", "둔갑 스킬"),
      percent("cooldownReduction", [3, 3, 3, 3, 3], "conditional", "금술 스킬 사용 시 둔갑 스킬"),
    ],
    "야생의 충동": [damage("주는 피해", [2, 10.5, 19], "global", "둔갑 스킬")],
    "환수의 정기": [
      percent("critDamage", [20, 40, 60], "conditional", "환수 각성 상태의 환수 스킬"),
      percent("cooldownReduction", [5, 5, 5], "conditional", "환수의 정기 중첩"),
    ],
    "천부적 재능": [
      note("환수 스킬 적중당 10% 확률로 발동"),
      damage("주는 피해", [12, 24, 36, 48, 60], "conditional", "발동 시"),
    ],
    "기민함": [damage("주는 피해", [1, 2, 3, 4, 5], "global", "둔갑 스킬")],
    "사냥 본능": [damage("주는 피해", [4.5, 12, 20], "global", "둔갑 스킬")],
    "날렵한 걸음걸이": [
      damage("주는 피해", [8, 15, 22], "conditional", "환수 각성 상태의 환수 스킬"),
      note("이동기가 피융으로 교체 · 재사용 대기시간 +1초"),
      percent("cooldownReduction", [0.1, 0.2, 0.3], "global", "환수 스킬"),
    ],
    "환수 술사": [damage("주는 피해", [1, 2, 3, 4, 5], "global", "환수 스킬")],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 마나 소모 −30~90%")],
    "고대의 힘": [damage("주는 피해", [25, 50, 75], "partial", "한방 곰")],
    "민첩한 몸놀림": [
      damage("주는 피해", [37, 25, 12], "partial", "한방 곰 피해 감소"),
      percent("cooldownReduction", [50, 50, 50], "partial", "한방 곰"),
    ],
    "결속 강화": [percent("critDamage", [70, 135, 205], "partial", "두둥실 여우곰")],
    "빨리와 여우곰!": [
      damage("주는 피해", [15, 37.5, 60], "conditional", "피격이상 면역인 적 · 두둥실 여우곰"),
      percent("cooldownReduction", [10, 10, 10], "partial", "두둥실 여우곰"),
    ],
  },
};
