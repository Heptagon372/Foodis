/**
 * 플랫폼 QA 크롤러 — 모든 화면과 읽기 API 를 한 번씩 불러 상태 코드 · 응답 시간 · 오류 흔적을 본다 (docs/design/20).
 * 실행 (apps/web): pnpm qa:crawl                       기본 http://localhost:3000
 *                  pnpm qa:crawl -- http://localhost:3210  다른 서버 (프로덕션 빌드 리허설 등)
 * 쓰기 API(POST)는 부르지 않는다. 어드민 화면은 로그인 화면으로 돌려보내면 정상.
 */
const BASE = process.argv.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:3000";

type Check = { path: string; expect?: number[]; kind: "page" | "api" };
type Result = { path: string; status: number; ms: number; bytes: number; problem: string | null };

async function get(path: string): Promise<{ status: number; body: string; ms: number; location: string | null }> {
  const t0 = performance.now();
  const r = await fetch(BASE + path, { redirect: "manual", headers: { "user-agent": "foodis-qa-crawl" } });
  const body = await r.text();
  return { status: r.status, body, ms: performance.now() - t0, location: r.headers.get("location") };
}

async function main() {
  // 동적 화면에 넣을 실제 값: 공개 API 에서 고른다
  const pick = async <T>(path: string, f: (j: unknown) => T | undefined): Promise<T | undefined> => {
    try {
      return f(JSON.parse((await get(path)).body));
    } catch {
      return undefined;
    }
  };
  const posts = await pick("/api/community/posts", (j) => ((j as { posts?: { id: string }[] }).posts ?? (j as { id: string }[]))?.[0]?.id);
  const clubs = await pick("/api/community/clubs", (j) => ((j as { clubs?: { id: string }[] }).clubs ?? (j as { id: string }[]))?.[0]?.id);

  const pages: Check[] = [
    "/", "/map", "/eats", "/news", "/radio", "/quests", "/passport", "/passport/table", "/settings", "/onboarding", "/login", "/demo",
    "/community", "/community/write", "/community/clubs/new",
    "/food/kimchi", "/food/sushi", "/food/tom-yum-kung", "/food/cozonac", "/food/pad-thai", "/food/injera",
    "/country/KR", "/country/TH", "/country/QA", "/country/WS", "/country/ZZ",
    "/ingredient/potato", "/ingredient/chickpea",
    "/journey/kimchi", "/journey/pad-thai", "/taste/kimchi", "/taste/sushi",
    "/food/this-food-does-not-exist",
    ...(posts ? [`/community/${posts}`] : []),
    ...(clubs ? [`/community/clubs/${clubs}`] : []),
  ].map((path) => ({ path, kind: "page" as const, expect: path.includes("does-not-exist") || path.endsWith("/ZZ") ? [404] : undefined }));
  const admin: Check[] = ["/admin", "/admin/foods", "/admin/kpi", "/admin/logs", "/admin/reports", "/admin/places", "/admin/import"].map((path) => ({ path, kind: "page", expect: [200, 307, 308] }));
  const apis: Check[] = [
    "/api/health", "/api/foodi/models", "/api/foodi/voices", "/api/countries/KR", "/api/foods/kimchi", "/api/foods/kimchi/relations",
    "/api/news", "/api/radio", "/api/trending", "/api/community/posts", "/api/community/clubs", "/api/community/briefing",
    "/api/foods/table?keys=kimchi,sushi", "/api/foods/explore?q=%EA%B9%80%EC%B9%98", "/api/places/nearby?food=kimchi&lat=37.5665&lng=126.978",
  ].map((path) => ({ path, kind: "api" }));
  // /api/community/signals · /api/community/buddy/chats 는 POST 전용, /api/demo/pack 은 DEMO_MODE 일 때만(아니면 403)
  const authApis: Check[] = ["/api/me", "/api/community/buddy", "/api/demo/pack"].map((path) => ({ path, kind: "api", expect: [200, 401, 403] }));

  const results: Result[] = [];
  for (const c of [...pages, ...admin, ...apis, ...authApis]) {
    try {
      const r = await get(c.path);
      const ok = c.expect ?? [200];
      let problem: string | null = ok.includes(r.status) ? null : `상태 ${r.status}${r.location ? ` → ${r.location}` : ""}`;
      if (!problem && c.kind === "page" && r.status === 200) {
        if (/Application error|Internal Server Error|Unhandled Runtime Error|__next_error__/.test(r.body)) problem = "오류 화면 흔적";
        else if (r.body.length < 2_000) problem = `본문이 너무 짧음 (${r.body.length}B)`;
      }
      if (!problem && c.kind === "api" && r.status === 200) {
        try {
          JSON.parse(r.body);
        } catch {
          problem = "JSON 이 아님";
        }
      }
      if (!problem && r.ms > 8_000) problem = `느림 ${Math.round(r.ms)}ms`;
      results.push({ path: c.path, status: r.status, ms: r.ms, bytes: r.body.length, problem });
    } catch (e) {
      results.push({ path: c.path, status: 0, ms: 0, bytes: 0, problem: `요청 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  for (const r of results) console.log(`${r.problem ? "✗" : "✓"} ${String(r.status).padEnd(3)} ${String(Math.round(r.ms)).padStart(6)}ms ${String(r.bytes).padStart(8)}B  ${r.path}${r.problem ? `  ← ${r.problem}` : ""}`);
  const bad = results.filter((r) => r.problem);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n${BASE} — ${results.length}개 중 문제 ${bad.length}개 · 응답 p50 ${Math.round(ms[ms.length >> 1])}ms · p95 ${Math.round(ms[Math.floor(ms.length * 0.95)])}ms`);
  if (bad.length) process.exitCode = 1;
}

main();
