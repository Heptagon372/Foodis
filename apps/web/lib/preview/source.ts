// Supabase 키가 없을 때 쓰는 미리보기 데이터 소스. 화면(ContentSource)과 푸디(FoodisRepo) 둘 다 제공한다.
// FoodisRepo 를 같은 인터페이스로 구현하므로, 키 없이도 실제 Orchestrator 코드 경로(키워드 검색 → 템플릿 답)가 돈다.
import type { ContentSource, Country, FoodDetail, FoodSummary } from "@/lib/content/types";
import { emptyDiet, fitsProfile, type FoodisRepo, type FoodRow } from "@/lib/foodi/repo";
import { rankByKeywords } from "@/lib/foodi/keywords";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";
import { PREVIEW_COUNTRIES } from "./countries";
import { PREVIEW_FOODS, PREVIEW_RELATIONS, previewId, type PreviewFood } from "./foods";
import { PREVIEW_IMAGES } from "./images";

const countryOf = (cc: string): Country => PREVIEW_COUNTRIES.find((c) => c.code === cc)!;
const fullDiet = (d: PreviewFood["diet"]) => Object.fromEntries(DIET_KEYS.map((k) => [k, d[k] ?? "unknown"])) as Record<DietKey, DietLevel>;
const wiki = (f: PreviewFood) => `https://en.wikipedia.org/wiki/${encodeURIComponent(f.name_en.replace(/ /g, "_"))}`;

function summaryOf(f: PreviewFood): FoodSummary {
  const c = countryOf(f.cc);
  return {
    id: previewId(f.n), slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, country_code: f.cc,
    flag: c.flag_emoji, accent: c.accent_color, country_name: c.name_ko,
    summary: f.summary, taste_tags: f.tags, image_url: PREVIEW_IMAGES[f.slug]?.url ?? null, image_credit: PREVIEW_IMAGES[f.slug]?.credit ?? null, diet: fullDiet(f.diet), allergens: f.allergens ?? [],
  };
}

const bySlug = new Map(PREVIEW_FOODS.map((f) => [f.slug, f]));
const byId = new Map(PREVIEW_FOODS.map((f) => [previewId(f.n), f]));

/** 관계는 양방향으로 보여준다 (DB 에서는 s06 이 양방향 행을 만든다) */
const relationsOf = (slug: string) =>
  PREVIEW_RELATIONS.flatMap((r) => (r.from === slug ? [{ ...r, other: r.to }] : r.to === slug ? [{ ...r, other: r.from }] : []));

export const previewContent: ContentSource = {
  mode: "preview",
  listCountries: async () => PREVIEW_COUNTRIES,
  listFoods: async () => PREVIEW_FOODS.map(summaryOf),
  async getFood(slug) {
    const f = bySlug.get(slug);
    if (!f) return null;
    const detail: FoodDetail = {
      ...summaryOf(f),
      name_local: f.name_local ?? null,
      country: countryOf(f.cc),
      region_in_country: null,
      origin_note: f.origin_note ?? null,
      history: f.history ?? null,
      culture_story: f.culture ?? null,
      cooking_method: f.method ?? null,
      course_type: f.course ?? null,
      diet_note: f.diet_note ?? null,
      ingredients: f.ingredients.map((name, i) => ({ slug: name, name_ko: name, role: i < 2 ? "main" : "seasoning" })),
      sources: [{ field: "summary", url: wiki(f), title: `Wikipedia — ${f.name_en}`, license: "CC BY-SA 4.0" }],
      relations: relationsOf(slug).map((r) => ({ type: r.type, description: r.description, food: summaryOf(bySlug.get(r.other)!) })),
      sameCountry: PREVIEW_FOODS.filter((o) => o.cc === f.cc && o.slug !== slug).map(summaryOf),
    };
    return detail;
  },
  async getIngredient(slug) {
    const name = decodeURIComponent(slug);
    const foods = PREVIEW_FOODS.filter((f) => f.ingredients.includes(name));
    return foods.length ? { ingredient: { slug: name, name_ko: name, name_en: null, category: null }, foods: foods.map(summaryOf) } : null;
  },
  async getCountry(code) {
    const country = PREVIEW_COUNTRIES.find((c) => c.code === code);
    return country ? { country, foods: PREVIEW_FOODS.filter((f) => f.cc === code).map(summaryOf) } : null;
  },
};

function rowOf(f: PreviewFood): FoodRow {
  const c = countryOf(f.cc);
  return {
    id: previewId(f.n), slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, country_code: f.cc,
    origin_note: f.origin_note ?? null, summary: f.summary, history: f.history ?? null, culture_story: f.culture ?? null,
    taste_tags: f.tags, image_url: PREVIEW_IMAGES[f.slug]?.url ?? null, image_credit: PREVIEW_IMAGES[f.slug]?.credit ?? null, allergens: f.allergens ?? [], diet: fullDiet(f.diet), diet_note: f.diet_note ?? null, country: { name_ko: c.name_ko, flag_emoji: c.flag_emoji, accent_color: c.accent_color },
    sources: [{ title: `Wikipedia — ${f.name_en}`, url: wiki(f) }],
  };
}

const okFor = (f: PreviewFood, need: DietKey[], avoid: string[]) => fitsProfile({ diet: fullDiet(f.diet), allergens: f.allergens ?? [] }, need, avoid);

/** 메모리 FoodisRepo. 기록·캐시는 프로세스 메모리에만 (서버 재시작 시 사라짐). */
export function previewRepo(): FoodisRepo {
  const cache = new Map<string, { payload: unknown; exp: number }>();
  const pick = (text: string, p: { needDiet: DietKey[]; ctx: { allergens: string[]; exploredCountries: string[]; tagWeights: Record<string, number> }; excludeFoodIds: string[]; countryCode: string | null; count: number }) => {
    const all = PREVIEW_FOODS.filter((f) => okFor(f, p.needDiet, p.ctx.allergens) && !p.excludeFoodIds.includes(previewId(f.n)) && (!p.countryCode || f.cc === p.countryCode));
    // 미리보기는 임베딩이 없어 실서비스의 키워드 대체 검색과 같은 순위 규칙을 쓴다. 동점은 질문마다 조금씩 섞이도록 고정 셔플
    const shuffled = [...all].sort((a, b) => ((a.n * 7919 + text.length) % 13) - ((b.n * 7919 + text.length) % 13));
    const rows = shuffled.map((f) => ({ f, name_ko: f.name_ko, name_en: f.name_en, country_code: f.cc, taste_tags: f.tags }));
    return rankByKeywords(rows, text, p.ctx.exploredCountries, p.ctx.tagWeights).slice(0, p.count).map((x) => previewId(x.f.n));
  };
  return {
    matchFoods: async (p) => pick("", p),
    keywordFoods: async (text, p) => pick(text, p),
    getFoods: async (ids) => ids.flatMap((id) => (byId.has(id) ? [rowOf(byId.get(id)!)] : [])),
    getRelatedFoodIds: async (id, limit, type) => {
      const f = byId.get(id);
      return f ? relationsOf(f.slug).filter((r) => !type || r.type === type).slice(0, limit).map((r) => previewId(bySlug.get(r.other)!.n)) : [];
    },
    countries: async () => PREVIEW_COUNTRIES.map(({ code, name_ko, name_en, continent_group }) => ({ code, name_ko, name_en, continent_group })),
    allFoodNames: async () => PREVIEW_FOODS.map((f) => ({ id: previewId(f.n), name_ko: f.name_ko, name_en: f.name_en, country_code: f.cc })),
    getUserContext: async (userId) => ({ userId, diet: emptyDiet(), allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [] }),
    recordConversation: async () => null,
    recordUsage: async () => {},
    markExplored: async () => {},
    usageTodayUsd: async () => 0,
    cacheGet: async <T,>(k: string) => {
      const hit = cache.get(k);
      return hit && hit.exp > Date.now() ? (hit.payload as T) : null;
    },
    cacheSet: async (k, _kind, payload, ttlHours) => void cache.set(k, { payload, exp: Date.now() + ttlHours * 3_600_000 }),
  };
}
