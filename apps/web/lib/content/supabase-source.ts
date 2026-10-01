import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";
import type { ContentSource, Country, FoodDetail, FoodSummary, RelationType } from "./types";

const SUMMARY_COLS =
  "id, slug, name_ko, name_en, country_code, summary, taste_tags, image_url, image_credit, allergens, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, countries(name_ko, flag_emoji, accent_color)";

type Row = Record<string, unknown>;
const toSummary = (r: Row): FoodSummary => {
  const c = r.countries as { name_ko: string; flag_emoji: string; accent_color: string };
  return {
    id: r.id as string, slug: r.slug as string, name_ko: r.name_ko as string, name_en: r.name_en as string,
    country_code: r.country_code as string, flag: c.flag_emoji, accent: c.accent_color, country_name: c.name_ko,
    summary: r.summary as string | null, taste_tags: r.taste_tags as string[], image_url: r.image_url as string | null, image_credit: r.image_credit as string | null,
    diet: Object.fromEntries(DIET_KEYS.map((k) => [k, r[`diet_${k}`]])) as Record<DietKey, DietLevel>,
    allergens: (r.allergens as string[]) ?? [],
  };
};

/** anon 키 + RLS: 검수된(verified) 콘텐츠만 보인다 */
export function supabaseContent(db: SupabaseClient): ContentSource {
  return {
    mode: "live",
    async listCountries() {
      const { data, error } = await db.from("countries").select("code, name_ko, name_en, region, continent_group, flag_emoji, accent_color").order("code");
      if (error) throw error;
      return data as Country[];
    },
    async listFoods() {
      const { data, error } = await db.from("foods").select(SUMMARY_COLS);
      if (error) throw error;
      return (data as unknown as Row[]).map(toSummary);
    },
    async getFood(slug) {
      const { data, error } = await db
        .from("foods")
        .select(
          `${SUMMARY_COLS.replace("countries(name_ko, flag_emoji, accent_color)", "countries(code, name_ko, name_en, region, continent_group, flag_emoji, accent_color)")}, ` +
            "name_local, region_in_country, origin_note, history, culture_story, cooking_method, course_type, diet_note, " +
            "food_ingredients(role, ingredients(slug, name_ko)), sources(field, url, title, license)",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as unknown as Row;
      const [rels, same] = await Promise.all([
        db.from("food_relations").select(`relation_type, description, to:foods!food_relations_to_food_id_fkey(${SUMMARY_COLS})`).eq("from_food_id", r.id as string).order("strength", { ascending: false }),
        db.from("foods").select(SUMMARY_COLS).eq("country_code", r.country_code as string).neq("id", r.id as string).limit(6),
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
        sameCountry: ((same.data as unknown as Row[]) ?? []).map(toSummary),
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
