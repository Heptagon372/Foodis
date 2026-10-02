// 가맹 브랜드 매칭 · 공정위 응답 파싱 · 어드민 입력 규칙 (가짜 fetch, 네트워크 없음)
import { describe, expect, it, vi } from "vitest";
import { OfferInput, parseKakaoPlaceId, RestaurantInput } from "./admin-rules";
import { buildBrandIndex, franchiseLabel, franchiseOf, matchFranchise, normalizeBrand, stripBranch } from "./franchise";
import { fetchFtcBrands, FTC_BRAND_URL, parseFtcPage, toBrandRows } from "./ftc";

const idx = buildBrandIndex([{ brand_name: "교촌치킨" }, { brand_name: "미스터피자" }, { brand_name: "BBQ" }, { brand_name: "포메인" }, { brand_name: "본죽" }, { brand_name: "본가" }, { brand_name: "Paris Baguette" }, { brand_name: "A" }]);

describe("normalizeBrand · stripBranch", () => {
  it("공백·기호·괄호를 지우고 영문은 소문자", () => {
    expect(normalizeBrand(" Paris  Baguette ")).toBe("parisbaguette");
    expect(normalizeBrand("BBQ(비비큐)")).toBe("bbq");
    expect(normalizeBrand("ＢＢＱ")).toBe("bbq"); // 전각
    expect(normalizeBrand("맘스터치·버거")).toBe("맘스터치버거");
  });
  it("지점명 꼬리('강남역점', '본점', '2호점')를 뗀다", () => {
    expect(stripBranch("교촌치킨 강남역점")).toBe("교촌치킨");
    expect(stripBranch("본죽 역삼 1호점")).toBe("본죽 역삼");
    expect(stripBranch("본죽(역삼점)")).toBe("본죽");
    expect(stripBranch("BBQ 본점")).toBe("BBQ");
    expect(stripBranch("김밥천국 서초점 2호점")).toBe("김밥천국");
    expect(stripBranch("할매분식점")).toBe("할매분식점"); // 토큰 하나면 건드리지 않는다
  });
});

describe("matchFranchise", () => {
  it("지점명을 뗀 이름이 같으면 가맹", () => {
    expect(matchFranchise("교촌치킨 강남역점", idx)).toBe("교촌치킨");
    expect(matchFranchise("bbq 역삼점", idx)).toBe("BBQ");
    expect(matchFranchise("파리 바게트", idx)).toBeNull(); // 한글 표기는 다른 이름
    expect(matchFranchise("Paris Baguette 서울역점", idx)).toBe("Paris Baguette");
  });
  it("붙여 쓴 지점명은 브랜드 접두어 + '점'으로 끝날 때만", () => {
    expect(matchFranchise("미스터피자역삼점", idx)).toBe("미스터피자");
    expect(matchFranchise("미스터피자집", idx)).toBeNull();
  });
  it("짧은 브랜드가 개인 가게를 잡지 않는다", () => {
    expect(matchFranchise("본가순대국", idx)).toBeNull();
    expect(matchFranchise("본가 순대국점", idx)).toBeNull(); // 지점명 뗀 '본가 순대국' ≠ '본가'
    expect(matchFranchise("본가", idx)).toBe("본가"); // 정확히 같으면
    expect(matchFranchise("A 식당", idx)).toBeNull(); // 1글자 브랜드는 색인에 넣지 않는다
  });
  it("카카오 분류 4칸째 브랜드명으로도 맞춘다 (일반 분류 3칸은 무시)", () => {
    expect(matchFranchise("Pho Mein 강남", idx, "음식점 > 아시아음식 > 베트남음식 > 포메인")).toBe("포메인");
    expect(matchFranchise("동네 쌀국수", idx, "음식점 > 아시아음식 > 베트남음식")).toBeNull();
  });
  it("브랜드 목록이 비면 판단하지 않는다(null) · 라벨", () => {
    expect(franchiseOf("교촌치킨 강남점", new Map())).toEqual({ is: null, brand: null });
    expect(franchiseOf("교촌치킨 강남점", idx)).toEqual({ is: true, brand: "교촌치킨" });
    expect(franchiseOf("동네 쌀국수", idx)).toEqual({ is: false, brand: null });
    expect(franchiseLabel({ is: true })).toBe("가맹 브랜드 · 공정위 정보");
    expect(franchiseLabel({ is: false })).toBe("개인 음식점(추정)");
    expect(franchiseLabel({ is: null })).toBeNull();
  });
});

describe("공정위 가맹정보 브랜드 목록", () => {
  const item = (brandNm: string, indutyLclasNm = "외식", extra = {}) => ({ brandNm, indutyLclasNm, indutyMlsfcNm: "치킨", jngBizCrtraYr: "2025", jnghdqrtrsRprsvNm: "홍길동", ...extra });

  it("감싼 응답·평평한 응답·item 1개 모두 읽는다", () => {
    expect(parseFtcPage({ response: { header: { resultCode: "00" }, body: { totalCount: 2, items: { item: [item("a"), item("b")] } } } })).toMatchObject({ total: 2, resultCode: "00" });
    expect(parseFtcPage({ resultCode: "00", totalCount: 1, items: { item: item("a") } }).items).toHaveLength(1);
    expect(parseFtcPage({ totalCount: 0, items: [] }).items).toEqual([]);
  });

  it("외식만 · 정규화 중복 제거 · 대표자 이름은 버린다", () => {
    const rows = toBrandRows([item("교촌치킨"), item("교촌 치킨"), item("다이소", "도소매"), item("  "), item("본죽", "외식", { corpNm: "(주)본아이에프" })], "2025");
    expect(rows.map((r) => r.brand_name)).toEqual(["교촌치킨", "본죽"]);
    expect(rows[1]).toEqual({ normalized: "본죽", brand_name: "본죽", company: "(주)본아이에프", industry: "치킨", source_updated_at: "2025" });
    expect(JSON.stringify(rows)).not.toContain("홍길동");
  });

  it("페이지를 끝까지 넘기고 필수 파라미터를 보낸다", async () => {
    const calls: string[] = [];
    const fake = vi.fn(async (url: string) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get("pageNo"));
      const items = page === 1 ? Array.from({ length: 1000 }, (_, i) => item(`브랜드${i}`)) : [item("마지막브랜드")];
      return new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { totalCount: 1001, items: { item: items } } } }));
    });
    const r = await fetchFtcBrands("2025", { key: "test-key", fetch: fake });
    expect(r.pages).toBe(2);
    expect(r.rows).toHaveLength(1001);
    const u = new URL(calls[0]);
    expect(u.origin + u.pathname).toBe(FTC_BRAND_URL);
    expect(Object.fromEntries(u.searchParams)).toEqual({ serviceKey: "test-key", pageNo: "1", numOfRows: "1000", resultType: "json", jngBizCrtraYr: "2025" });
  });

  it("서비스키 오류(XML 응답)를 알아듣게 알린다", async () => {
    const fake = async () => new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>");
    await expect(fetchFtcBrands("2025", { key: "bad", fetch: fake })).rejects.toThrow(/서비스키/);
  });
});

describe("어드민 입력 규칙", () => {
  it("카카오 장소 링크·id", () => {
    expect(parseKakaoPlaceId("https://place.map.kakao.com/26338954")).toBe("26338954");
    expect(parseKakaoPlaceId("http://place.map.kakao.com/m/26338954?service=search_pc")).toBe("26338954");
    expect(parseKakaoPlaceId(" 26338954 ")).toBe("26338954");
    expect(parseKakaoPlaceId("https://evil.example/26338954")).toBeNull();
    expect(parseKakaoPlaceId("abc")).toBeNull();
  });
  it("쿠폰·이벤트는 마감일이 필요, 마감이 시작보다 빠르면 거절", () => {
    const base = { place: "123", title: "10% 할인", source: "owner" as const };
    expect(OfferInput.safeParse({ ...base, kind: "coupon" }).success).toBe(false);
    expect(OfferInput.safeParse({ ...base, kind: "coupon", ends_on: "2026-10-31" }).success).toBe(true);
    expect(OfferInput.safeParse({ ...base, kind: "group_buy" }).success).toBe(true);
    expect(OfferInput.safeParse({ ...base, kind: "event", starts_on: "2026-11-01", ends_on: "2026-10-31" }).success).toBe(false);
    expect(OfferInput.safeParse({ ...base, kind: "takeout", source: "report" }).success).toBe(false); // 제보는 이 경로로 못 넣는다
  });
  it("음식점 등록: 위도·경도는 함께, 한국 범위", () => {
    const base = { place: "123", name: "가게", info_source: "owner" as const };
    expect(RestaurantInput.safeParse(base).success).toBe(true);
    expect(RestaurantInput.safeParse({ ...base, lat: 37.5 }).success).toBe(false);
    expect(RestaurantInput.safeParse({ ...base, lat: 37.5, lng: 127 }).success).toBe(true);
    expect(RestaurantInput.safeParse({ ...base, lat: 35.6, lng: 139.7 }).success).toBe(false);
  });
});
