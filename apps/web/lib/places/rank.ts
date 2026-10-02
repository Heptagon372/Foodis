// 정렬·필터 (순수 함수). "가까운 순" = 거리, "맛있는 순" = Google 평점과 푸디 앱 평점을 합친 베이즈 평균.
// 베이즈 평균: 평가 수가 적은 곳이 별 5개 한두 개로 1등 하지 않게, 사전 평균 PRIOR_MEAN 을 PRIOR_WEIGHT 명분 섞는다.
//   score = (C·m + n_g·R_g + w·n_a·R_a) / (C + n_g + w·n_a)
// 평점이 하나도 없으면 맛있는 순을 흉내 내지 않는다 — 거리순으로 보여주고 "평점 정보가 아직 없어요"라고 말한다.
import { hasActiveVerified } from "./offers";
import type { FilterKey, FranchiseFilter, Place, PlaceRating, RankedPlace, SortKey } from "./types";

export const PRIOR_MEAN = 3.5;
export const PRIOR_WEIGHT = 10;
/** 푸디 앱 평점 1건의 가중치. 직접 가본 사람의 평가지만 표본이 작아 Google 과 같게 둔다 */
export const APP_WEIGHT = 1;
/** 합친 평가 수가 이보다 적으면 "평가가 아직 적어요" */
export const FEW_RATINGS = 5;

export function ratingCount(r: PlaceRating): number {
  return (r.google?.count ?? 0) + (r.app?.count ?? 0);
}

export function bayesScore(r: PlaceRating, m = PRIOR_MEAN, C = PRIOR_WEIGHT, w = APP_WEIGHT): number | null {
  const ng = r.google && r.google.count > 0 ? r.google.count : 0;
  const na = r.app && r.app.count > 0 ? r.app.count : 0;
  if (!ng && !na) return null;
  const sum = C * m + ng * (r.google?.rating ?? 0) + w * na * (r.app?.avg ?? 0);
  return Math.round((sum / (C + ng + w * na)) * 1000) / 1000;
}

export function takeoutSource(p: Place): RankedPlace["takeoutSource"] {
  if (hasActiveVerified(p.offers, "takeout")) return "offer";
  return p.takeout === true ? "google" : null;
}

export function matchesFilters(p: Place, filters: FilterKey[], franchise: FranchiseFilter): boolean {
  for (const f of filters) {
    if (f === "takeout" ? !takeoutSource(p) : !hasActiveVerified(p.offers, f)) return false;
  }
  // 가맹 여부를 모르는(null) 곳은 "개인 음식점만"에 넣지 않는다 — 추정이 아니라 확인된 것만 거른다
  if (franchise === "yes" && p.franchise.is !== true) return false;
  if (franchise === "no" && p.franchise.is !== false) return false;
  return true;
}

const MATCH_ORDER = { confirmed: 0, dish: 1, cuisine: 2 } as const;

export function rankPlaces(places: Place[], opts: { sort: SortKey; filters?: FilterKey[]; franchise?: FranchiseFilter }): { places: RankedPlace[]; sortedBy: SortKey; notices: string[]; totalBeforeFilter: number } {
  const notices: string[] = [];
  const ranked: RankedPlace[] = places.map((p) => ({ ...p, score: bayesScore(p.rating), fewRatings: ratingCount(p.rating) < FEW_RATINGS, takeoutSource: takeoutSource(p) }));
  const kept = ranked.filter((p) => matchesFilters(p, opts.filters ?? [], opts.franchise ?? null));

  let sortedBy: SortKey = opts.sort;
  if (opts.sort === "best" && !ranked.some((p) => p.score != null)) {
    sortedBy = "distance";
    notices.push("평점 정보가 아직 없어요. 가까운 순으로 보여드려요.");
  } else if (opts.sort === "best" && ranked.reduce((a, p) => a + ratingCount(p.rating), 0) < FEW_RATINGS * 2) {
    notices.push("평가 수가 아직 적어서 순위가 바뀔 수 있어요.");
  }

  // 거리 동률이면 근거가 센 곳(메뉴 확인 > 음식 이름 검색 > 나라 음식점) 먼저
  const byDistance = (a: RankedPlace, b: RankedPlace) => a.distance - b.distance || MATCH_ORDER[a.match] - MATCH_ORDER[b.match];
  kept.sort(
    sortedBy === "distance"
      ? byDistance
      : // 평점 없는 곳은 사전 평균(m)이 아니라 맨 뒤로 — 모르는 걸 '보통'이라고 꾸미지 않는다
        (a, b) => (b.score ?? -1) - (a.score ?? -1) || byDistance(a, b),
  );
  return { places: kept, sortedBy, notices, totalBeforeFilter: places.length };
}

/** 쿼리 문자열 → 필터 목록 (알 수 없는 값은 버린다) */
export function parseFilters(raw: string | null): FilterKey[] {
  if (!raw) return [];
  const allowed = new Set<string>(["takeout", "group_buy", "coupon", "event"]);
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => allowed.has(s)))] as FilterKey[];
}
