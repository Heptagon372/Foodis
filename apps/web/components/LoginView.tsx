"use client";
// 로그인 (F-AUTH-01): 카카오 · Google (Supabase OAuth) · 인스타그램 (직접 OAuth, app/auth/instagram) + 이메일 코드. 게스트 기록은 로그인 직후 계정과 합쳐진다 (F-AUTH-02)
// 모바일은 화면 전체, PC(sm 이상)는 가운데 카드 한 장
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { authErrorText, safeNext } from "@/lib/auth/links";
import { authAvailable, useAccount, useAuthProviders } from "@/lib/client/account";
import { exploredCountries, useLocal } from "@/lib/client/passport";
import { supabaseBrowser } from "@/lib/db/supabase-browser";
import { Wordmark } from "./bits";
import { GoogleGlyph, InstagramGlyph, INSTAGRAM_GRADIENT, KakaoGlyph } from "./BrandIcons";
import { Icon } from "./icons";
import { btn } from "./ui";

// 입력칸 공통 — 바탕은 surface, 포커스는 리프 링 (두 테마 모두 토큰)
const INPUT = "rounded-2xl border border-line bg-surface px-4 text-ink outline-none transition placeholder:text-muted focus:border-leaf focus:ring-2 focus:ring-leaf/25";
// 안내 띠 (미리보기·준비 중) — PreviewBanner 와 같은 식이 '주의' 의미색
const NOTE = "flex items-start gap-2 rounded-2xl border border-diet-warn/25 bg-diet-warn/10 px-3.5 py-2.5 text-caption text-diet-warn-ink";

type Provider = "kakao" | "google";

/** instagram: 서버에 인스타 앱 ID·시크릿이 있는지 (값은 넘기지 않는다) */
export function LoginView({ live, instagram }: { live: boolean; instagram: boolean }) {
  return (
    <Suspense>
      <Login live={live} instagram={instagram} />
    </Suspense>
  );
}

/** Supabase 원문 오류 · 인스타 콜백 오류 코드 → 사용자 말 */
function friendly(msg: string, provider?: Provider): string {
  const known = authErrorText(msg);
  if (known) return known;
  if (/provider is not enabled|Unsupported provider/i.test(msg))
    return `${provider === "kakao" ? "카카오" : provider === "google" ? "Google" : "이"} 로그인은 아직 준비 중이에요. 이메일로 로그인해 주세요.`;
  if (/rate limit|too many/i.test(msg))
    return "잠시 후 다시 시도해 주세요. (메일은 1분에 1번 보낼 수 있어요)";
  if (/expired|invalid/i.test(msg))
    return "코드가 맞지 않거나 시간이 지났어요. 새 코드를 받아 주세요.";
  if (/access_denied|cancel/i.test(msg)) return "로그인을 취소했어요.";
  return `로그인하지 못했어요: ${msg}`;
}

function Login({ live, instagram }: { live: boolean; instagram: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const acct = useAccount();
  const countries = useLocal(exploredCountries).length;
  const foods = useLocal((s) => Object.keys(s.entries).length);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"start" | "code">("start");
  const [busy, setBusy] = useState<Provider | "instagram" | "email" | "code" | null>(null);
  const [msg, setMsg] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(
    params.get("error")
      ? { tone: "error", text: friendly(params.get("error")!) }
      : null,
  );

  // Supabase 에서 켠 로그인 방식만 버튼으로 — 꺼진 제공자를 누르면 Supabase 오류 화면(JSON)으로 가 버린다
  const providers = useAuthProviders();
  const social = (["kakao", "google"] as const).filter(
    (p) => providers?.[p] ?? false,
  );
  // 카카오·Google 확인이 끝난 뒤 함께 그린다 — 먼저 그리면 위에 버튼이 끼어들며 아래로 밀린다
  const withInstagram = authAvailable && instagram && providers !== null;
  // 제공자 화면에서 '뒤로'로 돌아오면(bfcache) "이동 중…" 이 남지 않게
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setBusy(null);
    addEventListener("pageshow", reset);
    return () => removeEventListener("pageshow", reset);
  }, []);

  const callback = () =>
    `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const oauth = async (provider: Provider) => {
    setBusy(provider);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback() },
    });
    // 성공이면 제공자 화면으로 이동한다 — 여기로 돌아오는 건 실패뿐
    if (error) {
      setBusy(null);
      setMsg({ tone: "error", text: friendly(error.message, provider) });
    }
  };
  // 인스타그램은 Supabase 제공자가 아니라 우리 서버 라우트가 OAuth 를 돈다
  const instagramLogin = () => {
    setBusy("instagram");
    setMsg(null);
    location.assign(`/auth/instagram?mode=login&next=${encodeURIComponent(next)}`);
  };
  const sendCode = async () => {
    setBusy("email");
    setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: callback() },
    });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: friendly(error.message) });
    setStep("code");
    setMsg({
      tone: "info",
      text: `${email.trim()} 로 메일을 보냈어요. 메일의 링크를 누르거나 6자리 코드를 입력하세요.`,
    });
  };
  const verify = async () => {
    setBusy("code");
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(null);
    if (error) return setMsg({ tone: "error", text: friendly(error.message) });
    router.replace(next);
  };

  const notice = msg && (
    <p
      role={msg.tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm ${msg.tone === "error" ? "border border-diet-no/25 bg-diet-no/10 text-diet-no" : "bg-lime-soft text-ink"}`}
    >
      <Icon name={msg.tone === "error" ? "warn" : "check-circle"} className={`mt-0.5 size-4 shrink-0 ${msg.tone === "error" ? "" : "text-leaf"}`} />
      {msg.text}
    </p>
  );

  if (acct.status === "user") {
    return (
      <Shell>
        {/* 로그인한 채로 온 오류(예: 인스타 연결 요청 만료)도 보이게 */}
        {notice}
        <div className="flex flex-col items-center gap-3 rounded-[28px] text-center max-sm:card max-sm:p-6">
          <span className="grid size-14 place-items-center rounded-[18px] bg-lime-soft text-leaf" aria-hidden>
            <Icon name="check-circle" className="size-6" />
          </span>
          <p className="text-title font-bold text-ink">이미 로그인했어요</p>
          <p className="text-sm text-ink-soft">
            {acct.user?.email ?? acct.user?.name}
          </p>
          <Link href={next} className={`${btn("primary")} mt-1 w-full`}>
            계속하기
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-2">
        <h1 className="text-h1">
          <span className="block font-medium text-ink-soft">탐험 기록을</span>
          <span className="block font-bold text-ink">계정에 저장해요</span>
        </h1>
        <p className="text-sm text-ink-soft">
          휴대폰을 바꿔도, 다른 기기에서도 Passport 가 이어져요.
        </p>
      </div>

      {foods > 0 && (
        <div className="glass flex items-center gap-3 rounded-3xl p-3 pr-4 text-sm text-ink">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lime-soft text-leaf" aria-hidden>
            <Icon name="passport" className="size-5" />
          </span>
          <span>
            지금까지 모은{" "}
            <b>
              {countries}개국 · {foods}개 음식
            </b>
            도 로그인하면 계정으로 옮겨져요.
          </span>
        </div>
      )}
      {!authAvailable && (
        <p className={NOTE}>
          <Icon name="info" className="mt-px size-4 shrink-0" />
          로그인은 Supabase 연결 후에 열려요. 지금은 이 기기에만 저장돼요.
        </p>
      )}
      {authAvailable && !live && (
        <p className={NOTE}>
          <Icon name="info" className="mt-px size-4 shrink-0" />
          미리보기 모드예요. 로그인은 되지만 기록은 실제 DB 가 준비된 뒤 계정에
          저장돼요.
        </p>
      )}

      {step === "start" ? (
        <div className="space-y-3">
          {social.includes("kakao") && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void oauth("kakao")}
              // 카카오 공식 표기(노랑 #FEE500 + 검정 85%)는 브랜드 가이드라 테마와 무관하게 고정
              className="relative flex h-12 w-full items-center justify-center rounded-full bg-[#FEE500] font-semibold text-black/85 transition active:scale-[0.99] disabled:opacity-50"
            >
              <KakaoGlyph className="absolute left-5 size-5" />
              {busy === "kakao" ? "카카오로 이동 중…" : "카카오로 시작하기"}
            </button>
          )}
          {social.includes("google") && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void oauth("google")}
              // Google 공식 라이트 버튼(흰 바탕 + #1F1F1F 글자) — 다크 테마에서도 브랜드 가이드의 라이트 표기를 쓴다
              className="relative flex h-12 w-full items-center justify-center rounded-full border border-[#747775] bg-white font-semibold text-[#1f1f1f] transition active:scale-[0.99] disabled:opacity-50"
            >
              <GoogleGlyph className="absolute left-5 size-5" />
              {busy === "google" ? "Google 로 이동 중…" : "Google 로 시작하기"}
            </button>
          )}
          {withInstagram && (
            <div className="space-y-1.5">
              <button
                type="button"
                disabled={!!busy}
                onClick={instagramLogin}
                // 인스타그램 브랜드 그라데이션 + 흰 글자 — 카카오·Google 과 같은 높이·모양의 알약
                className={`relative flex h-12 w-full items-center justify-center rounded-full ${INSTAGRAM_GRADIENT} font-semibold text-white transition active:scale-[0.99] disabled:opacity-50`}
              >
                <InstagramGlyph className="absolute left-5 size-5" />
                {busy === "instagram" ? "인스타그램으로 이동 중…" : "인스타그램으로 시작하기"}
              </button>
              {/* Meta 정책: 인스타그램 API 로그인은 프로페셔널 계정만 (개인 계정은 동의 화면에서 막힌다) */}
              <p className="px-2 text-center text-caption text-muted">
                인스타그램은 프로페셔널(비즈니스·크리에이터) 계정만 로그인할 수 있어요
              </p>
            </div>
          )}
          {(social.length > 0 || withInstagram) && (
            <div className="flex items-center gap-3 py-1 text-caption text-muted">
              <span className="h-px flex-1 bg-line" />
              또는 이메일
              <span className="h-px flex-1 bg-line" />
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => (e.preventDefault(), void sendCode())}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              autoComplete="email"
              className={`${INPUT} h-12 min-w-0 flex-1`}
            />
            <button
              disabled={!authAvailable || !!busy}
              className={`${btn("primary")} shrink-0`}
            >
              {busy === "email" ? "보내는 중" : "코드 받기"}
            </button>
          </form>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => (e.preventDefault(), void verify())}
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6자리 코드"
            className={`${INPUT} h-14 w-full text-center text-xl tracking-[0.4em]`}
            autoFocus
          />
          <button
            disabled={!!busy}
            className={`${btn("primary", "lg")} w-full`}
          >
            {busy === "code" ? "확인 중…" : "로그인"}
          </button>
          <button
            type="button"
            onClick={() => (setStep("start"), setCode(""), setMsg(null))}
            className={`${btn("ghost")} w-full`}
          >
            이메일 다시 입력
          </button>
        </form>
      )}

      {notice}

      <div className="space-y-3 pt-2 text-center">
        <Link
          href={next}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-leaf underline-offset-4 hover:underline"
        >
          로그인 없이 계속 둘러보기
          <Icon name="next" className="size-4" />
        </Link>
        <p className="text-caption text-muted">
          로그인하면 탐험 기록·식이 조건·취향이 계정에 저장돼요. 언제든 Passport
          에서 탈퇴하면 모두 지워져요.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // 모바일: 화면 전체 / PC(sm↑): 가운데 카드 한 장 (바깥 틀은 AppFrame 의 bare 경로 — max-w-md, lg 에서 max-w-lg)
  return (
    <main className="flex min-h-dvh flex-col px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:justify-center sm:px-0 sm:py-12">
      <div className="flex flex-1 flex-col gap-6 sm:card sm:flex-none sm:rounded-[32px] sm:p-8">
        <header className="flex items-center justify-between">
          <Wordmark />
        </header>
        <div className="flex flex-1 flex-col justify-center gap-6">
          {children}
        </div>
      </div>
    </main>
  );
}
