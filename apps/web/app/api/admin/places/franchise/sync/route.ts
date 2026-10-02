// POST /api/admin/places/franchise/sync — 공정위 가맹 브랜드 목록(외식) → franchise_brands (admin 전용)
// 기준년도를 안 주면 작년 → 재작년 순으로 자료가 있는 해를 쓴다 (공정위 공개는 해를 넘겨 이뤄진다)
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { env } from "@/lib/env";
import { fetchFtcBrands } from "@/lib/places/ftc";
import { invalidateBrands } from "@/lib/places/repo";

export const maxDuration = 60;

export async function POST(req: Request) {
  const s = await requireApi("admin");
  if (s instanceof Response) return s;
  if (!env.ftcFranchiseKey) return apiError(503, "FTC_FRANCHISE_API_KEY(공공데이터포털 서비스키)가 설정되지 않았어요");
  const { year } = (await req.json().catch(() => ({}))) as { year?: string };
  const thisYear = new Date().getFullYear();
  const years = year && /^\d{4}$/.test(year) ? [year] : [String(thisYear - 1), String(thisYear - 2)];
  try {
    for (const y of years) {
      const r = await fetchFtcBrands(y, { key: env.ftcFranchiseKey });
      if (!r.rows.length) continue;
      const now = new Date().toISOString();
      for (let i = 0; i < r.rows.length; i += 500) {
        const { error } = await db()
          .from("franchise_brands")
          .upsert(r.rows.slice(i, i + 500).map((b) => ({ ...b, synced_at: now })), { onConflict: "normalized" });
        if (error) return apiError(500, error.message);
      }
      invalidateBrands();
      return Response.json({ ok: true, year: y, brands: r.rows.length, fetched: r.total, pages: r.pages });
    }
    return apiError(404, `${years.join("·")}년 외식 브랜드 자료가 없어요`);
  } catch (e) {
    return apiError(502, (e as Error).message);
  }
}
