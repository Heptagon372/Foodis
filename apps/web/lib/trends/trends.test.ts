// 음식 키워드 추출 · 급상승 순위 · 뉴스 파싱/수집 · 모임 저장소 규칙
import { describe, expect, it } from "vitest";
import { previewSeed } from "@/lib/community/seed";
import { memoryStore } from "@/lib/community/store";
import { crawlNews } from "@/lib/news/crawl";
import { decodeEntities, parseGoogleRss, parseNaver } from "@/lib/news/sources";
import { memoryNewsStore } from "@/lib/news/store";
import { extractFoodTerms } from "./keywords";
import { clubHeat, rankRising, type Mention } from "./rising";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const H = 3_600_000;
const vocab = { foods: [{ slug: "tteokbokki", name_ko: "떡볶이" }, { slug: "kimchi", name_ko: "김치" }, { slug: "pho", name_ko: "퍼" }] };
const terms = (t: string) => extractFoodTerms(t, vocab).map((x) => x.term);

describe("음식 키워드 추출", () => {
  it("DB 음식(slug) · 유행 사전 · 꼬리말 규칙", () => {
    expect(extractFoodTerms("로제 떡볶이 신메뉴 출시", vocab)[0]).toEqual({ term: "떡볶이", slug: "tteokbokki" });
    expect(terms("두바이 쫀득쿠키 품절 대란")).toEqual(["두바이쫀득쿠키"]);
    expect(terms("편의점 마라탕이 인기")).toContain("마라탕");
    expect(terms("성수동 소금빵 오픈런")).toContain("소금빵");
  });
  it("조사는 맞을 때만 떼고, 흔한 오탐은 거른다", () => {
    expect(terms("떡볶이 열풍")).toEqual(["떡볶이"]);
    expect(terms("비대면 화면 전국 확대")).toEqual([]);
    expect(terms("한국 목욕탕 문화")).toEqual([]);
    expect(terms("퍼펙트 데이")).toEqual([]); // 한 글자 DB 이름은 붙이지 않음
  });
  it("더 구체적인 이름이 이긴다", () => {
    expect(terms("흑당 버블티 다시 유행")).toEqual(expect.arrayContaining(["흑당", "버블티"]));
    expect(terms("크림 치즈 베이글 맛집")).toContain("베이글");
  });
});

describe("급상승", () => {
  const m = (term: string, hoursAgo: number, n = 1, source: Mention["source"] = "news"): Mention[] => Array.from({ length: n }, () => ({ term, slug: null, at: NOW - hoursAgo * H, weight: 1, source }));

  it("최근 48시간에 몰린 키워드가 꾸준한 키워드보다 위, 6시간 전엔 없었으면 NEW", () => {
    const mentions = [
      ...m("탕후루", 3, 6), // 갑자기
      ...m("커피", 10, 4), ...m("커피", 24 * 4, 12), // 꾸준히 많음
      ...m("약과", 30, 3), ...m("약과", 8, 1),
    ];
    const r = rankRising(mentions, NOW);
    expect(r[0].term).toBe("탕후루");
    expect(r[0].badge).toBe("new");
    expect(r.find((x) => x.term === "커피")!.growth).toBeLessThan(2);
    expect(r.find((x) => x.term === "약과")!.badge).not.toBe("new");
  });
  it("2회 미만 언급은 순위에 넣지 않고, 출처별 개수를 센다", () => {
    const r = rankRising([...m("훠궈", 1, 1), ...m("마라탕", 2, 2, "community"), ...m("마라탕", 5, 1)], NOW);
    expect(r.map((x) => x.term)).toEqual(["마라탕"]);
    expect(r[0]).toMatchObject({ news: 1, community: 2 });
  });
  it("모임: 최근 가입·글이 평소의 2배 넘으면 급상승", () => {
    const act = [
      ...Array.from({ length: 5 }, (_, i) => ({ club_id: "a", at: NOW - (i + 1) * H, kind: "join" as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ club_id: "b", at: NOW - (24 * 3 + i * 12) * H, kind: "join" as const })),
      { club_id: "b", at: NOW - 5 * H, kind: "join" as const },
    ];
    const h = clubHeat(act, NOW);
    expect(h.get("a")?.rising).toBe(true);
    expect(h.get("b")?.rising).toBe(false);
  });
});

describe("뉴스 수집", () => {
  const rss = `<rss><channel><item><title>편의점 &#39;두바이 쫀득쿠키&#39; 품절 - 푸드신문</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Fri, 02 Oct 2026 09:00:00 GMT</pubDate><source url="https://food.example">푸드신문</source></item><item><title>링크 없음</title><pubDate>Fri, 02 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
  it("Google RSS: 제목 끝 언론사를 떼고 엔티티를 푼다", () => {
    expect(parseGoogleRss(rss)).toEqual([{ url: "https://news.google.com/rss/articles/abc", title: "편의점 '두바이 쫀득쿠키' 품절", source: "푸드신문", snippet: null, published_at: "2026-10-02T09:00:00.000Z", provider: "google_rss" }]);
    expect(decodeEntities("&lt;b&gt;A&amp;B&lt;/b&gt;")).toBe("<b>A&B</b>");
  });
  it("네이버: <b> 태그 제거, 언론사는 도메인으로", () => {
    const a = parseNaver({ items: [{ title: "<b>마라탕</b> 인기 &quot;여전&quot;", originallink: "https://www.foodnews.co.kr/a/1", link: "https://n.news.naver.com/1", description: "요약 <b>마라탕</b>", pubDate: "Fri, 02 Oct 2026 18:00:00 +0900" }] });
    expect(a[0]).toMatchObject({ title: '마라탕 인기 "여전"', source: "foodnews.co.kr", snippet: "요약 마라탕", published_at: "2026-10-02T09:00:00.000Z" });
  });
  it("수집: 실패한 검색어는 건너뛰고, 같은 제목은 한 번만, 키워드를 붙여 저장", async () => {
    const store = memoryNewsStore();
    let calls = 0;
    const fetcher = async (q: string) => {
      calls++;
      if (q === "식문화") throw new Error("down");
      return [{ url: `https://x/${q}`, title: "마라탕 열풍 계속", source: "a", snippet: null, published_at: new Date(NOW - H).toISOString(), provider: "google_rss" as const }];
    };
    const r = await crawlNews(store, fetcher, vocab, NOW);
    expect(r.failed).toBe(1);
    expect(r.queries).toBe(calls);
    expect(r.inserted).toBe(1);
    const [a] = await store.list({ category: null, limit: 10 });
    expect(a.terms).toEqual(["마라탕"]);
    expect(a.category).toBe("food");
    expect((await crawlNews(store, fetcher, vocab, NOW)).inserted).toBe(0);
  });
});

describe("모임 (카페형)", () => {
  it("만들면 만든 사람이 회원, 이름 중복 금지, 가입·탈퇴, 만든 사람은 탈퇴 불가", async () => {
    const s = memoryStore();
    const c = await s.createClub({ name: "마라 원정대", topic: "chinese", description: "마라", cover: null, owner_key: "me", owner_name: "나" });
    if (c === "duplicate") throw new Error("dup");
    expect(c.member_count).toBe(1);
    expect(await s.createClub({ name: "마라원정대", topic: "chinese", description: "x", cover: null, owner_key: "u2", owner_name: "b" })).toBe("duplicate");
    expect(await s.toggleMember(c.id, "u2")).toEqual({ on: true, count: 2 });
    expect(await s.toggleMember(c.id, "me")).toBe("owner");
    expect([...(await s.memberOf("u2", null))]).toEqual([c.id]);
    expect(await s.toggleMember(c.id, "u2")).toEqual({ on: false, count: 1 });
  });
  it("모임 글은 게시판과 분리되고, 모임 글 수가 따라 움직인다", async () => {
    const s = memoryStore();
    const c = await s.createClub({ name: "비건 한 끼", topic: "vegetarian", description: "x", cover: null, owner_key: "me", owner_name: "나" });
    if (c === "duplicate") throw new Error("dup");
    const base = { author_key: "me", author_name: "나", category: "vegetarian" as const, title: "t", body: "b", place: null, meet_at: null, capacity: null, photos: [], poll: null, food_slugs: [], country_codes: [] };
    await s.createPost({ ...base, club_id: null });
    const p = await s.createPost({ ...base, club_id: c.id });
    expect(await s.listPosts({ categories: null, limit: 10 })).toHaveLength(1);
    expect((await s.listPosts({ categories: null, limit: 10, club: c.id }))[0].id).toBe(p.id);
    expect(await s.listPosts({ categories: null, limit: 10, club: "any" })).toHaveLength(2);
    expect((await s.getClub(c.id))?.post_count).toBe(1);
    expect(await s.deleteClub(c.id, "u2")).toBe(false);
    expect(await s.deleteClub(c.id, "me")).toBe(true);
    expect(await s.listPosts({ categories: null, limit: 10, club: "any" })).toHaveLength(1);
  });
  it("샘플: 모임 6개, 최근 가입이 몰린 모임이 급상승", async () => {
    const s = memoryStore({ seed: previewSeed(() => null, NOW) });
    const clubs = await s.listClubs({ topic: null, limit: 20 });
    expect(clubs).toHaveLength(6);
    const heat = clubHeat(await s.clubActivity(new Date(NOW - 9 * 24 * H).toISOString()), NOW);
    expect(heat.get("seed-club-mala")?.rising).toBe(true);
    expect(heat.get("seed-club-diet")?.rising).toBe(false);
  });
});
