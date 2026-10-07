// 사용자 로그인 콜백 (Google · Kakao OAuth, 이메일 링크). ?next= 는 같은 사이트 경로만 허용 (오픈 리다이렉트 방지)
// ?link=kakao|google 이면 계정 연결(linkIdentity)에서 돌아온 것 — 결과를 로그인 화면이 아닌 next 화면에 ?linked= / ?link_error= 로 돌려준다 (06 문서 §7)
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { loginErrorPath, safeNext, withParam } from "@/lib/auth/links";
import { supabaseForRequest } from "@/lib/db/supabase-server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const link = ["kakao", "google"].find((p) => p === url.searchParams.get("link"));
  const fail = (msg: string) => NextResponse.redirect(new URL(link ? withParam(next, "link_error", msg) : loginErrorPath(msg, next), url.origin));
  const providerError = (link && url.searchParams.get("error_code")) || url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) return fail(providerError);
  const supabase = await supabaseForRequest();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("링크에 인증 정보가 없어요") };
  if (error) return fail(error.message);
  return NextResponse.redirect(new URL(link ? withParam(next, "linked", link) : next, url.origin));
}
