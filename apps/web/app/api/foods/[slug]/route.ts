// GET /api/foods/:slug — 음식 상세 + 국가 + 재료 + 식이 + 출처 (F-EXP-01). 공개, 검수된 음식만 (RLS)
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/http";
import { supabasePublic } from "@/lib/db/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data, error } = await supabasePublic()
    .from("foods")
    .select(
      "id, slug, name_ko, name_en, name_local, country_code, region_in_country, origin_note, summary, history, culture_story, cooking_method, " +
        "taste_tags, course_type, image_url, image_credit, diet_vegan, diet_vegetarian, diet_halal, diet_gluten_free, diet_dairy_free, allergens, diet_note, " +
        "countries(code, name_ko, name_en, flag_emoji, accent_color), " +
        "food_ingredients(role, ingredients(id, slug, name_ko, name_en, category, allergen)), " +
        "sources(field, url, title, source_type, license)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) return jsonError(500, "db_error", error.message);
  if (!data) return jsonError(404, "not_found", "음식을 찾을 수 없습니다.");
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
