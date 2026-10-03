// GET /api/places/:kakaoPlaceId/menu — 카카오맵 장소 상세에서 메뉴판·영업시간·영업 중 여부 크롤링.
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { cachedKakaoMenu } from "@/lib/places/kakao-menu";

const PLACE_ID = /^\d{1,20}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(clientKey(req, null) + ":menu", 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const id = (await params).id;
  if (!PLACE_ID.test(id)) return jsonError(400, "invalid_place", "음식점 id 가 올바르지 않아요.");

  const data = await cachedKakaoMenu(id);
  return NextResponse.json(data, {
    // 영업 중 여부는 시간에 따라 바뀌니 짧게
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
  });
}
