// 네이버 플레이스에서 별점·리뷰를 가져온다 (서버 전용).
// 1) 이름+주소로 네이버 플레이스 검색 → naver place id 획득
// 2) 해당 장소의 방문자 리뷰 크롤링
import "server-only";

export type NaverReview = {
  username: string;
  rating: number;
  date: string;
  text: string;
};

export type NaverPlaceReviews = {
  naverId: string | null;
  rating: number | null;
  reviewCount: number;
  reviews: NaverReview[];
  placeUrl: string | null;
};

const TIMEOUT_MS = 5000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Referer: "https://pcmap.place.naver.com/",
};
const GQL = "https://pcmap-api.place.naver.com/graphql";

async function searchNaverPlace(name: string, address: string): Promise<string | null> {
  const query = `${name} ${address}`.slice(0, 100);
  try {
    const res = await fetch(GQL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify([{
        operationName: "getPlacesList",
        variables: { input: { query, x: "", y: "", deviceType: "pcmap", bounds: "" }, isNmap: false },
        query: `query getPlacesList($input: PlacesInput) { businesses: places(input: $input) { items { id name roadAddress } total } }`,
      }]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.[0]?.data?.businesses?.items;
    if (!items?.length) return null;
    // 이름이 일치하는 장소 찾기
    const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
    const match = items.find((i: { name: string }) => norm(i.name) === norm(name));
    return (match ?? items[0]).id ?? null;
  } catch {
    return null;
  }
}

async function fetchNaverReviews(naverId: string): Promise<Omit<NaverPlaceReviews, "naverId">> {
  const empty = { rating: null, reviewCount: 0, reviews: [] as NaverReview[], placeUrl: `https://m.place.naver.com/restaurant/${naverId}/review/visitor` };
  try {
    const res = await fetch(GQL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify([{
        operationName: "getVisitorReviews",
        variables: { input: { businessId: naverId, businessType: "restaurant", page: 1, size: 20, isPhotoUsed: false, item: "0" } },
        query: `query getVisitorReviews($input: VisitorReviewsInput) {
          visitorReviews(input: $input) {
            items { id rating author { nickname } body created }
            starDistribution { score count }
            total
          }
        }`,
      }]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return empty;
    const data = await res.json();
    const vr = data?.[0]?.data?.visitorReviews;
    if (!vr) return empty;

    const total = vr.total ?? 0;
    const dist = vr.starDistribution as { score: number; count: number }[] | null;
    let rating: number | null = null;
    if (dist?.length) {
      const sum = dist.reduce((a: number, d: { score: number; count: number }) => a + d.score * d.count, 0);
      const cnt = dist.reduce((a: number, d: { score: number; count: number }) => a + d.count, 0);
      if (cnt > 0) rating = sum / cnt;
    }
    // starDistribution이 없으면 개별 리뷰 별점 평균 사용
    if (rating == null && vr.items?.length) {
      const ratings = (vr.items as { rating?: number }[]).filter((r) => r.rating != null && r.rating > 0);
      if (ratings.length) rating = ratings.reduce((a: number, r) => a + (r.rating ?? 0), 0) / ratings.length;
    }

    const reviews: NaverReview[] = (vr.items ?? []).slice(0, 20).map((r: { author?: { nickname?: string }; rating?: number; created?: string; body?: string }) => ({
      username: r.author?.nickname ?? "익명",
      rating: r.rating ?? 0,
      date: (r.created ?? "").split("T")[0],
      text: r.body ?? "",
    }));

    return { rating, reviewCount: total, reviews, placeUrl: `https://m.place.naver.com/restaurant/${naverId}/review/visitor` };
  } catch {
    return empty;
  }
}

export async function crawlNaverReviews(name: string, address: string): Promise<NaverPlaceReviews> {
  const empty: NaverPlaceReviews = { naverId: null, rating: null, reviewCount: 0, reviews: [], placeUrl: null };

  const naverId = await searchNaverPlace(name, address);
  if (!naverId) return empty;

  const reviews = await fetchNaverReviews(naverId);
  return { naverId, ...reviews };
}

const cache = new Map<string, { at: number; data: NaverPlaceReviews }>();
const TTL = 10 * 60_000;

export async function cachedNaverReviews(name: string, address: string): Promise<NaverPlaceReviews> {
  const key = `${name}|${address}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.data;

  const data = await crawlNaverReviews(name, address);
  cache.set(key, { at: now, data });

  if (cache.size > 200) {
    for (const [k, v] of cache) {
      if (now - v.at > TTL) cache.delete(k);
    }
  }
  return data;
}
