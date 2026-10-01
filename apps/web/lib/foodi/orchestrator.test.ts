// Orchestrator 단위 테스트: 미리보기 DB + 각본대로 답하는 가짜 LLM.
// (LLM 없이 도는 경로는 eval/eval.test.ts 의 30문항이 검증한다. 여기서는 LLM 이 있을 때의 방어선을 본다.)
import { describe, expect, it, vi } from "vitest";
import { previewRepo } from "@/lib/preview/source";
import { PREVIEW_FOODS, previewId } from "@/lib/preview/foods";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import type { Embedder, LLMProvider, Usage } from "@/lib/providers/types";
import { normalizeQuestion } from "@/lib/guard/cache";
import { josa, validate } from "./generate";
import { findCountry, findFood, findUnknownPlace, ruleClassify, type Vocab } from "./intent";
import { ask } from "./orchestrator";
import type { FoodisRepo } from "./repo";

const id = (slug: string) => previewId(PREVIEW_FOODS.find((f) => f.slug === slug)!.n);
const usage = (op: string): Usage => ({ provider: "fake", operation: op, units: 1, unitType: "tokens", costUsd: 0.001 });
const vocab: Vocab = {
  countries: PREVIEW_COUNTRIES.map(({ code, name_ko, name_en, continent_group }) => ({ code, name_ko, name_en, continent_group })),
  foods: PREVIEW_FOODS.map((f) => ({ id: previewId(f.n), name_ko: f.name_ko, name_en: f.name_en })),
};

/** fast 호출엔 intent, smart 호출엔 순서대로 answers 를 돌려주는 가짜 LLM */
function fakeLLM(answers: unknown[], intent: unknown = { intent: "recommend", diet: [], country_code: null, mentioned_food: null, mentioned_place: null }) {
  const calls: string[] = [];
  let i = 0;
  const llm: LLMProvider = {
    async structured({ model, operation }) {
      calls.push(operation);
      if (model === "fast") return { data: intent, usage: usage(operation) } as never;
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return { data: a, usage: usage(operation) } as never;
    },
  };
  return { llm, calls };
}
const noEmbed: Embedder = { embed: async () => Promise.reject(new Error("no embed")) };
const deps = (llm: LLMProvider, repo: FoodisRepo = previewRepo()) => ({ llm, embedder: noEmbed, repo, dailyBudgetUsd: 5 });

describe("LLM 경로의 방어선", () => {
  it("검증 통과한 답은 그대로, 식이 배지는 DB 값, 로그인 사용자는 탐험 기록", async () => {
    const repo = previewRepo();
    const mark = vi.spyOn(repo, "markExplored");
    const { llm, calls } = fakeLLM([{ speech: "에티오피아의 인제라 어때요?", picks: [{ food_id: id("injera"), reason: "발효 취향" }], follow_ups: ["문화 이야기", "다른 거"] }]);
    // 첫 키워드 후보에 인제라가 들어오도록 이름으로 묻는다
    const res = await ask(deps(llm, repo), { text: "인제라 추천해줘" }, "user-1");
    expect(res.validated).toBe(true);
    expect(calls).toEqual(["generate"]); // 규칙으로 의도 분류 → fast LLM 생략
    expect(res.cards[0]).toMatchObject({ slug: "injera", diet_badges: expect.arrayContaining([{ key: "vegan", level: "yes" }, { key: "gluten_free", level: "depends" }]) });
    expect(mark).toHaveBeenCalledWith("user-1", [id("injera")]);
  });

  it("후보 밖 음식명을 말하면 1회 재생성 → 그래도 실패하면 DB 템플릿, 캐시 안 함", async () => {
    const repo = previewRepo();
    const cacheSet = vi.spyOn(repo, "cacheSet");
    const bad = { speech: "레촌도 먹어봐요!", picks: [{ food_id: id("injera"), reason: "x" }], follow_ups: ["a", "b"] };
    const { llm, calls } = fakeLLM([bad, bad]);
    const res = await ask(deps(llm, repo), { text: "인제라 추천해줘" }, null);
    expect(calls).toEqual(["generate", "generate"]);
    expect(res.validated).toBe(false);
    expect(res.speech).not.toContain("레촌");
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it("DB 가 no 인 식이 조건을 단정하면 거부 (주입 대응)", async () => {
    const lie = { speech: "세비체는 비건이에요.", picks: [{ food_id: id("ceviche"), reason: "x" }], follow_ups: ["a", "b"] };
    const { llm } = fakeLLM([lie, lie]);
    const res = await ask(deps(llm), { text: "세비체 추천해줘" }, null);
    expect(res.validated).toBe(false);
    expect(res.speech).not.toMatch(/세비체는 비건이에요/);
  });

  it("비건 사용자에게 조건 밖 음식을 고르면 거부", async () => {
    const { llm, calls } = fakeLLM([
      { speech: "버터 치킨 어때요?", picks: [{ food_id: id("butter-chicken"), reason: "x" }], follow_ups: ["a", "b"] },
      { speech: "차나 마살라 어때요?", picks: [{ food_id: id("chana-masala"), reason: "x" }], follow_ups: ["a", "b"] },
    ]);
    const res = await ask(deps(llm), { text: "인도 음식 추천해줘", guest: { diet: ["vegan"] } }, null);
    // 버터 치킨은 DB 필터에서 이미 빠져 후보에도 없다 → 후보 밖 food_id 로 거부 → 재생성
    expect(calls).toEqual(["generate", "generate"]);
    expect(res.cards.map((c) => c.slug)).toEqual(["chana-masala"]);
  });

  it("LLM 이 뽑은 음식 이름도 DB 와 대조: 없으면 '지도에 없음' + 대안", async () => {
    const { llm } = fakeLLM([], { intent: "explain_food", diet: [], country_code: null, mentioned_food: "부리토", mentioned_place: null });
    const res = await ask(deps(llm), { text: "부리토 어떤 음식이야" }, null);
    expect(res.not_in_map).toBe("부리토");
    expect(res.speech).toContain("지도");
    expect(res.cards).toHaveLength(1);
  });

  it("같은 첫 질문은 캐시 (LLM 0회), '다른 거' 같은 이어지는 질문은 캐시 안 씀", async () => {
    const repo = previewRepo();
    const ans = { speech: "인제라 어때요?", picks: [{ food_id: id("injera"), reason: "x" }], follow_ups: ["a", "b"] };
    const { llm, calls } = fakeLLM([ans, ans]);
    await ask(deps(llm, repo), { text: "푸디야, 인제라 추천해줘!" }, null);
    const second = await ask(deps(llm, repo), { text: "인제라 추천해줘" }, null);
    expect(second.cached).toBe(true);
    await ask(deps(llm, repo), { text: "인제라 추천해줘", seen_food_ids: [id("kimchi")] }, null);
    expect(calls).toEqual(["generate", "generate"]);
  });

  it("화면의 음식보다 질문에서 이름으로 가리킨 음식이 우선 (이야기 이어 듣기)", async () => {
    const { llm } = fakeLLM([new Error("offline")]);
    const res = await ask(deps(llm), { text: "비엔나 커피하우스 커피 이야기도 들려줘", context_food_id: id("turkish-coffee") }, null);
    expect(res.intent).toBe("culture_story");
    expect(res.cards.map((c) => c.slug)).toEqual(["viennese-coffee"]);
  });

  it("예산 초과면 LLM 없이 템플릿", async () => {
    const repo = previewRepo();
    vi.spyOn(repo, "usageTodayUsd").mockResolvedValue(99);
    const { llm, calls } = fakeLLM([]);
    const res = await ask(deps(llm, repo), { text: "추천해줘" }, null);
    expect(calls).toEqual([]);
    expect(res.cards).toHaveLength(1);
  });
});

describe("슬롯 추출·한국어", () => {
  it("긴 국가명 우선, 별칭", () => {
    expect(findCountry("인도네시아 음식", vocab.countries)).toBe("ID");
    expect(findCountry("인도 음식", vocab.countries)).toBe("IN");
    expect(findCountry("터키 음식 알려줘", vocab.countries)).toBe("TR");
    expect(findCountry("한국 음식", vocab.countries)).toBe("KR");
  });
  it("음식 이름은 국가보다 먼저 (튀르키예 커피는 음식)", () => {
    expect(findFood("터키 커피 이야기", vocab.foods)).toBe(id("turkish-coffee"));
    expect(ruleClassify("터키 커피 이야기 들려줘", undefined, vocab)).toMatchObject({ intent: "culture_story", foodId: id("turkish-coffee"), countryCode: null });
  });
  it("지도에 없는 장소", () => {
    expect(findUnknownPlace("화성 음식 추천해줘", vocab)).toBe("화성");
    expect(findUnknownPlace("비건으로 먹을 수 있는 음식 추천해줘", vocab)).toBeNull();
    expect(findUnknownPlace("아프리카 음식", vocab)).toBeNull();
    expect(findUnknownPlace("할랄 음식만 보여줘", vocab)).toBeNull();
  });
  it("'알려줘'만으로는 음식 추천이 아니다", () => {
    expect(ruleClassify("내일 날씨 알려줘", undefined, vocab).intent).toBeNull();
    expect(ruleClassify("안 가본 나라 음식 알려줘", undefined, vocab).intent).toBe("recommend");
  });
  it("조사", () => {
    expect(josa("김치", "은는")).toBe("김치는");
    expect(josa("인제라", "을를")).toBe("인제라를");
    expect(josa("만두", "과와")).toBe("만두와");
    expect(josa("화성", "은는")).toBe("화성은");
    expect(josa("유럽", "으로")).toBe("유럽으로");
    expect(josa("중동·아프리카", "으로")).toBe("중동·아프리카로");
  });
  it("호출어·문장부호 정규화", () => {
    expect(normalizeQuestion("푸디야, 오늘은 어디로 떠나볼까?")).toBe(normalizeQuestion("오늘은 어디로 떠나볼까"));
  });
  it("validate: 후보 이름의 일부는 허용", () => {
    const diet = { vegan: "unknown", vegetarian: "unknown", halal: "unknown", gluten_free: "unknown", dairy_free: "unknown" };
    const foods = [{ id: "t", slug: "t", name_ko: "돈코츠 라멘", name_en: "Tonkotsu ramen", diet }] as never;
    const names = [{ id: "r", name_ko: "라멘", name_en: "Ramen" }, { id: "t", name_ko: "돈코츠 라멘", name_en: "Tonkotsu ramen" }];
    expect(validate({ speech: "돈코츠 라멘 어때요", picks: [{ food_id: "t", reason: "" }], follow_ups: [] }, { foods, intent: "recommend", targetId: null, needDiet: [], ctx: {} as never, text: "" }, names).ok).toBe(true);
  });
});
