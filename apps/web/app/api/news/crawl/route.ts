// GET /api/news/crawl — 스케줄러(Vercel Cron 등)용 강제 수집. Authorization: Bearer <CRON_SECRET>
// 화면 요청만으로도 30분마다 자동 수집되지만, 방문이 없을 때도 쌓아 두려면 이걸 30분 간격으로 부른다
import { jsonError } from "@/lib/api/http";
import { env } from "@/lib/env";
import { crawlNow, newsProvider } from "@/lib/news/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return jsonError(401, "unauthorized", "CRON_SECRET 이 필요해요.");
  if (newsProvider() === "none") return jsonError(503, "news_provider_missing", "NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 이 설정되지 않았어요.");
  try {
    return Response.json({ ok: true, provider: newsProvider(), ...(await crawlNow()) });
  } catch (e) {
    return jsonError(500, "crawl_failed", (e as Error).message);
  }
}
