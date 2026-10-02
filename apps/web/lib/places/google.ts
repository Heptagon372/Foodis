// Google Places API (New) — 평점(rating, userRatingCount)·포장(takeout)·배달(delivery). 키가 있을 때만 쓰는 선택 기능.
// 공식 문서 (확인일 2026-10-02):
//   Text Search (New)   https://developers.google.com/maps/documentation/places/web-service/text-search
//     POST https://places.googleapis.com/v1/places:searchText  헤더 X-Goog-Api-Key · X-Goog-FieldMask(필수) · body textQuery, locationBias.circle, pageSize(1~20)
//   Place Details (New) https://developers.google.com/maps/documentation/places/web-service/place-details
//     GET  https://places.googleapis.com/v1/places/{place_id}  같은 헤더
//   요금 https://developers.google.com/maps/billing-and-pricing/pricing — 요청한 필드 중 가장 높은 등급으로 과금
//     rating·userRatingCount = Enterprise, takeout·delivery = Enterprise + Atmosphere
//     Text Search E+A 월 1,000건 무료 후 $40/1000 · Place Details E+A 월 1,000건 무료 후 $25/1000
//   약관 https://cloud.google.com/maps-platform/terms/maps-service-terms (2026-06-10 판)
//     §14.3 place_id 외 콘텐츠(평점 등)는 캐시·저장 금지 → 평점은 매번 새로 받고, place_id 만 저장해 다음엔 싼 Place Details 로
//     §14.2 Google 이 아닌 지도와 함께 쓰기 금지 → 평점이 들어간 응답은 화면에서 카카오·네이버 지도 없이 목록으로만 보여준다
//     지도 없이 보여줄 때 "Google Maps" 출처 표기
// 비용 관리: 요청 1번에 가까운 후보 GOOGLE_ENRICH_MAX 곳만, 하루 상한 GOOGLE_PLACES_DAILY_CAP, "Google 에 없음"은 7일 기억.
import { distanceM, type LatLng } from "./geo";
import type { FetchLike } from "./kakao";

export const GOOGLE_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
export const GOOGLE_DETAILS_URL = "https://places.googleapis.com/v1/places/";
/** 필드를 적게 고를수록 싸다. currentOpeningHours 는 받지 않는다(화면에서 쓰지 않음) */
export const GOOGLE_SEARCH_MASK = "places.id,places.location,places.rating,places.userRatingCount,places.takeout,places.delivery";
export const GOOGLE_DETAILS_MASK = "id,rating,userRatingCount,takeout,delivery";
/** "Google 에 없음"으로 확인한 곳은 이 기간 동안 다시 찾지 않는다 */
export const GOOGLE_MISS_TTL_MS = 7 * 86_400_000;
export const GOOGLE_ENRICH_MAX = 5;
/** 카카오 좌표와 이 거리 안이어야 같은 가게로 본다 */
export const SAME_PLACE_M = 150;

export type GoogleInfo = { place_id: string; rating: number | null; count: number | null; takeout: boolean | null; delivery: boolean | null };
type GPlace = { id: string; location?: { latitude: number; longitude: number }; rating?: number; userRatingCount?: number; takeout?: boolean; delivery?: boolean };
type Deps = { key: string; fetch?: FetchLike };

const toInfo = (g: GPlace): GoogleInfo => ({ place_id: g.id, rating: g.rating ?? null, count: g.userRatingCount ?? null, takeout: g.takeout ?? null, delivery: g.delivery ?? null });

/** 이름+주소로 찾고, 카카오 좌표에서 SAME_PLACE_M 안의 가장 가까운 결과만 받아들인다. 없으면 null(=Google 에 없음) */
export async function searchGooglePlace(p: { name: string; address: string | null } & LatLng, deps: Deps): Promise<GoogleInfo | null> {
  const res = await (deps.fetch ?? fetch)(GOOGLE_SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": deps.key, "X-Goog-FieldMask": GOOGLE_SEARCH_MASK },
    body: JSON.stringify({
      textQuery: [p.name, p.address].filter(Boolean).join(" "),
      languageCode: "ko",
      regionCode: "KR",
      pageSize: 3,
      locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 300 } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Google Places 검색 오류 (${res.status})`);
  const data = (await res.json()) as { places?: GPlace[] };
  const near = (data.places ?? [])
    .filter((g) => g.location)
    .map((g) => ({ g, d: distanceM(p, { lat: g.location!.latitude, lng: g.location!.longitude }) }))
    .filter((x) => x.d <= SAME_PLACE_M)
    .sort((a, b) => a.d - b.d)[0]?.g;
  return near ? toInfo(near) : null;
}

/** 저장해 둔 place_id 로 평점만 다시 받는다 (Text Search 보다 싸다). 404 면 null — place_id 가 바뀐 것 */
export async function googleDetails(placeId: string, deps: Deps): Promise<GoogleInfo | null> {
  const res = await (deps.fetch ?? fetch)(GOOGLE_DETAILS_URL + encodeURIComponent(placeId), {
    headers: { "X-Goog-Api-Key": deps.key, "X-Goog-FieldMask": GOOGLE_DETAILS_MASK },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Places 상세 오류 (${res.status})`);
  return toInfo((await res.json()) as GPlace);
}

/** 가까운 순으로 max 곳. 최근 7일 안에 "Google 에 없음"으로 확인한 곳은 건너뛴다 */
export function pickEnrichTargets<T extends { distance: number; googlePlaceId: string | null; googleCheckedAt: string | null }>(places: T[], max = GOOGLE_ENRICH_MAX, now = Date.now()): T[] {
  return places
    .filter((p) => p.googlePlaceId || !p.googleCheckedAt || now - new Date(p.googleCheckedAt).getTime() > GOOGLE_MISS_TTL_MS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

// 하루 호출 상한 (서버 인스턴스별 메모리 — 완벽하지 않지만 실수로 큰 비용이 나는 걸 막는다)
let day = "";
let used = 0;
export function takeGoogleBudget(n: number, cap: number, now = new Date()): number {
  const d = now.toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    used = 0;
  }
  const ok = Math.max(0, Math.min(n, cap - used));
  used += ok;
  return ok;
}
