// GET /api/foods/:slug/relations?type= — 관계 목록 (F-EXP-02). 검수된 관계만 (RLS)
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/http";
import { supabasePublic } from "@/lib/db/supabase-server";

const TYPES = ["similar_taste", "shares_ingredient", "same_technique", "historical_link", "regional_variant"];

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const type = new URL(req.url).searchParams.get("type");
  if (type && !TYPES.includes(type)) return jsonError(400, "invalid_type", `type 은 ${TYPES.join(" | ")} 중 하나`);

  const db = supabasePublic();
  const { data: food } = await db.from("foods").select("id").eq("slug", slug).maybeSingle();
  if (!food) return jsonError(404, "not_found", "음식을 찾을 수 없습니다.");

  let q = db
    .from("food_relations")
    .select("relation_type, description, strength, to:foods!food_relations_to_food_id_fkey(id, slug, name_ko, image_url, countries(code, flag_emoji, accent_color))")
    .eq("from_food_id", food.id)
    .order("strength", { ascending: false });
  if (type) q = q.eq("relation_type", type);
  const { data, error } = await q;
  if (error) return jsonError(500, "db_error", error.message);
  return NextResponse.json({ items: data });
}
