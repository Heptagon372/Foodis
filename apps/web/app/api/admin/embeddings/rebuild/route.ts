// POST /api/admin/embeddings/rebuild — 검수된 음식 임베딩 생성 (F-ADM-02). body: { onlyMissing?: true }
// 텍스트 구성은 foodis-data s09 와 같다 → 배치로 만든 것과 섞여도 검색 품질이 같다 (s09 는 OpenAI 전용 — EMBED_PROVIDER=gemini 이면 여기서만 만든다)
// onlyMissing 이어도 지금 임베딩 모델(EMBED_PROVIDER)과 다른 모델로 만든 행은 다시 만든다: 질의·문서 벡터가 같은 모델이어야 비교된다
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { embeddingText } from "@/lib/admin/rules";
import { DIET_KEYS } from "@/lib/foodi/schema";
import { embedConfigError, embedKeyName, embedModel, embedReady, getEmbedder } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const s = await requireApi("admin");
  if (s instanceof Response) return s;
  const cfg = embedConfigError();
  if (cfg) return apiError(412, cfg);
  if (!embedReady()) return apiError(412, `${embedKeyName()} 가 없어요 (apps/web/.env.local)`);
  const { onlyMissing = true } = ((await req.json().catch(() => ({}))) ?? {}) as { onlyMissing?: boolean };
  const model = embedModel();
  const c = db();
  const { data: foods, error } = await c
    .from("foods")
    .select(`id, name_ko, name_en, summary, taste_tags, cooking_method, course_type, culture_story, ${DIET_KEYS.map((k) => `diet_${k}`).join(", ")}, countries(name_ko), food_ingredients(role, ingredients(name_ko)), food_embeddings(food_id, model)`)
    .eq("verified", true);
  if (error) return apiError(500, error.message);
  // 1:1 관계라 객체로 올 수도, 배열로 올 수도 있다
  const embeddedWith = (f: Record<string, unknown>) => [f.food_embeddings].flat().filter(Boolean).map((e) => (e as { model: string }).model);
  const rows = (foods as unknown as Record<string, unknown>[]).filter((f) => !onlyMissing || !embeddedWith(f).includes(model));
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
    // Gemini 문서 형식 "title: {name_ko} | text: {본문}" — s09 와 같은 제목
    const { vectors, usage } = await getEmbedder().embed(texts, { kind: "document", titles: batch.map((f) => f.name_ko as string) });
    cost += usage.costUsd;
    const up = await c.from("food_embeddings").upsert(
      batch.map((f, j) => ({ food_id: f.id, embedding: vectors[j], text_used: texts[j], model, updated_at: new Date().toISOString() })),
      { onConflict: "food_id" },
    );
    if (up.error) return apiError(500, up.error.message, { done });
    done += batch.length;
  }
  return Response.json({ ok: true, embedded: done, model, costUsd: Number(cost.toFixed(6)) });
}
