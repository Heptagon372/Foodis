// FOODIS 서비스 워커 — 데모 오프라인 대비 (11 문서 §1·§6).
// - 화면(HTML): 네트워크 우선, 실패하면 미리 저장한 화면 (/demo 에서 "오프라인 준비")
// - 정적 자산(_next/static, 글꼴, 이미지): 캐시 우선 — 파일명에 해시가 있어 바뀌면 새 파일
// - /api/* 는 건드리지 않는다: 오프라인 답은 앱이 데모 팩에서 직접 꺼낸다
// 캐시 이름은 lib/client/demo.ts 와 같아야 한다.
const PAGES = "foodis-pages-v1";
const STATIC = "foodis-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/fonts/") ||
  /\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/.test(url.pathname) ||
  url.hostname === "cdn.jsdelivr.net" ||
  url.hostname.endsWith("wikimedia.org"); // 음식 사진 (위키미디어 공용)

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    e.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate" && url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone(); // 브라우저가 본문을 읽기 전에 복제해야 한다
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(url.pathname, { ignoreSearch: true })) || (await cache.match("/")) || Response.error();
        }),
    );
  }
});
