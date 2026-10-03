// GET /api/places/:kakaoPlaceId/kakao-reviews — 카카오맵 장소 상세에서 별점·리뷰 크롤링
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { cachedKakaoReviews } from "@/lib/places/kakao-crawl";

const PLACE_ID = /^\d{1,20}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(clientKey(req, null) + ":kakao-reviews", 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const id = (await params).id;
  if (!PLACE_ID.test(id)) return jsonError(400, "invalid_place", "음식점 id 가 올바르지 않아요.");

  const data = await cachedKakaoReviews(id);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=300" },
  });
}
