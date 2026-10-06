// POST /api/admin/import — s07 검수 시트(review_sheet.csv) 가져오기 (F-ADM-02)
// body: { csv, apply?: false, overwriteVerified?: false }
//  apply=false → 미리보기(무엇이 생기고 바뀌는지), apply=true → 저장. 가져온 음식은 모두 verified=false (화면에서 검수)
import { requireApi } from "@/lib/admin/auth";
import { apiError, db, replaceDietSources, toRow } from "@/lib/admin/data";
import { dietProblems, parseCsv, reviewRowToEdit } from "@/lib/admin/rules";
import { invalidateContent } from "@/lib/content";

export const runtime = "nodejs";

type Item = { slug: string; action: "create" | "update" | "skip_verified" | "error"; message?: string };

export async function POST(req: Request) {
  const s = await requireApi("editor");
  if (s instanceof Response) return s;
  const body = (await req.json().catch(() => null)) as { csv?: string; apply?: boolean; overwriteVerified?: boolean } | null;
  if (!body?.csv) return apiError(400, "csv 가 필요해요");
  const rows = parseCsv(body.csv);
  if (!rows.length) return apiError(400, "읽을 수 있는 행이 없어요");
  if (rows.length > 500) return apiError(413, "한 번에 500행까지");

  const { data: existing, error } = await db().from("foods").select("id, slug, verified");
  if (error) return apiError(500, error.message);
  const bySlug = new Map(existing.map((f) => [f.slug as string, f]));
  const { data: countries } = await db().from("countries").select("code");
  const known = new Set((countries ?? []).map((c) => c.code as string));

  const items: Item[] = [];
  for (const r of rows) {
    const res = reviewRowToEdit(r);
    if ("error" in res) {
      items.push({ slug: res.slug, action: "error", message: res.error });
      continue;
    }
    const problems = dietProblems(res.edit);
    if (problems.length) {
      items.push({ slug: res.slug, action: "error", message: problems[0] });
      continue;
    }
    if (!known.has(res.edit.country_code)) {
      items.push({ slug: res.slug, action: "error", message: `국가 ${res.edit.country_code} 가 DB 에 없어요 — 대시보드에서 국가 동기화` });
      continue;
    }
    const cur = bySlug.get(res.slug);
    if (cur?.verified && !body.overwriteVerified) {
      items.push({ slug: res.slug, action: "skip_verified", message: "이미 검수 완료 — 덮어쓰려면 옵션 체크" });
      continue;
    }
    items.push({ slug: res.slug, action: cur ? "update" : "create" });
    if (!body.apply) continue;
    const row = { slug: res.slug, ...toRow(res.edit, s.userId) };
    const up = await db().from("foods").upsert(row, { onConflict: "slug" }).select("id").single();
    if (up.error) {
      items[items.length - 1] = { slug: res.slug, action: "error", message: up.error.message };
      continue;
    }
    await replaceDietSources(up.data.id, res.edit.diet_sources);
    // 설명 문장은 근거 기반 AI 초안 → 출처 표기 (0002 데이터 소스 레지스트리)
    await db().from("sources").upsert(
      { food_id: up.data.id, field: "summary,history,culture_story", url: `foodis://draft/${res.slug}`, title: "FOODIS AI 초안 (근거 기반, 검수 필요)", source_type: "foodis_llm_draft", data_source_id: "foodis_llm_draft" },
      { onConflict: "food_id,field,url" },
    );
  }
  if (body.apply) invalidateContent();
  const count = (a: Item["action"]) => items.filter((i) => i.action === a).length;
  return Response.json({ applied: Boolean(body.apply), total: items.length, create: count("create"), update: count("update"), skipped: count("skip_verified"), errors: count("error"), items });
}
