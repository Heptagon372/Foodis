// "한국에서 맛보기" 공용 타입 (docs/design/12). 서버·클라이언트가 같이 쓴다 — 키·비밀 값은 넣지 않는다.

export type OfferKind = "coupon" | "event" | "group_buy" | "takeout";
/** 제보 종류: 혜택 4종 + 정보 정정(info — 폐업·메뉴 없음 등). info 는 배지로 보여주지 않는다 */
export type ReportKind = OfferKind | "info";
export type OfferSource = "owner" | "admin" | "report";

/** restaurant_offers 한 줄 (DB 그대로) */
export type OfferRow = {
  id: string;
  kind: ReportKind;
  title: string;
  detail: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source: OfferSource;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
};

/** 화면용 혜택 요약. 확인 전 제보는 내용(자유 텍스트)을 싣지 않고 종류만 알린다 — 검수 전 문구 노출 방지 */
export type OfferView = {
  kind: OfferKind;
  state: "active" | "upcoming";
  title: string | null;
  ends_at: string | null;
  starts_at: string | null;
  verified: boolean;
  /** 예: "사장님 등록 · 10월 2일 확인", "이용자 제보 · 확인 전" */
  source_label: string;
};

/** 이 음식점이 그 음식을 판다는 근거의 세기 */
export type MatchLevel = "confirmed" | "dish" | "cuisine";

export type PlaceRating = {
  google: { rating: number; count: number } | null;
  app: { avg: number; count: number } | null;
};

export type Place = {
  /** 카카오 장소 id (restaurants.kakao_place_id). 평점·제보 경로에도 이 값을 쓴다 */
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  road_address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  place_url: string | null;
  distance: number;
  match: MatchLevel;
  rating: PlaceRating;
  /** Google Places 의 takeout/delivery — 맛있는 순(목록 전용)에서만 채운다. null = 모름 */
  takeout: boolean | null;
  delivery: boolean | null;
  franchise: { is: boolean | null; brand: string | null };
  offers: OfferView[];
};

export type SortKey = "distance" | "best";
export const FILTER_KEYS = ["takeout", "group_buy", "coupon", "event"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
/** yes = 가맹 브랜드만, no = 가맹 브랜드 제외(개인 음식점만) */
export type FranchiseFilter = "yes" | "no" | null;

export type RankedPlace = Place & {
  /** 맛있는 순 점수(베이즈 평균). 평점이 하나도 없으면 null */
  score: number | null;
  /** 합친 평가 수가 적으면 화면에 "평가가 아직 적어요" */
  fewRatings: boolean;
  /** 포장 가능 근거: google | offer | null */
  takeoutSource: "google" | "offer" | null;
};

export type NearbyResponse = {
  food: { slug: string; name_ko: string; country_name: string };
  center: { lat: number; lng: number; label: string | null };
  radius: number;
  sort: SortKey;
  /** 실제 정렬 기준 — 평점이 하나도 없으면 best 를 요청해도 distance */
  sortedBy: SortKey;
  places: RankedPlace[];
  /** 필터 전 후보 수 — "필터를 풀면 N곳 더" 안내용 */
  totalBeforeFilter: number;
  notices: string[];
  /**
   * kakao: 카카오 로컬 검색 결과인지 · google: Google 평점·포장 정보가 들어 있는지.
   * google=true 면 화면은 카카오·네이버 지도를 함께 띄우지 않는다 (Google 약관 §14.2 — 다른 지도와 함께 쓰기 금지)
   */
  sources: { kakao: boolean; google: boolean; franchiseSyncedAt: string | null };
  /** 개발 미리보기 전용 예시 데이터일 때만 true (운영에서는 절대 안 나감) */
  example?: true;
};
