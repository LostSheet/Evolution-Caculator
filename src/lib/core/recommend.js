// 프론트 위에서 "둘 다 상대적으로 높은" 지점을 고른다.
//
// 축이 둘인데 눈금이 다르다. 실제로 재 보면 한 방 딜은 프론트 전체에서 15~50%
// 벌어지는데 DPS는 4~13%밖에 안 벌어진다 — 늘 네댓 배 차이다. 구조적이다:
//
//   DPS = 한 방 딜 ÷ (1 − 쿨감)
//
// 프론트를 따라 쿨감을 사면 한 방 딜을 잃는다. DPS가 오르는 건 1/(1−쿨감)이
// 커지는 속도가 한 방 딜이 깎이는 속도를 "겨우" 넘기 때문이고, 그 차이가 곧
// DPS의 폭이다. 그래서 절대 수치를 나란히 놓으면 안 되고, 각 축의 최고 대비
// 손실로 환산해야 비교가 성립한다.
//
//   손실 = (최고 − 이 빌드) ÷ 최고
//
// 여기서 고르지는 않는다. 한때 "두 손실 중 큰 쪽이 가장 작은 지점"(체비셰프)을
// 추천으로 썼는데, 기준이 프론트의 양 끝이라 탐색이 극단적인 빌드를 하나 더
// 찾았느냐로 답이 절반씩 뒤집혔다. 게임의 성질이 아니라 탐색의 우연이었다.
// 고르는 일은 ceiling.js가 하고, 여기는 읽을 숫자만 만든다.
import { readNumber } from "./util.js";

/**
 * 프론트를 손실 기준으로 다시 읽는다.
 * @param {object[]} front 파레토 프론트
 * @returns {?object} 비어 있으면 null
 */
export function analyseFront(front) {
  if (!Array.isArray(front) || front.length === 0) return null;

  const damageBest = Math.max(...front.map(entry => readNumber(entry.damageIndex)));
  const dpsBest = Math.max(...front.map(entry => readNumber(entry.dpsIndex)));
  if (!(damageBest > 0) || !(dpsBest > 0)) return null;

  const rows = front.map(entry => {
    const damageLoss = (damageBest - readNumber(entry.damageIndex)) / damageBest * 100;
    const dpsLoss = (dpsBest - readNumber(entry.dpsIndex)) / dpsBest * 100;
    return { entry, damageLoss, dpsLoss, worstLoss: Math.max(damageLoss, dpsLoss) };
  });

  return {
    damageBest,
    dpsBest,
    // 이 프론트에서 각 축이 실제로 얼마나 벌어지는가 — 결정에 제일 중요한 숫자다.
    damageSpread: Math.max(...rows.map(row => row.damageLoss)),
    dpsSpread: Math.max(...rows.map(row => row.dpsLoss)),
    cooldownRange: [
      Math.min(...front.map(entry => readNumber(entry.cooldownReduction))),
      Math.max(...front.map(entry => readNumber(entry.cooldownReduction))),
    ],
    rows,
  };
}
