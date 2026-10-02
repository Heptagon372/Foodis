// PlacesStore 의 Supabase 구현 (service_role — 라우트에서만). 0005_restaurants.sql 이 없으면 각 호출이 에러를 던지고,
// nearby.ts 가 그걸 삼켜 카카오 결과만으로 응답한다.
import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { hasSupabaseKeys } from "@/lib/content";
import { buildBrandIndex, type BrandIndex } from "./franchise";
import type { PlacesStore, StoredRestaurant } from "./nearby";
import type { OfferRow } from "./types";

const COLS = "id, kakao_place_id, place_url, name, category, address, road_address, phone, lat, lng, google_place_id, google_checked_at, franchise_brand, is_franchise";
const OFFER_COLS = "id, restaurant_id, kind, title, detail, starts_at, ends_at, source, verified, verified_at, created_at";

// 브랜드 목록은 수천 줄이라 1시간 메모리 캐시. 동기화 직후엔 invalidateBrands() 로 비운다
let brands: { at: number; idx: BrandIndex; syncedAt: string | null } | null = null;
export const invalidateBrands = () => void (brands = null);

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export function placesStore(): PlacesStore | null {
  if (!hasSupabaseKeys()) return null;
  const db = supabaseAdmin();
  return {
    async upsertRestaurants(rows) {
      // 카카오 응답에서는 id·place_url 만 저장한다 (이름·주소·좌표 저장 금지 — 0005 마이그레이션 주석)
      if (!rows.length) return [];
      const now = new Date().toISOString();
      return must(await db.from("restaurants").upsert(rows.map((r) => ({ ...r, updated_at: now })), { onConflict: "kakao_place_id" }).select(COLS)) as StoredRestaurant[];
    },
    async confirmedNear(foodId, b) {
      const data = must(
        await db
          .from("restaurant_foods")
          .select(`restaurants!inner(${COLS})`)
          .eq("food_id", foodId)
          .eq("confirmed", true)
          .not("restaurants.lat", "is", null)
          .gte("restaurants.lat", b.minLat)
          .lte("restaurants.lat", b.maxLat)
          .gte("restaurants.lng", b.minLng)
          .lte("restaurants.lng", b.maxLng)
          .limit(50),
      ) as unknown as { restaurants: StoredRestaurant }[];
      return data.map((d) => d.restaurants);
    },
    async linkFoods(ids, foodId) {
      // 이미 있는 연결(어드민 확인 등)은 덮어쓰지 않는다
      must(await db.from("restaurant_foods").upsert(ids.map((restaurant_id) => ({ restaurant_id, food_id: foodId, source: "search", confirmed: false })), { onConflict: "restaurant_id,food_id", ignoreDuplicates: true }));
    },
    async offersFor(ids) {
      const data = must(await db.from("restaurant_offers").select(OFFER_COLS).in("restaurant_id", ids).limit(500)) as (OfferRow & { restaurant_id: string })[];
      const m = new Map<string, OfferRow[]>();
      for (const o of data) m.set(o.restaurant_id, [...(m.get(o.restaurant_id) ?? []), o]);
      return m;
    },
    async ratingStats(ids) {
      const data = must(await db.from("restaurant_rating_stats").select("restaurant_id, avg, count").in("restaurant_id", ids)) as { restaurant_id: string; avg: number; count: number }[];
      return new Map(data.map((d) => [d.restaurant_id, { avg: Number(d.avg), count: d.count }]));
    },
    async saveGooglePlaceId(id, placeId, at) {
      // Google 은 place_id 만 저장 허용 (평점 저장 금지 — Service Specific Terms §14.3)
      must(await db.from("restaurants").update({ google_place_id: placeId, google_checked_at: at }).eq("id", id));
    },
    async brandIndex() {
      if (brands && Date.now() - brands.at < 3_600_000) return brands;
      // 수만 줄이 될 수 있어 1,000줄씩 끊어 읽는다 (PostgREST 기본 상한)
      const all: { brand_name: string; normalized: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const page = must(await db.from("franchise_brands").select("brand_name, normalized").range(from, from + 999)) as { brand_name: string; normalized: string }[];
        all.push(...page);
        if (page.length < 1000) break;
      }
      const last = must(await db.from("franchise_brands").select("synced_at").order("synced_at", { ascending: false }).limit(1)) as { synced_at: string }[];
      brands = { at: Date.now(), idx: buildBrandIndex(all), syncedAt: last[0]?.synced_at ?? null };
      return brands;
    },
  };
}

/** kakao_place_id → restaurants.id (평점·제보 라우트용) */
export async function restaurantIdByKakao(kakaoId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from("restaurants").select("id").eq("kakao_place_id", kakaoId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
