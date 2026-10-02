"use client";
// 어드민 로그인: 이메일로 받은 6자리 코드 (Supabase 이메일 OTP — OAuth 설정 없이 바로 쓸 수 있다)
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Wordmark } from "@/components/bits";
import { Icon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { btn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/db/supabase-browser";

const INPUT = "h-12 w-full rounded-xl border border-line bg-surface px-4 text-ink placeholder:text-muted focus:border-brand";

export default function AdminLogin() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const denied = params.get("denied");
  const linkError = params.get("error");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(
    denied ? "로그인은 됐지만 어드민 권한이 없어요. 관리자에게 admin_roles 등록을 요청하세요 (또는 .env.local 의 ADMIN_EMAILS)." : linkError ? `로그인 링크 오류: ${linkError}` : null,
  );

  const send = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/admin/auth/callback` } });
    setBusy(false);
    if (error) return setMsg(`보내기 실패: ${error.message}`);
    setStep("code");
    setMsg(`${email} 로 로그인 메일을 보냈어요. 메일의 링크를 누르거나, 6자리 코드가 있으면 아래에 입력하세요.`);
  };
  const verify = async () => {
    setBusy(true);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setMsg(`코드가 맞지 않아요: ${error.message}`);
    router.replace("/admin");
    router.refresh();
  };

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <ThemeToggle className="absolute right-6 top-[max(1.25rem,env(safe-area-inset-top))]" />
      <div className="space-y-1">
        <Wordmark />
        <h1 className="text-h2 font-bold text-ink">콘텐츠 검수 어드민</h1>
        <p className="text-sm text-ink-soft">DB가 사실의 기준 — 검수를 거친 음식만 푸디가 말해요.</p>
      </div>
      {step === "email" ? (
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void send())}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="팀 이메일" aria-label="팀 이메일" className={INPUT} autoFocus />
          <button disabled={busy} className={`${btn("primary", "md")} w-full`}>{busy ? "보내는 중…" : "코드 받기"}</button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), void verify())}>
          <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6자리 코드" aria-label="6자리 코드" className={`${INPUT} text-center text-xl tracking-[0.4em]`} autoFocus />
          <button disabled={busy} className={`${btn("primary", "md")} w-full`}>{busy ? "확인 중…" : "로그인"}</button>
          <button type="button" onClick={() => setStep("email")} className={`${btn("ghost", "sm")} w-full`}>
            이메일 다시 입력
          </button>
        </form>
      )}
      {msg && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-lime-soft px-4 py-3 text-sm text-leaf">
          <Icon name="info" className="mt-px size-[18px] shrink-0" />
          <span>{msg}</span>
        </p>
      )}
    </main>
  );
}
