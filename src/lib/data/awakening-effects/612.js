// 차원술사 (612) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/612.js
//
// "차원술사 스킬"은 이 직업의 스킬 전부를 가리킨다. 이 계산기에는 스킬 축이
// 따로 없으므로 지수 전체가 곧 그것이다 — 그래서 조건이 안 붙은 것은 전역으로
// 센다. 분침 강화 · 가속 강화의 치적도 앞 문장에 조건이 없다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "시간 관리자", note: "시간선 분화를 쓰는 선택지입니다." },
    { name: "공간 검사", note: "하나의 시간선에 고정하고 간섭을 쓰는 선택지입니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "시간 관리자": [note("시간선 분화 사용 · 차원 시계 정각 효과 대체")],
    "공간 검사": [
      percent("cooldownReduction", [40], "global", "간섭을 제외한 분침 스킬"),
      damage("주는 피해", [50], "partial", "간섭"),
      damage("주는 피해", [20], "conditional", "간섭 2중첩"),
      note("시간 동기화 비활성화 · 간섭 최대 2중첩"),
    ],
    "특이점": [
      percent("cooldownReduction", [100], "conditional", "특이점 도달 시 이동기"),
      note("차원 시계 20 · 40 · 60초에 특이점 · 마나 6% 회복"),
    ],
    "분침 강화": [
      percent("critRate", [10, 15, 20], "global"),
      percent("cooldownReduction", [8, 8, 8], "conditional", "차원 균열 활성 중 일반 스킬"),
    ],
    "정각": [damage("주는 피해", [1, 2, 3, 4, 5], "global")],
    "가속 강화": [percent("critRate", [10, 20, 30], "global")],
    "공간 우위": [damage("주는 피해", [6, 12, 18], "conditional", "활성 차원 균열 방향 적중 시")],
    "약점 파괴": [damage("주는 피해", [1.2, 2.4, 3.6, 4.8, 6], "conditional", "분침 스킬 백어택 또는 균열 방향")],
    "이면 강화": [damage("주는 피해", [1, 2, 3, 4, 5], "conditional", "기존 시간선 · 분리된 시간선에서는 1.5배")],
    "시간선 붕괴": [damage("주는 피해", [3, 6, 9], "global")],
    "차원 파괴": [damage("주는 피해", [8, 16, 24], "conditional", "차원 격발 시 누적 피해")],
    "고속 진입": [
      percent("attackSpeedOnly", [10, 10, 10, 10, 10], "conditional", "간섭 사용 후 20초"),
      damage("주는 피해", [1, 2, 3, 4, 5], "global"),
    ],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 마나 소모 −30~90%")],
    "시간 여행": [damage("주는 피해", [36, 58, 80], "conditional", "분리된 시간선의 업의 경계")],
    "퀀텀 프리즌": [damage("주는 피해", [12, 31, 50], "partial", "업의 경계 · 차원 회중시계")],
    "차원멸절포": [damage("주는 피해", [36, 58, 80], "partial", "일념")],
    // 1레벨은 오히려 6% 깎인다.
    "차원 검술": [
      percent("cooldownReduction", [30, 30, 30], "partial", "일념 · 초 단위"),
      damage("주는 피해", [6, 9, 24], "partial", "일념 · 1레벨은 감소"),
    ],
  },
};
