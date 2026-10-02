// POST /api/places/:kakaoPlaceId/report — 이용자 제보 (쿠폰·이벤트·공동구매·포장·정보 정정). 로그인 필요.
// 제보는 verified=false 로만 들어가고, 어드민이 확인하기 전에는 내용(자유 텍스트)이 화면에 나가지 않는다 ("이용자 제보 · 확인 전" 배지만).
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { hasSupabaseKeys } from "@/lib/content";
import { currentUserId, supabaseAdmin } from "@/lib/db/supabase-server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { endOfDayKst, OFFER_LABEL } from "@/lib/places/offers";
import { restaurantIdByKakao } from "@/lib/places/repo";

const Body = z.object({
  kind: z.enum(["coupon", "event", "group_buy", "takeout", "info"]),
  text: z.string().trim().min(2).max(300),
  ends_on: z.iso.date().optional(), // 쿠폰·이벤트 마감일을 알면 (YYYY-MM-DD)
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return jsonError(401, "login_required", "제보는 로그인한 뒤에 할 수 있어요.");
  const key = clientKey(req, userId);
  const burst = rateLimit(key + ":place-report", 3, 60_000);
  const daily = rateLimit(key + ":place-report-day", 10, 86_400_000);
  if (!burst.ok || !daily.ok) return tooMany(burst.ok ? daily.retryAfterSec : burst.retryAfterSec);
  const id = (await params).id;
  if (!/^\d{1,20}$/.test(id)) return jsonError(400, "invalid_place", "음식점 id 가 올바르지 않아요.");
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  if (!hasSupabaseKeys()) return Response.json({ ok: true, preview: true });

  try {
    const restaurantId = await restaurantIdByKakao(id);
    if (!restaurantId) return jsonError(404, "place_not_found", "이 음식점을 먼저 검색해 주세요.");
    const { error } = await supabaseAdmin()
      .from("restaurant_offers")
      .insert({
        restaurant_id: restaurantId,
        kind: body.data.kind,
        title: `${OFFER_LABEL[body.data.kind]} 제보`,
        detail: body.data.text,
        ends_at: body.data.ends_on ? endOfDayKst(body.data.ends_on) : null,
        source: "report",
        verified: false,
        created_by: userId,
      });
    if (error) return jsonError(500, "report_failed", error.message);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(500, "report_failed", (e as Error).message);
  }
}
