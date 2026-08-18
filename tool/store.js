// 툴이 파일을 읽고 쓰는 길. vite.tool.config.js의 미들웨어와 짝이다.
//
// import로 안 읽는다 — 방금 쓴 파일을 다시 import하면 HMR 캐시가 옛것을 준다.
// 화면이 "저장했다"고 말한 뒤 그 값을 못 읽는 것만큼 나쁜 것이 없다.

export async function readFile(path) {
  const res = await fetch(`/__read?path=${encodeURIComponent(path)}`);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error);
  return body.source;
}

export async function writeFile(path, source) {
  const res = await fetch("/__save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, source }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error);
  return body.path;
}
