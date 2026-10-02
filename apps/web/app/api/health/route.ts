// GET /api/health — 설정·DB 연결 점검. Supabase Free 는 7일 무접속 시 일시정지 → 주기적으로 호출 (09 문서 §6)
import { NextResponse } from "next/server";
import { dataStatus } from "@/lib/content";
import { supabasePublic } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { embedStatus, llmModels, llmStatus, sttStatus, ttsStatus } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = { supabase: Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey) };
  // 영역별 제공자 준비 상태 (키 값은 넣지 않는다). 영역마다 하나 이상 준비돼야 ok
  const providers = { llm: llmStatus(), stt: sttStatus(), tts: ttsStatus(), embed: embedStatus() };
  const anyReady = (xs: { ready: boolean }[]) => xs.some((x) => x.ready);
  let db: { ok: boolean; countries?: number; error?: string } = { ok: false };
  if (keys.supabase) {
    // head:true 는 테이블이 없어도(404) error 가 비어 오는 경우가 있어 실제로 한 행을 읽어 본다
    const { count, error } = await supabasePublic().from("countries").select("code", { count: "exact" }).limit(1);
    db = error ? { ok: false, error: error.code === "PGRST205" ? "테이블 없음 — supabase/migrations 를 SQL Editor 에서 실행하세요" : error.message } : { ok: true, countries: count ?? 0 };
  }
  const ok = db.ok && anyReady(providers.llm) && anyReady(providers.embed);
  return NextResponse.json(
    { ok, keys, providers, db, content: await dataStatus().catch(() => ({ live: false, reason: "확인 실패" })), models: llmModels(), demoMode: env.demoMode },
    { status: ok ? 200 : 503 },
  );
}
