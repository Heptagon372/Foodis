// PATCH /api/admin/foods/:id — 음식 수정 (F-ADM-01). 저장하면 검수가 풀린다(다시 승인 필요)
// DELETE — 삭제 (admin)
import { requireApi } from "@/lib/admin/auth";
import { apiError, db, replaceDietSources, toRow } from "@/lib/admin/data";
import { dietProblems, FoodEdit } from "@/lib/admin/rules";
import { z } from "zod";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("editor");
  if (s instanceof Response) return s;
  const { id } = await params;
  const parsed = FoodEdit.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, z.prettifyError(parsed.error));
  const problems = dietProblems(parsed.data);
  if (problems.length) return apiError(422, "검수 규칙 위반", problems);
  const { error } = await db().from("foods").update(toRow(parsed.data, s.userId)).eq("id", id);
  if (error) return apiError(500, error.message);
  await replaceDietSources(id, parsed.data.diet_sources);
  return Response.json({ ok: true, verified: false });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("admin");
  if (s instanceof Response) return s;
  const { error } = await db().from("foods").delete().eq("id", (await params).id);
  return error ? apiError(500, error.message) : Response.json({ ok: true });
}
