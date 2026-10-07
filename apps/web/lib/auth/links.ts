// 로그인 방법 · 계정 연결 공용 규칙 (브라우저·서버 둘 다 쓰는 순수 함수 — 06 문서 §7)
// 인스타그램으로 처음 가입한 회원은 Supabase 에 가짜 메일(instagram-<id>@users.foodis.invalid)로 만든다. 이 메일은 화면 어디에도 보이지 않게 한다
export type LinkProvider = "kakao" | "google" | "instagram";
export const LINK_PROVIDERS: readonly LinkProvider[] = ["kakao", "google", "instagram"];
export const LINK_LABEL: Record<LinkProvider, string> = { kakao: "카카오", google: "Google", instagram: "Instagram" };

// .invalid 는 실제로 존재할 수 없는 최상위 도메인 (RFC 2606) — 메일이 나갈 일이 없다
export const SYNTHETIC_DOMAIN = "users.foodis.invalid";
export const syntheticEmail = (provider: "instagram", uid: string) => `${provider}-${uid}@${SYNTHETIC_DOMAIN}`;
/** 인스타 연결을 해제한 회원의 메일 — 같은 인스타로 다시 로그인하면 이 계정이 아닌 새 계정이 되게 메일을 비켜 둔다 */
export const retiredEmail = (userId: string) => `user-${userId}@${SYNTHETIC_DOMAIN}`;
export const isSyntheticEmail = (email?: string | null) => !!email && email.trim().toLowerCase().endsWith(`@${SYNTHETIC_DOMAIN}`);
/** 화면에 보여도 되는 메일 — 가짜 메일이면 null */
export const visibleEmail = (email?: string | null) => (email && !isSyntheticEmail(email) ? email : null);

/** ?next= 는 같은 사이트 경로만 (오픈 리다이렉트 방지). URL 파서는 탭·줄바꿈을 지우고 \ 를 / 로 읽어서("/\t/evil" → "//evil") 제어 문자·역슬래시도 거절한다 */
export const safeNext = (v: unknown, fallback = "/passport"): string =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !/[\x00-\x1f\x7f\\]/.test(v) ? v : fallback;

/** 같은 사이트 경로에 쿼리 하나 붙이기 — 기존 쿼리·해시(#account)는 지킨다 */
export function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, "http://foodis.local");
  u.searchParams.set(key, value);
  return u.pathname + u.search + u.hash;
}

export const loginErrorPath = (code: string, next: string) => `/login?error=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;

/** 회원의 로그인 방법 — identities 는 Supabase 신원 제공자 목록(email·kakao·google…), instagram 은 social_links 연결 여부 */
export type SignInMethods = { identities: string[]; instagram: boolean; email: string | null };

/** 실제로 다시 들어올 수 있는 방법들. 가짜 메일은 코드를 받을 수 없어 빼고, 진짜 메일은 이메일 코드 로그인으로 친다 */
export function usableMethods(m: SignInMethods): Set<string> {
  const s = new Set<string>();
  for (const p of m.identities) if (p !== "email" && p !== "phone") s.add(p);
  if (m.instagram) s.add("instagram");
  if (visibleEmail(m.email)) s.add("email");
  return s;
}

export type UnlinkVerdict = { ok: true } | { ok: false; reason: "not_linked" | "primary" | "last_method" };

/** 해제해도 되나: 마지막 로그인 방법은 절대 못 지운다. 카카오·Google 은 Supabase 가 신원 2개 이상일 때만 지우게 한다(가입 때 신원 하나뿐이면 불가) */
export function canUnlink(target: LinkProvider, m: SignInMethods): UnlinkVerdict {
  const usable = usableMethods(m);
  if (!usable.has(target)) return { ok: false, reason: "not_linked" };
  if (target !== "instagram" && m.identities.length < 2) return { ok: false, reason: "primary" };
  usable.delete(target);
  return usable.size > 0 ? { ok: true } : { ok: false, reason: "last_method" };
}

export const UNLINK_BLOCKED: Record<Exclude<UnlinkVerdict, { ok: true }>["reason"], string> = {
  not_linked: "연결되어 있지 않아요",
  primary: "처음 가입한 로그인 방법이라 해제할 수 없어요",
  last_method: "마지막 로그인 방법이라 해제할 수 없어요",
};

// 인스타그램 콜백·연결 오류 코드 → 사용자 말 (로그인 화면 friendly() 와 Passport/설정 연결 카드가 같이 쓴다)
const AUTH_ERRORS: Record<string, string> = {
  instagram_not_configured: "인스타그램 로그인은 아직 준비 중이에요. 다른 방법으로 로그인해 주세요.",
  instagram_state: "로그인 요청이 만료됐어요. 처음부터 다시 시도해 주세요.",
  instagram_denied: "인스타그램에서 허용하지 않았어요. 프로페셔널(비즈니스·크리에이터) 계정인지 확인해 주세요.",
  instagram_token: "인스타그램 인증에 실패했어요. 잠시 후 다시 시도해 주세요.",
  instagram_db: "계정 연결 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  instagram_signup: "인스타그램으로 가입하지 못했어요. 잠시 후 다시 시도해 주세요.",
  instagram_session: "로그인 세션을 만들지 못했어요. 다시 시도해 주세요.",
  instagram_rate: "시도가 너무 많아요. 1분 뒤에 다시 시도해 주세요.",
  instagram_linked_elsewhere: "이미 다른 FOODIS 계정에 연결된 인스타그램이에요.",
  instagram_already_linked: "이미 다른 인스타그램이 연결돼 있어요. 해제한 뒤 다시 연결해 주세요.",
  identity_already_exists: "이미 다른 FOODIS 계정에 연결된 계정이에요.",
  manual_linking_disabled: "지금은 계정 연결을 쓸 수 없어요. (관리자: Supabase → Authentication → Sign In / Providers → \"Allow manual linking\" 켜기)",
  login_required: "먼저 로그인해 주세요.",
  access_denied: "로그인을 취소했어요.",
};

/** 알려진 오류 코드·Supabase 원문이면 사용자 말, 아니면 null */
export function authErrorText(msg: string): string | null {
  if (AUTH_ERRORS[msg]) return AUTH_ERRORS[msg];
  if (msg === "single_identity_not_deletable") return UNLINK_BLOCKED.primary;
  if (/manual linking/i.test(msg)) return AUTH_ERRORS.manual_linking_disabled;
  if (/already linked|identity.*already exists/i.test(msg)) return AUTH_ERRORS.identity_already_exists;
  if (/single identity|last identity|at least 2 identities/i.test(msg)) return UNLINK_BLOCKED.primary;
  return null;
}
