// 커뮤니티: 카테고리 추천 · 트렌드/맞춤 순서 · 음식 태그 · 브리핑(LLM/템플릿) · 사전 필터 · 메모리 저장소 규칙
import { describe, expect, it } from "vitest";
import type { LLMProvider } from "@/lib/providers/types";
import { briefingKey, makeBriefing, templateBriefing, validateBriefing } from "./briefing";
import { filterCategories, suggestCategories } from "./categories";
import { ruleCheck } from "./moderation";
import { previewSeed } from "./seed";
import { memoryStore, type NewPost } from "./store";
import { matchTags } from "./tags";
import { bumpInterest, computeTrends, decodeInterest, encodeInterest, normalizeInterest, rankForYou } from "./trends";
import { buddyState, NewPostInput, type PostRow } from "./types";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const H = 3_600_000;
const ago = (h: number) => new Date(NOW - h * H).toISOString();

const post = (o: Partial<PostRow> & Pick<PostRow, "id" | "category">): PostRow => ({
  author_key: "u1",
  author_name: "a",
  title: "제목",
  body: "본문",
  place: null,
  meet_at: null,
  capacity: null,
  photos: [],
  poll: null,
  food_slugs: [],
  country_codes: [],
  like_count: 0,
  comment_count: 0,
  join_count: 0,
  created_at: ago(1),
  ...o,
});

describe("카테고리", () => {
  it("글 내용으로 카테고리를 추천한다", () => {
    expect(suggestCategories("오늘 저녁 같이 먹을 사람 2명 구해요")[0]).toBe("buddy");
    expect(suggestCategories("할랄 인증 케밥집 추천")[0]).toBe("halal");
    expect(suggestCategories("비건 샐러드 맛집")).toContain("vegetarian");
    expect(suggestCategories("마라탕 훠궈 최고")[0]).toBe("chinese");
    expect(suggestCategories("아무 말")).toEqual([]);
  });
  it("모임 필터는 밥친구를 빼고 10개", () => {
    expect(filterCategories("club")).toHaveLength(10);
    expect(filterCategories("club")).not.toContain("buddy");
    expect(filterCategories("all")).toBeNull();
    expect(filterCategories("halal")).toEqual(["halal"]);
  });
});

describe("트렌드 · 맞춤 피드", () => {
  it("감쇠 합으로 열기를 매기고, 최근 이틀에 몰리면 급상승", () => {
    const signals = [
      ...Array.from({ length: 8 }, () => ({ kind: "like" as const, category: "halal" as const, at: ago(5) })),
      ...Array.from({ length: 10 }, () => ({ kind: "view" as const, category: "korean" as const, at: ago(24 * 6) })),
    ];
    const t = computeTrends(signals, [{ category: "halal", created_at: ago(3) }], NOW);
    expect(t[0].category).toBe("halal");
    expect(t[0].heat).toBe(1);
    expect(t[0].rising).toBe(true);
    expect(t[0].posts7d).toBe(1);
    const korean = t.find((x) => x.category === "korean")!;
    expect(korean.rising).toBe(false);
    expect(korean.heat).toBeGreaterThan(0);
    expect(korean.heat).toBeLessThan(1);
  });

  it("2주 넘은 신호는 버린다", () => {
    const t = computeTrends([{ kind: "post", category: "meat", at: ago(24 * 20) }], [], NOW);
    expect(t.every((x) => x.score === 0)).toBe(true);
  });

  it("내 관심 카테고리 글이 위로, 이유가 붙는다", () => {
    const posts = [post({ id: "a", category: "korean", created_at: ago(2) }), post({ id: "b", category: "halal", created_at: ago(30) })];
    const r = rankForYou(posts, { halal: 1 }, [], NOW);
    expect(r[0].post.id).toBe("b");
    expect(r[0].reason).toBe("자주 보는 할랄");
  });

  it("관심이 없으면 신선도·반응으로, 지난 밥약속은 뒤로", () => {
    const posts = [
      post({ id: "past", category: "buddy", meet_at: ago(5), created_at: ago(1) }),
      post({ id: "new", category: "diet", created_at: ago(2) }),
    ];
    const r = rankForYou(posts, {}, [], NOW);
    expect(r.map((x) => x.post.id)).toEqual(["new", "past"]);
    expect(r[0].reason).toBe("방금 올라온 글");
  });

  it("관심 가중치: 쌓고 → 정규화 → 쿼리 문자열 왕복", () => {
    let m = bumpInterest({}, "halal", "post", NOW);
    m = bumpInterest(m, "korean", "tap", NOW);
    const n = normalizeInterest(m, NOW);
    expect(n.halal).toBe(1);
    expect(n.korean).toBeCloseTo(1 / 6, 2);
    expect(decodeInterest(encodeInterest(n))).toEqual({ halal: 1, korean: 0.17 });
    expect(decodeInterest("hack:1,halal:abc,diet:0.5")).toEqual({ diet: 0.5 });
  });
});

describe("음식 태그", () => {
  const vocab = {
    foods: [
      { slug: "pho", name_ko: "퍼", name_en: "Pho" },
      { slug: "bun-cha", name_ko: "분짜", name_en: "Bun cha" },
      { slug: "green-curry", name_ko: "그린 커리", name_en: "Green curry" },
    ],
    countries: [{ code: "VN", name_ko: "베트남" }],
  };
  it("DB 음식 이름만 붙이고, 한 글자 한국어 이름은 영어 단어로만", () => {
    expect(matchTags("베트남 분짜랑 그린커리 먹었어요", vocab)).toEqual({ food_slugs: ["green-curry", "bun-cha"], country_codes: ["VN"] });
    expect(matchTags("퍼펙트한 하루", vocab).food_slugs).toEqual([]);
    expect(matchTags("I love pho", vocab).food_slugs).toEqual(["pho"]);
  });
});

describe("푸디 브리핑", () => {
  const trends = computeTrends(
    Array.from({ length: 10 }, () => ({ kind: "like" as const, category: "vegetarian" as const, at: ago(3) })),
    [{ category: "vegetarian", created_at: ago(5) }],
    NOW,
  );
  const input = { trends, hotFoods: [{ slug: "falafel", name_ko: "팔라펠", count: 3 }], titles: [{ category: "vegetarian" as const, title: "비건 점심" }] };

  it("템플릿: 신호 없으면 첫 글 유도, 있으면 상위 카테고리·음식", () => {
    expect(templateBriefing({ trends: computeTrends([], [], NOW), hotFoods: [], titles: [] }).focus).toEqual([]);
    const b = templateBriefing(input);
    expect(b.headline).toBe("채식이 뜨고 있어요");
    expect(b.summary).toContain("팔라펠");
    expect(b.ask).toBe("팔라펠과 비슷한 음식 알려줘");
    expect(b.by).toBe("template");
  });

  it("LLM 출력은 검증: 링크 금지, focus 는 상위 트렌드 안에서만", () => {
    expect(validateBriefing({ headline: "채식 붐", summary: "자세히는 https://x.y 참고하세요", ask: "채식 추천해줘", focus: [] }, input)).toBeNull();
    expect(validateBriefing({ headline: "채식 붐이에요", summary: "채식 모임이 활발해요. 팔라펠 이야기가 많아요.", ask: "팔라펠 알려줘", focus: ["vegetarian", "meat", "hack"] }, input)?.focus).toEqual(["vegetarian"]);
  });

  it("LLM 이 실패하면 템플릿으로", async () => {
    const broken: LLMProvider = { structured: async () => Promise.reject(new Error("down")) };
    expect((await makeBriefing(broken, input)).briefing.by).toBe("template");
    const ok: LLMProvider = {
      structured: async () => ({ data: { headline: "채식 테이블이 북적여요", summary: "이번 주는 채식 모임이 가장 활발해요.", ask: "채식 음식 추천해줘", focus: ["vegetarian"] } as never, usage: { provider: "fake", operation: "community_briefing", units: 1, unitType: "tokens", costUsd: 0 } }),
    };
    const r = await makeBriefing(ok, input);
    expect(r.briefing.by).toBe("ai");
    expect(r.usage?.operation).toBe("community_briefing");
    expect(briefingKey(input)).toContain("vegetarian");
  });
});

describe("사전 필터 (규칙)", () => {
  it("전화번호·오픈채팅은 막고 음식 이야기는 통과", () => {
    expect(ruleCheck("연락주세요 010-1234-5678").ok).toBe(false);
    expect(ruleCheck("오픈채팅 open.kakao.com/o/abc").ok).toBe(false);
    expect(ruleCheck("돼지고기 없는 할랄 식당 찾아요, 7시 정문").ok).toBe(true);
  });
});

describe("글 입력 검증", () => {
  const base = { category: "korean", title: "비빔밥 맛집", body: "추천해요" };
  it("만날 시각·인원은 밥친구에서만, 투표 선택지 중복 금지", () => {
    expect(NewPostInput.safeParse(base).success).toBe(true);
    expect(NewPostInput.safeParse({ ...base, capacity: 3 }).success).toBe(false);
    expect(NewPostInput.safeParse({ ...base, category: "buddy", capacity: 3, meet_at: "2026-10-02T19:00:00+09:00" }).success).toBe(true);
    expect(NewPostInput.safeParse({ ...base, poll: { options: ["a", "a"] } }).success).toBe(false);
    expect(NewPostInput.safeParse({ ...base, poll: { options: ["a"] } }).success).toBe(false);
  });
});

describe("메모리 저장소", () => {
  const draft = (o: Partial<NewPost> = {}): NewPost => ({
    author_key: "me",
    author_name: "나",
    category: "buddy",
    title: "같이 먹어요",
    body: "점심",
    place: "정문",
    meet_at: new Date(Date.now() + 3 * H).toISOString(),
    capacity: 1,
    photos: [],
    poll: { question: null, options: ["한식", "중식"] },
    food_slugs: [],
    country_codes: [],
    ...o,
  });

  it("따봉 토글 · 정원 · 투표 변경 · 내 글만 삭제", async () => {
    const s = memoryStore();
    const p = await s.createPost(draft());
    expect(await s.toggleLike(p.id, "u2")).toEqual({ on: true, count: 1 });
    expect(await s.toggleLike(p.id, "u2")).toEqual({ on: false, count: 0 });
    expect(await s.toggleJoin(p.id, "u2")).toEqual({ on: true, count: 1 });
    expect(await s.toggleJoin(p.id, "u3")).toBe("full");
    expect(await s.vote(p.id, "u2", 1)).toEqual([0, 1]);
    expect(await s.vote(p.id, "u2", 0)).toEqual([1, 0]);
    await expect(s.vote(p.id, "u2", 4)).rejects.toThrow(RangeError);
    expect((await s.viewerStates([p.id], "u2")).get(p.id)).toEqual({ liked: false, joined: true, vote: 0 });
    expect(await s.deletePost(p.id, "u2")).toBe(false);
    expect(await s.deletePost(p.id, "me")).toBe(true);
  });

  it("신고 3건이면 숨김, 댓글 수가 따라 움직인다", async () => {
    const s = memoryStore();
    const p = await s.createPost(draft({ category: "korean", meet_at: null, capacity: null, poll: null }));
    const c = await s.addComment({ post_id: p.id, author_key: "u2", author_name: "b", body: "좋아요" });
    expect((await s.getPost(p.id))?.comment_count).toBe(1);
    expect(await s.deleteComment(c.id, "me")).toBe(false);
    expect(await s.deleteComment(c.id, "u2")).toBe(true);
    for (const k of ["a", "b"]) expect((await s.report(p.id, k, null)).hidden).toBe(false);
    expect((await s.report(p.id, "c", null)).hidden).toBe(true);
    expect(await s.getPost(p.id)).toBeNull();
    expect(await s.listPosts({ categories: null, limit: 10 })).toHaveLength(0);
  });

  it("샘플 시드: 빈 화면이 아니고 투표 수가 실제 표에 더해진다", async () => {
    const s = memoryStore({ seed: previewSeed(() => ({ url: "x.jpg" }), NOW) });
    const all = await s.listPosts({ categories: null, limit: 50 });
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(new Set(all.map((p) => p.category)).size).toBe(11);
    const veg = all.find((p) => p.id === "seed-veg-1")!;
    expect((await s.pollCounts([veg.id])).get(veg.id)).toEqual([14, 6, 11]);
    expect(await s.vote(veg.id, "u9", 1)).toEqual([14, 7, 11]);
    const t = computeTrends(await s.recentSignals(ago(24 * 14)), all, NOW);
    expect(t[0].category).toBe("halal");
    expect(buddyState(all.find((p) => p.id === "seed-buddy-1")!, NOW)).toBe("open");
  });
});
