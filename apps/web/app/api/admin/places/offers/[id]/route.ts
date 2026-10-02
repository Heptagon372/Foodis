// PATCH /api/admin/places/offers/:id — { verified: true|false, override? } 혜택·제보 확인/취소 (reviewer 이상, 본인 등록분은 admin override 만)
// DELETE — 틀린 제보·끝난 혜택 지우기 (reviewer 이상)
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { approvalProblem } from "@/lib/admin/rules";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("reviewer");
  if (s instanceof Response) return s;
  const { id } = await params;
  const { verified, override = false } = (await req.json().catch(() => ({}))) as { verified?: boolean; override?: boolean };
  if (typeof verified !== "boolean") return apiError(400, "verified 는 true | false");
  if (!verified) {
    const { error } = await db().from("restaurant_offers").update({ verified: false, verified_by: null, verified_at: null }).eq("id", id);
    return error ? apiError(500, error.message) : Response.json({ ok: true, verified: false });
  }
  const { data: o, error } = await db().from("restaurant_offers").select("id, kind, created_by").eq("id", id).maybeSingle();
  if (error || !o) return apiError(404, "혜택을 찾을 수 없어요");
  if (o.kind === "info") return apiError(422, "정보 정정 제보는 확인 대신 내용을 반영한 뒤 지워 주세요");
  const problem = approvalProblem({ role: s.role, userId: s.userId, createdBy: o.created_by, override });
  if (problem) return apiError(403, problem);
  const up = await db().from("restaurant_offers").update({ verified: true, verified_by: s.userId, verified_at: new Date().toISOString() }).eq("id", id);
  return up.error ? apiError(500, up.error.message) : Response.json({ ok: true, verified: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("reviewer");
  if (s instanceof Response) return s;
  const { error } = await db().from("restaurant_offers").delete().eq("id", (await params).id);
  return error ? apiError(500, error.message) : Response.json({ ok: true });
}
