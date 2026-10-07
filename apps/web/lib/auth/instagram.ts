// 인스타그램 로그인 (Meta "Instagram API with Instagram Login" = 인스타그램 비즈니스 로그인). Supabase 에 인스타 제공자가 없어 OAuth 를 직접 돈다 (06 문서 §7)
// 여기는 순수 함수만 — 동의 주소 · 토큰/프로필 응답 읽기 · state 쿠키 서명. 네트워크·DB 는 app/auth/instagram/*
// 인스타 토큰은 신원 확인(사용자 id·이름)에만 쓰고 저장하지 않는다
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { safeNext } from "./links";

export const IG_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN = "https://api.instagram.com/oauth/access_token";
export const IG_ME = "https://graph.instagram.com/me";
export const IG_SCOPE = "instagram_business_basic";
export const IG_PROFILE_FIELDS = "user_id,username,name,profile_picture_url";
export const IG_STATE_COOKIE = "foodis_ig_state";
export const IG_STATE_PATH = "/auth/instagram"; // 시작·콜백 경로에만 실려 가게
export const IG_STATE_TTL_SEC = 600;

/** 앱 ID · 시크릿 · service_role 이 다 있어야 켠다 (가입·세션 발급이 service_role 로 돈다) */
export const instagramConfigured = (e: { instagramAppId?: string; instagramAppSecret?: string; supabaseServiceKey?: string; supabaseUrl?: string }) =>
  Boolean(e.instagramAppId && e.instagramAppSecret && e.supabaseServiceKey && e.supabaseUrl);

/** redirect_uri — 시작·토큰 교환 두 단계에서 글자 하나까지 같아야 한다. 요청 origin 으로 만든다 */
export const callbackUrl = (origin: string) => `${origin}/auth/instagram/callback`;

export function authorizeUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(IG_AUTHORIZE);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPE);
  u.searchParams.set("state", p.state);
  return u.toString();
}

/** 인스타가 code 끝에 붙이는 "#_" 는 code 가 아니다 (보통 해시라 서버엔 안 오지만 혹시 몰라 떼어 낸다) */
export const cleanCode = (code: string) => code.trim().replace(/#_$/, "");

export const tokenRequestBody = (p: { clientId: string; clientSecret: string; redirectUri: string; code: string }) =>
  new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, grant_type: "authorization_code", redirect_uri: p.redirectUri, code: cleanCode(p.code) });

// ── state 쿠키: 무작위 state + mode(login|link) + next + (연결이면) 시작한 회원 id. 앱 시크릿으로 HMAC 서명해 위조·변조를 막는다
export type IgMode = "login" | "link";
export type IgState = { state: string; mode: IgMode; next: string; uid?: string; exp: number };

export const newState = () => randomBytes(24).toString("base64url");
const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");
const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function encodeStateCookie(s: IgState, secret: string): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** 쿠키 서명 · 만료 · 주소의 state 일치를 모두 통과해야 IgState. 하나라도 어긋나면 null */
export function verifyStateCookie(cookie: string | undefined, state: string | null, secret: string, now = Date.now()): IgState | null {
  if (!cookie || !state) return null;
  const [body, sig, extra] = cookie.split(".");
  if (!body || !sig || extra !== undefined || !sameText(sig, mac(body, secret))) return null;
  let s: Partial<IgState>;
  try {
    s = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof s.state !== "string" || typeof s.exp !== "number" || s.exp < now || !sameText(s.state, state)) return null;
  if (s.mode !== "login" && s.mode !== "link") return null;
  if (s.mode === "link" && typeof s.uid !== "string") return null;
  return { state: s.state, mode: s.mode, next: safeNext(s.next), uid: s.uid, exp: s.exp };
}

// ── 응답 읽기. 인스타 id 는 17자리 숫자라 숫자로 오면 JSON.parse 가 끝자리를 잃는다(2^53 초과) → 원문에서 숫자 그대로 뽑는다
const rawId = (text: string, key: string): string | null => text.match(new RegExp(`"${key}"\\s*:\\s*"?(\\d+)`))?.[1] ?? null;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** userId 가 비면 /me 의 id 로 대신한다 (콜백) */
export type IgToken = { accessToken: string; userId: string | null };

/** 토큰 응답: 평평한 {access_token, user_id, permissions} 또는 {data: [{…}]} 둘 다 받는다 */
export function parseTokenResponse(text: string): IgToken | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const wrapped = (j as { data?: unknown })?.data;
  const o = (Array.isArray(wrapped) ? wrapped[0] : j) as { access_token?: unknown; user_id?: unknown } | undefined;
  const accessToken = str(o?.access_token);
  return accessToken ? { accessToken, userId: rawId(text, "user_id") ?? str(o?.user_id) } : null;
}

export type IgProfile = { id: string | null; username: string | null; name: string | null; avatar: string | null };

/** /me 응답 — 빠진 필드는 null 로 (권한·계정 종류에 따라 name·사진이 없을 수 있다) */
export function parseProfile(text: string): IgProfile | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || "error" in o) return null;
  const avatar = str(o.profile_picture_url);
  return { id: rawId(text, "id") ?? str(o.id), username: str(o.username), name: str(o.name), avatar: avatar && /^https:\/\//.test(avatar) ? avatar : null };
}

/** 오류 응답에서 로그용 한 줄 ({error_message} 또는 {error:{message}}) — 토큰·시크릿은 담기지 않는다 */
export function igErrorMessage(text: string): string {
  try {
    const o = JSON.parse(text) as { error_message?: string; error?: { message?: string } | string };
    return o.error_message ?? (typeof o.error === "string" ? o.error : o.error?.message) ?? text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}
