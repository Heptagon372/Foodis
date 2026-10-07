// FoodisRepo 의 Supabase 구현. 컬럼·RPC 는 supabase/migrations/0001_init.sql 기준.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { avoidTerms, canonAllergens } from "@/lib/diet/allergens";
import { checkDiet } from "@/lib/diet/consistency";
import type { IndexedFood, IngRole } from "@/lib/foodi/food-index";
import { fameScore } from "@/lib/foodi/names";
import { emptyDiet, type CountryRow, type FoodisRepo, type FoodRow, type UserContext, type VectorParams } from "@/lib/foodi/repo";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";


const FOOD_SELECT =
  "id, slug, name_ko, name_en, country_code, origin_note, summary, history, culture_story, region_in_country, cooking_method, course_type, taste_tags, image_url, image_credit, allergens, diet_note, " +
  "diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, " +
  "countries(name_ko, flag_emoji, accent_color), sources(title, url), food_ingredients(role, ingredients(name_ko))";

const INDEX_SELECT =
  // fame_rank · popularity: 나라 안 순위 · 세계 유명도(위키 언어판 수) — 0014 컬럼, pnpm db:fame 이 채운다
  "id, slug, name_ko, name_en, name_local, country_code, taste_tags, cooking_method, course_type, allergens, image_url, fame_rank, popularity, " +
  "diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, food_ingredients(role, ingredients(name_ko))";

const dietOf = (r: Record<string, unknown>) => Object.fromEntries(DIET_KEYS.map((k) => [k, r[`diet_${k}`] as DietLevel])) as Record<DietKey, DietLevel>;
const ROLE_ORDER: Record<string, number> = { main: 0, sub: 1, seasoning: 2 };
type IngLink = { role: string; ingredients: { name_ko: string } | null };
const ingredientsOf = (r: Record<string, unknown>) =>
  ((r.food_ingredients as IngLink[]) ?? []).filter((x) => x.ingredients?.name_ko).sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3));

// ── 검색 색인 캐시: 서버 프로세스 하나에 하나 (요청마다 repo 를 새로 만들어도 공유). 10분 지나면 다음 요청이 옛 색인으로 답하는 동안 뒤에서 새로 받는다
const INDEX_TTL_MS = 10 * 60_000;
let indexCache: { at: number; rows: IndexedFood[] } | null = null;
let indexLoading: Promise<IndexedFood[]> | null = null;
let countryCache: { at: number; rows: CountryRow[] } | null = null;
/** match_foods_v2(0016) 가 DB 에 있나 — 모르면 null (첫 호출에서 확인) */
let hasV2: boolean | null = null;
/** 임베딩이 공개 음식의 몇 %에 있나 (10분 캐시). 일부만 있으면 의미 신호를 끈다 — 임베딩이 있는 8%만 점수를 받아 순위가 그쪽으로 쏠리기 때문 */
let coverageCache: { at: number; value: number } | null = null;
export const EMBED_COVERAGE_MIN = 0.95;

/** 어드민이 음식·나라를 고친 뒤 (lib/content/cache invalidateContent) — 다음 질문이 새 색인을 받는다 */
export function invalidateFoodIndex() {
  indexCache = null;
  countryCache = null;
  coverageCache = null;
}

/** PostgREST 는 한 번에 최대 1,000행 — 쪽으로 나눠 동시에 몇 개씩 받는다 */
async function pages<T>(db: SupabaseClient, build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, total: number, size = 1000, parallel = 6): Promise<T[]> {
  const starts = Array.from({ length: Math.ceil(total / size) }, (_, i) => i * size);
  const out: T[][] = [];
  for (let i = 0; i < starts.length; i += parallel) {
    const got = await Promise.all(
      starts.slice(i, i + parallel).map(async (from) => {
        const { data, error } = await build(from, from + size - 1);
        if (error) throw error;
        return data as T[];
      }),
    );
    out.push(...got);
  }
  return out.flat();
}

async function loadIndex(db: SupabaseClient): Promise<IndexedFood[]> {
  const { count, error } = await db.from("foods").select("id", { count: "exact", head: true }).eq("verified", true);
  if (error) throw error;
  const total = (count ?? 0) + 1000; // 세는 사이 늘어난 행까지
  const idsWhere = (col: string) =>
    pages<{ id: string }>(db, (a, b) => db.from("foods").select("id").eq("verified", true).not(col, "is", null).order("id").range(a, b), total, 1000);
  const [rows, story, history] = await Promise.all([
    pages<Record<string, unknown>>(db, (a, b) => db.from("foods").select(INDEX_SELECT).eq("verified", true).order("id").range(a, b), total),
    idsWhere("culture_story"),
    idsWhere("history"),
  ]);
  const hasStory = new Set(story.map((r) => r.id));
  const hasHistory = new Set(history.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name_ko: r.name_ko as string,
    name_en: r.name_en as string,
    name_local: (r.name_local as string | null) ?? null,
    country_code: r.country_code as string,
    tags: (r.taste_tags as string[]) ?? [],
    method: (r.cooking_method as string | null) ?? null,
    course: (r.course_type as string | null) ?? null,
    diet: dietOf(r),
    allergens: canonAllergens(r.allergens as string[]),
    ingredients: ingredientsOf(r).map((x) => ({ name: x.ingredients!.name_ko, role: (ROLE_ORDER[x.role] !== undefined ? x.role : "sub") as IngRole })),
    fame_rank: (r.fame_rank as number | null) ?? null,
    links: (r.popularity as number | null) ?? null,
    has_image: Boolean(r.image_url),
    has_story: hasStory.has(r.id as string),
    has_history: hasHistory.has(r.id as string),
  }));
}

/** 임베딩 문자열 "[0.1,0.2,…]" → 숫자 배열 (PostgREST 는 vector 를 문자열로 준다) */
const parseVector = (v: unknown): number[] | null => (Array.isArray(v) ? (v as number[]) : typeof v === "string" ? (JSON.parse(v) as number[]) : null);

export function supabaseRepo(db: SupabaseClient): FoodisRepo {
  const foodIndex = async (): Promise<IndexedFood[]> => {
    const fresh = indexCache && Date.now() - indexCache.at < INDEX_TTL_MS;
    if (!fresh && !indexLoading) {
      indexLoading = loadIndex(db)
        .then((rows) => ((indexCache = { at: Date.now(), rows }), rows))
        .finally(() => (indexLoading = null));
    }
    // 옛 색인이 있으면 바로 쓰고(새 색인은 뒤에서), 처음이면 기다린다
    if (indexCache) return indexCache.rows;
    return indexLoading!;
  };

  const embeddingCoverage = async () => {
    if (coverageCache && Date.now() - coverageCache.at < INDEX_TTL_MS) return coverageCache.value;
    const [e, f] = await Promise.all([
      db.from("food_embeddings").select("food_id", { count: "exact", head: true }),
      db.from("foods").select("id", { count: "exact", head: true }).eq("verified", true),
    ]);
    if (e.error || f.error) throw e.error ?? f.error;
    coverageCache = { at: Date.now(), value: (e.count ?? 0) / Math.max(1, f.count ?? 0) };
    return coverageCache.value;
  };

  const vectorSearch = async (p: VectorParams) => {
    // 임베딩을 채우는 중이면(무료 등급 하루 1,000건 등) 의미 신호 없이 — retrieve 가 조건·대표성·새로움으로 고른다
    if ((await embeddingCoverage()) < EMBED_COVERAGE_MIN) return [];
    const has = (k: DietKey) => p.needDiet.includes(k);
    const filters = {
      query_embedding: p.embedding,
      exclude_food_ids: p.excludeFoodIds,
      need_vegan: has("vegan"),
      need_vegetarian: has("vegetarian"),
      need_halal: has("halal"),
      need_gluten_free: has("gluten_free"),
      need_dairy_free: has("dairy_free"),
      // DB 에는 한국어(우유)·영어(dairy) 표기가 섞여 있다 → 두 표기를 다 넘긴다
      avoid_allergens: avoidTerms(p.allergens),
      country_filter: p.countryCode,
      match_count: p.count,
    };
    // v2(0016): 거리순 + LIMIT → HNSW 인덱스. 아직 SQL 을 실행하지 않은 DB 면 v1 로 (한 번 없다고 확인하면 그 뒤로는 바로 v1)
    if (hasV2 !== false) {
      const { data, error } = await db.rpc("match_foods_v2", filters);
      if (!error) {
        hasV2 = true;
        return (data as { food_id: string; vec_sim: number }[]).map((r) => ({ id: r.food_id, sim: r.vec_sim }));
      }
      if (error.code !== "PGRST202") throw error;
      hasV2 = false;
    }
    // v1 을 '순수 벡터 순'으로 쓴다: 취향·미탐험 가산은 rank.ts 가 따로 계산한다 (빈 가중치 · 빈 탐험 목록 → 점수 = 0.55·유사도 + 상수)
    const { data, error } = await db.rpc("match_foods", { ...filters, user_tag_weights: {}, explored_countries: [] });
    if (error) throw error;
    return (data as { food_id: string; vec_sim: number }[]).map((r) => ({ id: r.food_id, sim: r.vec_sim }));
  };

  return {
    foodIndex,
    vectorSearch,

    async neighbors(foodId, count) {
      if ((await embeddingCoverage()) < EMBED_COVERAGE_MIN) return [];
      const { data, error } = await db.from("food_embeddings").select("embedding").eq("food_id", foodId).maybeSingle();
      if (error) throw error;
      const v = parseVector(data?.embedding);
      if (!v) return [];
      return vectorSearch({ embedding: v, needDiet: [], allergens: [], countryCode: null, excludeFoodIds: [foodId], count });
    },

    async relationsOf(foodId) {
      const { data, error } = await db
        .from("food_relations")
        .select("from_food_id, to_food_id, relation_type")
        .or(`from_food_id.eq.${foodId},to_food_id.eq.${foodId}`)
        .eq("verified", true)
        .limit(50);
      if (error) throw error;
      return (data as { from_food_id: string; to_food_id: string; relation_type: string }[]).map((r) => ({
        id: r.from_food_id === foodId ? r.to_food_id : r.from_food_id,
        type: r.relation_type,
      }));
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
          region_in_country: r.region_in_country as string | null,
          cooking_method: r.cooking_method as string | null,
          course_type: r.course_type as string | null,
          ingredients: ingredientsOf(r).map((x) => x.ingredients!.name_ko),
          taste_tags: r.taste_tags as string[],
          image_url: r.image_url as string | null,
          image_credit: r.image_credit as string | null,
          allergens: canonAllergens(r.allergens as string[]),
          // 카드의 식이 배지도 색인과 같은 값 — 재료와 모순인 yes 는 depends 로 (lib/diet/consistency.ts)
          diet: checkDiet(dietOf(r), ingredientsOf(r).map((x) => x.ingredients!.name_ko)).diet,
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
      if (countryCache && Date.now() - countryCache.at < INDEX_TTL_MS) return countryCache.rows;
      const { data, error } = await db.from("countries").select("code, name_ko, name_en, continent_group");
      if (error) throw error;
      countryCache = { at: Date.now(), rows: data as CountryRow[] };
      return countryCache.rows;
    },

    async allFoodNames() {
      return (await foodIndex())
        .map(({ id, name_ko, name_en, name_local, country_code, fame_rank, links }) => ({ id, name_ko, name_en, name_local, country_code, fame_rank, links }))
        .sort((a, b) => fameScore(b.fame_rank, b.links) - fameScore(a.fame_rank, a.links));
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
