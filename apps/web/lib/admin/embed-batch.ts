// 음식 임베딩 일괄 생성 (docs/design/19 §5). 어드민 라우트(/api/admin/embeddings/rebuild)와 CLI(scripts/embed-foods.ts)가 함께 쓴다.
// - 1만 개라 PostgREST 1,000행 제한을 쪽으로 넘고, 한 번에 limit 개까지만 만든 뒤 남은 수를 돌려준다(다시 부르면 이어서).
// - mode: missing = 지금 모델(EMBED_PROVIDER) 임베딩이 없는 음식만 (모델이 다른 행은 '없는 것' — 질의·문서 벡터가 같은 모델이어야 비교된다)
//         stale   = missing + 문서가 바뀐 음식(어드민에서 고친 소개·재료 …) — text_used 와 지금 문서를 비교. 몇 번 나눠 불러도 이어진다
//         all     = 전부 (CLI 한 번에 끝까지 돌 때만)
// - 문서 식이 줄은 재료와 모순인 yes 를 빼고 쓴다 (lib/diet/consistency.ts) — "비건"으로 잘못 검색되지 않게.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDiet } from "@/lib/diet/consistency";
import { DIET_KEYS, type DietKey, type DietLevel } from "@/lib/foodi/schema";
import type { Embedder } from "@/lib/providers/types";
import { embeddingText } from "./rules";

type Row = Record<string, unknown>;
const DETAIL =
  `id, name_ko, name_en, summary, taste_tags, cooking_method, course_type, culture_story, region_in_country, ${DIET_KEYS.map((k) => `diet_${k}`).join(", ")}, ` +
  "countries(name_ko), food_ingredients(role, ingredients(name_ko))";

async function allRows<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if ((data as T[]).length < 1000) return out;
  }
}

export function documentFor(f: Row): string {
  const links = ((f.food_ingredients as { role: string; ingredients: { name_ko: string } | null }[]) ?? []).filter((x) => x.ingredients);
  const names = links.map((x) => x.ingredients!.name_ko);
  const diet = checkDiet(Object.fromEntries(DIET_KEYS.map((k) => [k, f[`diet_${k}`] as DietLevel])) as Record<DietKey, DietLevel>, names).diet;
  return embeddingText({
    name_ko: f.name_ko as string,
    name_en: f.name_en as string,
    summary: f.summary as string | null,
    taste_tags: (f.taste_tags as string[]) ?? [],
    cooking_method: f.cooking_method as string | null,
    course_type: f.course_type as string | null,
    culture_story: f.culture_story as string | null,
    diet,
    mainIngredients: links.filter((x) => x.role === "main").map((x) => x.ingredients!.name_ko),
    subIngredients: links.filter((x) => x.role === "sub").map((x) => x.ingredients!.name_ko),
    countryKo: (f.countries as { name_ko: string } | null)?.name_ko ?? "",
    region: f.region_in_country as string | null,
  });
}

export type EmbedBatchResult = { embedded: number; remaining: number; total: number; costUsd: number; model: string };

export type EmbedMode = "missing" | "stale" | "all";

/** 분당 문서 한도: EMBED_RPM 이 있으면 그것, 없으면 Gemini 무료 등급(분당 100건)에서 앱 질문 몫 20을 남긴 80, OpenAI 는 제한 없음 */
export const embedPerMinute = (provider: string) => {
  const env = Number(process.env.EMBED_RPM);
  if (env > 0) return env;
  return provider === "gemini" ? 80 : undefined;
};

/** 만들 차례인 음식 id */
export async function pendingFoodIds(db: SupabaseClient, model: string, mode: EmbedMode): Promise<{ todo: string[]; total: number }> {
  if (mode === "stale") {
    const [foods, done] = await Promise.all([
      allRows<Row>((a, b) => db.from("foods").select(DETAIL).eq("verified", true).order("id").range(a, b)),
      allRows<{ food_id: string; model: string; text_used: string }>((a, b) => db.from("food_embeddings").select("food_id, model, text_used").order("food_id").range(a, b)),
    ]);
    const have = new Map(done.map((r) => [r.food_id, r]));
    const todo = foods.filter((f) => {
      const e = have.get(f.id as string);
      return !e || e.model !== model || e.text_used !== documentFor(f);
    });
    return { todo: todo.map((f) => f.id as string), total: foods.length };
  }
  const [foods, done] = await Promise.all([
    allRows<{ id: string }>((a, b) => db.from("foods").select("id").eq("verified", true).order("id").range(a, b)),
    mode === "missing" ? allRows<{ food_id: string }>((a, b) => db.from("food_embeddings").select("food_id").eq("model", model).order("food_id").range(a, b)) : Promise.resolve([]),
  ]);
  const have = new Set(done.map((r) => r.food_id));
  return { todo: foods.map((f) => f.id).filter((id) => !have.has(id)), total: foods.length };
}

export async function embedFoods(
  db: SupabaseClient,
  embedder: Embedder,
  model: string,
  o: {
    mode: EmbedMode;
    limit: number;
    batch?: number;
    parallel?: number;
    /** 분당 최대 문서 수. Gemini 무료 등급은 임베딩 '분당 100건'(문서 하나가 1건) — 넘으면 429 */
    perMinute?: number;
    onProgress?: (done: number, of: number, costUsd: number) => void;
    onWait?: (ms: number, why: string) => void;
  },
): Promise<EmbedBatchResult> {
  const { todo, total } = await pendingFoodIds(db, model, o.mode);
  const work = todo.slice(0, o.limit);
  const size = o.batch ?? 50;
  const chunks = Array.from({ length: Math.ceil(work.length / size) }, (_, i) => work.slice(i * size, i * size + size));
  let embedded = 0;
  let costUsd = 0;
  const one = async (ids: string[]) => {
    const { data, error } = await db.from("foods").select(DETAIL).in("id", ids);
    if (error) throw error;
    const rows = data as unknown as Row[];
    const texts = rows.map(documentFor);
    // Gemini 문서 형식 "title: {name_ko} | text: {본문}" — 질의는 "task: search result | query: …" (providers/gemini.ts)
    const { vectors, usage } = await withQuotaRetry(() => embedder.embed(texts, { kind: "document", titles: rows.map((f) => f.name_ko as string) }), o.onWait);
    const up = await db.from("food_embeddings").upsert(
      rows.map((f, j) => ({ food_id: f.id, embedding: vectors[j], text_used: texts[j], model, updated_at: new Date().toISOString() })),
      { onConflict: "food_id" },
    );
    if (up.error) throw up.error;
    embedded += rows.length;
    costUsd += usage.costUsd;
    o.onProgress?.(embedded, work.length, costUsd);
  };
  const parallel = o.parallel ?? 1;
  // 분당 한도: 지난 60초 동안 보낸 문서 수를 세어, 다음 묶음이 넘치면 그만큼 기다린다
  const sent: { at: number; n: number }[] = [];
  for (let i = 0; i < chunks.length; i += parallel) {
    const group = chunks.slice(i, i + parallel);
    if (o.perMinute) {
      const n = group.reduce((a, c) => a + c.length, 0);
      for (;;) {
        const now = Date.now();
        while (sent.length && now - sent[0].at > 60_000) sent.shift();
        const used = sent.reduce((a, x) => a + x.n, 0);
        if (used + n <= o.perMinute) break;
        const ms = 60_000 - (now - sent[0].at) + 250;
        o.onWait?.(ms, `분당 ${o.perMinute}건 한도`);
        await sleep(ms);
      }
      sent.push({ at: Date.now(), n });
    }
    await Promise.all(group.map(one));
  }
  return { embedded, remaining: todo.length - embedded, total, costUsd: Number(costUsd.toFixed(6)), model };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429(할당량)면 응답이 알려 준 시간("Please retry in 7.2s")만큼 쉬고 다시 — 분당 한도는 1분이면 풀리니 최대 20번(약 10분)까지 참는다. 다른 오류는 그대로 던진다 */
export async function withQuotaRetry<T>(fn: () => Promise<T>, onWait?: (ms: number, why: string) => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 20 || !/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw e;
      const sec = Number(msg.match(/retry in ([\d.]+)s/i)?.[1] ?? 0);
      // 하루 한도(PerDay)면 기다려도 소용없다 — 남은 것은 다음에 이어서 (없는 것만 모드)
      if (/PerDay|per day|daily/i.test(msg)) throw e;
      const ms = Math.min(60_000, Math.max(sec * 1000, 10_000 * (attempt + 1))) + 500;
      onWait?.(ms, "429 할당량");
      await sleep(ms);
    }
  }
}
