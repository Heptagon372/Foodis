// 검색어 전략 · 카카오/Google 호출 모양 · /api/places/nearby 검증과 약관 지키기 (가짜 fetch·가짜 DB — 실제 호출 없음)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBrandIndex } from "./franchise";
import { GOOGLE_DETAILS_URL, GOOGLE_SEARCH_URL, pickEnrichTargets } from "./google";
import { buildQueries, geocode, KAKAO_BASE, searchNearby, type KakaoDoc } from "./kakao";
import { handleNearby, resetNearbyCaches, type FoodLite, type NearbyDeps, type PlacesStore, type StoredRestaurant } from "./nearby";
import type { NearbyResponse, OfferRow } from "./types";

const PHO: FoodLite = { id: "00000000-0000-4000-8000-000000000001", slug: "pho", name_ko: "쌀국수", name_en: "Pho", country_code: "VN", country_name: "베트남", course_type: "main", live: true };
const COFFEE: FoodLite = { ...PHO, slug: "turkish-coffee", name_ko: "튀르키예 커피", name_en: "Turkish coffee", country_code: "TR", country_name: "튀르키예", course_type: "drink" };

const doc = (id: string, name: string, distance: number, extra: Partial<KakaoDoc> = {}): KakaoDoc => ({
  id,
  place_name: name,
  category_name: "음식점 > 아시아음식 > 베트남음식",
  category_group_code: "FD6",
  phone: "02-000-0000",
  address_name: "서울 중구 어딘가 1",
  road_address_name: "서울 중구 세종대로 1",
  x: String(126.978 + distance / 100000),
  y: "37.5665",
  place_url: `http://place.map.kakao.com/${id}`,
  distance: String(distance),
  ...extra,
});

type Call = { url: string; init?: RequestInit };
function fakeFetch(routes: { kakao?: (q: string) => KakaoDoc[]; googleSearch?: () => unknown; googleDetails?: (id: string) => unknown | null }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith(KAKAO_BASE)) return new Response(JSON.stringify({ documents: routes.kakao?.(new URL(url).searchParams.get("query")!) ?? [], meta: {} }));
    if (url === GOOGLE_SEARCH_URL) return new Response(JSON.stringify(routes.googleSearch?.() ?? { places: [] }));
    if (url.startsWith(GOOGLE_DETAILS_URL)) {
      const body = routes.googleDetails?.(decodeURIComponent(url.slice(GOOGLE_DETAILS_URL.length)));
      return body ? new Response(JSON.stringify(body)) : new Response("{}", { status: 404 });
    }
    return new Response("not found", { status: 404 });
  });
  return { fn, calls };
}

const deps = (over: Partial<NearbyDeps> = {}): NearbyDeps => ({ getFood: async (slug) => (slug === "pho" ? PHO : slug === "turkish-coffee" ? COFFEE : null), allowExample: false, now: new Date("2026-10-02T03:00:00Z"), ...over });
const qs = (o: Record<string, string>) => new URLSearchParams(o);
const ok = (r: Awaited<ReturnType<typeof handleNearby>>) => {
  expect(r.status).toBe(200);
  return r.body as NearbyResponse;
};

beforeEach(() => resetNearbyCaches());

describe("buildQueries — 음식 이름 → 영어 이름 → 나라 요리", () => {
  it("한국어·영어 이름은 dish, 나라 요리는 cuisine", () => {
    expect(buildQueries(PHO)).toEqual([
      { query: "쌀국수", match: "dish", category: "FD6" },
      { query: "Pho", match: "dish", category: "FD6" },
      { query: "베트남음식", match: "cuisine", category: "FD6" },
    ]);
  });
  it("표에 없는 나라는 '{나라} 음식', 영어 이름이 한글이거나 같으면 건너뜀", () => {
    expect(buildQueries({ name_ko: "인제라", name_en: "인제라", country_code: "ET", country_name: "에티오피아" }).map((q) => q.query)).toEqual(["인제라", "에티오피아 음식"]);
  });
  it("음료는 카페(CE7)에서, 나라 요리 검색은 하지 않는다", () => {
    expect(buildQueries(COFFEE)).toEqual([
      { query: "튀르키예 커피", match: "dish", category: "CE7" },
      { query: "Turkish coffee", match: "dish", category: "CE7" },
    ]);
  });
});

describe("카카오 로컬 API 호출", () => {
  it("KakaoAK 헤더 · x=경도 y=위도 · radius · sort=distance · FD6, 충분히 모이면 멈춘다", async () => {
    const many = Array.from({ length: 12 }, (_, i) => doc(String(i + 1), `쌀국수집 ${i}`, 100 + i));
    const { fn, calls } = fakeFetch({ kakao: () => many });
    const r = await searchNearby(PHO, { lat: 37.5, lng: 127.01 }, 3000, { key: "k", fetch: fn });
    expect(r.calls).toBe(1);
    expect(r.docs).toHaveLength(12);
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe("/v2/local/search/keyword.json");
    expect(Object.fromEntries(u.searchParams)).toEqual({ query: "쌀국수", category_group_code: "FD6", size: "15", page: "1", x: "127.01", y: "37.5", radius: "3000", sort: "distance" });
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("KakaoAK k");
  });

  it("결과가 적으면 다음 검색어로, 같은 가게는 처음 근거(dish)를 지킨다", async () => {
    const { fn, calls } = fakeFetch({ kakao: (q) => (q === "쌀국수" ? [doc("1", "포 하우스", 300)] : q === "Pho" ? [doc("1", "포 하우스", 300), doc("2", "Pho 24", 500)] : [doc("2", "Pho 24", 500), doc("3", "사이공 식당", 800)]) });
    const r = await searchNearby(PHO, { lat: 37.5, lng: 127 }, 3000, { key: "k", fetch: fn });
    expect(calls).toHaveLength(3);
    expect(r.docs.map((d) => [d.id, d.match])).toEqual([
      ["1", "dish"],
      ["2", "dish"],
      ["3", "cuisine"],
    ]);
  });

  it("주소 검색이 비면 키워드 검색으로", async () => {
    const fn = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ documents: url.includes("address.json") ? [] : [{ ...doc("9", "강남역 2호선", 0), x: "127.0276", y: "37.4979" }] })),
    );
    expect(await geocode("강남역", { key: "k", fetch: fn })).toEqual({ lat: 37.4979, lng: 127.0276, label: "강남역 2호선" });
  });
});

describe("handleNearby — 검증", () => {
  it("slug 형식·한국 밖 좌표·없는 음식", async () => {
    expect((await handleNearby(qs({ food: "../etc" }), deps({ kakaoKey: "k" }))).status).toBe(400);
    expect((await handleNearby(qs({ food: "pho", radius: "50000" }), deps({ kakaoKey: "k" }))).status).toBe(400);
    const outside = await handleNearby(qs({ food: "pho", lat: "35.68", lng: "139.76" }), deps({ kakaoKey: "k" }));
    expect(outside).toMatchObject({ status: 400, body: { error: { code: "outside_korea" } } });
    expect((await handleNearby(qs({ food: "nope" }), deps({ kakaoKey: "k" }))).status).toBe(404);
  });

  it("키가 없으면 운영은 503, 개발 미리보기만 '예시 데이터'", async () => {
    expect(await handleNearby(qs({ food: "pho" }), deps())).toMatchObject({ status: 503, body: { error: { code: "kakao_key_missing" } } });
    const ex = ok(await handleNearby(qs({ food: "pho" }), deps({ allowExample: true })));
    expect(ex.example).toBe(true);
    expect(ex.notices[0]).toContain("예시 데이터");
    expect(ex.places.every((p) => p.name.startsWith("(예시)"))).toBe(true);
  });

  it("좌표가 없으면 서울시청 기준이라고 알린다", async () => {
    const { fn, calls } = fakeFetch({ kakao: () => [doc("1", "포 하우스", 300)] });
    const r = ok(await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "k", fetch: fn })));
    expect(r.center).toEqual({ lat: 37.5665, lng: 126.978, label: "서울시청" });
    expect(r.notices[0]).toContain("서울시청 기준");
    expect(new URL(calls[0].url).searchParams.get("y")).toBe("37.5665");
  });

  it("카카오 키 오류·쿼터 초과를 구분한다", async () => {
    const auth = vi.fn(async () => new Response("{}", { status: 401 }));
    expect(await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "bad", fetch: auth }))).toMatchObject({ status: 502, body: { error: { code: "kakao_auth" } } });
    resetNearbyCaches();
    const quota = vi.fn(async () => new Response("{}", { status: 429 }));
    expect(await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "k", fetch: quota }))).toMatchObject({ status: 503, body: { error: { code: "kakao_quota" } } });
  });

  it("같은 동네·음식·반경은 10분 캐시", async () => {
    const { fn, calls } = fakeFetch({ kakao: () => Array.from({ length: 10 }, (_, i) => doc(String(i), `쌀국수 ${i}`, i * 10)) });
    await handleNearby(qs({ food: "pho", lat: "37.50001", lng: "127.00001" }), deps({ kakaoKey: "k", fetch: fn }));
    await handleNearby(qs({ food: "pho", lat: "37.50003", lng: "127.00002" }), deps({ kakaoKey: "k", fetch: fn }));
    expect(calls).toHaveLength(1);
  });
});

/** 메모리 가짜 DB — 무엇이 저장되는지 확인한다 */
function fakeStore(init: { offers?: Record<string, OfferRow[]>; ratings?: Record<string, { avg: number; count: number }>; brands?: string[]; confirmed?: StoredRestaurant[] } = {}) {
  const rows = new Map<string, StoredRestaurant>();
  const saved: { upserts: unknown[]; google: [string, string | null][]; links: string[] } = { upserts: [], google: [], links: [] };
  const store: PlacesStore = {
    async upsertRestaurants(list) {
      saved.upserts.push(...list);
      return list.map((r) => {
        const s = rows.get(r.kakao_place_id) ?? { id: `db-${r.kakao_place_id}`, kakao_place_id: r.kakao_place_id, place_url: null, name: null, category: null, address: null, road_address: null, phone: null, lat: null, lng: null, google_place_id: null, google_checked_at: null, franchise_brand: null, is_franchise: null };
        Object.assign(s, r);
        rows.set(r.kakao_place_id, s);
        return s;
      });
    },
    confirmedNear: async () => init.confirmed ?? [],
    linkFoods: async (ids) => void saved.links.push(...ids),
    offersFor: async (ids) => new Map(ids.flatMap((id) => (init.offers?.[id] ? [[id, init.offers[id]] as const] : []))),
    ratingStats: async (ids) => new Map(ids.flatMap((id) => (init.ratings?.[id] ? [[id, init.ratings[id]] as const] : []))),
    saveGooglePlaceId: async (id, placeId, at) => {
      saved.google.push([id, placeId]);
      const s = [...rows.values()].find((r) => r.id === id)!;
      Object.assign(s, { google_place_id: placeId, google_checked_at: at });
    },
    brandIndex: async () => ({ idx: buildBrandIndex((init.brands ?? []).map((brand_name) => ({ brand_name }))), syncedAt: init.brands ? "2026-10-01T00:00:00Z" : null }),
  };
  return { store, saved, rows };
}

describe("handleNearby — DB·혜택·가맹·Google", () => {
  const offer = (o: Partial<OfferRow>): OfferRow => ({ id: "o", kind: "coupon", title: "음료 서비스", detail: null, starts_at: null, ends_at: "2026-10-31T14:59:59Z", source: "owner", verified: true, verified_at: "2026-10-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z", ...o });

  it("카카오 응답에서는 id·place_url 만 저장한다 (이름·주소·좌표 저장 금지)", async () => {
    const { fn } = fakeFetch({ kakao: (q) => (q === "쌀국수" ? [doc("1", "포 하우스", 300)] : []) });
    const { store, saved } = fakeStore();
    await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "k", fetch: fn, store }));
    expect(saved.upserts).toEqual([{ kakao_place_id: "1", place_url: "http://place.map.kakao.com/1", franchise_brand: null, is_franchise: null }]);
    expect(saved.links).toEqual(["db-1"]); // 음식 이름으로 찾은 곳만 '검색 추정' 연결
  });

  it("혜택·앱 평점·가맹 여부를 붙이고 필터한다", async () => {
    const { fn } = fakeFetch({ kakao: (q) => (q === "쌀국수" ? [doc("1", "포 하우스", 300), doc("2", "포메인 시청점", 100), doc("3", "사이공", 900)] : []) });
    const { store } = fakeStore({
      brands: ["포메인"],
      offers: { "db-1": [offer({}), offer({ id: "x", kind: "event", ends_at: "2026-09-01T00:00:00Z" })], "db-3": [offer({ kind: "group_buy", source: "report", verified: false, verified_at: null })] },
      ratings: { "db-3": { avg: 4.8, count: 6 } },
    });
    const r = ok(await handleNearby(qs({ food: "pho", lat: "37.5665", lng: "126.978" }), deps({ kakaoKey: "k", fetch: fn, store })));
    expect(r.places.map((p) => p.id)).toEqual(["2", "1", "3"]);
    const [p2, p1, p3] = r.places;
    expect(p2.franchise).toEqual({ is: true, brand: "포메인" });
    expect(p1.franchise).toEqual({ is: false, brand: null });
    expect(p1.offers.map((o) => o.kind)).toEqual(["coupon"]); // 지난 이벤트는 숨김
    expect(p3.offers[0]).toMatchObject({ kind: "group_buy", verified: false, title: null, source_label: "이용자 제보 · 확인 전" });
    expect(p3.rating.app).toEqual({ avg: 4.8, count: 6 });
    expect(r.sources).toEqual({ kakao: true, google: false, franchiseSyncedAt: "2026-10-01T00:00:00Z" });

    const coupon = ok(await handleNearby(qs({ food: "pho", lat: "37.5665", lng: "126.978", filters: "coupon" }), deps({ kakaoKey: "k", fetch: fn, store })));
    expect(coupon.places.map((p) => p.id)).toEqual(["1"]);
    expect(coupon.totalBeforeFilter).toBe(3);
    const groupBuy = ok(await handleNearby(qs({ food: "pho", lat: "37.5665", lng: "126.978", filters: "group_buy" }), deps({ kakaoKey: "k", fetch: fn, store })));
    expect(groupBuy.places).toEqual([]); // 확인 전 제보는 필터에 넣지 않는다
    const indie = ok(await handleNearby(qs({ food: "pho", lat: "37.5665", lng: "126.978", franchise: "no" }), deps({ kakaoKey: "k", fetch: fn, store })));
    expect(indie.places.map((p) => p.id)).toEqual(["1", "3"]);
  });

  it("DB 오류가 나도 카카오 결과로 응답한다", async () => {
    const { fn } = fakeFetch({ kakao: () => [doc("1", "포 하우스", 300)] });
    const broken: PlacesStore = { ...fakeStore().store, upsertRestaurants: async () => Promise.reject(new Error("relation does not exist")) };
    const warn = vi.fn();
    const r = ok(await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "k", fetch: fn, store: broken, warn })));
    expect(r.places).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("upsert 실패"));
  });

  it("Google 은 맛있는 순에서만 부르고, place_id 만 저장한다", async () => {
    const { fn, calls } = fakeFetch({
      kakao: (q) => (q === "쌀국수" ? [doc("1", "포 하우스", 300), doc("2", "사이공", 100)] : []),
      googleSearch: () => ({ places: [{ id: "gp-near", location: { latitude: 37.5665, longitude: 126.979 }, rating: 4.5, userRatingCount: 210, takeout: true }] }),
    });
    const { store, saved } = fakeStore();

    const near = ok(await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "k", googleKey: "g", fetch: fn, store })));
    expect(calls.some((c) => c.url.startsWith("https://places.googleapis.com"))).toBe(false); // 가까운 순(지도와 함께)에는 Google 없음
    expect(near.sources.google).toBe(false);

    const best = ok(await handleNearby(qs({ food: "pho", sort: "best" }), deps({ kakaoKey: "k", googleKey: "g", fetch: fn, store })));
    const g = calls.filter((c) => c.url === GOOGLE_SEARCH_URL);
    expect(g.length).toBeGreaterThan(0);
    expect((g[0].init?.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("places.id,places.location,places.rating,places.userRatingCount,places.takeout,places.delivery");
    expect(JSON.parse(String(g[0].init?.body))).toMatchObject({ textQuery: expect.stringContaining("사이공"), regionCode: "KR", pageSize: 3 });
    expect(best.sources.google).toBe(true);
    // 구글 결과(126.979)와 150m 안인 건 "사이공"(id 2)뿐
    expect(best.places.find((p) => p.id === "2")!.rating.google).toEqual({ rating: 4.5, count: 210 });
    expect(best.places.find((p) => p.id === "1")!.rating.google).toBeNull();
    expect(best.places[0].id).toBe("2");
    // 저장은 place_id 와 시각뿐 (평점 저장 금지)
    expect(new Map(saved.google)).toEqual(
      new Map([
        ["db-2", "gp-near"],
        ["db-1", null],
      ]),
    );

    // 다음에는 저장한 place_id 로 Place Details (더 싼 SKU), 평점은 매번 새로 받는다
    resetNearbyCaches();
    const { fn: fn2, calls: calls2 } = fakeFetch({ kakao: (q) => (q === "쌀국수" ? [doc("1", "포 하우스", 300), doc("2", "사이공", 100)] : []), googleDetails: (id) => ({ id, rating: 4.4, userRatingCount: 220 }) });
    const again = ok(await handleNearby(qs({ food: "pho", sort: "best" }), deps({ kakaoKey: "k", googleKey: "g", fetch: fn2, store })));
    expect(calls2.filter((c) => c.url.startsWith(GOOGLE_DETAILS_URL)).map((c) => c.url)).toEqual([GOOGLE_DETAILS_URL + "gp-near"]);
    expect((calls2.find((c) => c.url.startsWith(GOOGLE_DETAILS_URL))!.init?.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("id,rating,userRatingCount,takeout,delivery");
    expect(calls2.some((c) => c.url === GOOGLE_SEARCH_URL)).toBe(false); // id 1 은 7일 안 '없음' 확인 → 다시 찾지 않음
    expect(again.places.find((p) => p.id === "2")!.rating.google).toEqual({ rating: 4.4, count: 220 });
  });

  it("Google 결과가 150m 밖이면 같은 가게로 보지 않는다", async () => {
    const { fn } = fakeFetch({
      kakao: (q) => (q === "쌀국수" ? [doc("1", "포 하우스", 0)] : []),
      googleSearch: () => ({ places: [{ id: "far", location: { latitude: 37.58, longitude: 126.978 }, rating: 5, userRatingCount: 999 }] }),
    });
    const r = ok(await handleNearby(qs({ food: "pho", sort: "best" }), deps({ kakaoKey: "k", googleKey: "g", fetch: fn })));
    expect(r.places[0].rating.google).toBeNull();
    expect(r.sortedBy).toBe("distance");
  });

  it("메뉴 확인된 음식점은 사장님·어드민이 넣은 위치가 있으면 검색에 없어도 보여준다", async () => {
    const { fn } = fakeFetch({ kakao: () => [] });
    const confirmed: StoredRestaurant = { id: "db-77", kakao_place_id: "77", place_url: "https://place.map.kakao.com/77", name: "파트너 쌀국수", category: null, address: "서울 중구", road_address: null, phone: null, lat: 37.567, lng: 126.979, google_place_id: null, google_checked_at: null, franchise_brand: null, is_franchise: null };
    const { store } = fakeStore({ confirmed: [confirmed, { ...confirmed, id: "db-78", kakao_place_id: "78", lat: null, lng: null }] });
    const r = ok(await handleNearby(qs({ food: "pho" }), deps({ kakaoKey: "k", fetch: fn, store })));
    expect(r.places.map((p) => [p.id, p.match])).toEqual([["77", "confirmed"]]);
  });
});

describe("pickEnrichTargets", () => {
  it("가까운 순 N곳, 최근 7일 안 'Google 에 없음'은 건너뜀", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    const list = [
      { id: "a", distance: 300, googlePlaceId: null, googleCheckedAt: null },
      { id: "b", distance: 100, googlePlaceId: null, googleCheckedAt: "2026-09-30T00:00:00Z" }, // 없음 확인 2일 전 → 건너뜀
      { id: "c", distance: 200, googlePlaceId: "gp", googleCheckedAt: "2026-10-01T00:00:00Z" }, // place_id 있음 → 평점은 매번 새로
      { id: "d", distance: 50, googlePlaceId: null, googleCheckedAt: "2026-09-01T00:00:00Z" }, // 7일 지남 → 다시
    ];
    expect(pickEnrichTargets(list, 2, now).map((p) => p.id)).toEqual(["d", "c"]);
  });
});
