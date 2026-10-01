// PATCH /api/admin/reports/:id — 신고 처리 (F-ADM-03): resolved | rejected | open
import { requireApi } from "@/lib/admin/auth";
import { apiError, db } from "@/lib/admin/data";
import { z } from "zod";

const Body = z.object({ status: z.enum(["open", "resolved", "rejected"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireApi("reviewer");
  if (s instanceof Response) return s;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "status 는 open | resolved | rejected");
  const { error } = await db().from("reports").update({ status: parsed.data.status }).eq("id", (await params).id);
  return error ? apiError(500, error.message) : Response.json({ ok: true });
}
