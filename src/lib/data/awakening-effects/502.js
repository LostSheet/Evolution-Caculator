// 호크아이 (502) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/502.js
//
// 전역이 없다. 모든 수치가 실버호크 소환 여부 · 버프 · 특정 스킬에 걸린다.
// 실버호크를 늘 소환해 두더라도 '소환 중'은 조건이라, 유지율을 모르는 채로
// 전역으로 세면 안 된다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "죽음의 습격", note: "실버호크를 안 쓰는 선택지입니다. 미소환 조건이라 아직 반영하지 않습니다." },
    { name: "두 번째 동료", note: "실버호크 MK-II 선택지입니다. 소환 중 조건이라 아직 반영하지 않습니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "죽음의 습격": [damage("주는 피해", [6, 12, 18], "conditional", "실버호크 미소환 상태")],
    "두 번째 동료": [
      percent("moveSpeedOnly", [8, 8, 8], "conditional", "실버호크 소환 중"),
      percent("critRate", [13, 26, 40], "partial", "실버호크 스킬"),
      note("실버호크 공격 범위 +60% · 유지 시간 +100%"),
    ],
    "호크 게이지 회수": [note("최후의 습격 · 실버호크 강습 사용 시 호크 게이지 30~50% 회복")],
    "호크 서포트": [damage("공격력", [8, 16, 24], "conditional", "실버호크 소환 중")],
    "페일 노트": [percent("critDamage", [4, 8, 12, 16, 20], "conditional", "페일 노트 버프 9초")],
    "최후의 표적": [note("최후의 표적 대상이 받는 피해 +9~27% (8초)")],
    "폭풍의 표적": [note("폭풍의 표적 대상이 받는 피해 +6~18% (8초)")],
    "실버호크 강화": [damage("주는 피해", [8, 16, 24, 32, 40], "partial", "실버호크 기본 공격")],
    "마나 회수": [damage("주는 피해", [4, 8, 12, 16, 20], "partial", "최후의 습격 · 실버호크 강습")],
    "실버호크 강습": [damage("주는 피해", [6, 12, 18], "conditional", "실버호크 강습으로 바뀐 뒤")],
    "폭풍의 사냥꾼": [
      damage("주는 피해", [8, 16, 24], "conditional", "폭풍의 사냥꾼 버프 8초"),
      percent("moveSpeedOnly", [12, 12, 12], "conditional", "사냥꾼의 발걸음 버프"),
    ],
    "딥러닝": [
      damage("주는 피해", [0.5, 1, 1.5, 2, 2.5], "conditional", "딥러닝 버프"),
      damage("주는 피해", [1, 2, 3, 4, 5], "conditional", "딥러닝 컴플리트 버프"),
    ],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 마나 소모 −30~90%")],
    "고속 회전": [damage("주는 피해", [20, 40, 60], "conditional", "실버호크 미소환 중 스파이럴 애로우")],
    "동료": [
      percent("critRate", [13, 26, 40], "partial", "스파이럴 애로우"),
      damage("주는 피해", [13, 26, 40], "conditional", "실버호크 소환 중 스파이럴 애로우"),
    ],
    "추가 동작": [
      damage("주는 피해", [50, 50, 50], "partial", "락온 · 체인 추가 대가로 피해 감소"),
      percent("attackSpeedOnly", [10, 10, 10], "conditional", "고속 버프 8초"),
      percent("attackSpeedOnly", [10, 20, 30], "conditional", "고속 버프 추가분"),
    ],
    "기동대": [percent("cooldownReduction", [15, 30, 45], "partial", "락온 스킬")],
  },
};
