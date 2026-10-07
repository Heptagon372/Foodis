// POST /api/admin/countries/sync — 국가 30개를 시드(foodis-data/data/seed/countries.csv)와 동기화
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { invalidateContent } from "@/lib/content";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";

export async function POST() {
  const s = await requireApi("admin");
  if (s instanceof Response) return s;
  const { error, count } = await db()
    .from("countries")
    .upsert(PREVIEW_COUNTRIES.map((c) => ({ ...c, updated_at: new Date().toISOString() })), { onConflict: "code", count: "exact" });
  if (error) return apiError(500, error.message);
  invalidateContent();
  return Response.json({ ok: true, countries: count ?? PREVIEW_COUNTRIES.length });
}
