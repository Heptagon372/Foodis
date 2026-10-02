// GET /api/places/:kakaoPlaceId/naver-reviews?name=...&address=... — 네이버 플레이스에서 별점·리뷰 크롤링
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { cachedNaverReviews } from "@/lib/places/naver-crawl";

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, null) + ":naver-reviews", 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  const address = url.searchParams.get("address");
  if (!name) return jsonError(400, "missing_name", "음식점 이름이 필요해요.");

  const data = await cachedNaverReviews(name, address ?? "");
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=300" },
  });
}
