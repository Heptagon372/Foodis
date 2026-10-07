// 인스타그램 로그인·연결 시작 (06 문서 §7): /auth/instagram?mode=login|link&next=/경로
// 무작위 state 를 만들어 mode·next(·연결이면 지금 회원 id)와 함께 서명한 짧은 httpOnly 쿠키에 두고, 인스타그램 동의 화면으로 보낸다
import { NextResponse } from "next/server";
import { authorizeUrl, callbackUrl, encodeStateCookie, IG_STATE_COOKIE, IG_STATE_PATH, IG_STATE_TTL_SEC, instagramConfigured, newState, type IgMode } from "@/lib/auth/instagram";
import { loginErrorPath, safeNext, withParam } from "@/lib/auth/links";
import { currentUserId } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode: IgMode = url.searchParams.get("mode") === "link" ? "link" : "login";
  const next = safeNext(url.searchParams.get("next"));
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!instagramConfigured(env) || !env.supabaseAnonKey) return go(mode === "link" ? withParam(next, "link_error", "instagram_not_configured") : loginErrorPath("instagram_not_configured", next));

  // 연결은 로그인한 회원만 — 콜백에서 같은 회원인지 다시 확인한다 (다른 사람 세션에 끼워 넣기 방지)
  let uid: string | undefined;
  if (mode === "link") {
    uid = (await currentUserId().catch(() => null)) ?? undefined;
    if (!uid) return go(`/login?next=${encodeURIComponent(next)}`);
  }

  const state = newState();
  const res = NextResponse.redirect(authorizeUrl({ clientId: env.instagramAppId!, redirectUri: callbackUrl(url.origin), state }));
  res.cookies.set(IG_STATE_COOKIE, encodeStateCookie({ state, mode, next, uid, exp: Date.now() + IG_STATE_TTL_SEC * 1000 }, env.instagramAppSecret!), {
    httpOnly: true,
    sameSite: "lax", // 인스타그램에서 돌아오는 최상위 이동(GET)에는 실려 온다
    secure: url.protocol === "https:",
    path: IG_STATE_PATH,
    maxAge: IG_STATE_TTL_SEC,
  });
  return res;
}
