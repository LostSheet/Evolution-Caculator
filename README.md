# 아크 패시브 계산기

로스트아크 아크 패시브 진화 노드 계산기 + 조합 탐색기. Vite + Svelte 5.

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm test         # 검증 3종
```

## 구조

```
src/lib/core/     계산 · 탐색 코어 (프레임워크 무관, 순수 JS)
src/lib/components/  Svelte UI
scripts/          코어 생성기 + 테스트
legacy/           재구성 이전의 바닐라 빌드 (아래 참조)
```

### legacy/ 를 남겨둔 이유

`legacy/`는 단순 백업이 아니라 **계산식의 기준 구현**입니다.

`src/lib/core/` 중 `data.js` · `bracelets.js` · `engravings.js` · `util.js` ·
`metrics.js` · `search.js`는 손으로 옮겨 적은 것이 아니라
`scripts/extract-core.mjs`가 `legacy/`의 선언문을 **원문 그대로 잘라내** 생성합니다.
그래서 파일 상단에 `GENERATED` 주석이 붙어 있고, 직접 수정하면 안 됩니다.

```bash
npm run extract:core   # legacy/ → src/lib/core/ 재생성
```

수식을 고칠 때는 `legacy/`의 원본을 고치고 위 명령으로 다시 생성하면 됩니다.
`scripts/diff-legacy.mjs`가 무작위 상태로 신·구 결과를 대조하므로 어긋나면 즉시 잡힙니다.

예외는 `src/lib/core/runner.js`입니다. 레거시 탐색 드라이버가 브라우저 전역을 읽고 있어서
옵션을 명시적으로 받도록 새로 썼습니다. `scripts/runner.test.mjs`가 이 파일을 검증합니다.

`legacy/index.html`은 지금도 더블클릭으로 그냥 열립니다.

## 검증

| 스크립트 | 확인하는 것 |
| --- | --- |
| `test:pareto` | Pareto front 수집이 brute-force와 일치 (동점 처리 포함) |
| `test:runner` | 빠른 평가기 ≡ `calculateMetrics`, 전수 탐색 최적해 ≡ brute-force, 적용 결과 ≡ 표시값 |
| `test:legacy` | 추출된 코어 ≡ `legacy/` 원본 (무작위 4,000상태) |

## 계산 규칙

`ARK_PASSIVE_REFERENCE.md`에 노드 기준표, 마나 스킬 딜 비중, 방향성 각인 조건,
조합 탐색 규칙이 정리되어 있습니다.
