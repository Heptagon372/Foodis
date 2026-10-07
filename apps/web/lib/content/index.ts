// 콘텐츠 소스 선택: Supabase 키가 있고 + 카탈로그 뷰(0014 food_cards)가 있고 + DB 에 검수된 음식이 1개 이상이면 live, 아니면 미리보기 샘플.
// 키만 넣고 아직 데이터를 적재하지 않은 단계에서 앱이 텅 비지 않게 한다 (1분마다 다시 확인).
import "server-only";
import { supabasePublic } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { previewContent } from "@/lib/preview/source";
import { cachedContent } from "./cache";
import { supabaseContent } from "./supabase-source";
import type { ContentSource } from "./types";

export const hasSupabaseKeys = () => Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey);

export type DataStatus = { live: boolean; reason: string };
let status: { at: number; value: DataStatus } | null = null;

export async function dataStatus(): Promise<DataStatus> {
  if (!hasSupabaseKeys()) return { live: false, reason: "Supabase 키 없음" };
  if (status && Date.now() - status.at < 60_000) return status.value;
  // 화면 목록은 food_cards 뷰(0014)로 고른다 → 뷰가 있어야 live. 개수는 테이블에서 바로 센다 (뷰는 순위를 매기느라 더 무겁다)
  const [view, { count, error: countError }] = await Promise.all([
    supabasePublic().from("food_cards").select("id").limit(1),
    supabasePublic().from("foods").select("id", { count: "exact" }).limit(1),
  ]);
  const error = view.error ?? countError;
  // 한 번 live 였는데 확인 요청만 잠깐 실패(네트워크 끊김·시간 초과)하면 live 를 유지하고 10초 뒤 다시 본다 —
  // 순간 오류 한 번에 1분 동안 실제 사용자에게 미리보기 샘플이 보이지 않게. 테이블·뷰 없음(PGRST205)은 진짜 상태라 그대로
  if (error && status?.value.live && error.code !== "PGRST205") {
    status = { at: Date.now() - 50_000, value: status.value };
    return status.value;
  }
  const value: DataStatus = error
    ? {
        live: false,
        reason: error.code !== "PGRST205" ? `DB 오류: ${error.message}` : countError ? "DB 테이블 없음 (마이그레이션 필요)" : "food_cards 뷰 없음 (0014_food_catalog.sql 실행 필요)",
      }
    : count
      ? { live: true, reason: `검수된 음식 ${count}개` }
      : { live: false, reason: "DB 연결됨 · 검수된 음식 0개" };
  // 오류(서버 막 켜진 직후의 첫 연결 실패 등)는 1분이 아니라 5초만 기억한다 — 곧바로 다시 확인해 live 로 돌아오게
  status = { at: error ? Date.now() - 55_000 : Date.now(), value };
  return value;
}

export const isLive = async () => (await dataStatus()).live;

// live 소스는 프로세스 안에서 한 번만 만들고 목록 조회는 캐시한다 (lib/content/cache.ts)
let live: ContentSource | null = null;
export async function getContent(): Promise<ContentSource> {
  if (!(await isLive())) return previewContent;
  return (live ??= cachedContent(supabaseContent(supabasePublic())));
}
export { invalidateContent } from "./cache";
