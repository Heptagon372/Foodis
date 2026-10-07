// Supabase 키가 없을 때 쓰는 미리보기 데이터 소스. 화면(ContentSource)과 푸디(FoodisRepo) 둘 다 제공한다.
// FoodisRepo 를 같은 인터페이스로 구현하므로, 키 없이도 실제 Orchestrator 코드 경로(키워드 검색 → 템플릿 답)가 돈다.
// 카탈로그(catalog.json 2천여 개)·미디어(media.json)는 미리보기를 처음 쓸 때만 읽는다 — live 서버가 수 MB JSON 을 들고 있지 않게.
import { memoryCatalog } from "@/lib/content/catalog";
import type { ContentSource, Country, FoodDetail, FoodSummary, GalleryPhoto, YouTubeVideo } from "@/lib/content/types";
import { canonAllergens } from "@/lib/diet/allergens";
import type { IndexedFood } from "@/lib/foodi/food-index";
import { emptyDiet, type FoodisRepo, type FoodRow } from "@/lib/foodi/repo";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";
import { PREVIEW_COUNTRIES } from "./countries";
import { PREVIEW_FOODS, PREVIEW_RELATIONS, previewId, type PreviewFood } from "./foods";
import { PREVIEW_IMAGES } from "./images";

/** 전체 음식 목록 (tools/gen-preview-catalog.mjs 가 foodis-data 시드·근거 수집 결과로 만든다).
 *  이름 · 나라 · 유명도 순위 · 사진만 확인된 상태 — 소개·식이 정보는 검수 전이라 비워 둔다 */
type CatalogItem = { s: string; ko: string; en: string; cc: string; r: number; tg: string[]; img?: string; cr?: string; w: string };
// 미디어(갤러리·유튜브)는 tools/gen-preview-media.mjs 가 s10/s11 결과로 만든다
type MediaMap = Record<string, { gallery: GalleryPhoto[]; youtube: YouTubeVideo | null }>;

const countryOf = (cc: string): Country => PREVIEW_COUNTRIES.find((c) => c.code === cc)!;
const fullDiet = (d: PreviewFood["diet"]) => Object.fromEntries(DIET_KEYS.map((k) => [k, d[k] ?? "unknown"])) as Record<DietKey, DietLevel>;
const wiki = (f: PreviewFood) => `https://en.wikipedia.org/wiki/${encodeURIComponent(f.name_en.replace(/ /g, "_"))}`;
const UNKNOWN_DIET = Object.fromEntries(DIET_KEYS.map((k) => [k, "unknown"])) as Record<DietKey, DietLevel>;

const bySlug = new Map(PREVIEW_FOODS.map((f) => [f.slug, f]));
const byId = new Map(PREVIEW_FOODS.map((f) => [previewId(f.n), f]));

/** 관계는 양방향으로 보여준다 (DB 에서는 s06 이 양방향 행을 만든다) */
const relationsOf = (slug: string) =>
  PREVIEW_RELATIONS.flatMap((r) => (r.from === slug ? [{ ...r, other: r.to }] : r.to === slug ? [{ ...r, other: r.from }] : []));

/** 카탈로그·미디어를 처음 쓸 때 한 번 읽어 화면용 목록을 만든다 */
type PreviewData = {
  all: FoodSummary[];
  summaryOf: (f: PreviewFood) => FoodSummary;
  extraBySlug: Map<string, { c: CatalogItem; summary: FoodSummary }>;
  media: MediaMap;
};
let loaded: Promise<PreviewData> | null = null;
const data = () =>
  (loaded ??= Promise.all([import("./catalog.json"), import("./media.json")]).then(([c, m]): PreviewData => {
    const catalog = c.default as CatalogItem[];
    const catalogBySlug = new Map(catalog.map((x) => [x.s, x]));
    const summaryOf = (f: PreviewFood): FoodSummary => {
      const country = countryOf(f.cc);
      const cat = catalogBySlug.get(f.slug);
      return {
        id: previewId(f.n), slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, country_code: f.cc,
        flag: country.flag_emoji, accent: country.accent_color, country_name: country.name_ko,
        summary: f.summary, taste_tags: f.tags, image_url: PREVIEW_IMAGES[f.slug]?.url ?? cat?.img ?? null, image_credit: PREVIEW_IMAGES[f.slug]?.credit ?? cat?.cr ?? null, diet: fullDiet(f.diet), allergens: f.allergens ?? [], ingredient_names: f.ingredients,
        fame_rank: cat?.r ?? null,
      };
    };
    // 직접 쓴 미리보기 음식(PREVIEW_FOODS)에 없는 카탈로그 음식. id 는 1000번대부터
    const written = new Set(PREVIEW_FOODS.map((f) => f.slug));
    const extra = catalog
      .filter((x) => !written.has(x.s))
      .map((x, i) => {
        const country = countryOf(x.cc);
        const summary: FoodSummary = {
          id: previewId(1000 + i), slug: x.s, name_ko: x.ko, name_en: x.en, country_code: x.cc, flag: country.flag_emoji, accent: country.accent_color, country_name: country.name_ko,
          summary: null, taste_tags: x.tg, image_url: x.img ?? null, image_credit: x.cr ?? null, diet: UNKNOWN_DIET, allergens: [], fame_rank: x.r,
        };
        return { c: x, summary };
      });
    return {
      all: [...PREVIEW_FOODS.map(summaryOf), ...extra.map((x) => x.summary)],
      summaryOf,
      extraBySlug: new Map(extra.map((x) => [x.c.s, x])),
      media: m.default as MediaMap,
    };
  }));

const continentOf = new Map(PREVIEW_COUNTRIES.map((c) => [c.code, c.continent_group]));
const catalog = memoryCatalog(async () => ({ foods: (await data()).all, continentOf: (code) => continentOf.get(code) }));

const mediaOf = (media: MediaMap, slug: string, fallbackImageUrl: string | null, fallbackCredit: string | null): { gallery: GalleryPhoto[]; youtube: YouTubeVideo | null } => {
  const m = media[slug];
  if (m) return m;
  // media.json 에 없으면 catalog 의 대표 이미지라도 1장짜리 갤러리로
  if (fallbackImageUrl) {
    return {
      gallery: [{
        url: fallbackImageUrl,
        thumb: fallbackImageUrl,
        title: slug,
        source: "wikimedia_commons",
        license: fallbackCredit?.split(" / ")?.[1] ?? "see source",
        credit_url: fallbackCredit?.split(" / ")?.pop() ?? null,
        author: fallbackCredit?.split(" / ")?.[0] ?? null,
        fit: 1,
      }],
      youtube: null,
    };
  }
  return { gallery: [], youtube: null };
};

/** 같은 나라 대표 음식 10개 (자기 자신 빼고) */
const sameCountryOf = async (cc: string, slug: string) => (await catalog.foodsInCountries([cc], 11)).filter((o) => o.slug !== slug).slice(0, 10);

export const previewContent: ContentSource = {
  mode: "preview",
  listCountries: async () => PREVIEW_COUNTRIES,
  countFoods: async () => (await data()).all.length,
  ...catalog,
  async getFood(slug) {
    const d = await data();
    const f = bySlug.get(slug);
    const x = f ? null : d.extraBySlug.get(slug);
    if (x) {
      const m = mediaOf(d.media, slug, x.summary.image_url, x.summary.image_credit);
      return {
        ...x.summary,
        name_local: null, country: countryOf(x.c.cc), region_in_country: null, origin_note: null, history: null, culture_story: null, cooking_method: null, course_type: null, diet_note: null,
        ingredients: [],
        sources: [{ field: "name", url: x.c.w, title: `Wikipedia — ${x.c.en}`, license: "CC BY-SA 4.0" }],
        relations: [],
        sameCountry: await sameCountryOf(x.c.cc, slug),
        gallery: m.gallery,
        youtube: m.youtube,
      };
    }
    if (!f) return null;
    const summary = d.summaryOf(f);
    const m = mediaOf(d.media, slug, summary.image_url, summary.image_credit);
    const detail: FoodDetail = {
      ...summary,
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
      relations: relationsOf(slug).map((r) => ({ type: r.type, description: r.description, food: d.summaryOf(bySlug.get(r.other)!) })),
      sameCountry: await sameCountryOf(f.cc, slug),
      gallery: m.gallery,
      youtube: m.youtube,
    };
    return detail;
  },
  async getIngredient(slug) {
    const name = decodeURIComponent(slug);
    const foods = PREVIEW_FOODS.filter((f) => f.ingredients.includes(name));
    const { summaryOf } = await data();
    return foods.length ? { ingredient: { slug: name, name_ko: name, name_en: null, category: null }, foods: foods.map(summaryOf) } : null;
  },
  async getCountry(code) {
    const country = PREVIEW_COUNTRIES.find((c) => c.code === code);
    return country ? { country, foods: await catalog.foodsInCountries([code], Number.MAX_SAFE_INTEGER) } : null;
  },
};

function rowOf(f: PreviewFood): FoodRow {
  const c = countryOf(f.cc);
  return {
    id: previewId(f.n), slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, country_code: f.cc,
    origin_note: f.origin_note ?? null, summary: f.summary, history: f.history ?? null, culture_story: f.culture ?? null,
    cooking_method: f.method ?? null, course_type: f.course ?? null, ingredients: f.ingredients,
    taste_tags: f.tags, image_url: PREVIEW_IMAGES[f.slug]?.url ?? null, image_credit: PREVIEW_IMAGES[f.slug]?.credit ?? null, allergens: canonAllergens(f.allergens), diet: fullDiet(f.diet), diet_note: f.diet_note ?? null, country: { name_ko: c.name_ko, flag_emoji: c.flag_emoji, accent_color: c.accent_color },
    sources: [{ title: `Wikipedia — ${f.name_en}`, url: wiki(f) }],
  };
}

/** 검색 색인 (한 번만 만든다 — food-index.ts 가 배열이 같으면 색인을 다시 만들지 않는다).
 *  미리보기 음식은 재료 앞 2개를 주재료로 본다 (상세 화면 getFood 와 같은 규칙) */
//  순위·사진 유무는 카탈로그(처음 쓸 때 읽는 data())에서
let previewIndex: Promise<IndexedFood[]> | undefined;
const indexRows = () =>
  (previewIndex ??= data().then((d) => {
    const summary = new Map(d.all.map((x) => [x.slug, x]));
    return PREVIEW_FOODS.map((f) => ({
      id: previewId(f.n), slug: f.slug, name_ko: f.name_ko, name_en: f.name_en, name_local: f.name_local ?? null, country_code: f.cc,
      tags: f.tags, method: f.method ?? null, course: f.course ?? null, diet: fullDiet(f.diet), allergens: canonAllergens(f.allergens),
      ingredients: f.ingredients.map((name, i) => ({ name, role: i < 2 ? ("main" as const) : ("seasoning" as const) })),
      fame_rank: summary.get(f.slug)?.fame_rank ?? null,
      has_image: Boolean(summary.get(f.slug)?.image_url), has_story: Boolean(f.culture), has_history: Boolean(f.history),
    }));
  }));

/** 메모리 FoodisRepo. 기록·캐시는 프로세스 메모리에만 (서버 재시작 시 사라짐). */
export function previewRepo(): FoodisRepo {
  const cache = new Map<string, { payload: unknown; exp: number }>();
  return {
    foodIndex: async () => indexRows(),
    // 미리보기에는 임베딩이 없다 → 의미 신호 없이 조건·대표성·새로움으로 고른다 (실서비스 임베딩 장애 때와 같은 경로)
    vectorSearch: async () => [],
    neighbors: async () => [],
    relationsOf: async (id) => {
      const f = byId.get(id);
      return f ? relationsOf(f.slug).map((r) => ({ id: previewId(bySlug.get(r.other)!.n), type: r.type })) : [];
    },
    getFoods: async (ids) => ids.flatMap((id) => (byId.has(id) ? [rowOf(byId.get(id)!)] : [])),
    getRelatedFoodIds: async (id, limit, type) => {
      const f = byId.get(id);
      return f ? relationsOf(f.slug).filter((r) => !type || r.type === type).slice(0, limit).map((r) => previewId(bySlug.get(r.other)!.n)) : [];
    },
    countries: async () => PREVIEW_COUNTRIES.map(({ code, name_ko, name_en, continent_group }) => ({ code, name_ko, name_en, continent_group })),
    allFoodNames: async () => (await indexRows()).map((f) => ({ id: f.id, name_ko: f.name_ko, name_en: f.name_en, name_local: f.name_local, country_code: f.country_code, fame_rank: f.fame_rank })),
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
