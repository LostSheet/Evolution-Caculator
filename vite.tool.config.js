import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";

/**
 * 직업 관리 툴 — 유저 앱과 완전히 따로 선다.
 *
 * 왜 따로인가: 이 화면이 하는 일은 코드에 커밋될 데이터를 고치는 것이다.
 * 유저에게 보일 이유가 없고, 유저 번들에 한 줄도 실릴 이유가 없다.
 * `npm run build`는 이 설정을 안 본다 — 페이지 탭도, ?tool 같은 뒷문도 없다.
 *
 * 파일을 직접 쓴다. 내려받아 손으로 옮기는 것보다 낫다 — 30직업 × 다섯 갈래를
 * 손으로 옮기다 보면 어느 파일이 최신인지 알 수 없게 된다.
 */
const ROOT = resolve(import.meta.dirname);
// 여기 밑으로만 쓴다. 툴이 열려 있는 동안 임의 경로에 쓰게 두면 안 된다.
const WRITABLE = resolve(ROOT, "src/lib/data");

function writeBack() {
  return {
    name: "tool-write-back",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
          try {
            const { path, source } = JSON.parse(body);
            const target = resolve(ROOT, path);
            const inside = relative(WRITABLE, target);
            if (inside.startsWith("..") || inside.startsWith(sep) || inside === "") {
              throw new Error(`src/lib/data 밖입니다: ${path}`);
            }
            if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, source);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, path: relative(ROOT, target) }));
          } catch (cause) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(cause.message ?? cause) }));
          }
        });
      });

      // 읽기도 서버가 맡는다. import로 읽으면 HMR 캐시에 걸려 방금 쓴 것이 안 온다.
      server.middlewares.use("/__read", (req, res) => {
        try {
          const path = new URL(req.url, "http://x").searchParams.get("path");
          const target = resolve(ROOT, path ?? "");
          const inside = relative(WRITABLE, target);
          if (inside.startsWith("..") || inside === "") throw new Error("src/lib/data 밖입니다");
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, source: existsSync(target) ? readFileSync(target, "utf8") : null }));
        } catch (cause) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: String(cause.message ?? cause) }));
        }
      });
    },
  };
}

export default defineConfig({
  root: "tool",
  plugins: [svelte(), writeBack()],
  server: { port: 5180 },
});
