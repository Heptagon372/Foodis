// GET /api/countries/:code — 국가 개요 + 대표 음식 (F-EXP-03)
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/http";
import { supabasePublic } from "@/lib/db/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return jsonError(400, "invalid_code", "ISO 3166-1 alpha-2 코드가 필요합니다.");
  const { data, error } = await supabasePublic()
    .from("countries")
    .select("code, name_ko, name_en, region, continent_group, flag_emoji, accent_color, culture_summary, dining_style, foods(slug, name_ko, summary, image_url, course_type)")
    .eq("code", code)
    .maybeSingle();
  if (error) return jsonError(500, "db_error", error.message);
  if (!data) return jsonError(404, "not_found", "국가를 찾을 수 없습니다.");
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
