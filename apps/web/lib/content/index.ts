// 화면용 콘텐츠 소스 선택: Supabase 키가 있으면 live, 없으면 미리보기 샘플.
import "server-only";
import { supabasePublic } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { previewContent } from "@/lib/preview/source";
import { supabaseContent } from "./supabase-source";
import type { ContentSource } from "./types";

export const isLive = () => Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey);

export function getContent(): ContentSource {
  return isLive() ? supabaseContent(supabasePublic()) : previewContent;
}
