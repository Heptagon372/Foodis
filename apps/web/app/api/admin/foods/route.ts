// POST /api/admin/foods — 새 음식 (F-ADM-01). verified=false 로 시작
import { requireApi } from "@/lib/admin/auth";
import { apiError, db, replaceDietSources, toRow } from "@/lib/admin/data";
import { dietProblems, FoodEdit } from "@/lib/admin/rules";
import { invalidateContent } from "@/lib/content";
import { z } from "zod";

const Body = FoodEdit.extend({ slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "slug 는 영소문자·숫자·하이픈") });

export async function POST(req: Request) {
  const s = await requireApi("editor");
  if (s instanceof Response) return s;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, z.prettifyError(parsed.error));
  const problems = dietProblems(parsed.data);
  if (problems.length) return apiError(422, "검수 규칙 위반", problems);
  const { slug, ...edit } = parsed.data;
  const { data, error } = await db().from("foods").insert({ slug, ...toRow(edit, s.userId) }).select("id, slug").single();
  if (error) return apiError(error.code === "23505" ? 409 : 500, error.code === "23505" ? "같은 slug 가 이미 있어요" : error.message);
  await replaceDietSources(data.id, edit.diet_sources);
  invalidateContent();
  return Response.json(data, { status: 201 });
}
