// GET /api/news?category=food|culture&term=<키워드> — 음식·문화 뉴스 (최신 순) + 뉴스 급상승 키워드.
// 자동 수집: 처음(빈 저장소)이면 기다렸다 보여 주고, 30분 넘게 묵었으면 응답 뒤에 새로 수집한다
import { after } from "next/server";
import { jsonError } from "@/lib/api/http";
import { crawlNow, getNewsStore, isStale, NEWS_STALE_MS, newsProvider } from "@/lib/news/server";
import type { NewsCategory } from "@/lib/news/sources";
import { norm } from "@/lib/trends/keywords";
import { rankRising, type Mention } from "@/lib/trends/rising";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const c = url.searchParams.get("category");
  const category: NewsCategory | null = c === "food" || c === "culture" ? c : null;
  const term = url.searchParams.get("term")?.trim().slice(0, 30) || null;
  try {
    const store = await getNewsStore();
    if (!(await store.lastFetchedAt()) && newsProvider() !== "none") {
      // 첫 방문: 최대 12초 기다렸다 보여 준다 (수집원이 막혀도 화면은 뜬다)
      await Promise.race([crawlNow(), new Promise((r) => setTimeout(r, 12_000))]).catch(() => null);
    } else if (await isStale(store)) after(() => crawlNow().then(() => {}, () => {}));

    const all = await store.list({ category: null, limit: 1500, sinceIso: new Date(Date.now() - 9 * 86_400_000).toISOString() });
    const inCat = category ? all.filter((a) => a.category === category) : all;
    const mentions: Mention[] = inCat.flatMap((a) => a.terms.map((t) => ({ term: t, slug: null, at: Date.parse(a.published_at), weight: 1, source: "news" as const })));
    const rising = rankRising(mentions);
    const hot = new Set(rising.slice(0, 5).map((r) => norm(r.term)));
    const list = term ? inCat.filter((a) => a.terms.some((t) => norm(t) === norm(term)) || a.title.includes(term)) : inCat;
    const last = await store.lastFetchedAt();
    return Response.json(
      {
        articles: list.slice(0, 60).map((a) => ({ ...a, hot: a.terms.some((t) => hot.has(norm(t))) })),
        rising,
        counts: { food: all.filter((a) => a.category === "food").length, culture: all.filter((a) => a.category === "culture").length },
        provider: newsProvider(),
        mode: store.mode,
        updated_at: last,
        next_update_at: last ? new Date(Date.parse(last) + NEWS_STALE_MS).toISOString() : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(500, "news_failed", (e as Error).message);
  }
}
