// POST /api/admin/foods/:id/verify — 검수 승인 (reviewer 이상, 작성자 본인 불가 · admin 예외는 override)
// DELETE — 승인 취소
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { approvalProblem } from "@/lib/admin/rules";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("reviewer");
  if (s instanceof Response) return s;
  const { id } = await params;
  const { override = false } = (await req.json().catch(() => ({}))) as { override?: boolean };
  const { data: food, error } = await db().from("foods").select("id, created_by, summary").eq("id", id).maybeSingle();
  if (error || !food) return apiError(404, "음식을 찾을 수 없어요");
  if (!food.summary) return apiError(422, "summary 가 비어 있으면 승인할 수 없어요");
  const problem = approvalProblem({ role: s.role, userId: s.userId, createdBy: food.created_by, override });
  if (problem) return apiError(403, problem);
  const now = new Date().toISOString();
  const up = await db().from("foods").update({ verified: true, verified_by: s.userId, verified_at: now }).eq("id", id);
  if (up.error) return apiError(500, up.error.message);
  if (override) console.warn(`[admin] ${s.email} 가 본인 작성 음식 ${id} 를 예외 승인`);
  return Response.json({ ok: true, verified: true, override });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("reviewer");
  if (s instanceof Response) return s;
  const { error } = await db().from("foods").update({ verified: false, verified_by: null, verified_at: null }).eq("id", (await params).id);
  return error ? apiError(500, error.message) : Response.json({ ok: true, verified: false });
}
