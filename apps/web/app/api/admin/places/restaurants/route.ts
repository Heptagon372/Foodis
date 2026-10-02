// POST /api/admin/places/restaurants — 사장님·어드민이 직접 확인한 음식점 등록/수정 (editor 이상)
// 카카오 장소 id(링크)로 묶고, 이름·주소·위치는 사장님에게 받은 값만 넣는다. food 를 주면 "메뉴 확인됨"으로 잇는다.
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { isLive } from "@/lib/content";
import { parseKakaoPlaceId, RestaurantInput } from "@/lib/places/admin-rules";
import { foodLite } from "@/lib/places/server";

export async function POST(req: Request) {
  const s = await requireApi("editor");
  if (s instanceof Response) return s;
  const parsed = RestaurantInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "입력을 확인해 주세요", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const r = parsed.data;
  const kakaoId = parseKakaoPlaceId(r.place)!;
  const { data, error } = await db()
    .from("restaurants")
    .upsert(
      { kakao_place_id: kakaoId, place_url: `https://place.map.kakao.com/${kakaoId}`, name: r.name, address: r.address || null, phone: r.phone || null, lat: r.lat ?? null, lng: r.lng ?? null, info_source: r.info_source, updated_at: new Date().toISOString() },
      { onConflict: "kakao_place_id" },
    )
    .select("id")
    .single();
  if (error || !data) return apiError(500, error?.message ?? "저장 실패");
  if (r.food) {
    if (!(await isLive())) return apiError(409, "실제 DB 음식이 있어야 메뉴를 이을 수 있어요 (지금은 미리보기 샘플)");
    const food = await foodLite(r.food);
    if (!food) return apiError(404, "그 음식 slug 가 없어요");
    const link = await db().from("restaurant_foods").upsert({ restaurant_id: data.id, food_id: food.id, source: "admin", confirmed: true }, { onConflict: "restaurant_id,food_id" });
    if (link.error) return apiError(500, link.error.message);
  }
  return Response.json({ ok: true, id: data.id }, { status: 201 });
}
