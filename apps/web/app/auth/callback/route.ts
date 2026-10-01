// 사용자 로그인 콜백 (Google · Kakao OAuth, 이메일 링크). ?next= 는 같은 사이트 경로만 허용 (오픈 리다이렉트 방지)
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseForRequest } from "@/lib/db/supabase-server";

const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/passport");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(providerError)}&next=${encodeURIComponent(next)}`, url.origin));
  const supabase = await supabaseForRequest();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("링크에 인증 정보가 없어요") };
  return NextResponse.redirect(new URL(error ? `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}` : next, url.origin));
}
