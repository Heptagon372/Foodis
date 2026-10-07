// GET /api/foods/explore?q=김치 — 맛집탐방 음식 검색. /eats 는 처음에 나라별 대표 음식만 받고, 검색어가 있으면 여기서 DB 의 10,000개 전체를 찾는다 (search_food_cards, 0014)
import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { toExploreFoods } from "@/lib/places/food-cats";

const LIMIT = 40;

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 40);
  if (!q) return NextResponse.json([]);
  const content = await getContent();
  const [hit, countries] = await Promise.all([content.searchFoods(q, LIMIT), content.listCountries()]);
  return NextResponse.json(toExploreFoods(hit, countries), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
