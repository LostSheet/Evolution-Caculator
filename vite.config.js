import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [svelte()],
  // GitHub Pages 프로젝트 사이트는 /<저장소 이름>/ 아래에 얹힌다. 이걸 안 적으면
  // 자산 경로가 /assets/…로 나가서 404가 된다.
  //
  // 다만 빌드에만 건다. 개발 서버에도 걸면 HMR이 /Evolution-Caculator/ 아래를
  // 두드리는데 브라우저는 뿌리를 보고 있어서, 고친 것이 화면에 안 올라온 채로
  // 옛 코드가 돌아간다 — 실제로 그 상태로 검증을 한 번 했다.
  base: command === 'build' ? '/Evolution-Caculator/' : '/',
  build: {
    // Pages가 읽는 자리는 저장소 뿌리 아니면 docs/ 둘뿐이다. 뿌리는 소스와
    // 섞이므로 docs/를 쓴다 — 그래서 이 폴더는 통째로 산출물이고, 참고 문서는
    // reference/로 옮겼다.
    outDir: 'docs',
  },
  // 포트를 못 박지 않는다. 다른 작업이 5173을 쓰고 있으면 그대로 못 뜬다.
  // 이 앱은 특정 포트가 필요 없다 — 로스트아크 API가 CORS에서 Origin을 그대로
  // 되돌려 주므로 어느 포트에서 열어도 통한다.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
}))
