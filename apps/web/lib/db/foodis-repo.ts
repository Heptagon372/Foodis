// FoodisRepo 의 Supabase 구현. 컬럼·RPC 는 supabase/migrations/0001_init.sql 기준.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyDiet, type CountryRow, type FoodisRepo, type FoodRow, type MatchParams, type UserContext } from "@/lib/foodi/repo";
import { rankByKeywords } from "@/lib/foodi/keywords";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";

const FOOD_SELECT =
  "id, slug, name_ko, name_en, country_code, origin_note, summary, history, culture_story, taste_tags, image_url, image_credit, allergens, diet_note, " +
  "diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, " +
  "countries(name_ko, flag_emoji, accent_color), sources(title, url)";

type LiteFood = { id: string; name_ko: string; name_en: string; country_code: string; allergens: string[]; taste_tags: string[] } & Record<`diet_${DietKey}`, DietLevel>;

const dietOf = (r: Record<string, unknown>) => Object.fromEntries(DIET_KEYS.map((k) => [k, r[`diet_${k}`] as DietLevel])) as Record<DietKey, DietLevel>;
const passesDiet = (f: LiteFood, need: DietKey[], avoid: string[]) =>
  need.every((k) => f[`diet_${k}`] === "yes" || f[`diet_${k}`] === "depends") && !f.allergens.some((a) => avoid.includes(a));

export function supabaseRepo(db: SupabaseClient): FoodisRepo {
  // 검수된 음식은 200건 남짓 → 이름 목록은 메모리에 5분 캐시 (검증·키워드 대체 검색용)
  let lite: { at: number; rows: LiteFood[] } | null = null;
  let countryCache: { at: number; rows: CountryRow[] } | null = null;
  const liteFoods = async (): Promise<LiteFood[]> => {
    if (lite && Date.now() - lite.at < 300_000) return lite.rows;
    const { data, error } = await db
      .from("foods")
      .select("id, name_ko, name_en, country_code, allergens, taste_tags, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free")
      .eq("verified", true);
    if (error) throw error;
    lite = { at: Date.now(), rows: data as unknown as LiteFood[] };
    return lite.rows;
  };

  return {
    async matchFoods(p: MatchParams) {
      const has = (k: DietKey) => p.needDiet.includes(k);
      const { data, error } = await db.rpc("match_foods", {
        query_embedding: p.embedding,
        user_tag_weights: p.ctx.tagWeights,
        exclude_food_ids: p.excludeFoodIds,
        explored_countries: p.ctx.exploredCountries,
        need_vegan: has("vegan"),
        need_vegetarian: has("vegetarian"),
        need_halal: has("halal"),
        need_gluten_free: has("gluten_free"),
        need_dairy_free: has("dairy_free"),
        avoid_allergens: p.ctx.allergens,
        country_filter: p.countryCode,
        match_count: p.count,
      });
      if (error) throw error;
      return (data as { food_id: string }[]).map((r) => r.food_id);
    },

    async keywordFoods(text, p) {
      const all = (await liteFoods()).filter(
        (f) => passesDiet(f, p.needDiet, p.ctx.allergens) && !p.excludeFoodIds.includes(f.id) && (!p.countryCode || f.country_code === p.countryCode),
      );
      return rankByKeywords(all, text, p.ctx.exploredCountries, p.ctx.tagWeights).slice(0, p.count).map((f) => f.id);
    },

    async getFoods(ids) {
      if (!ids.length) return [];
      const { data, error } = await db.from("foods").select(FOOD_SELECT).in("id", ids).eq("verified", true);
      if (error) throw error;
      const rows = (data as unknown as Record<string, unknown>[]).map(
        (r): FoodRow => ({
          id: r.id as string,
          slug: r.slug as string,
          name_ko: r.name_ko as string,
          name_en: r.name_en as string,
          country_code: r.country_code as string,
          origin_note: r.origin_note as string | null,
          summary: r.summary as string | null,
          history: r.history as string | null,
          culture_story: r.culture_story as string | null,
          taste_tags: r.taste_tags as string[],
          image_url: r.image_url as string | null,
          image_credit: r.image_credit as string | null,
          allergens: r.allergens as string[],
          diet: dietOf(r),
          diet_note: r.diet_note as string | null,
          country: r.countries as FoodRow["country"],
          sources: (r.sources as FoodRow["sources"]) ?? [],
        }),
      );
      const order = new Map(ids.map((id, i) => [id, i]));
      return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    },

    async getRelatedFoodIds(foodId, limit, type) {
      let q = db.from("food_relations").select("to_food_id").eq("from_food_id", foodId).eq("verified", true);
      if (type) q = q.eq("relation_type", type);
      const { data, error } = await q.order("strength", { ascending: false }).limit(limit);
      if (error) throw error;
      return data.map((r) => r.to_food_id as string);
    },

    async countries() {
      if (countryCache && Date.now() - countryCache.at < 300_000) return countryCache.rows;
      const { data, error } = await db.from("countries").select("code, name_ko, name_en, continent_group");
      if (error) throw error;
      countryCache = { at: Date.now(), rows: data as CountryRow[] };
      return countryCache.rows;
    },

    async allFoodNames() {
      return (await liteFoods()).map(({ id, name_ko, name_en }) => ({ id, name_ko, name_en }));
    },

    async getUserContext(userId): Promise<UserContext> {
      const base: UserContext = { userId, diet: emptyDiet(), allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [] };
      if (!userId) return base;
      const [diet, dna, passport] = await Promise.all([
        db.from("dietary_profiles").select("*").eq("user_id", userId).maybeSingle(),
        db.from("food_dna").select("tag_weights").eq("user_id", userId).maybeSingle(),
        db.from("passport_entries").select("food_id, foods(country_code)").eq("user_id", userId),
      ]);
      if (diet.data) {
        for (const k of DIET_KEYS) base.diet[k] = Boolean(diet.data[k]);
        base.allergens = diet.data.allergens ?? [];
      }
      base.tagWeights = (dna.data?.tag_weights as Record<string, number>) ?? {};
      const entries = (passport.data ?? []) as unknown as { food_id: string; foods: { country_code: string } | null }[];
      base.exploredFoodIds = [...new Set(entries.map((e) => e.food_id))];
      base.exploredCountries = [...new Set(entries.flatMap((e) => (e.foods ? [e.foods.country_code] : [])))];
      return base;
    },

    async recordConversation(c) {
      const { data, error } = await db
        .from("conversations")
        .insert({
          user_id: c.userId,
          input_mode: c.inputMode,
          intent: c.intent,
          user_text: c.userText,
          ai_json: c.aiJson,
          food_ids: c.foodIds,
          validated: c.validated,
          latency_ms: c.latencyMs,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async recordUsage(usages, conversationId) {
      if (!usages.length) return;
      const { error } = await db.from("api_usage").insert(
        usages.map((u) => ({ provider: u.provider, operation: u.operation, units: u.units, unit_type: u.unitType, cost_usd: u.costUsd, conversation_id: conversationId })),
      );
      if (error) throw error;
    },

    async markExplored(userId, foodIds) {
      if (!foodIds.length) return;
      const { error } = await db
        .from("passport_entries")
        .upsert(foodIds.map((food_id) => ({ user_id: userId, food_id, status: "explored" })), { onConflict: "user_id,food_id,status", ignoreDuplicates: true });
      if (error) throw error;
    },

    async usageTodayUsd() {
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const { data, error } = await db.from("api_usage").select("cost_usd").gte("created_at", since.toISOString());
      if (error) throw error;
      return data.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
    },

    async cacheGet<T>(key: string) {
      const { data } = await db.from("response_cache").select("payload, expires_at, hits").eq("cache_key", key).maybeSingle();
      if (!data || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) return null;
      void db.from("response_cache").update({ hits: (data.hits ?? 0) + 1 }).eq("cache_key", key).then(() => {});
      return data.payload as T;
    },

    async cacheSet(key, kind, payload, ttlHours) {
      const expires_at = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
      const { error } = await db.from("response_cache").upsert({ cache_key: key, kind, payload, expires_at });
      if (error) throw error;
    },
  };
}
