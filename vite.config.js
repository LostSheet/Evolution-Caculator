import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // 포트를 못 박지 않는다. 다른 작업이 5173을 쓰고 있으면 그대로 못 뜬다.
  // 이 앱은 특정 포트가 필요 없다 — 로스트아크 API가 CORS에서 Origin을 그대로
  // 되돌려 주므로 어느 포트에서 열어도 통한다.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
})
