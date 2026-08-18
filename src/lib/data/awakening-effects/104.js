// 워로드 (104) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/104.js
//
// 전역은 정교함의 치적 하나뿐이다. 나머지는 랜스 · 일반 스킬을 짚거나 진격 ·
// 방어 태세를 조건으로 건다.
import { percent, damage, formula, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "고독한 기사", note: "진격 태세 중심 선택지입니다. 랜스 스킬에만 걸려 아직 반영하지 않습니다." },
    { name: "철옹성", note: "방어 태세 중심 선택지입니다. 실드와 태세 조건이라 아직 반영하지 않습니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "고독한 기사": [
      percent("moveSpeedOnly", [10, 10, 10], "conditional", "진격 태세 중 이동속도 감소"),
      damage("주는 피해", [13, 26, 40], "conditional", "전장의 창 이후 랜스 스킬 1회"),
    ],
    "철옹성": [note("방어 태세 실드량 +30~50%")],
    // 스킬도 태세도 안 붙는다. 딜 전체에 걸리는 치적이다.
    "정교함": [percent("critRate", [5, 10, 15], "global")],
    "전투 태세": [damage("주는 피해", [10, 15, 20], "conditional", "방어 태세 중")],
    "효율 증대": [damage("주는 피해", [1, 2, 3, 4, 5], "global", "랜스 스킬")],
    // 치적을 재료로 쓰는 식이다. 상한은 amounts가 아니라 cap으로 넘긴다 —
    // 따로 한 줄 더 두면 60%가 통째로 더해진다.
    "건랜스 수련": [
      formula("damage:주는 피해", "{{치명타적중률합}} * {n}", [0.2, 0.4, 0.6], [20, 40, 60], "global",
        "모든 치명타 발생 확률 1%당"),
    ],
    "숙련된 전술가": [damage("주는 피해", [15, 27.5, 40], "global", "일반 스킬")],
    "전술 훈련": [
      percent("critRate", [0.8, 1.6, 2.4, 3.2, 4], "global", "일반 스킬"),
      percent("critRate", [1.6, 3.2, 4.8, 6.4, 8], "conditional", "일반 스킬 · 방어 태세 중"),
      percent("critRate", [1.6, 3.2, 4.8, 6.4, 8], "partial", "전장의 방패"),
    ],
    "결사대": [
      damage("주는 피해", [0.8, 1.6, 2.4, 3.2, 4], "global", "랜스 스킬"),
      damage("주는 피해", [0.6, 1.2, 1.8, 2.4, 3], "conditional", "헤드어택 적중 시"),
    ],
    "선봉장의 함성": [
      percent("critDamage", [15, 30, 45], "conditional", "진격 태세 중 랜스 스킬"),
      percent("attackSpeedOnly", [10, 10, 10], "conditional", "선봉장의 함성 효과 중"),
      damage("주는 피해", [5, 5, 5], "conditional", "약점 노출 · 헤드/백어택"),
    ],
    "선봉장의 마음가짐": [damage("주는 피해", [6, 15, 25], "conditional", "방어 태세 중")],
    "전술 이동": [
      note("이동기 재사용 대기시간 −1초"),
      percent("attackSpeedOnly", [5, 5, 5, 5, 5], "conditional", "이동기 사용 후 8초"),
      damage("주는 피해", [0.8, 1.6, 2.4, 3.2, 4], "global", "랜스 및 일반 스킬"),
    ],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 마나 소모 −30~90%")],
    "저돌": [
      damage("주는 피해", [7.5, 15, 22.5], "partial", "차지 스팅어 돌진 · 3회"),
      note("돌진 추가 타격 3회"),
    ],
    "선봉의 보호": [percent("cooldownReduction", [25, 37.5, 50], "partial", "실드 대시")],
    "거포": [damage("주는 피해", [25, 50, 75], "partial", "풀배럴 캐넌")],
    "퀵 배럴": [damage("주는 피해", [25, 50, 75], "partial", "풀배럴 캐넌")],
  },
};
