// GET /api/foods/table?ids=a,b&slugs=x,y — My Table 접시 조회표 (사진·국가색). 탐험 기록은 브라우저에만 있어서
// 예전에는 서버가 1만 개 조회표(약 4MB)를 화면에 통째로 넣었다 → 지금은 기록에 있는 음식만 (최대 120개) 묻는다 (docs/design/20).
// 목록은 서버 캐시(lib/content listFoods, 5분)에서 찾는다 — 미리보기·실DB 둘 다.
import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { toTableFood } from "@/lib/table/my-table";

const MAX = 120;
const list = (v: string | null) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX);

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ids = new Set(list(q.get("ids")));
  const slugs = new Set(list(q.get("slugs")));
  if (!ids.size && !slugs.size) return NextResponse.json([]);
  const foods = await (await getContent()).listFoods();
  const hit = foods.filter((f) => ids.has(f.id) || slugs.has(f.slug)).map(toTableFood);
  return NextResponse.json(hit, { headers: { "Cache-Control": "private, max-age=300" } });
}
