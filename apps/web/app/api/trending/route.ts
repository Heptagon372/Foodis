// GET /api/trending — 지금 뜨는 음식 (뉴스 제목 + 커뮤니티 글의 음식 언급 → 급상승 순위, ▲·NEW).
// 뉴스가 30분 넘게 묵었으면 응답 뒤에 새로 수집한다 (after)
import { after } from "next/server";
import { jsonError } from "@/lib/api/http";
import { risingFoods } from "@/lib/community/server";
import { crawlNow, getNewsStore, isStale } from "@/lib/news/server";
import { RISING } from "@/lib/trends/rising";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const news = await getNewsStore();
    if (await isStale(news)) after(() => crawlNow().then(() => {}, () => {}));
    const since = new Date(Date.now() - RISING.recentMs - RISING.baseMs).toISOString();
    const articles = await news.list({ category: null, limit: 1500, sinceIso: since });
    const last = await news.lastFetchedAt();
    const r = await risingFoods(articles, `${articles.length}:${last ?? ""}`);
    return Response.json({ items: r.items, counts: r.counts, updated_at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(500, "trending_failed", (e as Error).message);
  }
}
