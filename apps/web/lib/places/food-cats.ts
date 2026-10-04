// 맛집탐방 음식 분류: 나라로 한식·중식·일식·양식·기타 하나 + 식단으로 채식·할랄 (겹칠 수 있음). 순수 함수 — 서버·클라이언트 공용.
import type { Country, FoodSummary } from "@/lib/content/types";

export type FoodCat = "korean" | "chinese" | "japanese" | "western" | "veg" | "halal" | "other";
export type ExploreFood = { slug: string; name_ko: string; name_en: string; flag: string; image_url: string | null; cats: FoodCat[] };

export const FOOD_CATS: [FoodCat | "all", string][] = [
  ["all", "전체"],
  ["korean", "한식"],
  ["chinese", "중식"],
  ["japanese", "일식"],
  ["western", "양식"],
  ["veg", "채식"],
  ["halal", "할랄"],
  ["other", "기타"],
];

const CHINESE = new Set(["CN", "TW", "HK", "MO"]);
const WESTERN_OUTSIDE_EUROPE = new Set(["US", "CA", "AU", "NZ"]);

export function catsOf(f: Pick<FoodSummary, "country_code" | "diet">, c: Pick<Country, "continent_group"> | undefined): FoodCat[] {
  const cc = f.country_code;
  const out: FoodCat[] = [
    cc === "KR" ? "korean" : CHINESE.has(cc) ? "chinese" : cc === "JP" ? "japanese" : c?.continent_group === "europe" || WESTERN_OUTSIDE_EUROPE.has(cc) ? "western" : "other",
  ];
  if (f.diet.vegetarian === "yes" || f.diet.vegan === "yes") out.push("veg");
  if (f.diet.halal === "yes") out.push("halal");
  return out;
}

export function toExploreFoods(foods: FoodSummary[], countries: Country[]): ExploreFood[] {
  const byCode = new Map(countries.map((c) => [c.code, c]));
  const rank = (r?: number | null) => r ?? Number.MAX_SAFE_INTEGER;
  return [...foods]
    .sort((a, b) => rank(a.fame_rank) - rank(b.fame_rank))
    .map((f) => ({ slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, flag: f.flag, image_url: f.image_url, cats: catsOf(f, byCode.get(f.country_code)) }));
}
