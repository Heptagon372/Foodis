// 카탈로그 조회의 메모리 구현 — 미리보기 소스(lib/preview/source.ts)와 테스트가 쓴다.
// live 는 같은 규칙을 SQL 로 한다 (supabase/migrations/0014_food_catalog.sql 의 food_cards · search_food_cards). 규칙을 바꾸면 둘 다 바꾼다.
import type { ContentSource, FoodSummary } from "./types";

type CatalogQueries = Pick<ContentSource, "countryFoodCounts" | "topFoods" | "foodsInCountries" | "searchFoods" | "foodsByKeys" | "foodNames">;

/** 나라 안 순위를 1부터 빈칸 없이 다시 매긴다: 매겨진 순위 → 사진 있는 것 → slug (food_cards 뷰의 row_number 와 같은 규칙) */
export function rankWithinCountry(foods: FoodSummary[]): FoodSummary[] {
  const byCountry = new Map<string, FoodSummary[]>();
  for (const f of foods) (byCountry.get(f.country_code) ?? byCountry.set(f.country_code, []).get(f.country_code)!).push(f);
  const rank = (r?: number | null) => r ?? Number.MAX_SAFE_INTEGER;
  return [...byCountry.values()].flatMap((list) =>
    [...list]
      .sort((a, b) => rank(a.fame_rank) - rank(b.fame_rank) || Number(!a.image_url) - Number(!b.image_url) || a.slug.localeCompare(b.slug))
      .map((f, i) => ({ ...f, fame_rank: i + 1 })),
  );
}

/** 모든 나라의 1위 → 2위 → … (같은 순위는 나라 코드 순) */
export const byRankThenCountry = (a: FoodSummary, b: FoodSummary) => a.fame_rank! - b.fame_rank! || a.country_code.localeCompare(b.country_code);

/** 띄어쓰기를 빼고 소문자로 — "팟 타이" 와 "팟타이" 를 같은 이름으로 */
const compact = (s: string) => s.replace(/ /g, "").toLowerCase();

/** 이름 검색: 띄어쓰기 무시 부분 일치. 순서는 정확히 같은 이름 → 앞부분 일치 → 나라 안 유명도 → 짧은 이름 (search_food_cards 와 같은 규칙) */
export function searchRanked(foods: FoodSummary[], q: string, limit: number): FoodSummary[] {
  const t = compact(q);
  if (!t) return [];
  const exact = (f: FoodSummary) => compact(f.name_ko) === t || compact(f.name_en) === t;
  const prefix = (f: FoodSummary) => compact(f.name_ko).startsWith(t) || compact(f.name_en).startsWith(t);
  return foods
    .filter((f) => `${compact(f.name_ko)}|${compact(f.name_en)}`.includes(t))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || Number(prefix(b)) - Number(prefix(a)) || a.fame_rank! - b.fame_rank! || a.name_ko.length - b.name_ko.length || a.slug.localeCompare(b.slug))
    .slice(0, Math.min(Math.max(limit, 1), 100));
}

/** 메모리 목록 위의 카탈로그 조회. load 는 처음 부를 때 한 번만 (목록은 rankWithinCountry 로 순위를 다시 매긴다) */
export function memoryCatalog(load: () => Promise<{ foods: FoodSummary[]; continentOf: (code: string) => string | undefined }>): CatalogQueries {
  let data: Promise<{ foods: FoodSummary[]; continentOf: (code: string) => string | undefined }> | null = null;
  const get = () => (data ??= load().then((d) => ({ ...d, foods: rankWithinCountry(d.foods) })));
  return {
    async countryFoodCounts() {
      const counts: Record<string, number> = {};
      for (const f of (await get()).foods) counts[f.country_code] = (counts[f.country_code] ?? 0) + 1;
      return counts;
    },
    async topFoods({ perCountry, continent }) {
      const { foods, continentOf } = await get();
      return foods.filter((f) => f.fame_rank! <= perCountry && (!continent || continentOf(f.country_code) === continent)).sort(byRankThenCountry);
    },
    async foodsInCountries(codes, limit) {
      const want = new Set(codes);
      return (await get()).foods.filter((f) => want.has(f.country_code)).sort(byRankThenCountry).slice(0, limit);
    },
    async searchFoods(q, limit) {
      return searchRanked((await get()).foods, q, limit);
    },
    async foodsByKeys(keys) {
      const want = new Set(keys);
      return (await get()).foods.filter((f) => want.has(f.id) || want.has(f.slug));
    },
    async foodNames() {
      return (await get()).foods.map(({ slug, name_ko, name_en }) => ({ slug, name_ko, name_en }));
    },
  };
}
