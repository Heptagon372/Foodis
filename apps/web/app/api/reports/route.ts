// POST /api/reports — 상세 화면 "정보가 틀렸나요?" (07 문서 거버넌스, F-ADM-03). 게스트도 가능
// 같은 음식·식이 필드에 열린 신고 3건이면 DB 트리거가 그 값을 unknown 으로 강등 → 남용 방지로 IP·사용자별 제한
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { isLive } from "@/lib/content";
import { currentUserId, supabaseAdmin } from "@/lib/db/supabase-server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

const Body = z.object({
  food_id: z.uuid(),
  field: z.enum(["diet_vegan", "diet_vegetarian", "diet_halal", "diet_gluten_free", "diet_dairy_free", "allergens", "summary", "culture_story", "origin", "other"]),
  message: z.string().trim().max(500).optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const userId = await currentUserId().catch(() => null);
  const key = clientKey(req, userId);
  const burst = rateLimit(key + ":report", 3, 60_000);
  const daily = rateLimit(key + ":report-day", 10, 86_400_000);
  if (!burst.ok || !daily.ok) return tooMany(burst.ok ? daily.retryAfterSec : burst.retryAfterSec);
  if (!(await isLive())) return Response.json({ ok: true, preview: true }); // 미리보기 샘플에는 저장하지 않는다
  const { error } = await supabaseAdmin().from("reports").insert({ ...body.data, user_id: userId });
  if (error) return jsonError(500, "report_failed", error.message);
  return Response.json({ ok: true }, { status: 201 });
}
