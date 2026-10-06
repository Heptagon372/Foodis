import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonAllergens } from "@/lib/diet/allergens";
import { checkDiet } from "@/lib/diet/consistency";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";
import type { ContentSource, Country, FoodDetail, FoodSummary, RelationType } from "./types";
// 나라 안 유명도 순위 — tools/gen-fame-rank.mjs 가 만든다 (DB 에 컬럼이 없어 앱 번들로)
import FAME from "./fame.json";

const fame = FAME as Record<string, number>;

const SUMMARY_COLS =
  "id, slug, name_ko, name_en, country_code, summary, taste_tags, image_url, image_credit, allergens, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, countries(name_ko, flag_emoji, accent_color), food_ingredients(ingredients(name_ko))";

type Row = Record<string, unknown>;
const toSummary = (r: Row): FoodSummary => {
  const c = r.countries as { name_ko: string; flag_emoji: string; accent_color: string };
  return {
    id: r.id as string, slug: r.slug as string, name_ko: r.name_ko as string, name_en: r.name_en as string,
    country_code: r.country_code as string, flag: c.flag_emoji, accent: c.accent_color, country_name: c.name_ko,
    summary: r.summary as string | null, taste_tags: r.taste_tags as string[], image_url: r.image_url as string | null, image_credit: r.image_credit as string | null,
    // 식이 표가 재료와 모순이면(비건 yes 인데 우유·버터, 1만 개 중 45개) yes → depends — 카드·목록·상세·푸디 답이 같은 값 (lib/diet/consistency.ts)
    diet: checkDiet(
      Object.fromEntries(DIET_KEYS.map((k) => [k, r[`diet_${k}`]])) as Record<DietKey, DietLevel>,
      ((r.food_ingredients as { ingredients: { name_ko: string } | null }[]) ?? []).flatMap((x) => (x.ingredients ? [x.ingredients.name_ko] : [])),
    ).diet,
    // DB 에 한국어(우유)·영어(dairy) 표기가 섞여 있다 → 표준 키로 (lib/diet/allergens.ts)
    allergens: canonAllergens(r.allergens as string[]),
    fame_rank: fame[r.slug as string] ?? null,
  };
};

// 목록 캐시 (서버 프로세스 하나에 하나): 홈·지도·맛집·라디오가 요청마다 1만 행(11쪽)을 다시 받느라 3~4초씩 걸렸다 (docs/design/20).
// 5분 동안은 그대로 쓰고, 지나면 옛 목록으로 답하면서 뒤에서 새로 받는다. 상세 화면(getFood)은 캐시하지 않는다 — 어드민에서 고친 내용은 상세에 바로 보인다
const LIST_TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; value: T } | null;
let foodsCache: Cached<FoodSummary[]> = null;
let countriesCache: Cached<Country[]> = null;
const inflight = new Map<string, Promise<unknown>>();
function cached<T>(key: string, get: () => Cached<T>, set: (v: Cached<T>) => void, load: () => Promise<T>): Promise<T> {
  const cur = get();
  const fresh = cur && Date.now() - cur.at < LIST_TTL_MS;
  if (!fresh && !inflight.has(key)) {
    inflight.set(
      key,
      load()
        .then((value) => (set({ at: Date.now(), value }), value))
        .finally(() => inflight.delete(key)),
    );
  }
  return cur ? Promise.resolve(cur.value) : (inflight.get(key) as Promise<T>);
}

/** anon 키 + RLS: 검수된(verified) 콘텐츠만 보인다 */
export function supabaseContent(db: SupabaseClient): ContentSource {
  return {
    mode: "live",
    listCountries: () =>
      cached(
        "countries",
        () => countriesCache,
        (v) => (countriesCache = v),
        async () => {
          const { data, error } = await db.from("countries").select("code, name_ko, name_en, region, continent_group, flag_emoji, accent_color").order("code");
          if (error) throw error;
          return data as Country[];
        },
      ),
    listFoods: () =>
      cached(
        "foods",
        () => foodsCache,
        (v) => (foodsCache = v),
        async () => {
          // PostgREST 는 한 번에 최대 1,000행 → 개수를 먼저 세고 쪽들을 동시에 받는다 (차례로 11번 → 한 번에)
          const { count, error: e1 } = await db.from("foods").select("id", { count: "exact", head: true });
          if (e1) throw e1;
          const pages = Array.from({ length: Math.ceil(((count ?? 0) + 1) / 1000) }, (_, i) => i * 1000);
          const got = await Promise.all(
            pages.map(async (from) => {
              const { data, error } = await db.from("foods").select(SUMMARY_COLS).order("id").range(from, from + 999);
              if (error) throw error;
              return data as unknown as Row[];
            }),
          );
          return got.flat().map(toSummary);
        },
      ),
    async countFoods() {
      // 목록을 이미 받아 뒀으면 그 길이 (홈이 목록과 개수를 함께 부른다)
      if (foodsCache) return foodsCache.value.length;
      const { count, error } = await db.from("foods").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    async getFood(slug) {
      const { data, error } = await db
        .from("foods")
        .select(
          `${SUMMARY_COLS.replace("countries(name_ko, flag_emoji, accent_color)", "countries(code, name_ko, name_en, region, continent_group, flag_emoji, accent_color)").replace(", food_ingredients(ingredients(name_ko))", "")}, ` +
            "name_local, region_in_country, origin_note, history, culture_story, cooking_method, course_type, diet_note, " +
            "food_ingredients(role, ingredients(slug, name_ko)), sources(field, url, title, license)",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as unknown as Row;
      const [rels, same, photos, yt] = await Promise.all([
        db.from("food_relations").select(`relation_type, description, to:foods!food_relations_to_food_id_fkey(${SUMMARY_COLS})`).eq("from_food_id", r.id as string).order("strength", { ascending: false }),
        db.from("foods").select(SUMMARY_COLS).eq("country_code", r.country_code as string).neq("id", r.id as string).limit(6),
        db.from("food_photos").select("url, thumb, title, source, license, credit_url, author, fit").eq("food_id", r.id as string).order("rank"),
        db.from("food_youtube").select("video_id, url, title, channel, duration_sec, view_count, fit").eq("food_id", r.id as string).maybeSingle(),
      ]);
      const ingredients = ((r.food_ingredients as Row[]) ?? []).map((fi) => ({ ...(fi.ingredients as { slug: string; name_ko: string }), role: fi.role as string }));
      const detail: FoodDetail = {
        ...toSummary(r),
        name_local: r.name_local as string | null,
        country: r.countries as Country,
        region_in_country: r.region_in_country as string | null,
        origin_note: r.origin_note as string | null,
        history: r.history as string | null,
        culture_story: r.culture_story as string | null,
        cooking_method: r.cooking_method as string | null,
        course_type: r.course_type as string | null,
        diet_note: r.diet_note as string | null,
        ingredients,
        sources: (r.sources as FoodDetail["sources"]) ?? [],
        relations: ((rels.data as unknown as Row[]) ?? [])
          .filter((x) => x.to)
          .map((x) => ({ type: x.relation_type as RelationType, description: x.description as string, food: toSummary(x.to as Row) })),
        sameCountry: ((same.data as unknown as Row[]) ?? []).map(toSummary),
        gallery: (photos.data as FoodDetail["gallery"]) ?? [],
        youtube: (yt.data as FoodDetail["youtube"]) ?? null,
      };
      return detail;
    },
    async getIngredient(slug) {
      const { data: ing } = await db.from("ingredients").select("id, slug, name_ko, name_en, category").eq("slug", decodeURIComponent(slug)).maybeSingle();
      if (!ing) return null;
      const { data } = await db.from("food_ingredients").select(`foods(${SUMMARY_COLS})`).eq("ingredient_id", ing.id);
      const foods = ((data as unknown as { foods: Row | null }[]) ?? []).flatMap((x) => (x.foods ? [toSummary(x.foods)] : []));
      return { ingredient: { slug: ing.slug, name_ko: ing.name_ko, name_en: ing.name_en, category: ing.category }, foods };
    },
    async getCountry(code) {
      const { data: country } = await db.from("countries").select("code, name_ko, name_en, region, continent_group, flag_emoji, accent_color").eq("code", code).maybeSingle();
      if (!country) return null;
      const { data } = await db.from("foods").select(SUMMARY_COLS).eq("country_code", code);
      return { country: country as Country, foods: ((data as unknown as Row[]) ?? []).map(toSummary) };
    },
  };
}
