// GET /api/places/nearby?food=<slug>&lat&lng&radius&sort=distance|best&filters=takeout,coupon&franchise=yes|no
// "한국에서 맛보기" (docs/design/12). API 키는 서버에만 — 브라우저는 이 라우트만 부른다.
// 좌표는 검색 대리 호출에만 쓰고 저장·로그하지 않는다.
import { jsonError, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { handleNearby } from "@/lib/places/nearby";
import { placesStore } from "@/lib/places/repo";
import { allowExample, foodLite } from "@/lib/places/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await currentUserId().catch(() => null);
  // 카카오 로컬 API 하루 무료량(키워드 검색 100,000)을 지키려고 사용자·IP별 분당 20회
  const rl = rateLimit(clientKey(req, userId) + ":places", 20, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  try {
    const r = await handleNearby(new URL(req.url).searchParams, {
      getFood: foodLite,
      kakaoKey: env.kakaoRestKey,
      googleKey: env.googleMapsKey,
      googleDailyCap: env.googlePlacesDailyCap,
      store: placesStore(),
      allowExample: allowExample(),
      warn: (m) => console.warn(m),
    });
    return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[places] nearby", (e as Error).message);
    return jsonError(500, "places_failed", "음식점을 찾지 못했어요. 잠시 뒤 다시 해주세요.");
  }
}
