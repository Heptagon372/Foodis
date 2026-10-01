// 어드민 데이터 접근 (service_role — 라우트에서 권한 확인 후에만 호출).
import "server-only";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { DIET_KEYS } from "@/lib/foodi/schema";
import type { FoodEdit } from "./rules";

export const db = () => supabaseAdmin();

/** FoodEdit → foods 컬럼. 내용을 고치면 검수가 풀리고, 고친 사람이 '작성자'가 된다 (작성자·검수자 분리) */
export function toRow(e: FoodEdit, userId: string) {
  const { diet, diet_sources: _ds, ...rest } = e;
  void _ds;
  return {
    ...rest,
    ...Object.fromEntries(DIET_KEYS.map((k) => [`diet_${k}`, diet[k]])),
    verified: false,
    verified_by: null,
    verified_at: null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
}

/** 식이 출처 URL 을 sources(field=diet, data_source_id=foodis_review)로 통째로 교체 */
export async function replaceDietSources(foodId: string, urls: string[]) {
  const c = db();
  const del = await c.from("sources").delete().eq("food_id", foodId).eq("field", "diet");
  if (del.error) throw del.error;
  if (!urls.length) return;
  const ins = await c.from("sources").insert(
    [...new Set(urls)].map((url) => ({ food_id: foodId, field: "diet", url, title: "검수자 첨부 출처", source_type: "foodis_review", data_source_id: "foodis_review" })),
  );
  if (ins.error) throw ins.error;
}

export const apiError = (status: number, message: string, details?: unknown) => Response.json({ error: { message, details } }, { status });
