// 스카우터 (505) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/505.js
//
// 코어 인챈트가 조건 없이 치적 9%와 주는 피해 15%를 준다. 제로 모드의 앞
// 절("스카우터가 적에게 주는 피해")도 전역인데, 1레벨에는 그 절이 아예 없어서
// 0부터 시작한다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "진화의 유산", note: "하이퍼 싱크 Mk.2 선택지입니다. 싱크 계열 스킬 중심이라 아직 반영하지 않습니다." },
    { name: "아르데타인의 기술", note: "드론 중심 선택지입니다. 드론 부착 상태를 조건으로 걸어 아직 반영하지 않습니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "진화의 유산": [note("하이퍼 싱크 Mk.2 변신 · 제로 싱크 배터리 전환")],
    "아르데타인의 기술": [
      note("배터리 최대량 +10~20%"),
      percent("moveSpeedOnly", [10, 10, 10], "conditional", "드론 부착 상태"),
    ],
    "오버 싱크": [percent("cooldownReduction", [1, 1.5, 2], "conditional", "하이퍼 싱크 모드의 코멧 스트라이크")],
    "드론 방어 체계": [note("최대 생명력의 2~8% 보호막")],
    "코어 반응 증폭": [damage("주는 피해", [1, 2, 3, 4, 5], "global", "싱크 계열 스킬")],
    "전투 모드": [
      damage("주는 피해", [3, 9, 15], "conditional", "하이퍼 싱크 모드의 싱크 계열 스킬"),
      percent("cooldownReduction", [4, 4, 4], "conditional", "제로 싱크 스킬 사용 시 일반 스킬"),
      percent("cooldownReduction", [4, 4, 4], "conditional", "제로 싱크 스킬 사용 시 드론 스킬"),
      percent("cooldownReduction", [4, 4, 4], "conditional", "제로 싱크 스킬 사용 시 합작 스킬"),
    ],
    "기술 업그레이드": [
      damage("주는 피해", [20, 28, 36], "global", "일반 · 드론 · 합작 스킬"),
      damage("주는 피해", [20, 28, 36], "partial", "각성기 에어 스트라이크"),
    ],
    "전술 재장전": [
      damage("주는 피해", [1, 2, 3, 4, 5], "conditional", "전술 재장전 중첩"),
      percent("moveSpeedOnly", [1, 1, 1, 1, 1], "conditional", "전술 재장전 중첩당"),
      percent("attackSpeedOnly", [1, 1, 1, 1, 1], "conditional", "전술 재장전 중첩당"),
    ],
    "제로 코어 에너지": [damage("주는 피해", [3.5, 7, 10.5, 14, 17.5], "global", "제로 싱크 스킬")],
    // 1레벨에는 전역 절이 아예 없다. 2레벨부터 5 · 10%.
    "제로 모드": [
      damage("주는 피해", [0, 5, 10], "global"),
      damage("주는 피해", [40, 40, 40], "global", "제로 싱크 후 하이퍼 싱크 스킬"),
    ],
    "코어 인챈트": [
      percent("critRate", [3, 6, 9], "global"),
      damage("주는 피해", [5, 10, 15], "global"),
      note("배터리 최대량 +7~21% · 드론 방어 체계 발동 시 코어 에너지 회복"),
    ],
    "최고의 합작": [
      damage("주는 피해", [1.2, 2.4, 3.6, 4.8, 6], "conditional", "합작 - 스카우터 버프"),
      damage("주는 피해", [1.2, 2.4, 3.6, 4.8, 6], "conditional", "합작 - 드론 버프"),
    ],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 무력화 피해 +10~30%")],
    "최적화 모드": [damage("주는 피해", [15, 35, 55], "partial", "네오 파이어 스킬")],
    "포커스 파워": [damage("주는 피해", [24, 46, 68], "partial", "네오 파이어 스킬")],
    "오토 파일럿": [
      percent("cooldownReduction", [5, 5, 5], "conditional", "제로 싱크 스킬 사용 시 포인트 익스클루션"),
      damage("주는 피해", [30, 17.5, 5], "partial", "포인트 익스클루션 · 피해 감소"),
    ],
    "싱크 콤비네이션": [damage("주는 피해", [20, 41, 62], "partial", "포인트 익스클루션")],
  },
};
