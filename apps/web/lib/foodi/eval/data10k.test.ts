// 1만 개 실데이터 회귀 테스트 (docs/design/19 §9). foodis-data/data/import/foodis_foods_10000.jsonl 을 그대로 읽어
// 실서비스와 같은 오케스트레이터를 LLM·임베딩 없이 돌린다 → 규칙·질의 해석·점수식만으로도 맞는 답이 나오는지.
// 파일이 없으면(데이터 없이 받은 체크아웃) 건너뛴다.
import { describe, expect, it } from "vitest";
import { hitsAllergen } from "@/lib/diet/allergens";
import type { Embedder, LLMProvider } from "@/lib/providers/types";
import { foodIndexOf } from "../food-index";
import { validate } from "../generate";
import { ask } from "../orchestrator";
import type { AskRequest, AskResponse, DietKey } from "../schema";
import { hasImportData, importRepo, loadImport } from "./import-repo";

const offlineLLM: LLMProvider = { structured: async () => Promise.reject(new Error("offline")) };
const offlineEmbedder: Embedder = { embed: async () => Promise.reject(new Error("offline")) };

describe.skipIf(!hasImportData())("1만 개 실데이터 — 검색·랭킹 v2", () => {
  const repo = importRepo();
  const d = loadImport();
  const idx = foodIndexOf(d.rows, d.countries);
  const food = (id: string) => idx.byId.get(id)!;
  const bySlug = (slug: string) => d.rows.find((r) => r.slug === slug)!;
  const run = (text: string, guest: Partial<NonNullable<AskRequest["guest"]>> = {}, extra: Partial<AskRequest> = {}) =>
    ask({ llm: offlineLLM, embedder: offlineEmbedder, repo, dailyBudgetUsd: 5 }, { text, input_mode: "text", guest: { diet: [], allergens: [], explored_countries: [], explored_foods: [], tag_weights: {}, ...guest }, ...extra }, null);
  const cardFoods = (r: AskResponse) => r.cards.map((c) => food(c.food_id));
  const ings = (id: string) => food(id).ingredients.map((i) => i.name);

  it("색인: 1만 개 전부, 재료 사전·이름 사전이 만들어진다", () => {
    // 같은 나라·같은 이름 중복은 하나로 (색인 검색 대상) — 1만 개 중 몇 개만
    expect(idx.foods.length).toBeGreaterThan(9_980);
    expect(idx.foods.length).toBeLessThanOrEqual(10_000);
    expect(idx.byId.size).toBe(10_000);
    expect(idx.ingWords.has("감자")).toBe(true);
    expect(idx.ingWords.has("병아리콩")).toBe(true);
    expect(idx.names.byKey.size).toBeGreaterThan(15_000);
  });

  describe("이름 인식 (두 글자 이름 956개 · 동명 47쌍)", () => {
    it("'아시아'는 아프가니스탄 음식 '아시'가 아니라 대륙", async () => {
      const r = await run("아시아 음식 추천해줘");
      expect(r.intent).toBe("recommend");
      expect(r.cards.length).toBeGreaterThan(0);
      for (const f of cardFoods(r)) expect(idx.continentOf.get(f.country_code)).toBe("asia");
    });
    it("'부자 되는'의 부자는 음식(이집트·시리아 아이스크림)이 아니다", async () => {
      const r = await run("부자 되는 음식 추천");
      expect(r.intent).toBe("recommend");
      expect(cardFoods(r).map((f) => f.name_ko)).not.toContain("부자");
    });
    it("음성 인식 오타 교정: 똠양꿍 → 똠 얌 꿍", async () => {
      const r = await run("똠양꿍은 어떤 음식이야?");
      expect(r.intent).toBe("explain_food");
      expect(r.not_in_map).toBeUndefined();
      expect(r.cards[0].slug).toBe("tom-yum-kung");
    });
    it("같은 이름은 유명한 쪽: 소바 → 일본 (브라질 소바가 아니라)", async () => {
      const r = await run("소바 알려줘");
      expect(r.cards[0].slug).toBe("soba");
    });
    it("같은 이름이라도 나라를 말하면 그 나라: 브라질 소바", async () => {
      const r = await run("브라질 소바 알려줘");
      expect(r.cards[0].slug).toBe("soba-br");
    });
  });

  describe("조건 해석 → 점수 (재료·맛·조리법·코스)", () => {
    it("감자 요리 → 감자가 든 음식, '지도에 없음'이 아니다", async () => {
      const r = await run("감자 요리 추천해줘");
      expect(r.not_in_map).toBeUndefined();
      expect(ings(r.cards[0].food_id).some((n) => n.includes("감자"))).toBe(true);
    });
    it("병아리콩 요리 → 병아리콩이 주재료", async () => {
      const r = await run("병아리콩 요리 알려줘");
      expect(ings(r.cards[0].food_id)).toContain("병아리콩");
      expect(r.cards[0].reason).toContain("병아리콩");
    });
    it("김치 들어간 요리 → 김치 자체가 아니라 김치가 든 음식", async () => {
      const r = await run("김치 들어간 요리 추천");
      expect(r.cards[0].slug).not.toBe("kimchi");
      expect(ings(r.cards[0].food_id).some((n) => n.includes("김치"))).toBe(true);
    });
    it("안 매운 태국 음식 → 태국 · spicy 태그 없음", async () => {
      const r = await run("안 매운 태국 음식 추천해줘");
      for (const f of cardFoods(r)) {
        expect(f.country_code).toBe("TH");
        expect(f.tags).not.toContain("spicy");
      }
    });
    it("돼지고기 빼고 → 돼지고기·차슈·베이컨이 든 음식 제외", async () => {
      const r = await run("돼지고기 빼고 중국 음식 추천해줘");
      for (const c of r.cards) expect(ings(c.food_id).join(" ")).not.toMatch(/돼지|차슈|베이컨|햄|라드|소시지/);
    });
    it("디저트 → dessert 코스, 튀긴 간식 → 튀김 계열 간식", async () => {
      const a = await run("디저트 추천해줘");
      expect(cardFoods(a)[0].course).toBe("dessert");
      const b = await run("튀긴 간식 뭐 있어?");
      expect(["deep_fried", "fried", "stir_fried"]).toContain(cardFoods(b)[0].method);
      expect(cardFoods(b)[0].course).toBe("snack");
    });
    it("코코넛 들어간 디저트 → 두 조건 모두", async () => {
      const r = await run("코코넛 들어간 디저트");
      const f = cardFoods(r)[0];
      expect(f.course).toBe("dessert");
      expect(f.ingredients.some((i) => i.name.includes("코코넛"))).toBe(true);
    });
    it("비 오는 날 → 따뜻한 국물 쪽 (상황 신호)", async () => {
      const r = await run("비 오는 날 먹기 좋은 음식");
      const f = cardFoods(r)[0];
      expect(f.tags.includes("soup") || f.tags.includes("hot") || ["soup", "stew"].includes(f.course ?? "")).toBe(true);
    });
  });

  describe("안전: 알레르기·식이는 1만 개 어디서도 새지 않는다", () => {
    it("질문 속 알레르기('땅콩 알레르기 있는데')도 하드 필터", async () => {
      const r = await run("땅콩 알레르기 있는데 태국 음식");
      for (const c of r.cards) {
        expect(hitsAllergen(food(c.food_id).allergens, ["peanut"])).toBe(false);
        expect(ings(c.food_id).join(" ")).not.toContain("땅콩");
      }
    });
    const QUESTIONS = ["오늘 뭐 먹지?", "디저트 추천해줘", "태국 음식 추천해줘", "매운 거 추천", "국물 요리", "간식 추천해줘", "유럽 음식", "해산물 요리 추천해줘", "아침 메뉴 추천", "빵 추천해줘"];
    const PROFILES: { diet: DietKey[]; allergens: ("peanut" | "shellfish" | "dairy" | "wheat" | "egg" | "nuts")[] }[] = [
      { diet: [], allergens: ["peanut", "nuts"] },
      { diet: [], allergens: ["shellfish"] },
      { diet: ["vegan"], allergens: [] },
      { diet: ["halal", "gluten_free"], allergens: ["dairy"] },
      { diet: ["vegetarian"], allergens: ["egg", "wheat"] },
    ];
    it(`${QUESTIONS.length}문항 × ${PROFILES.length}프로필: 카드 전부 식이(yes·depends)·알레르기 통과`, async () => {
      for (const p of PROFILES)
        for (const q of QUESTIONS) {
          const r = await run(q, p);
          for (const c of r.cards) {
            const f = food(c.food_id);
            expect(hitsAllergen(f.allergens, p.allergens), `${q} → ${f.name_ko} 알레르기`).toBe(false);
            for (const k of p.diet) expect(["yes", "depends"], `${q} → ${f.name_ko} ${k}`).toContain(f.diet[k]);
          }
        }
    });
    it("재료와 모순인 '비건 yes'(코조낙: 달걀·우유·버터)는 depends 로 낮추고, 비건 디저트는 확실한 것부터", async () => {
      expect(food(d.idOf.get("cozonac")!).diet.vegan).toBe("depends");
      const r = await run("비건 디저트 추천해줘");
      expect(r.cards.length).toBeGreaterThan(0);
      for (const f of cardFoods(r)) expect(f.diet.vegan).toBe("yes");
    });
  });

  describe("비슷한 음식 (재료 IDF 자카드 + 관계 + 태그)", () => {
    it("팟 타이와 비슷한 음식 → 대상 자신은 빼고, 이유가 붙는다", async () => {
      const r = await run("팟 타이랑 비슷한 음식 알려줘");
      expect(r.intent).toBe("compare_similar");
      expect(r.cards.length).toBeGreaterThan(0);
      expect(r.cards.map((c) => c.slug)).not.toContain("pad-thai");
    });
    it("오타 교정은 '…이랑 비슷한' 자리에서도: 똠양꿍 → 똠 얌 꿍과 비슷한 음식", async () => {
      const r = await run("똠양꿍이랑 비슷한 음식 알려줘");
      expect(r.intent).toBe("compare_similar");
      expect(r.cards.length).toBeGreaterThan(0);
      expect(r.cards.map((c) => c.slug)).not.toContain("tom-yum-kung");
    });
    it("'다른 나라에도' → 대상과 다른 나라만", async () => {
      const r = await run("만두 같은 음식 다른 나라에도 있어?");
      expect(r.intent).toBe("compare_similar");
      for (const f of cardFoods(r)) expect(f.country_code).not.toBe("KR");
    });
  });

  it("검증기: '아시아'·'부자 되는' 같은 말을 후보 밖 음식명으로 오인하지 않는다", () => {
    const sushi = d.idOf.get("sushi")!;
    const row = { id: sushi, name_ko: "스시", name_en: "Sushi", summary: "", history: null, culture_story: null, diet_note: null, origin_note: null, diet: bySlug("sushi").diet } as never;
    const v = validate({ speech: "아시아의 바다를 담은 일본의 스시, 부자 되는 기분으로 드셔 보세요.", picks: [{ food_id: sushi, reason: "x" }], follow_ups: ["a", "b"] }, { foods: [row], intent: "recommend", targetId: null, needDiet: [], ctx: { allergens: [] } as never, text: "추천" }, idx.foodNames);
    expect(v).toEqual({ ok: true });
  });

  it("같은 질문을 다시 하면(이미 본 음식 제외) 다른 음식이 나온다 — 막다른 답 없음", async () => {
    const first = await run("디저트 추천해줘");
    const second = await run("디저트 추천해줘", {}, { seen_food_ids: first.cards.map((c) => c.food_id) });
    expect(second.cards.length).toBeGreaterThan(0);
    expect(second.cards[0].food_id).not.toBe(first.cards[0].food_id);
  });
});
