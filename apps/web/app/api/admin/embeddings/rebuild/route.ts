// POST /api/admin/embeddings/rebuild — 검수된 음식 임베딩 생성 (F-ADM-02). body: { onlyMissing?: true }
// 텍스트 구성은 foodis-data s09 와 같다 → 배치로 만든 것과 섞여도 검색 품질이 같다
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { embeddingText } from "@/lib/admin/rules";
import { env } from "@/lib/env";
import { DIET_KEYS } from "@/lib/foodi/schema";
import { getEmbedder } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const s = await requireApi("admin");
  if (s instanceof Response) return s;
  if (!process.env.OPENAI_API_KEY) return apiError(412, "OPENAI_API_KEY 가 없어요 (apps/web/.env.local)");
  const { onlyMissing = true } = ((await req.json().catch(() => ({}))) ?? {}) as { onlyMissing?: boolean };
  const c = db();
  const { data: foods, error } = await c
    .from("foods")
    .select(`id, name_ko, name_en, summary, taste_tags, cooking_method, course_type, culture_story, ${DIET_KEYS.map((k) => `diet_${k}`).join(", ")}, countries(name_ko), food_ingredients(role, ingredients(name_ko)), food_embeddings(food_id)`)
    .eq("verified", true);
  if (error) return apiError(500, error.message);
  const rows = (foods as unknown as Record<string, unknown>[]).filter((f) => !onlyMissing || !(f.food_embeddings as unknown[] | null)?.length);
  let done = 0;
  let cost = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const texts = batch.map((f) =>
      embeddingText({
        name_ko: f.name_ko as string,
        name_en: f.name_en as string,
        summary: f.summary as string | null,
        taste_tags: (f.taste_tags as string[]) ?? [],
        cooking_method: f.cooking_method as string | null,
        course_type: f.course_type as string | null,
        culture_story: f.culture_story as string | null,
        diet: Object.fromEntries(DIET_KEYS.map((k) => [k, f[`diet_${k}`] as string])),
        mainIngredients: ((f.food_ingredients as { role: string; ingredients: { name_ko: string } | null }[]) ?? []).filter((x) => x.role === "main" && x.ingredients).map((x) => x.ingredients!.name_ko),
        countryKo: (f.countries as { name_ko: string } | null)?.name_ko ?? "",
      }),
    );
    const { vectors, usage } = await getEmbedder().embed(texts);
    cost += usage.costUsd;
    const up = await c.from("food_embeddings").upsert(
      batch.map((f, j) => ({ food_id: f.id, embedding: vectors[j], text_used: texts[j], model: env.embeddingModel, updated_at: new Date().toISOString() })),
      { onConflict: "food_id" },
    );
    if (up.error) return apiError(500, up.error.message, { done });
    done += batch.length;
  }
  return Response.json({ ok: true, embedded: done, costUsd: Number(cost.toFixed(6)) });
}
