// GET /api/health — 설정·DB 연결 점검. Supabase Free 는 7일 무접속 시 일시정지 → 주기적으로 호출 (09 문서 §6)
import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = {
    supabase: Boolean(env.supabaseUrl && env.supabaseAnonKey && env.supabaseServiceKey),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    google_tts: Boolean(env.googleTtsCredentials),
  };
  let db: { ok: boolean; countries?: number; error?: string } = { ok: false };
  if (keys.supabase) {
    const { count, error } = await supabasePublic().from("countries").select("code", { count: "exact", head: true });
    db = error ? { ok: false, error: error.message } : { ok: true, countries: count ?? 0 };
  }
  const ok = db.ok && keys.anthropic && keys.openai;
  return NextResponse.json(
    { ok, keys, db, models: { fast: env.llmModelFast, smart: env.llmModelSmart, tts: env.ttsProvider }, demoMode: env.demoMode },
    { status: ok ? 200 : 503 },
  );
}
