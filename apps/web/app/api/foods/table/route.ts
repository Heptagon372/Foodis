// GET /api/foods/table?keys=<id|slug>,… — My Table 접시의 사진·국가색 조회표 (F-REC-04).
// Passport 기록은 브라우저에만 있어 서버가 미리 알 수 없다 → 식탁에 올라갈 최근 기록만 받아 간다 (음식 10,000개 전체를 HTML 에 싣지 않게)
import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { MAX_PLATES, toTableFood } from "@/lib/table/my-table";

const KEY = /^[A-Za-z0-9-]{1,80}$/;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("keys") ?? "";
  const keys = new Set(raw.split(",").filter((k) => KEY.test(k)).slice(0, MAX_PLATES * 2));
  if (!keys.size) return NextResponse.json([]);
  const foods = await (await getContent()).listFoods();
  const hit = foods.filter((f) => keys.has(f.id) || keys.has(f.slug)).map(toTableFood);
  return NextResponse.json(hit, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
