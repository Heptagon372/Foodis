// 인스타그램 콜백 (06 문서 §7): state 쿠키 확인 → code 를 토큰으로 → /me 로 신원 → 로그인 또는 연결
//  login: social_links 로 회원 찾기 → 없으면 가짜 메일 회원 생성 + 연결 → 메일 없이 세션 발급
//         (generateLink 의 hashed_token 을 서버에서 바로 verifyOtp — SSR 클라이언트가 세션 쿠키를 쓴다)
//  link : 지금 로그인한 회원에 연결. 다른 회원에 이미 연결된 인스타면 거절
// 인스타 토큰은 신원 확인에만 쓰고 저장하지 않는다. 오류는 코드로 넘기고 화면이 사람 말로 바꾼다 (lib/auth/links.ts authErrorText)
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthError } from "@supabase/supabase-js";
import {
  callbackUrl,
  IG_ME,
  IG_PROFILE_FIELDS,
  IG_STATE_COOKIE,
  IG_STATE_PATH,
  IG_TOKEN,
  igErrorMessage,
  instagramConfigured,
  parseProfile,
  parseTokenResponse,
  tokenRequestBody,
  verifyStateCookie,
  type IgProfile,
  type IgToken,
} from "@/lib/auth/instagram";
import { loginErrorPath, syntheticEmail, withParam } from "@/lib/auth/links";
import { supabaseAdmin, supabaseForRequest } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

const PROVIDER = "instagram";
const NO_PROFILE: IgProfile = { id: null, username: null, name: null, avatar: null };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = await cookies();
  const secret = env.instagramAppSecret;
  const st = secret ? verifyStateCookie(store.get(IG_STATE_COOKIE)?.value, url.searchParams.get("state"), secret) : null;
  store.set(IG_STATE_COOKIE, "", { path: IG_STATE_PATH, maxAge: 0 }); // state 는 한 번 쓰면 끝
  const mode = st?.mode ?? "login";
  const next = st?.next ?? "/passport";
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  const fail = (code: string) => go(mode === "link" ? withParam(next, "link_error", code) : loginErrorPath(code, next));

  // 동의 화면에서 취소하면 ?error=access_denied&error_reason=user_denied
  const igError = url.searchParams.get("error");
  if (igError) return fail(igError === "access_denied" || url.searchParams.get("error_reason") === "user_denied" ? "access_denied" : "instagram_denied");
  if (!instagramConfigured(env) || !env.supabaseAnonKey) return fail("instagram_not_configured");
  if (!st) return fail("instagram_state");
  if (!rateLimit(clientKey(req, null) + ":ig", 20, 60_000).ok) return fail("instagram_rate");
  const code = url.searchParams.get("code");
  if (!code) return fail("instagram_token");

  const token = await exchange(code, callbackUrl(url.origin));
  if (!token) return fail("instagram_token");
  const profile = await fetchProfile(token); // 실패해도 신원(id)은 토큰에 있으니 이름·사진 없이 진행
  const uid = token.userId ?? profile.id;
  if (!uid) return fail("instagram_token");
  const row = { provider: PROVIDER, provider_uid: uid, username: profile.username, avatar_url: profile.avatar };

  const db = supabaseAdmin();
  const sb = await supabaseForRequest();
  const found = await db.from("social_links").select("user_id").eq("provider", PROVIDER).eq("provider_uid", uid).maybeSingle();
  if (found.error) {
    console.error("[instagram] social_links 읽기 실패 (0013 마이그레이션 확인)", found.error.message);
    return fail("instagram_db");
  }

  // ── 연결: 시작한 회원과 지금 세션 회원이 같아야 한다
  if (mode === "link") {
    const user = (await sb.auth.getUser()).data.user;
    if (!user || user.id !== st.uid) return fail("login_required");
    if (found.data && found.data.user_id !== user.id) return fail("instagram_linked_elsewhere");
    if (!found.data) {
      const mine = await db.from("social_links").select("provider_uid").eq("user_id", user.id).eq("provider", PROVIDER).maybeSingle();
      if (mine.data) return fail("instagram_already_linked"); // 회원당 인스타 1개 — 바꾸려면 해제 후 다시
    }
    const up = await db.from("social_links").upsert({ ...row, user_id: user.id }, { onConflict: "provider,provider_uid" });
    if (up.error) {
      console.error("[instagram] 연결 저장 실패", up.error.message);
      return fail("instagram_db");
    }
    // 프로필 사진이 없던 회원만 인스타 사진으로 채운다
    const meta = user.user_metadata ?? {};
    if (profile.avatar && !meta.avatar_url && !meta.picture) await db.auth.admin.updateUserById(user.id, { user_metadata: { ...meta, avatar_url: profile.avatar } });
    return go(withParam(next, "linked", PROVIDER));
  }

  // ── 로그인: 연결된 회원 → 그 회원 / 처음이면 가짜 메일 회원을 만든다
  let email: string;
  if (found.data) {
    const got = await db.auth.admin.getUserById(found.data.user_id);
    if (got.error || !got.data.user) return fail("instagram_session");
    email = got.data.user.email ?? "";
    if (!email) {
      // 메일 없이 가입한 회원(이메일 동의 없는 카카오 등) — 세션 발급용 가짜 메일을 붙인다 (화면엔 안 보임)
      email = syntheticEmail(PROVIDER, uid);
      const upd = await db.auth.admin.updateUserById(found.data.user_id, { email, email_confirm: true });
      if (upd.error) return fail("instagram_session");
    }
  } else {
    email = syntheticEmail(PROVIDER, uid);
    const created = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: clean({ name: profile.name ?? profile.username, user_name: profile.username, avatar_url: profile.avatar }),
      app_metadata: { foodis_provider: PROVIDER },
    });
    // 같은 메일이 이미 있으면(앞선 시도가 연결 저장 전에 끊김) 그 회원을 그대로 쓴다
    if (created.error && !emailTaken(created.error)) {
      console.error("[instagram] 회원 생성 실패", created.error.message);
      return fail("instagram_signup");
    }
  }

  // 메일을 보내지 않는 1회용 로그인 링크 → 서버에서 바로 확인해 세션 쿠키를 쓴다
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link.data?.properties?.hashed_token;
  const userId = link.data?.user?.id;
  if (link.error || !hash || !userId || (found.data && found.data.user_id !== userId)) {
    console.error("[instagram] 로그인 링크 실패", link.error?.message);
    return fail("instagram_session");
  }
  const up = await db.from("social_links").upsert({ ...row, user_id: userId }, { onConflict: "provider,provider_uid" }); // 처음이면 연결, 아니면 이름·사진 갱신
  if (up.error) {
    console.error("[instagram] 연결 저장 실패", up.error.message);
    return fail("instagram_db");
  }
  let { error } = await sb.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
  if (error) ({ error } = await sb.auth.verifyOtp({ token_hash: hash, type: "email" })); // 'magiclink' 를 안 받는 버전 대비
  if (error) {
    console.error("[instagram] 세션 발급 실패", error.message);
    return fail("instagram_session");
  }
  return go(next);
}

async function exchange(code: string, redirectUri: string): Promise<IgToken | null> {
  try {
    const r = await fetch(IG_TOKEN, {
      method: "POST",
      body: tokenRequestBody({ clientId: env.instagramAppId!, clientSecret: env.instagramAppSecret!, redirectUri, code }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    const token = r.ok ? parseTokenResponse(text) : null;
    if (!token) console.warn("[instagram] 토큰 교환 실패", r.status, igErrorMessage(text));
    return token;
  } catch (e) {
    console.warn("[instagram] 토큰 교환 실패", (e as Error).name);
    return null;
  }
}

async function fetchProfile(t: IgToken): Promise<IgProfile> {
  try {
    const u = new URL(IG_ME);
    u.searchParams.set("fields", IG_PROFILE_FIELDS);
    u.searchParams.set("access_token", t.accessToken);
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const text = await r.text();
    if (!r.ok) console.warn("[instagram] 프로필 실패", r.status, igErrorMessage(text));
    return (r.ok && parseProfile(text)) || NO_PROFILE;
  } catch (e) {
    console.warn("[instagram] 프로필 실패", (e as Error).name);
    return NO_PROFILE;
  }
}

const emailTaken = (e: AuthError) => e.code === "email_exists" || e.code === "user_already_exists" || (e.status === 422 && /already/i.test(e.message));
const clean = (o: Record<string, string | null>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
