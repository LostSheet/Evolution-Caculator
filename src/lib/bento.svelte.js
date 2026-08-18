// 벤또 격자.
//
// 열은 뷰포트에 따라 3 / 2 / 1로 고정하고, 행은 8px로 잘게 쪼갠다.
// 카드마다 제 높이만큼 행을 점유하게 하면 짧은 카드 밑에 구멍이 남지 않는다.
// grid-auto-flow: dense가 뒤쪽 카드를 앞의 빈칸으로 끌어와 채운다.
//
// 순서는 그대로다 — dense는 자리를 메울 뿐 우선순위를 뒤집지 않는다.
const ROW = 8;
const GAP = 16;

/**
 * @param {HTMLElement} grid 카드들을 직접 자식으로 가진 격자
 */
export function bento(grid) {
  const measure = () => {
    for (const card of grid.children) {
      if (!(card instanceof HTMLElement)) continue;
      // 이전 span이 높이를 잡아두면 실제 높이를 잴 수 없다.
      card.style.gridRowEnd = "";
      const height = card.getBoundingClientRect().height;
      card.style.gridRowEnd = `span ${Math.ceil(height / ROW) + GAP / ROW}`;
    }
  };

  measure();

  // 카드 내용이 늘거나 줄면 다시 잰다 — 직접 입력 효과 행 추가, 코어 선택 등.
  const observer = new ResizeObserver(measure);
  observer.observe(grid);
  for (const card of grid.children) {
    if (card instanceof HTMLElement) observer.observe(card);
  }

  return {
    update: measure,
    destroy: () => observer.disconnect(),
  };
}
