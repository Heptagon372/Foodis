// 정렬·필터·혜택 기간·좌표 검증 (순수 함수, 네트워크 없음)
import { describe, expect, it } from "vitest";
import { distanceM, formatDistance, inKorea, parseCoords, roundCoord } from "./geo";
import { offerBadge, offerState, sourceLabel, toOfferViews } from "./offers";
import { bayesScore, matchesFilters, parseFilters, rankPlaces } from "./rank";
import type { OfferRow, OfferView, Place } from "./types";

const place = (id: string, over: Partial<Place> = {}): Place => ({
  id,
  name: `가게 ${id}`,
  category: null,
  address: null,
  road_address: null,
  phone: null,
  lat: 37.5,
  lng: 127,
  place_url: null,
  distance: 100,
  match: "dish",
  rating: { google: null, app: null },
  takeout: null,
  delivery: null,
  franchise: { is: null, brand: null },
  offers: [],
  ...over,
});
const active = (kind: OfferView["kind"], verified = true): OfferView => ({ kind, state: "active", title: "t", starts_at: null, ends_at: null, verified, source_label: "x" });

describe("bayesScore — 평가 수가 적은 곳이 별 몇 개로 1등 하지 않게", () => {
  it("평점이 없으면 null", () => {
    expect(bayesScore({ google: null, app: null })).toBeNull();
    expect(bayesScore({ google: { rating: 4.5, count: 0 }, app: null })).toBeNull();
  });
  it("별 5개 1건보다 4.4점 500건이 높다", () => {
    const one = bayesScore({ google: null, app: { avg: 5, count: 1 } })!;
    const many = bayesScore({ google: { rating: 4.4, count: 500 }, app: null })!;
    expect(many).toBeGreaterThan(one);
    expect(one).toBeCloseTo((10 * 3.5 + 5) / 11, 3);
  });
  it("Google 과 앱 평점을 개수 가중으로 합친다", () => {
    const s = bayesScore({ google: { rating: 4, count: 10 }, app: { avg: 5, count: 10 } })!;
    expect(s).toBeCloseTo((10 * 3.5 + 40 + 50) / 30, 3);
  });
});

describe("rankPlaces", () => {
  const a = place("a", { distance: 900, rating: { google: { rating: 4.6, count: 300 }, app: null } });
  const b = place("b", { distance: 200, rating: { google: { rating: 3.9, count: 50 }, app: null } });
  const c = place("c", { distance: 50 });

  it("가까운 순: 거리, 동률이면 메뉴 확인된 곳 먼저", () => {
    expect(rankPlaces([a, b, c], { sort: "distance" }).places.map((p) => p.id)).toEqual(["c", "b", "a"]);
    const x = place("x", { distance: 100, match: "cuisine" });
    const y = place("y", { distance: 100, match: "confirmed" });
    expect(rankPlaces([x, y], { sort: "distance" }).places.map((p) => p.id)).toEqual(["y", "x"]);
  });

  it("맛있는 순: 점수 순, 평점 없는 곳은 맨 뒤(보통으로 꾸미지 않음)", () => {
    const r = rankPlaces([c, b, a], { sort: "best" });
    expect(r.sortedBy).toBe("best");
    expect(r.places.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(r.places[2].score).toBeNull();
  });

  it("평점이 하나도 없으면 거리순으로 바꾸고 알린다", () => {
    const r = rankPlaces([place("p", { distance: 500 }), place("q", { distance: 10 })], { sort: "best" });
    expect(r.sortedBy).toBe("distance");
    expect(r.places.map((p) => p.id)).toEqual(["q", "p"]);
    expect(r.notices.join()).toContain("평점 정보가 아직 없어요");
  });

  it("평가가 적으면 fewRatings·안내", () => {
    const r = rankPlaces([place("p", { rating: { google: null, app: { avg: 5, count: 2 } } })], { sort: "best" });
    expect(r.places[0].fewRatings).toBe(true);
    expect(r.notices.join()).toContain("평가 수가 아직 적어서");
  });

  it("필터: 확인된·유효한 혜택만, 포장은 Google 또는 확인된 포장 혜택", () => {
    const coupon = place("coupon", { offers: [active("coupon")] });
    const unverified = place("unverified", { offers: [active("coupon", false)] });
    const upcoming = place("upcoming", { offers: [{ ...active("event"), state: "upcoming" }] });
    const gTake = place("g", { takeout: true });
    const oTake = place("o", { offers: [active("takeout")] });
    const all = [coupon, unverified, upcoming, gTake, oTake];
    expect(rankPlaces(all, { sort: "distance", filters: ["coupon"] }).places.map((p) => p.id)).toEqual(["coupon"]);
    expect(rankPlaces(all, { sort: "distance", filters: ["event"] }).places).toEqual([]);
    const t = rankPlaces(all, { sort: "distance", filters: ["takeout"] });
    expect(t.places.map((p) => [p.id, p.takeoutSource])).toEqual([
      ["g", "google"],
      ["o", "offer"],
    ]);
    expect(t.totalBeforeFilter).toBe(5);
  });

  it("가맹 필터: 모르는(null) 곳은 어느 쪽에도 넣지 않는다", () => {
    const f = place("f", { franchise: { is: true, brand: "B" } });
    const i = place("i", { franchise: { is: false, brand: null } });
    const u = place("u");
    expect(matchesFilters(f, [], "no")).toBe(false);
    expect(matchesFilters(i, [], "no")).toBe(true);
    expect(matchesFilters(u, [], "no")).toBe(false);
    expect(matchesFilters(u, [], "yes")).toBe(false);
    expect(matchesFilters(f, [], "yes")).toBe(true);
    expect(matchesFilters(u, [], null)).toBe(true);
  });

  it("parseFilters 는 모르는 값을 버리고 중복을 없앤다", () => {
    expect(parseFilters("coupon, takeout,coupon,hack,franchise")).toEqual(["coupon", "takeout"]);
    expect(parseFilters(null)).toEqual([]);
  });
});

describe("혜택 기간·출처 라벨", () => {
  const now = new Date("2026-10-02T03:00:00Z"); // 한국 10월 2일 낮 12시
  const row = (o: Partial<OfferRow>): OfferRow => ({ id: "1", kind: "coupon", title: "10% 할인", detail: null, starts_at: null, ends_at: null, source: "owner", verified: true, verified_at: "2026-10-01T16:00:00Z", created_at: "2026-09-30T00:00:00Z", ...o });

  it("마감 지난 혜택은 숨기고, 시작 전은 upcoming", () => {
    expect(offerState(row({ ends_at: "2026-10-01T14:59:59Z" }), now)).toBe("expired");
    expect(offerState(row({ ends_at: "2026-10-31T14:59:59Z" }), now)).toBe("active");
    expect(offerState(row({ starts_at: "2026-10-05T00:00:00Z" }), now)).toBe("upcoming");
    const v = toOfferViews([row({ id: "old", ends_at: "2026-09-30T00:00:00Z" }), row({ id: "ok", ends_at: "2026-10-31T14:59:59Z" })], now);
    expect(v).toHaveLength(1);
    expect(offerBadge(v[0])).toBe("쿠폰 ~10/31");
  });

  it("출처 라벨: 확인 날짜는 한국 날짜, 확인 전 제보는 제목을 숨긴다", () => {
    expect(sourceLabel(row({}))).toBe("사장님 등록 · 10월 2일 확인"); // UTC 10/1 16시 = KST 10/2 01시
    expect(sourceLabel(row({ source: "report", verified: false, verified_at: null }))).toBe("이용자 제보 · 확인 전");
    const v = toOfferViews([row({ source: "report", verified: false, verified_at: null, title: "욕설 같은 자유 텍스트" })], now);
    expect(v[0].title).toBeNull();
  });

  it("정보 정정(info) 제보는 배지로 내보내지 않는다", () => {
    expect(toOfferViews([row({ kind: "info" })], now)).toEqual([]);
  });

  it("확인된 것 먼저, 그다음 곧 끝나는 것", () => {
    const v = toOfferViews([row({ id: "a", verified: false, source: "report" }), row({ id: "b", ends_at: "2026-12-01T00:00:00Z" }), row({ id: "c", ends_at: "2026-10-10T00:00:00Z" })], now);
    expect(v.map((o) => [o.verified, o.ends_at])).toEqual([
      [true, "2026-10-10T00:00:00Z"],
      [true, "2026-12-01T00:00:00Z"],
      [false, null],
    ]);
  });
});

describe("좌표 검증", () => {
  it("한국 사각형 안만 허용", () => {
    expect(parseCoords("37.5665", "126.978")).toEqual({ lat: 37.5665, lng: 126.978 });
    expect(parseCoords("33.25", "126.56")).not.toBe("outside"); // 제주
    expect(parseCoords("37.24", "131.86")).not.toBe("outside"); // 독도
    expect(parseCoords("35.68", "139.76")).toBe("outside"); // 도쿄
    expect(parseCoords("39.03", "125.75")).toBe("outside"); // 평양
    expect(parseCoords(null, null)).toBeNull();
    expect(parseCoords("abc", "127")).toBeNull();
    expect(parseCoords("", "127")).toBeNull();
    expect(inKorea({ lat: NaN, lng: 127 })).toBe(false);
  });
  it("로그·캐시용 반올림은 ~100m 단위", () => {
    expect(roundCoord({ lat: 37.566535, lng: 126.977969 })).toEqual({ lat: 37.567, lng: 126.978 });
  });
  it("거리 계산과 표시", () => {
    const d = distanceM({ lat: 37.5665, lng: 126.978 }, { lat: 37.5547, lng: 126.9707 }); // 시청 → 서울역 약 1.5km
    expect(d).toBeGreaterThan(1300);
    expect(d).toBeLessThan(1600);
    expect(formatDistance(240)).toBe("240m");
    expect(formatDistance(1460)).toBe("1.5km");
    expect(formatDistance(12000)).toBe("12km");
  });
});
