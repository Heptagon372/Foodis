// 이메일 로그인 링크 콜백: Supabase 기본 메일은 6자리 코드 없이 링크만 보내므로, 링크를 눌러도 로그인되게 한다
// (?code= PKCE 방식, ?token_hash=&type= 방식 둘 다)
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseForRequest } from "@/lib/db/supabase-server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = await supabaseForRequest();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("링크에 인증 정보가 없어요") };
  return NextResponse.redirect(new URL(error ? `/admin/login?error=${encodeURIComponent(error.message)}` : "/admin", url.origin));
}
