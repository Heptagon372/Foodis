import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";
import type { ContentSource, Country, FoodDetail, FoodName, FoodSummary, RelationType } from "./types";

// 음식 카드 목록은 food_cards 뷰(0014)에서 — 나라 이름·국기·색이 평평하게 붙어 있고 fame_rank 는 나라 안 실제 순위(1부터 빈칸 없이)
const CARD_COLS =
  "id, slug, name_ko, name_en, country_code, summary, taste_tags, image_url, image_credit, allergens, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, country_name, flag_emoji, accent_color, fame_rank";
// 상세·관계·재료처럼 foods 테이블에서 조인해 오는 곳 (fame_rank 는 foods 컬럼 — 순위 도구가 매긴 값)
const SUMMARY_COLS =
  "id, slug, name_ko, name_en, country_code, summary, taste_tags, image_url, image_credit, allergens, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, fame_rank, countries(name_ko, flag_emoji, accent_color)";
const COUNTRY_COLS = "code, name_ko, name_en, region, continent_group, flag_emoji, accent_color";
/** PostgREST 한 번 응답 상한 (Supabase 기본 max_rows) */
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;
const dietOf = (r: Row) => Object.fromEntries(DIET_KEYS.map((k) => [k, r[`diet_${k}`]])) as Record<DietKey, DietLevel>;

const toSummary = (r: Row): FoodSummary => {
  const c = r.countries as { name_ko: string; flag_emoji: string; accent_color: string };
  return {
    id: r.id as string, slug: r.slug as string, name_ko: r.name_ko as string, name_en: r.name_en as string,
    country_code: r.country_code as string, flag: c.flag_emoji, accent: c.accent_color, country_name: c.name_ko,
    summary: r.summary as string | null, taste_tags: r.taste_tags as string[], image_url: r.image_url as string | null, image_credit: r.image_credit as string | null,
    diet: dietOf(r), allergens: (r.allergens as string[]) ?? [], fame_rank: (r.fame_rank as number | null) ?? null,
  };
};
const fromCard = (r: Row): FoodSummary => toSummary({ ...r, countries: { name_ko: r.country_name, flag_emoji: r.flag_emoji, accent_color: r.accent_color } });

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>;
/** 1,000행 상한을 넘는 목록: 첫 페이지에서 전체 개수를 받고 나머지 페이지는 한꺼번에 (순서가 정해진 쿼리만 — 페이지 경계가 흔들리지 않게) */
async function allPages(page: (from: number, to: number, count: boolean) => Page): Promise<Row[]> {
  const first = await page(0, PAGE - 1, true);
  if (first.error) throw first.error;
  const total = first.count ?? first.data!.length;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => page((i + 1) * PAGE, (i + 2) * PAGE - 1, false)));
  return [first, ...rest].flatMap((r) => {
    if (r.error) throw r.error;
    return r.data as Row[];
  });
}

/** anon 키 + RLS: 검수된(verified) 콘텐츠만 보인다 */
export function supabaseContent(db: SupabaseClient): ContentSource {
  const cards = (count = false) => db.from("food_cards").select(CARD_COLS, count ? { count: "exact" } : undefined);
  return {
    mode: "live",
    async listCountries() {
      const { data, error } = await db.from("countries").select(COUNTRY_COLS).order("code");
      if (error) throw error;
      return data as Country[];
    },
    async countFoods() {
      const { count, error } = await db.from("foods").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    async countryFoodCounts() {
      const { data, error } = await db.from("country_food_counts").select("country_code, food_count");
      if (error) throw error;
      return Object.fromEntries((data as { country_code: string; food_count: number }[]).map((r) => [r.country_code, r.food_count]));
    },
    async topFoods({ perCountry, continent }) {
      const rows = await allPages((from, to, count) => {
        let q = cards(count).lte("fame_rank", perCountry);
        if (continent) q = q.eq("continent_group", continent);
        return q.order("fame_rank").order("country_code").range(from, to);
      });
      return rows.map(fromCard);
    },
    async foodsInCountries(codes, limit) {
      if (!codes.length || limit < 1) return [];
      const { data, error } = await cards().in("country_code", codes).order("fame_rank").order("country_code").limit(Math.min(limit, PAGE));
      if (error) throw error;
      return (data as Row[]).map(fromCard);
    },
    async searchFoods(q, limit) {
      if (!q.trim()) return [];
      const { data, error } = await db.rpc("search_food_cards", { q, lim: limit }).select(CARD_COLS);
      if (error) throw error;
      return (data as Row[]).map(fromCard);
    },
    async foodsByKeys(keys) {
      const ids = keys.filter((k) => UUID.test(k));
      const slugs = keys.filter((k) => !UUID.test(k));
      const [a, b] = await Promise.all([
        ids.length ? cards().in("id", ids) : null,
        slugs.length ? cards().in("slug", slugs) : null,
      ]);
      for (const r of [a, b]) if (r?.error) throw r.error;
      const seen = new Set<string>();
      return [...((a?.data as Row[]) ?? []), ...((b?.data as Row[]) ?? [])].filter((r) => !seen.has(r.id as string) && seen.add(r.id as string)).map(fromCard);
    },
    async foodNames() {
      const rows = await allPages((from, to, count) => db.from("foods").select("slug, name_ko, name_en", count ? { count: "exact" } : undefined).order("slug").range(from, to));
      return rows as FoodName[];
    },
    async getFood(slug) {
      const { data, error } = await db
        .from("foods")
        .select(
          `${SUMMARY_COLS.replace("countries(name_ko, flag_emoji, accent_color)", `countries(${COUNTRY_COLS})`)}, ` +
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
        // 같은 나라 대표 음식 (유명도 순)
        cards().eq("country_code", r.country_code as string).neq("id", r.id as string).order("fame_rank").limit(6),
        db.from("food_photos").select("url, thumb, title, source, license, credit_url, author, fit").eq("food_id", r.id as string).order("rank"),
        db.from("food_youtube").select("video_id, url, title, channel, duration_sec, view_count, fit").eq("food_id", r.id as string).maybeSingle(),
      ]);
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
        ingredients: ((r.food_ingredients as Row[]) ?? []).map((fi) => ({ ...(fi.ingredients as { slug: string; name_ko: string }), role: fi.role as string })),
        sources: (r.sources as FoodDetail["sources"]) ?? [],
        relations: ((rels.data as unknown as Row[]) ?? [])
          .filter((x) => x.to)
          .map((x) => ({ type: x.relation_type as RelationType, description: x.description as string, food: toSummary(x.to as Row) })),
        sameCountry: ((same.data as unknown as Row[]) ?? []).map(fromCard),
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
      const [{ data: country }, foods] = await Promise.all([
        db.from("countries").select(COUNTRY_COLS).eq("code", code).maybeSingle(),
        // 한 나라 음식은 많아야 수백 개지만, 상한(1,000행)에 걸려도 잘리지 않게 페이지로
        allPages((from, to, count) => cards(count).eq("country_code", code).order("fame_rank").range(from, to)),
      ]);
      if (!country) return null;
      return { country: country as Country, foods: foods.map(fromCard) };
    },
  };
}
