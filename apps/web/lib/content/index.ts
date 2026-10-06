// 콘텐츠 소스 선택: Supabase 키가 있고 + DB 에 검수된 음식이 1개 이상이면 live, 아니면 미리보기 샘플.
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
  const { count, error } = await supabasePublic().from("foods").select("id", { count: "exact" }).limit(1);
  const value: DataStatus = error
    ? { live: false, reason: error.code === "PGRST205" ? "DB 테이블 없음 (마이그레이션 필요)" : `DB 오류: ${error.message}` }
    : count
      ? { live: true, reason: `검수된 음식 ${count}개` }
      : { live: false, reason: "DB 연결됨 · 검수된 음식 0개" };
  status = { at: Date.now(), value };
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
