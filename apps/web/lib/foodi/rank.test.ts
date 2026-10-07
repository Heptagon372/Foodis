// 검색·랭킹 v2 단위 테스트 (docs/design/19): 이름 인식 · 질의 해석 · 점수식 · 다양화 · 유사도 · 알레르기 표기 · 식이 모순
import { describe, expect, it } from "vitest";
import { canonAllergens, hitsAllergen, avoidTerms } from "@/lib/diet/allergens";
import { checkDiet } from "@/lib/diet/consistency";
import { buildFoodIndex, type IndexedFood } from "./food-index";
import { buildNameIndex, editDistance, fameScore, findMentions, fuzzyFind } from "./names";
import { emptySpec, parseQuery } from "./query";
import { coverage, jaccard, mmr, scoreFoods, similarity, tasteScore, tierFilter, violates, type Scored } from "./rank";
import { emptyDiet, type UserContext } from "./repo";
import type { DietLevel } from "./schema";

const yes = { vegan: "yes", vegetarian: "yes", halal: "yes", gluten_free: "yes", dairy_free: "yes" } as Record<string, DietLevel> as IndexedFood["diet"];
let n = 0;
const food = (p: Partial<IndexedFood> & { name_ko: string }): IndexedFood => ({
  id: `f${++n}`, slug: p.name_ko, name_en: p.name_ko, country_code: "KR", tags: [], method: null, course: null, diet: yes, allergens: [], ingredients: [],
  fame_rank: null, has_image: false, has_story: false, has_history: false, ...p,
});
const ctx = (p: Partial<UserContext> = {}): UserContext => ({ userId: null, diet: emptyDiet(), allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [], ...p });

describe("이름 인식", () => {
  const idx = buildNameIndex([
    { id: "aush", name_ko: "아시", name_en: "Aush", country_code: "AF" },
    { id: "booza", name_ko: "부자", name_en: "Booza", country_code: "SY", fame_rank: 4, links: 10 },
    { id: "bouza", name_ko: "부자", name_en: "Bouza", country_code: "EG", fame_rank: 9, links: 3 },
    { id: "tyk", name_ko: "똠 얌 꿍", name_en: "Tom yum kung", country_code: "TH" },
    { id: "roast", name_ko: "로스트", name_en: "Rost", country_code: "BD" },
    { id: "oman", name_ko: "오만 할와", name_en: "Oman halwa", country_code: "OM" },
  ]);
  const ids = (t: string) => findMentions(t, idx).flatMap((m) => m.entries.map((e) => e.id));
  it("짧은 이름은 경계 + 음식 맥락 + 뒤따르는 말까지 본다", () => {
    expect(ids("아시아 음식 추천해줘")).toEqual([]);
    expect(ids("부자 되는 음식 추천")).toEqual([]);
    expect(ids("부자가 되고 싶어")).toEqual([]); // 음식 이야기가 아니다
    expect(ids("부자 알려줘")).toEqual(["booza", "bouza"]);
    expect(ids("로스트 치킨 같은 요리")).toEqual([]); // 더 긴 이름의 일부
    expect(ids("로스트는 어떤 음식이야?")).toEqual(["roast"]);
  });
  it("띄어쓰기를 무시하고 최장 일치", () => {
    expect(ids("똠얌꿍 먹고 싶어")).toEqual(["tyk"]);
  });
  it("자모 편집거리 오타 교정 (3음절 1까지)", () => {
    expect(editDistance([1, 2, 3], [1, 2, 4])).toBe(1);
    expect(fuzzyFind("똠양꿍", idx)?.id).toBe("tyk");
    expect(fuzzyFind("김치찌개", idx)).toBeNull();
  });
  it("대표성: 나라 안 순위와 세계 유명도를 섞는다", () => {
    expect(fameScore(1)).toBe(1);
    expect(fameScore(10)).toBeCloseTo(0.303, 2);
    expect(fameScore(null, 80)).toBe(1);
    expect(fameScore(null, 2)).toBe(0);
    // 음식 5개뿐인 나라의 1위(L=21)는 김치(1위, L=77)보다 낮다
    expect(fameScore(1, 21)).toBeLessThan(fameScore(1, 77) - 0.2);
    expect(fameScore(null, null)).toBe(0.15);
  });
});

describe("질의 해석", () => {
  const idx = buildFoodIndex(
    [
      food({ name_ko: "감자전", ingredients: [{ name: "감자", role: "main" }, { name: "소금", role: "seasoning" }, { name: "꿀", role: "seasoning" }] }),
      food({ name_ko: "감자탕", ingredients: [{ name: "돼지 등뼈", role: "main" }, { name: "감자", role: "sub" }] }),
      food({ name_ko: "닭죽", ingredients: [{ name: "닭고기", role: "main" }, { name: "쌀", role: "main" }] }),
      food({ name_ko: "닭강정", ingredients: [{ name: "닭고기", role: "main" }, { name: "꿀", role: "sub" }] }),
      food({ name_ko: "쌀국수", ingredients: [{ name: "쌀", role: "main" }] }),
    ],
    [{ code: "KR", name_ko: "대한민국", name_en: "South Korea", continent_group: "asia" }],
  );
  it("부정: 안 매운 · 맵지 않은 · 매운 거 말고 → notTags", () => {
    for (const q of ["안 매운 음식", "맵지 않은 거", "매운 거 말고"]) expect(parseQuery(q, idx).notTags, q).toEqual(["spicy"]);
    expect(parseQuery("매운 음식", idx).tags).toEqual(["spicy"]);
  });
  it("재료 묶음 개념은 단어 전체를 차지한다: '돼지고기 빼고'가 고기 전부 빼기가 되지 않는다", () => {
    const s = parseQuery("돼지고기 빼고 추천", idx);
    expect(s.notIngredients.map((a) => a.label)).toEqual(["돼지고기"]);
    expect(s.notTags).toEqual([]);
    expect(s.notIngredients[0].names.has("돼지 등뼈")).toBe(true);
  });
  it("데이터 재료 사전 + 한 글자 재료는 조사가 붙을 때만", () => {
    expect(parseQuery("감자로 만든 요리", idx).ingredients.map((a) => a.label)).toEqual(["감자"]);
    expect(parseQuery("꿀로 만든 간식", idx).ingredients.map((a) => a.label)).toEqual(["꿀"]);
    expect(parseQuery("꿀벌 이야기", idx).ingredients).toEqual([]);
    expect(parseQuery("쌀 요리", idx).tags).toEqual(["rice"]); // 맛·코스 낱말이면 그쪽 뜻
  });
  it("상황 → 약한 신호, 코스 · 조리법 묶음, 알레르기", () => {
    const s = parseQuery("비 오는 날 튀긴 간식", idx);
    expect(s.soft.tags).toContain("hot");
    expect(s.courses).toEqual([["snack"]]);
    expect(s.methods).toEqual([["deep_fried", "fried"]]);
    expect(parseQuery("땅콩 알레르기 있어요", idx).allergens).toEqual(["peanut"]);
    expect(parseQuery("땅콩 알레르기 있어요", idx).ingredients).toEqual([]);
  });
});

describe("점수식", () => {
  const potato = food({ name_ko: "감자전", tags: ["crunchy"], course: "side", ingredients: [{ name: "감자", role: "main" }], fame_rank: 5, has_image: true });
  const stew = food({ name_ko: "감자탕", tags: ["soup", "spicy", "hot"], course: "stew", ingredients: [{ name: "감자", role: "sub" }], fame_rank: 1, has_image: true, has_story: true });
  const cake = food({ name_ko: "케이크", tags: ["sweet"], course: "dessert", fame_rank: 1, country_code: "FR" });
  const idx = buildFoodIndex([potato, stew, cake], [{ code: "KR", name_ko: "대한민국", name_en: "Korea", continent_group: "asia" }, { code: "FR", name_ko: "프랑스", name_en: "France", continent_group: "europe" }]);
  const spec = parseQuery("감자 요리", idx);
  it("조건 충족도: 주재료 1 · 부재료 .7 · 없음 0, 이유 문구", () => {
    expect(coverage(idx.byId.get(potato.id)!, spec)).toMatchObject({ value: 1, hard: 1, hits: ["주재료 감자"] });
    expect(coverage(idx.byId.get(stew.id)!, spec)?.value).toBeCloseTo(0.7);
    expect(coverage(idx.byId.get(cake.id)!, spec)?.value).toBe(0);
    expect(coverage(idx.byId.get(cake.id)!, emptySpec())).toBeNull();
  });
  it("켜진 신호만 가중치를 다시 정규화해 더한다 → 조건 맞는 음식이 유명도를 이긴다", () => {
    const s = scoreFoods(idx.foods, { intent: "recommend", spec, vec: null, ctx: ctx(), needDiet: [], seed: "t" });
    const best = [...s].sort((a, b) => b.score - a.score)[0];
    expect(best.food.name_ko).toBe("감자전");
    expect(Object.keys(best.parts).sort()).toEqual(["fame", "qual", "slot"]); // 임베딩·취향·탐험 없음 → 꺼짐
  });
  it("계단식: 조건을 다 맞춘 후보가 충분하면 그 안에서만", () => {
    const s = scoreFoods(idx.foods, { intent: "recommend", spec, vec: null, ctx: ctx(), needDiet: [], seed: "t" });
    expect(tierFilter(s, 1).map((x) => x.food.name_ko)).toEqual(["감자전"]);
    expect(tierFilter(s, 2).map((x) => x.food.name_ko).sort()).toEqual(["감자전", "감자탕"]);
  });
  it("하드 조건: 빼 달라는 맛·재료", () => {
    expect(violates(idx.byId.get(stew.id)!, parseQuery("안 매운 거", idx))).toBe(true);
    expect(violates(idx.byId.get(potato.id)!, parseQuery("감자 빼고", idx))).toBe(true);
    expect(violates(idx.byId.get(cake.id)!, parseQuery("감자 빼고", idx))).toBe(false);
  });
  it("Food DNA 코사인: 태그가 많다고 유리하지 않다", () => {
    expect(tasteScore(potato, {})).toBeNull();
    expect(tasteScore(food({ name_ko: "a", tags: ["sweet"] }), { sweet: 1 })).toBe(1);
    expect(tasteScore(food({ name_ko: "b", tags: ["sweet", "soft", "rich", "cold"] }), { sweet: 1 })).toBe(0.5);
  });
  it("새로움: 안 가본 나라 1 · 가본 나라 .4 · 본 음식 0, 의미 신호는 후보 안 min-max", () => {
    const s = scoreFoods(idx.foods, { intent: "recommend", spec: emptySpec(), vec: new Map([[potato.id, 0.5], [stew.id, 0.3]]), ctx: ctx({ exploredCountries: ["KR"], exploredFoodIds: [stew.id] }), needDiet: [], seed: "t" });
    const by = (f: IndexedFood) => s.find((x) => x.food.id === f.id)!.parts;
    expect([by(cake).novel, by(potato).novel, by(stew).novel]).toEqual([1, 0.4, 0]);
    expect([by(potato).sem, by(stew).sem, by(cake).sem]).toEqual([1, 0, 0]);
  });
  it("MMR: 같은 나라·같은 맛만 줄줄이 나오지 않는다", () => {
    const mk = (name: string, cc: string, score: number): Scored => ({ food: food({ name_ko: name, country_code: cc, tags: ["sweet"] }), score, coverage: 1, parts: {}, why: [] });
    const picked = mmr([mk("a", "KR", 0.9), mk("b", "KR", 0.89), mk("c", "KR", 0.88), mk("d", "JP", 0.8)], 2);
    expect(picked.map((p) => p.food.name_ko)).toEqual(["a", "d"]);
  });
});

describe("비슷한 음식", () => {
  const common = (k: number) => Array.from({ length: k }, (_, i) => food({ name_ko: `x${i}`, ingredients: [{ name: "설탕", role: "main" }] }));
  const hummus = food({ name_ko: "후무스", country_code: "LB", tags: ["nutty", "creamy"], course: "side", ingredients: [{ name: "병아리콩", role: "main" }, { name: "타히니", role: "main" }, { name: "설탕", role: "seasoning" }] });
  const falafel = food({ name_ko: "팔라펠", country_code: "EG", tags: ["crunchy", "nutty"], method: "deep_fried", course: "snack", ingredients: [{ name: "병아리콩", role: "main" }, { name: "설탕", role: "seasoning" }] });
  const candy = food({ name_ko: "사탕", country_code: "LB", tags: ["sweet"], ingredients: [{ name: "설탕", role: "main" }] });
  const idx = buildFoodIndex([hummus, falafel, candy, ...common(50)], []);
  it("재료 IDF 가중 자카드: 흔한 설탕보다 드문 병아리콩을 공유하는 쪽이 훨씬 비슷하다", () => {
    const a = similarity(idx.byId.get(hummus.id)!, idx.byId.get(falafel.id)!, idx, {});
    const b = similarity(idx.byId.get(hummus.id)!, idx.byId.get(candy.id)!, idx, {});
    expect(a.sim).toBeGreaterThan(b.sim + 0.15);
    expect(a.why[0]).toBe("같은 재료 병아리콩");
  });
  it("검수된 관계와 임베딩 코사인이 있으면 더한다", () => {
    const base = similarity(idx.byId.get(hummus.id)!, idx.byId.get(candy.id)!, idx, {}).sim;
    expect(similarity(idx.byId.get(hummus.id)!, idx.byId.get(candy.id)!, idx, { rel: "similar_taste" }).sim).toBeGreaterThan(base);
    expect(similarity(idx.byId.get(hummus.id)!, idx.byId.get(candy.id)!, idx, { cos: 1 }).sim).toBeGreaterThan(base);
  });
  it("자카드", () => expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3));
});

describe("알레르기 표기 · 식이 모순", () => {
  it("한국어(1만 개 정리본)·영어(어드민) 표기를 같은 키로", () => {
    expect(canonAllergens(["우유", "밀", "계란", "어류", "견과", "갑각류", "조개류", "dairy", "알 수 없음"])).toEqual(["dairy", "wheat", "egg", "fish", "nuts", "shellfish", "mollusc", "알 수 없음"]);
    expect(hitsAllergen(["땅콩"], ["peanut"])).toBe(true);
    expect(hitsAllergen(["우유"], ["peanut"])).toBe(false);
    expect(avoidTerms(["peanut"])).toEqual(["peanut", "땅콩"]);
  });
  it("비건 yes 인데 우유·버터 → depends, 땅콩버터·코코넛 밀크·콜라드는 그대로", () => {
    const d = { ...yes };
    expect(checkDiet(d, ["효모 반죽", "달걀", "우유", "버터"])).toMatchObject({ diet: { vegan: "depends", vegetarian: "yes" }, downgraded: ["vegan"] });
    expect(checkDiet(d, ["땅콩버터", "코코넛 밀크", "콜라드 그린"]).downgraded).toEqual([]);
    expect(checkDiet(d, ["밀가루", "햄"]).downgraded).toEqual(["vegetarian", "vegan"]);
    expect(checkDiet(d, ["밀고기", "간장"]).downgraded).toEqual([]);
  });
});

describe("검증기: 후보 밖 음식 제안", () => {
  const row = { id: "k", name_ko: "김치", name_en: "Kimchi", summary: "만두 소로도 써요.", history: null, culture_story: null, diet_note: null, origin_note: null, ingredients: [], diet: { vegan: "depends" } } as never;
  const names = [
    { id: "k", name_ko: "김치", name_en: "Kimchi" },
    { id: "m", name_ko: "만두", name_en: "Mandu" },
  ];
  const g = { foods: [row], intent: "culture_story" as const, targetId: "k", needDiet: [], ctx: { allergens: [] } as never, text: "음식 문화 이야기" };
  const out = (speech: string) => ({ speech, picks: [{ food_id: "k", reason: "x" }], follow_ups: ["a", "b"] });
  it("DB 문장을 옮긴 것은 허용, 그 말로 다음 탐험을 권하면 거부 (라이브 평가 D05)", async () => {
    const { validate } = await import("./generate");
    expect(validate(out("김치는 만두 소로도 써요."), g, names)).toEqual({ ok: true });
    expect(validate(out("김치 이야기였어요. 다음 탐험으로 중국 만두를 살펴보는 건 어때요."), g, names)).toMatchObject({ ok: false });
  });
});
