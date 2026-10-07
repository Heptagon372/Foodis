import { describe, expect, it } from "vitest";
import { previewContent } from "@/lib/preview/source";
import { memoryCatalog, rankWithinCountry, searchRanked } from "./catalog";
import type { FoodSummary } from "./types";

const f = (slug: string, cc: string, fame_rank: number | null, o: Partial<FoodSummary> = {}) =>
  ({ id: `id-${slug}`, slug, name_ko: slug, name_en: slug, country_code: cc, fame_rank, image_url: null, ...o }) as FoodSummary;

const FOODS = [
  f("kimchi", "KR", 2, { name_ko: "김치", name_en: "Kimchi" }),
  f("bibimbap", "KR", 1, { name_ko: "비빔밥", name_en: "Bibimbap" }),
  f("kimchi-jjigae", "KR", null, { name_ko: "김치찌개", name_en: "Kimchi stew", image_url: "x" }),
  f("baek-kimchi", "KR", null, { name_ko: "백김치", name_en: "White kimchi" }),
  f("sushi", "JP", 1),
  f("ramen", "JP", 2),
  f("pizza", "IT", 1),
];
const CONTINENT: Record<string, string> = { KR: "asia", JP: "asia", IT: "europe" };
const catalog = memoryCatalog(async () => ({ foods: FOODS, continentOf: (c) => CONTINENT[c] }));

describe("카탈로그 메모리 구현 (food_cards · search_food_cards 와 같은 규칙)", () => {
  it("나라 안 순위를 1부터 빈칸 없이: 매긴 순위 → 사진 있는 것 → slug", () => {
    const kr = rankWithinCountry(FOODS).filter((x) => x.country_code === "KR");
    expect(kr.map((x) => [x.slug, x.fame_rank])).toEqual([["bibimbap", 1], ["kimchi", 2], ["kimchi-jjigae", 3], ["baek-kimchi", 4]]);
  });

  it("나라마다 상위 N개 — 모든 나라 1위 → 2위 순, 대륙 거르기", async () => {
    expect((await catalog.topFoods({ perCountry: 1 })).map((x) => x.slug)).toEqual(["pizza", "sushi", "bibimbap"]);
    expect((await catalog.topFoods({ perCountry: 2, continent: "asia" })).map((x) => x.slug)).toEqual(["sushi", "bibimbap", "ramen", "kimchi"]);
  });

  it("나라별 음식 수 · 여러 나라 대표 음식 · 키 조회 · 이름 사전", async () => {
    expect(await catalog.countryFoodCounts()).toEqual({ KR: 4, JP: 2, IT: 1 });
    expect((await catalog.foodsInCountries(["JP", "IT"], 2)).map((x) => x.slug)).toEqual(["pizza", "sushi"]);
    expect((await catalog.foodsByKeys(["id-ramen", "pizza", "nope"])).map((x) => x.slug).sort()).toEqual(["pizza", "ramen"]);
    expect((await catalog.foodNames()).find((x) => x.slug === "kimchi")).toEqual({ slug: "kimchi", name_ko: "김치", name_en: "Kimchi" });
  });

  it("검색: 정확히 같은 이름 → 앞부분 일치 → 유명도, 대소문자 무시", () => {
    const ranked = rankWithinCountry(FOODS);
    expect(searchRanked(ranked, "김치", 10).map((x) => x.slug)).toEqual(["kimchi", "kimchi-jjigae", "baek-kimchi"]);
    expect(searchRanked(ranked, "KIMCHI", 2).map((x) => x.slug)).toEqual(["kimchi", "kimchi-jjigae"]);
    expect(searchRanked(ranked, "  ", 10)).toEqual([]);
    // 띄어쓰기 무시: "김치 찌개" → 김치찌개, "kimchistew" → Kimchi stew
    expect(searchRanked(ranked, "김치 찌개", 10).map((x) => x.slug)).toEqual(["kimchi-jjigae"]);
    expect(searchRanked(ranked, "kimchistew", 10).map((x) => x.slug)).toEqual(["kimchi-jjigae"]);
  });
});

describe("미리보기 소스", () => {
  it("카탈로그 JSON 을 처음 쓸 때 읽어 같은 조회를 준다", async () => {
    const top = await previewContent.topFoods({ perCountry: 1 });
    expect(top.length).toBeGreaterThan(10);
    expect(new Set(top.map((x) => x.country_code)).size).toBe(top.length);
    expect(top.every((x) => x.fame_rank === 1)).toBe(true);
    const counts = await previewContent.countryFoodCounts();
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(await previewContent.countFoods());
    expect((await previewContent.searchFoods("김치", 5))[0].slug).toBe("kimchi");
    const kr = await previewContent.getCountry("KR");
    expect(kr!.foods[0].fame_rank).toBe(1);
  });
});
