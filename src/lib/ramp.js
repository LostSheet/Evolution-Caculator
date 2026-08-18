// 쿨감 램프.
//
// 곡선의 점과 표의 색 조각이 같은 뜻을 가져야 해서 두 화면이 같은 함수를 쓴다.
// 예전에는 두 파일에 같은 식이 따로 적혀 있었고, 테마를 바꿀 때 한쪽만
// 고쳐질 위험이 있었다.
//
// 색을 숫자로 섞지 않고 color-mix로 넘긴다. 램프의 양 끝이 곧 --cool과
// --warm이므로, 테마가 바뀌면 브라우저가 새 토큰으로 다시 섞는다.
//
// 다만 이 문자열을 background에 바로 꽂으면 안 된다. 그 자리에서 즉시
// rgb()로 굳어 버려서 테마를 바꿔도 옛 색이 그대로 남는다 — 밝은 테마에서
// 어두운 테마의 연한 파랑 위에 흰 글자가 올라가 대비 2.28이 나왔다.
// 사용자 지정 속성(--ramp)에 담아 두면 실제로 쓰이는 순간에 풀리므로
// 그때의 --cool/--warm을 따라간다. 쓰는 쪽은 app.css의 .ramped를 본다.

/** 프론트에서 쿨감의 최소·최대. 한 점뿐이면 나누기 0이 되므로 폭을 1로 벌린다. */
export function cooldownRange(front) {
  if (!Array.isArray(front) || front.length === 0) return { min: 0, max: 1 };
  const values = front.map(point => point.cooldownReduction);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max: max === min ? min + 1 : max };
}

/** 쿨감 값 하나를 램프 위의 색으로. 낮으면 --cool(한 방 딜), 높으면 --warm(사이클). */
export function cooldownColor(value, range) {
  const span = range.max - range.min;
  const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (value - range.min) / span));
  return `color-mix(in srgb, var(--warm) ${(t * 100).toFixed(1)}%, var(--cool))`;
}
