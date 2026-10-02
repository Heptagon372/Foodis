// GET /api/places/geocode?q=강남역 — GPS 를 못 쓸 때 지역·주소로 찾기 (카카오 주소 검색 → 비면 키워드 검색)
import { jsonError, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { inKorea } from "@/lib/places/geo";
import { geocode, KakaoError } from "@/lib/places/kakao";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 60) return jsonError(400, "invalid_query", "지역 이름을 2~60자로 적어 주세요.");
  const rl = rateLimit(clientKey(req, await currentUserId().catch(() => null)) + ":geocode", 10, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  if (!env.kakaoRestKey) return jsonError(503, "kakao_key_missing", "지역 검색 키(KAKAO_REST_API_KEY)가 설정되지 않았어요.");
  try {
    const p = await geocode(q, { key: env.kakaoRestKey });
    if (!p || !inKorea(p)) return jsonError(404, "not_found", "그 지역을 찾지 못했어요.");
    return Response.json(p, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return e instanceof KakaoError ? jsonError(502, `kakao_${e.code}`, e.message) : jsonError(502, "geocode_failed", "지역 검색이 잠시 안 돼요.");
  }
}
