// POST /api/admin/places/offers — 사장님·어드민이 확인한 혜택 등록 (editor 이상). 등록은 확인 전 상태 → 다른 검수자가 승인
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { OfferInput, parseKakaoPlaceId } from "@/lib/places/admin-rules";
import { endOfDayKst, startOfDayKst } from "@/lib/places/offers";

export async function POST(req: Request) {
  const s = await requireApi("editor");
  if (s instanceof Response) return s;
  const parsed = OfferInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "입력을 확인해 주세요", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const o = parsed.data;
  const kakaoId = parseKakaoPlaceId(o.place)!;
  // 음식점 행이 없으면 id 만으로 만든다 (카카오 정보는 저장하지 않음)
  const up = await db()
    .from("restaurants")
    .upsert({ kakao_place_id: kakaoId, place_url: `https://place.map.kakao.com/${kakaoId}` }, { onConflict: "kakao_place_id", ignoreDuplicates: true });
  if (up.error) return apiError(500, up.error.message);
  const { data: r, error: re } = await db().from("restaurants").select("id").eq("kakao_place_id", kakaoId).single();
  if (re || !r) return apiError(500, re?.message ?? "음식점 저장 실패");
  const { error } = await db()
    .from("restaurant_offers")
    .insert({
      restaurant_id: r.id,
      kind: o.kind,
      title: o.title,
      detail: o.detail || null,
      starts_at: o.starts_on ? startOfDayKst(o.starts_on) : null,
      ends_at: o.ends_on ? endOfDayKst(o.ends_on) : null,
      source: o.source,
      verified: false,
      created_by: s.userId,
    });
  return error ? apiError(500, error.message) : Response.json({ ok: true }, { status: 201 });
}
