// 카카오맵 장소 상세 페이지에서 별점·리뷰를 가져온다 (서버 전용).
// place.map.kakao.com 내부 API: /places/tab/reviews/kakaomap/{id}
import "server-only";

export type KakaoReview = {
  username: string;
  rating: number;
  date: string;
  text: string;
};

export type KakaoPlaceReviews = {
  rating: number | null;
  reviewCount: number;
  reviews: KakaoReview[];
};

const TIMEOUT_MS = 5000;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
};

export async function crawlKakaoReviews(placeId: string): Promise<KakaoPlaceReviews> {
  const empty: KakaoPlaceReviews = { rating: null, reviewCount: 0, reviews: [] };

  try {
    const url = `https://place.map.kakao.com/places/tab/reviews/kakaomap/${placeId}?order=RECOMMENDED&only_photo_review=false`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `https://place.map.kakao.com/${placeId}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return empty;

    const data = await res.json();

    const scoreSet = data?.score_set;
    const reviewCount = scoreSet?.review_count ?? 0;
    const rating = scoreSet?.average_score ?? null;

    const rawReviews: KakaoReview[] = [];
    for (const r of (data?.reviews ?? []).slice(0, 5)) {
      rawReviews.push({
        username: r.meta?.owner?.nickname ?? "익명",
        rating: r.star_rating ?? 0,
        date: (r.registered_at ?? "").split(" ")[0],
        text: r.contents ?? "",
      });
    }

    return { rating, reviewCount, reviews: rawReviews };
  } catch {
    return empty;
  }
}

const cache = new Map<string, { at: number; data: KakaoPlaceReviews }>();
const TTL = 10 * 60_000;

export async function cachedKakaoReviews(placeId: string): Promise<KakaoPlaceReviews> {
  const now = Date.now();
  const hit = cache.get(placeId);
  if (hit && now - hit.at < TTL) return hit.data;

  const data = await crawlKakaoReviews(placeId);
  cache.set(placeId, { at: now, data });

  if (cache.size > 200) {
    for (const [k, v] of cache) {
      if (now - v.at > TTL) cache.delete(k);
    }
  }
  return data;
}
