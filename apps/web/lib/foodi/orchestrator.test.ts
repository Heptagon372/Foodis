import { describe, expect, it, vi } from "vitest";
import type { Embedder, LLMProvider, Usage } from "@/lib/providers/types";
import { ask } from "./orchestrator";
import { emptyDiet, type FoodisRepo, type FoodRow, type UserContext } from "./repo";
import { validate } from "./generate";
import { ruleIntent, extractDiet } from "./intent";
import { normalizeQuestion } from "@/lib/guard/cache";

const usage = (op: string): Usage => ({ provider: "fake", operation: op, units: 1, unitType: "tokens", costUsd: 0.001 });

const food = (id: string, name_ko: string, name_en: string, cc: string, diet: Partial<FoodRow["diet"]> = {}): FoodRow => ({
  id,
  slug: name_en.toLowerCase(),
  name_ko,
  name_en,
  country_code: cc,
  summary: `${name_ko} 요약`,
  culture_story: `${name_ko} 문화 이야기`,
  taste_tags: ["sour"],
  image_url: null,
  allergens: [],
  diet: { vegan: "unknown", vegetarian: "unknown", halal: "unknown", gluten_free: "unknown", dairy_free: "unknown", ...diet },
  country: { name_ko: cc, flag_emoji: "🏳️", accent_color: "#000" },
  sources: [{ title: "Wikipedia", url: `https://en.wikipedia.org/wiki/${name_en}` }],
});

const INJERA = food("f-injera", "인제라", "Injera", "ET", { vegan: "yes", gluten_free: "depends" });
const KIMCHI = food("f-kimchi", "김치", "Kimchi", "KR", { vegan: "depends" });
const SUSHI = food("f-sushi", "스시", "Sushi", "JP");
const ALL = [INJERA, KIMCHI, SUSHI];

function fakeRepo(over: Partial<FoodisRepo> = {}, ctx: Partial<UserContext> = {}) {
  const cache = new Map<string, unknown>();
  const repo: FoodisRepo = {
    matchFoods: vi.fn(async () => [INJERA.id, KIMCHI.id]),
    keywordFoods: vi.fn(async () => [KIMCHI.id]),
    getFoods: async (ids) => ids.flatMap((id) => ALL.filter((f) => f.id === id)),
    getRelatedFoodIds: async () => [KIMCHI.id],
    allFoodNames: async () => ALL.map(({ id, name_ko, name_en }) => ({ id, name_ko, name_en })),
    getUserContext: async (userId) => ({ userId, diet: emptyDiet(), allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [], ...ctx }),
    recordConversation: vi.fn(async () => "conv-1"),
    recordUsage: vi.fn(async () => {}),
    markExplored: vi.fn(async () => {}),
    usageTodayUsd: async () => 0,
    cacheGet: async <T,>(k: string) => (cache.get(k) as T) ?? null,
    cacheSet: vi.fn(async (k: string, _kind, payload: unknown) => void cache.set(k, payload)),
    ...over,
  };
  return repo;
}

/** fast 호출엔 intent, smart 호출엔 순서대로 answers 를 돌려주는 가짜 LLM */
function fakeLLM(answers: unknown[], intent: unknown = { intent: "recommend", diet: [], country_code: null }): LLMProvider & { calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    async structured({ model, operation }) {
      calls.push(operation);
      if (model === "fast") return { data: intent, usage: usage(operation) } as never;
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return { data: a, usage: usage(operation) } as never;
    },
  };
}

const embedder: Embedder = { embed: async () => ({ vectors: [[0.1, 0.2]], usage: usage("embed") }) };
const failingEmbedder: Embedder = { embed: async () => Promise.reject(new Error("openai 503")) };

const deps = (llm: LLMProvider, repo: FoodisRepo, emb = embedder) => ({ llm, embedder: emb, repo, dailyBudgetUsd: 5 });
const req = (text: string, extra: object = {}) => ({ text, input_mode: "voice" as const, ...extra });

describe("ask pipeline", () => {
  it("추천: 후보 안에서 고른 답 + 식이 배지는 DB 값", async () => {
    const llm = fakeLLM([{ speech: "에티오피아의 인제라 어때요?", picks: [{ food_id: INJERA.id, reason: "발효 취향" }], follow_ups: ["문화 이야기"] }]);
    const repo = fakeRepo();
    const res = await ask(deps(llm, repo), req("푸디야, 오늘은 어디로 떠나볼까?"), "user-1");

    expect(res.validated).toBe(true);
    expect(res.intent).toBe("recommend");
    expect(llm.calls).toEqual(["generate"]); // 규칙으로 의도 분류 → fast LLM 생략
    expect(res.cards[0]).toMatchObject({ slug: "injera", diet_badges: [{ key: "vegan", level: "yes" }, { key: "gluten_free", level: "depends" }] });
    expect(res.sources[0].url).toContain("Injera");
    expect(repo.markExplored).toHaveBeenCalledWith("user-1", [INJERA.id]);
    expect(res.conversation_id).toBe("conv-1");
  });

  it("후보 밖 음식을 말하면 1회 재생성, 그래도 실패하면 DB 템플릿 (validated=false)", async () => {
    const bad = { speech: "스시도 먹어봐요!", picks: [{ food_id: INJERA.id, reason: "x" }], follow_ups: [] };
    const llm = fakeLLM([bad, bad]);
    const repo = fakeRepo({ matchFoods: async () => [INJERA.id, KIMCHI.id] });
    const res = await ask(deps(llm, repo), req("뭐 먹어볼까"), null);

    expect(llm.calls).toEqual(["generate", "generate"]);
    expect(res.validated).toBe(false);
    expect(res.speech).toContain("인제라");
    expect(res.speech).not.toContain("스시");
    expect(repo.cacheSet).not.toHaveBeenCalled(); // 실패한 답은 캐시하지 않음
  });

  it("후보 밖 food_id 는 거부된다", async () => {
    const llm = fakeLLM([
      { speech: "x", picks: [{ food_id: "f-hallucinated", reason: "x" }], follow_ups: [] },
      { speech: "김치 어때요?", picks: [{ food_id: KIMCHI.id, reason: "x" }], follow_ups: [] },
    ]);
    const res = await ask(deps(llm, fakeRepo()), req("추천해줘"), null);
    expect(res.validated).toBe(true);
    expect(res.cards.map((c) => c.food_id)).toEqual([KIMCHI.id]);
  });

  it("LLM 장애 → 템플릿, 임베딩 장애 → 키워드 검색 (카드는 항상 나온다)", async () => {
    const llm = fakeLLM([new Error("anthropic 529")]);
    const repo = fakeRepo();
    const res = await ask(deps(llm, repo, failingEmbedder), req("추천해줘"), null);
    expect(repo.keywordFoods).toHaveBeenCalled();
    expect(repo.matchFoods).not.toHaveBeenCalled();
    expect(res.cards).toHaveLength(1);
    expect(res.validated).toBe(false);
  });

  it("식이 조건: 질문의 비건 + 프로필의 할랄을 모두 검색 조건으로", async () => {
    const llm = fakeLLM([{ speech: "인제라 어때요?", picks: [{ food_id: INJERA.id, reason: "비건" }], follow_ups: [] }]);
    const repo = fakeRepo({}, { diet: { ...emptyDiet(), halal: true } });
    await ask(deps(llm, repo), req("비건 음식 추천해줘"), "u");
    expect(repo.matchFoods).toHaveBeenCalledWith(expect.objectContaining({ needDiet: expect.arrayContaining(["vegan", "halal"]) }));
  });

  it("같은 질문 두 번째는 캐시 (LLM 호출 0)", async () => {
    const llm = fakeLLM([{ speech: "인제라 어때요?", picks: [{ food_id: INJERA.id, reason: "x" }], follow_ups: [] }]);
    const repo = fakeRepo();
    await ask(deps(llm, repo), req("푸디야, 오늘은 어디로 떠나볼까?"), null);
    const second = await ask(deps(llm, repo), req("오늘은 어디로 떠나볼까"), null);
    expect(second.cached).toBe(true);
    expect(llm.calls).toEqual(["generate"]);
  });

  it("예산 초과면 LLM·임베딩 없이 템플릿", async () => {
    const llm = fakeLLM([]);
    const repo = fakeRepo({ usageTodayUsd: async () => 99 });
    const res = await ask(deps(llm, repo), req("추천해줘"), null);
    expect(llm.calls).toEqual([]);
    expect(res.cards).toHaveLength(1);
  });

  it("문화 이야기: 지금 보는 음식이 후보", async () => {
    const llm = fakeLLM([{ speech: "인제라는 함께 나눠 먹어요.", picks: [{ food_id: INJERA.id, reason: "현재 음식" }], follow_ups: [] }]);
    const repo = fakeRepo();
    const res = await ask(deps(llm, repo), req("이 음식 문화 이야기 들려줘", { context_food_id: INJERA.id }), null);
    expect(res.intent).toBe("culture_story");
    expect(repo.matchFoods).not.toHaveBeenCalled();
  });

  it("규칙에 안 걸리면 fast LLM 으로 의도 분류, 범위 밖이면 카드 없이 안내", async () => {
    const llm = fakeLLM([], { intent: "out_of_scope", diet: [], country_code: null });
    const res = await ask(deps(llm, fakeRepo()), req("내일 날씨 알려줘"), null);
    expect(llm.calls).toEqual(["intent"]);
    expect(res.intent).toBe("out_of_scope");
    expect(res.cards).toEqual([]);
    expect(res.follow_ups.length).toBeGreaterThan(0); // dead-end 금지
  });
});

describe("units", () => {
  it("validate: 후보 이름의 일부는 허용", () => {
    const ramen = food("f-ramen", "라멘", "Ramen", "JP");
    const tonkotsu = food("f-tonkotsu", "돈코츠 라멘", "Tonkotsu ramen", "JP");
    const names = [ramen, tonkotsu].map(({ id, name_ko, name_en }) => ({ id, name_ko, name_en }));
    expect(validate({ speech: "돈코츠 라멘 어때요", picks: [{ food_id: tonkotsu.id, reason: "" }], follow_ups: [] }, [tonkotsu], names).ok).toBe(true);
  });
  it("intent 규칙과 식이 추출", () => {
    expect(ruleIntent("나 몇 개 나라 가봤어?", false)).toBe("passport_status");
    expect(ruleIntent("문화 이야기 들려줘", false)).toBeNull(); // 현재 음식 없으면 규칙 확정 안 함
    expect(extractDiet("할랄이고 글루텐 없는 거")).toEqual(["halal", "gluten_free"]);
  });
  it("호출어·문장부호 정규화", () => {
    expect(normalizeQuestion("푸디야, 오늘은 어디로 떠나볼까?")).toBe(normalizeQuestion("오늘은 어디로 떠나볼까"));
  });
});
