"use client";
// 로그인 (F-AUTH-01): 카카오 · Google (Supabase OAuth) + 이메일 코드. 게스트 기록은 로그인 직후 계정과 합쳐진다 (F-AUTH-02)
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { authAvailable, useAccount } from "@/lib/client/account";
import { exploredCountries, useLocal } from "@/lib/client/passport";
import { supabaseBrowser } from "@/lib/db/supabase-browser";
import { Wordmark } from "./bits";

type Provider = "kakao" | "google";

export function LoginView({ live }: { live: boolean }) {
  return (
    <Suspense>
      <Login live={live} />
    </Suspense>
  );
}

/** Supabase 원문 오류 → 사용자 말 */
function friendly(msg: string, provider?: Provider): string {
  if (/provider is not enabled|Unsupported provider/i.test(msg))
    return `${provider === "kakao" ? "카카오" : provider === "google" ? "Google" : "이"} 로그인은 아직 준비 중이에요. 이메일로 로그인해 주세요.`;
  if (/rate limit|too many/i.test(msg))
    return "잠시 후 다시 시도해 주세요. (메일은 1분에 1번 보낼 수 있어요)";
  if (/expired|invalid/i.test(msg))
    return "코드가 맞지 않거나 시간이 지났어요. 새 코드를 받아 주세요.";
  if (/access_denied|cancel/i.test(msg)) return "로그인을 취소했어요.";
  return `로그인하지 못했어요: ${msg}`;
}

function Login({ live }: { live: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next =
    params.get("next")?.startsWith("/") && !params.get("next")?.startsWith("//")
      ? params.get("next")!
      : "/passport";
  const acct = useAccount();
  const countries = useLocal(exploredCountries).length;
  const foods = useLocal((s) => Object.keys(s.entries).length);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"start" | "code">("start");
  const [busy, setBusy] = useState<Provider | "email" | "code" | null>(null);
  const [msg, setMsg] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(
    params.get("error")
      ? { tone: "error", text: friendly(params.get("error")!) }
      : null,
  );

  // Supabase 에서 켠 로그인 방식만 버튼으로 — 꺼진 제공자를 누르면 Supabase 오류 화면(JSON)으로 가 버린다
  const [providers, setProviders] = useState<Record<Provider, boolean> | null>(
    null,
  );
  useEffect(() => {
    if (!authAvailable) return;
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    })
      .then((r) => r.json())
      .then((d: { external?: Record<string, boolean> }) =>
        setProviders({
          kakao: !!d.external?.kakao,
          google: !!d.external?.google,
        }),
      )
      .catch(() => setProviders({ kakao: true, google: true })); // 확인 실패 시 보여 주고, 오류는 콜백에서 안내
  }, []);
  const social = (["kakao", "google"] as const).filter(
    (p) => providers?.[p] ?? false,
  );

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

  if (acct.status === "user") {
    return (
      <Shell>
        <div className="space-y-3 rounded-3xl bg-surface p-5 text-center">
          <p className="text-lg font-semibold">이미 로그인했어요</p>
          <p className="text-sm text-muted">
            {acct.user?.email ?? acct.user?.name}
          </p>
          <Link
            href={next}
            className="block rounded-2xl bg-green-800 py-3 font-semibold text-ivory"
          >
            계속하기
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-2">
        <h1 className="font-display text-h1 font-semibold leading-tight">
          탐험 기록을
          <br />
          계정에 저장해요
        </h1>
        <p className="text-sm text-muted">
          휴대폰을 바꿔도, 다른 기기에서도 Passport 가 이어져요.
        </p>
      </div>

      {foods > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-mint-100/70 px-4 py-3 text-sm text-green-800">
          <span className="text-xl" aria-hidden>
            📕
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
        <p className="rounded-xl bg-[#FFF6D6] px-3 py-2 text-caption text-[#7A5B00]">
          로그인은 Supabase 연결 후에 열려요. 지금은 이 기기에만 저장돼요.
        </p>
      )}
      {authAvailable && !live && (
        <p className="rounded-xl bg-[#FFF6D6] px-3 py-2 text-caption text-[#7A5B00]">
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
              className="relative flex w-full items-center justify-center rounded-2xl bg-[#FEE500] py-3.5 font-semibold text-black/85 transition active:scale-[0.99] disabled:opacity-50"
            >
              <KakaoIcon />
              {busy === "kakao" ? "카카오로 이동 중…" : "카카오로 시작하기"}
            </button>
          )}
          {social.includes("google") && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void oauth("google")}
              className="relative flex w-full items-center justify-center rounded-2xl border border-line bg-white py-3.5 font-semibold text-charcoal transition active:scale-[0.99] disabled:opacity-50"
            >
              <GoogleIcon />
              {busy === "google" ? "Google 로 이동 중…" : "Google 로 시작하기"}
            </button>
          )}
          {social.length > 0 && (
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
              className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-mint-500"
            />
            <button
              disabled={!authAvailable || !!busy}
              className="shrink-0 rounded-2xl bg-green-800 px-4 font-semibold text-ivory disabled:opacity-50"
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
            className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-center text-xl tracking-[0.4em] outline-none focus:border-mint-500"
            autoFocus
          />
          <button
            disabled={!!busy}
            className="w-full rounded-2xl bg-green-800 py-3.5 font-semibold text-ivory disabled:opacity-50"
          >
            {busy === "code" ? "확인 중…" : "로그인"}
          </button>
          <button
            type="button"
            onClick={() => (setStep("start"), setCode(""), setMsg(null))}
            className="w-full text-sm text-muted"
          >
            이메일 다시 입력
          </button>
        </form>
      )}

      {msg && (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${msg.tone === "error" ? "bg-[#FDECEA] text-[#9B2C1F]" : "bg-mint-100 text-green-800"}`}
        >
          {msg.text}
        </p>
      )}

      <div className="space-y-3 pt-2 text-center">
        <Link
          href={next}
          className="text-sm font-medium text-muted underline-offset-4 hover:underline"
        >
          로그인 없이 계속 둘러보기
        </Link>
        <p className="text-caption text-muted/80">
          로그인하면 탐험 기록·식이 조건·취향이 계정에 저장돼요. 언제든 Passport
          에서 탈퇴하면 모두 지워져요.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col gap-6 px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Wordmark />
      </header>
      <div className="flex flex-1 flex-col justify-center gap-6">
        {children}
      </div>
    </main>
  );
}

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="absolute left-5 size-5" aria-hidden>
      <path
        fill="#000"
        d="M12 3.5c-5.25 0-9.5 3.3-9.5 7.36 0 2.62 1.75 4.92 4.4 6.22-.15.52-.94 3.3-.97 3.52 0 0-.02.16.09.22.1.06.23.01.23.01.3-.04 3.48-2.28 4.03-2.67.56.08 1.13.12 1.72.12 5.25 0 9.5-3.3 9.5-7.4S17.25 3.5 12 3.5Z"
        opacity=".9"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="absolute left-5 size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
