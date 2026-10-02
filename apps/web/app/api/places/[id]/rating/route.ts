// POST /api/places/:kakaoPlaceId/rating — 푸디 앱 평점 (로그인 사용자 1인 1표, 다시 매기면 덮어씀)
// "맛있는 순"의 한 축이다. 별점만 받고 글 후기는 받지 않는다(검수 부담·명예훼손 위험).
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { hasSupabaseKeys } from "@/lib/content";
import { currentUserId, supabaseAdmin } from "@/lib/db/supabase-server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { restaurantIdByKakao } from "@/lib/places/repo";
import { foodLite } from "@/lib/places/server";

const Body = z.object({ stars: z.number().int().min(1).max(5), food: z.string().regex(/^[a-z0-9-]{1,80}$/).optional() });
const PLACE_ID =/^\d{1,20}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return jsonError(401, "login_required", "평점은 로그인한 뒤에 남길 수 있어요.");
  const rl = rateLimit(clientKey(req, userId) + ":rating", 10, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const id = (await params).id;
  if (!PLACE_ID.test(id)) return jsonError(400, "invalid_place", "음식점 id 가 올바르지 않아요.");
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  if (!hasSupabaseKeys()) return Response.json({ ok: true, preview: true });

  try {
    const restaurantId = await restaurantIdByKakao(id);
    if (!restaurantId) return jsonError(404, "place_not_found", "이 음식점을 먼저 검색해 주세요.");
    const food = body.data.food ? await foodLite(body.data.food) : null;
    const { error } = await supabaseAdmin()
      .from("restaurant_ratings")
      .upsert({ restaurant_id: restaurantId, user_id: userId, food_id: food?.live ? food.id : null, stars: body.data.stars, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,user_id" });
    if (error) return jsonError(500, "rating_failed", error.message);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(500, "rating_failed", (e as Error).message);
  }
}
