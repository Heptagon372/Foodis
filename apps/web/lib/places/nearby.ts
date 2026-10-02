// GET /api/places/nearby 의 본체 (docs/design/12). 라우트는 얇게 두고, 여기서 검증 → 카카오 검색 → DB 보강 → (맛있는 순) Google 보강 → 정렬.
// 의존성(fetch·DB·키)을 주입받아 테스트에서 가짜로 돌린다. 사용자 좌표는 응답에 되돌려줄 뿐 저장·로그하지 않는다.
// 약관 요약 (확인일 2026-10-02):
//  · 카카오 결과는 화면 표시용으로만 — DB 에는 장소 id·place_url 만 저장, 메모리 캐시는 10분 (카카오는 사용자 경험 목적 1~2시간까지 허용)
//  · Google 평점은 맛있는 순(지도 없는 목록)에서만 받고, 저장하지 않는다 (place_id 만 저장)
import { z } from "zod";
import { examplePlaces } from "./fixture";
import { franchiseOf, type BrandIndex } from "./franchise";
import { boundsAround, DEFAULT_CENTER, DEFAULT_RADIUS, distanceM, parseCoords, roundCoord } from "./geo";
import { GOOGLE_ENRICH_MAX, googleDetails, pickEnrichTargets, searchGooglePlace, takeGoogleBudget, type GoogleInfo } from "./google";
import { buildQueries, KakaoError, searchNearby, type FetchLike, type FoodQueryInput, type KakaoDoc } from "./kakao";
import { toOfferViews } from "./offers";
import { parseFilters, rankPlaces } from "./rank";
import type { MatchLevel, NearbyResponse, OfferRow, Place } from "./types";

export type FoodLite = FoodQueryInput & { id: string; slug: string; /** foods 테이블에 있는 진짜 id 인가(미리보기 샘플이면 false) */ live: boolean };

/** DB 에 저장된 음식점 (restaurants 행). name~lng 는 사장님·어드민이 직접 받은 정보만 들어 있다 */
export type StoredRestaurant = {
  id: string;
  kakao_place_id: string;
  place_url: string | null;
  name: string | null;
  category: string | null;
  address: string | null;
  road_address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  google_checked_at: string | null;
  franchise_brand: string | null;
  is_franchise: boolean | null;
};
/** 검색에서 만난 음식점을 저장할 때 쓰는 값 — 카카오 응답에서는 id 와 place_url 만 */
export type RestaurantUpsert = { kakao_place_id: string; place_url: string | null; franchise_brand: string | null; is_franchise: boolean | null };

/** DB 접근 — 실제 구현은 repo.ts(Supabase service_role). Supabase 키가 없으면 null 로 두고 DB 없이 돈다 */
export interface PlacesStore {
  upsertRestaurants(rows: RestaurantUpsert[]): Promise<StoredRestaurant[]>;
  confirmedNear(foodId: string, b: ReturnType<typeof boundsAround>): Promise<StoredRestaurant[]>;
  linkFoods(restaurantIds: string[], foodId: string): Promise<void>;
  offersFor(restaurantIds: string[]): Promise<Map<string, OfferRow[]>>;
  ratingStats(restaurantIds: string[]): Promise<Map<string, { avg: number; count: number }>>;
  /** place_id 와 확인 시각만 저장 (평점은 저장 금지) */
  saveGooglePlaceId(restaurantId: string, placeId: string | null, at: string): Promise<void>;
  brandIndex(): Promise<{ idx: BrandIndex; syncedAt: string | null }>;
}

export type NearbyDeps = {
  getFood(slug: string): Promise<FoodLite | null>;
  kakaoKey?: string;
  googleKey?: string;
  googleDailyCap?: number;
  fetch?: FetchLike;
  store?: PlacesStore | null;
  /** 개발 미리보기에서만 true — 키가 없을 때 예시 데이터를 돌려준다 */
  allowExample: boolean;
  now?: Date;
  warn?: (msg: string) => void;
};

export type NearbyResult = { status: number; body: NearbyResponse | { error: { code: string; message: string } } };

const Query = z.object({
  food: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "food 는 음식 slug 예요"),
  sort: z.enum(["distance", "best"]).default("distance"),
  radius: z.coerce.number().int().min(100).max(20000).default(DEFAULT_RADIUS),
  franchise: z.enum(["yes", "no"]).optional(),
});

const err = (status: number, code: string, message: string): NearbyResult => ({ status, body: { error: { code, message } } });

// 같은 동네(≈100m)·같은 음식·같은 반경은 10분 동안 카카오를 다시 부르지 않는다 (쿼터·지연 절약). 키에 원 좌표는 넣지 않는다
export const KAKAO_TTL_MS = 10 * 60_000;
type Doc = KakaoDoc & { match: Exclude<MatchLevel, "confirmed"> };
const kakaoCache = new Map<string, { at: number; docs: Doc[] }>();
// DB 가 없을 때 Google place_id 기억 (place_id 는 무기한 저장 허용). 평점은 넣지 않는다
const placeIdMem = new Map<string, { placeId: string | null; at: string }>();

export function resetNearbyCaches() {
  kakaoCache.clear();
  placeIdMem.clear();
}

export async function handleNearby(params: URLSearchParams, deps: NearbyDeps): Promise<NearbyResult> {
  const q = Query.safeParse({ food: params.get("food") ?? "", sort: params.get("sort") || undefined, radius: params.get("radius") || undefined, franchise: params.get("franchise") || undefined });
  if (!q.success) return err(400, "invalid_query", z.prettifyError(q.error));
  const coords = parseCoords(params.get("lat"), params.get("lng"));
  if (coords === "outside") return err(400, "outside_korea", "한국 안의 위치에서만 찾을 수 있어요.");
  const center = coords ?? DEFAULT_CENTER;
  const { sort, radius } = q.data;
  const franchise = q.data.franchise ?? null;
  const filters = parseFilters(params.get("filters"));
  const now = deps.now ?? new Date();

  const food = await deps.getFood(q.data.food);
  if (!food) return err(404, "food_not_found", "그 음식을 찾지 못했어요.");

  const notices: string[] = [];
  if (!coords) notices.push("서울시청 기준이에요. '내 주변'을 누르거나 지역을 검색해 보세요.");
  const base = { food: { slug: food.slug, name_ko: food.name_ko, country_name: food.country_name }, center: { lat: center.lat, lng: center.lng, label: coords ? null : DEFAULT_CENTER.label }, radius, sort };

  if (!deps.kakaoKey) {
    if (!deps.allowExample) return err(503, "kakao_key_missing", "지도 검색 키(KAKAO_REST_API_KEY)가 설정되지 않았어요.");
    const ranked = rankPlaces(examplePlaces(center, food.name_ko, now), { sort, filters, franchise });
    return {
      status: 200,
      body: { ...base, sortedBy: ranked.sortedBy, places: ranked.places, totalBeforeFilter: ranked.totalBeforeFilter, notices: ["예시 데이터예요 — 실제 음식점이 아니에요.", ...notices, ...ranked.notices], sources: { kakao: false, google: false, franchiseSyncedAt: null }, example: true },
    };
  }

  // ── 1) 카카오 검색 (10분 캐시)
  const r = roundCoord(center);
  const cacheKey = `${food.slug}|${r.lat},${r.lng}|${radius}`;
  let cached = kakaoCache.get(cacheKey);
  if (!cached || now.getTime() - cached.at > KAKAO_TTL_MS) {
    try {
      cached = { at: now.getTime(), docs: (await searchNearby(food, center, radius, { key: deps.kakaoKey, fetch: deps.fetch })).docs };
    } catch (e) {
      if (e instanceof KakaoError) return err(e.code === "quota" ? 503 : 502, `kakao_${e.code}`, e.message);
      return err(502, "kakao_failed", "음식점 검색이 잠시 안 돼요. 조금 뒤 다시 해주세요.");
    }
    kakaoCache.set(cacheKey, cached);
    if (kakaoCache.size > 500) for (const [k, v] of kakaoCache) if (now.getTime() - v.at > KAKAO_TTL_MS) kakaoCache.delete(k);
  }
  const docs = cached.docs;

  // ── 2) DB: 가맹 브랜드 목록 → 음식점 id 저장 → 메뉴 확인된 근처 음식점 → 혜택·앱 평점
  const store = deps.store ?? null;
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      deps.warn?.(`[places] ${label} 실패: ${(e as Error).message}`);
      return fallback;
    }
  };
  const brands = store ? await safe("brandIndex", () => store.brandIndex(), { idx: new Map() as BrandIndex, syncedAt: null }) : { idx: new Map() as BrandIndex, syncedAt: null };

  // 화면에 나갈 Place 와 내부 메타(DB id·Google place_id)를 나눠 둔다 — 내부 값은 응답에 싣지 않는다
  type Meta = { dbId: string | null; googlePlaceId: string | null; googleCheckedAt: string | null };
  const meta = new Map<string, Meta>();
  const metaOf = (id: string) => meta.get(id) ?? meta.set(id, { dbId: null, googlePlaceId: null, googleCheckedAt: null }).get(id)!;
  const places: Place[] = docs.map((d) => {
    const lat = Number(d.y);
    const lng = Number(d.x);
    return {
      id: d.id,
      name: d.place_name,
      category: d.category_name || null,
      address: d.address_name || null,
      road_address: d.road_address_name || null,
      phone: d.phone || null,
      lat,
      lng,
      place_url: d.place_url || null,
      distance: d.distance ? Number(d.distance) : distanceM(center, { lat, lng }),
      match: d.match,
      rating: { google: null, app: null },
      takeout: null,
      delivery: null,
      franchise: franchiseOf(d.place_name, brands.idx, d.category_name),
      offers: [],
    };
  });

  if (store) {
    const stored = await safe("upsert", () => store.upsertRestaurants(places.map((p) => ({ kakao_place_id: p.id, place_url: p.place_url, franchise_brand: p.franchise.brand, is_franchise: p.franchise.is }))), []);
    const byKakao = new Map(stored.map((s) => [s.kakao_place_id, s]));
    if (food.live) {
      for (const c of await safe("confirmedNear", () => store.confirmedNear(food.id, boundsAround(center, radius)), [])) {
        byKakao.set(c.kakao_place_id, c);
        const hit = places.find((p) => p.id === c.kakao_place_id);
        if (hit) hit.match = "confirmed";
        // 검색에 안 잡힌 확인 음식점은 사장님·어드민이 넣어 둔 이름·위치가 있을 때만 보여준다
        else if (c.name && c.lat != null && c.lng != null) {
          const d = distanceM(center, { lat: c.lat, lng: c.lng });
          if (d <= radius)
            places.push({ id: c.kakao_place_id, name: c.name, category: c.category, address: c.address, road_address: c.road_address, phone: c.phone, lat: c.lat, lng: c.lng, place_url: c.place_url, distance: d, match: "confirmed", rating: { google: null, app: null }, takeout: null, delivery: null, franchise: franchiseOf(c.name, brands.idx, c.category), offers: [] });
        }
      }
    }
    for (const p of places) {
      const s = byKakao.get(p.id);
      if (s) Object.assign(metaOf(p.id), { dbId: s.id, googlePlaceId: s.google_place_id, googleCheckedAt: s.google_checked_at });
    }
    // 음식 이름으로 찾은 곳만 '검색 추정'으로 이어 둔다 (나라 음식점 검색 결과는 메뉴 근거가 약해 잇지 않음)
    const dishIds = places.flatMap((p) => (p.match === "dish" && metaOf(p.id).dbId ? [metaOf(p.id).dbId!] : []));
    if (food.live && dishIds.length) await safe("linkFoods", () => store.linkFoods(dishIds, food.id), undefined);

    const dbIds = places.flatMap((p) => (metaOf(p.id).dbId ? [metaOf(p.id).dbId!] : []));
    if (dbIds.length) {
      const [offers, stats] = await Promise.all([safe("offers", () => store.offersFor(dbIds), new Map<string, OfferRow[]>()), safe("ratings", () => store.ratingStats(dbIds), new Map<string, { avg: number; count: number }>())]);
      for (const p of places) {
        const dbId = metaOf(p.id).dbId;
        if (!dbId) continue;
        p.offers = toOfferViews(offers.get(dbId) ?? [], now);
        const st = stats.get(dbId);
        if (st?.count) p.rating.app = { avg: Number(st.avg), count: st.count };
      }
    }
  } else {
    for (const p of places) {
      const m = placeIdMem.get(p.id);
      if (m) Object.assign(metaOf(p.id), { googlePlaceId: m.placeId, googleCheckedAt: m.at });
    }
  }

  // ── 3) Google 보강: 맛있는 순(지도 없는 목록)에서만, 가까운 몇 곳, 하루 상한 안에서. 평점은 저장하지 않는다
  let googleShown = false;
  if (sort === "best" && deps.googleKey) {
    const targets = pickEnrichTargets(places.map((p) => ({ p, distance: p.distance, ...metaOf(p.id) })), GOOGLE_ENRICH_MAX, now.getTime());
    const n = takeGoogleBudget(targets.length, deps.googleDailyCap ?? 100, now);
    const at = now.toISOString();
    await Promise.all(
      targets.slice(0, n).map(async ({ p, dbId, googlePlaceId, googleCheckedAt }) => {
        const g = { key: deps.googleKey!, fetch: deps.fetch };
        let info: GoogleInfo | null | undefined;
        try {
          info = googlePlaceId ? await googleDetails(googlePlaceId, g) : null;
          if (!info) info = await searchGooglePlace({ name: p.name, address: p.road_address ?? p.address, lat: p.lat, lng: p.lng }, g);
        } catch (e) {
          deps.warn?.(`[places] google 실패: ${(e as Error).message}`);
          return; // 실패는 기록하지 않는다 — 다음에 다시
        }
        if (info) {
          if (info.rating != null && info.count) p.rating.google = { rating: info.rating, count: info.count };
          p.takeout = info.takeout;
          p.delivery = info.delivery;
          googleShown ||= info.rating != null || info.takeout != null;
        }
        const placeId = info?.place_id ?? null;
        if (placeId === googlePlaceId && googleCheckedAt) return; // 바뀐 게 없으면 쓰지 않는다
        if (store && dbId) await safe("saveGooglePlaceId", () => store.saveGooglePlaceId(dbId, placeId, at), undefined);
        else if (!store) placeIdMem.set(p.id, { placeId, at });
      }),
    );
  }

  // ── 4) 정렬·필터
  const ranked = rankPlaces(places, { sort, filters, franchise });
  if (places.some((p) => p.match === "cuisine")) {
    const cuisine = buildQueries(food).find((x) => x.match === "cuisine")?.query;
    notices.push(`'${food.name_ko}' 이름으로 찾은 곳이 적어서 ${cuisine ?? "같은 나라"} 음식점도 함께 보여드려요. 메뉴는 가게에 꼭 확인해 주세요.`);
  }
  if (!places.length) notices.push(`반경 ${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`} 안에서 찾지 못했어요.`);
  if (sort === "best" && !deps.googleKey && ranked.sortedBy === "best") notices.push("푸디 이용자 평점으로만 정렬했어요.");

  return {
    status: 200,
    body: { ...base, sortedBy: ranked.sortedBy, places: ranked.places, totalBeforeFilter: ranked.totalBeforeFilter, notices: [...notices, ...ranked.notices], sources: { kakao: true, google: googleShown, franchiseSyncedAt: brands.syncedAt } },
  };
}
