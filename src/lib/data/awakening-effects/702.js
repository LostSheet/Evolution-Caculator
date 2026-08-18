// 가디언나이트 (702) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/702.js
//
// 전역이 넷이다. 깨어나는 힘의 치적 20%, 그리고 초비행 · 잔불 · 완전 융화의
// 마지막 문장 "적에게 주는 피해". 세 노드 모두 앞 문장은 화신 상태나 반격의
// 불씨 조건인데, 그 뒤에 조건 없는 문장이 따로 붙어 있다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "업화의 계승자", note: "화신 상태를 쓰는 선택지입니다. 화신 조건이라 그쪽 수치는 아직 반영하지 않습니다." },
    { name: "드레드 로어", note: "화신을 버리고 가디언 피어를 쓰는 선택지입니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "업화의 계승자": [
      percent("attackSpeedOnly", [11, 13, 15], "conditional", "화신 상태"),
      percent("cooldownReduction", [0.7, 0.7, 0.7], "conditional", "엠버레스의 기운 소모당"),
    ],
    "드레드 로어": [note("화신 봉인 · 가디언 피어 · 가디언 스케일 관련 다수")],
    "깨어나는 힘": [
      note("일반 스킬 적중 시 엠버레스의 기운 회복량 +1"),
      percent("critRate", [6, 13, 20], "global"),
    ],
    "완전 연소": [
      note("발현 스킬 사용 시 엠버레스의 기운을 모두 소모 · 오브 게이지 회복"),
      percent("critRate", [5, 10, 15], "conditional", "발현 스킬 사용 후"),
    ],
    "초비행": [
      percent("moveSpeedOnly", [10, 10, 10, 10, 10], "conditional", "화신 상태의 활공"),
      percent("cooldownReduction", [0.5, 0.5, 0.5, 0.5, 0.5], "conditional", "화신 스킬 사용 시 이동기"),
      damage("주는 피해", [1, 2, 3, 4, 5], "global"),
    ],
    "힘의 제어": [
      damage("주는 피해", [6, 8, 10], "conditional", "엠버레스의 기운 소모당"),
      percent("cooldownReduction", [0.5, 0.5, 0.5], "conditional", "화신 중 기운 소모당 일반 스킬"),
    ],
    "돌파의 외침": [damage("주는 피해", [6, 13, 20], "global", "일반 스킬")],
    "날카로운 비늘": [damage("주는 피해", [1, 2, 3, 4, 5], "partial", "가디언 스케일 해제 시")],
    "잔불": [
      percent("moveSpeedOnly", [5, 5, 5, 5, 5], "conditional", "화신 해제 후 16초"),
      damage("주는 피해", [1, 2, 3, 4, 5], "global"),
    ],
    // 1레벨에는 전역 절이 없다.
    "완전 융화": [
      damage("주는 피해", [0, 4, 8], "global"),
      damage("주는 피해", [0, 3, 6], "conditional", "반격의 불씨 중첩당 인페르노 버스트"),
    ],
    "한계 초월": [
      percent("attackSpeedOnly", [15, 15, 15], "conditional", "초월 상태 5초"),
      damage("주는 피해", [5, 15, 25], "conditional", "초월 상태의 강화 스킬"),
    ],
    "할버드의 대가": [
      note("일반 스킬 시전 속도 +3~5%"),
      percent("critDamage", [4, 7, 8, 11, 12], "global", "일반 스킬"),
    ],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 무력화 피해 +10~30%")],
    "일점 돌파": [
      damage("주는 피해", [15, 34, 53], "conditional", "소울 디바이드 오버차지"),
      damage("주는 피해", [50, 50, 50], "conditional", "소울 디바이드 차지 실패 시 감소"),
    ],
    "파멸의 피": [damage("주는 피해", [20, 40, 60], "partial", "소울 디바이드")],
    "궤도 충돌": [damage("주는 피해", [12, 29, 46], "partial", "딥 임팩트")],
    "대강하": [damage("주는 피해", [0, 16, 32], "partial", "딥 임팩트")],
  },
};
