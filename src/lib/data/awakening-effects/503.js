// 데빌헌터 (503) — 깨달음 · 도약 수치.
//
// 원문: src/lib/data/arkpassive-desc/503.js
//
// 전역이 셋이다. 정밀 사격 훈련의 치적 24% · 치피 14%, 해결사의 움직임과
// 전략적 군장의 "모든 스킬의 피해량". 전략적 군장은 1레벨에 그 절이 없어
// 0부터 시작한다.
import { percent, damage, branchPercent, branchDamage, note, replaces } from "./kit.js";

export default {
  status: "confirmed",
  branches: [
    { name: "전술 탄환", note: "세 스탠스를 다 쓰는 선택지입니다. 스탠스 스킬 조건이라 아직 반영하지 않습니다." },
    { name: "핸드 거너", note: "핸드건 스탠스만 쓰는 선택지입니다. 맹공 버프 조건이라 아직 반영하지 않습니다." },
  ],
  nodes: {
    // ── 깨달음 ────────────────────────────────────────────────────────
    "전술 탄환": [damage("주는 피해", [3, 6, 9], "conditional", "전술 탄환 소모 시 해당 스탠스 스킬")],
    "핸드 거너": [
      damage("주는 피해", [16, 33, 50], "partial", "각성기 클레이 폭격"),
      percent("moveSpeedOnly", [8, 8, 8], "conditional", "맹공 버프"),
      percent("cooldownReduction", [5, 5, 5], "conditional", "맹공 버프"),
      note("핸드건 · 클레이 폭격 무력화 피해 +40%"),
    ],
    "탄약 보충": [note("스탠스 전환 시 전술 탄환 2~3개 획득")],
    "화려한 발재간": [percent("cooldownReduction", [0.1], "conditional", "핸드건 스킬 적중 시 이동기")],
    // "모든 스킬의 피해량이 4.0% 증가한다" — 조건이 없다.
    "해결사의 움직임": [damage("주는 피해", [0.8, 1.6, 2.4, 3.2, 4], "global")],
    "정밀 사격 훈련": [
      percent("critRate", [8, 16, 24], "global"),
      percent("critDamage", [4, 9, 14], "global"),
    ],
    "핸드건 강화": [damage("주는 피해", [65, 77, 89], "global", "핸드건 스킬")],
    "퀵 드로우": [percent("critRate", [1, 2, 3, 4, 5], "conditional", "퀵 드로우 버프 9초")],
    "고폭탄": [damage("주는 피해", [1.2, 2.4, 3.6, 4.8, 6], "global", "샷건 스킬")],
    // 1레벨에는 '모든 스킬' 절이 없다. 2레벨부터 5 · 10%.
    "전략적 군장": [
      damage("주는 피해", [0, 5, 10], "global"),
      damage("주는 피해", [5, 7, 9], "global", "샷건 스킬"),
    ],
    "비밀 병기": [damage("주는 피해", [0, 100, 200], "partial", "비밀 병기 스킬")],
    "빛나는 탄": [damage("주는 피해", [1.4, 2.8, 4.2, 5.6, 7], "conditional", "빛나는 탄 버프 중 핸드건 스킬")],

    // ── 도약 ──────────────────────────────────────────────────────────
    "초월적인 힘": [damage("주는 피해", [10, 20, 30, 40, 50], "partial", "초각성기")],
    "충전된 분노": [percent("cooldownReduction", [10, 20, 30, 40, 50], "conditional", "초각성 게이지가 찼을 때 각성기 1회")],
    "각성 증폭기": [note("각성기 사용 가능 횟수 +1~3")],
    "풀려난 힘": [damage("주는 피해", [3, 6, 9, 12, 15], "partial", "초각성 스킬")],
    "잠재력 해방": [percent("cooldownReduction", [2, 4, 6, 8, 10], "partial", "초각성 스킬")],
    "즉각적인 주문": [note("초각성 스킬 시전 속도 +4~12%, 마나 소모 −30~90%")],
    "허리케인": [
      percent("cooldownReduction", [0.4, 0.4, 0.4], "conditional", "래피드 파이어 적중 시 이동기"),
      damage("주는 피해", [23, 46, 70], "partial", "래피드 파이어"),
    ],
    "퀵 스톰": [damage("주는 피해", [21, 43, 65], "partial", "래피드 파이어")],
    "풀레인지": [damage("주는 피해", [23, 46, 70], "partial", "둠스 데이")],
    "샷건 리로드": [percent("cooldownReduction", [6, 13, 20], "conditional", "둠스 데이 사용 시 샷건 스킬")],
    "엄호 사격": [damage("주는 피해", [0, 18, 36], "partial", "죽음의 표적")],
    "증원": [
      damage("주는 피해", [75, 75, 75], "partial", "죽음의 표적 미사일당 피해 감소"),
      damage("주는 피해", [25, 50, 75], "partial", "죽음의 표적"),
    ],
  },
};
