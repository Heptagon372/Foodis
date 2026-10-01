"use client";
// Passport 의 계정 영역 (F-AUTH-01·02): 게스트 → 로그인 권유, 회원 → 동기화 상태 · 로그아웃 · 탈퇴
import Link from "next/link";
import { useState } from "react";
import { deleteAccount, signOut, useAccount, type Account } from "@/lib/client/account";

const SYNC_LABEL: Record<Account["sync"], string> = {
  idle: "",
  syncing: "저장하는 중…",
  ok: "계정에 저장됨",
  error: "저장 실패 — 연결되면 다시 시도해요",
  preview: "미리보기 모드라 이 기기에만 저장돼요",
};

const PROVIDER: Record<string, string> = { kakao: "카카오", google: "Google", email: "이메일" };

/** 게스트용 한 줄 권유 — 기록이 조금 쌓였을 때만 */
export function AccountNudge({ foods }: { foods: number }) {
  const acct = useAccount();
  if (acct.status !== "guest" || foods < 3) return null;
  return (
    <Link href="/login?next=/passport" className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm transition active:scale-[0.99]">
      <span>
        <b className="text-green-800">{foods}개 음식</b> 기록, 계정에 저장해 둘까요?
      </span>
      <span className="shrink-0 font-semibold text-green-800">로그인 →</span>
    </Link>
  );
}

export function AccountCard() {
  const acct = useAccount();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (acct.status === "off" || acct.status === "loading") return null;
  if (acct.status === "guest") {
    return (
      <div className="space-y-3 rounded-3xl bg-surface p-5 shadow-sm">
        <p className="font-semibold">로그인 없이 쓰는 중</p>
        <p className="text-sm text-muted">기록이 이 브라우저에만 있어요. 로그인하면 계정에 저장되고 다른 기기에서도 이어져요.</p>
        <Link href="/login?next=/passport" className="block rounded-2xl bg-green-800 py-3 text-center font-semibold text-ivory">
          로그인하고 저장하기
        </Link>
      </div>
    );
  }

  const u = acct.user!;
  const initial = (u.name ?? u.email ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div className="space-y-4 rounded-3xl bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-3">
        {u.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- 제공자 프로필 이미지(외부 도메인)
          <img src={u.avatar} alt="" className="size-11 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-11 place-items-center rounded-full bg-green-800 font-display text-lg font-semibold text-ivory" aria-hidden>
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{u.name ?? u.email}</p>
          <p className="truncate text-caption text-muted">
            {PROVIDER[u.provider] ?? u.provider} 로그인{u.name && u.email ? ` · ${u.email}` : ""}
          </p>
        </div>
      </div>
      {acct.sync !== "idle" && (
        <p className={`flex items-center gap-2 text-caption ${acct.sync === "error" ? "text-diet-no" : acct.sync === "preview" ? "text-muted" : "text-green-800"}`}>
          <span className={`size-1.5 rounded-full ${acct.sync === "ok" ? "bg-mint-500" : acct.sync === "syncing" ? "animate-pulse bg-mint-500" : acct.sync === "error" ? "bg-diet-no" : "bg-muted"}`} aria-hidden />
          {SYNC_LABEL[acct.sync]}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => (setBusy(true), void signOut().finally(() => setBusy(false)))} className="flex-1 rounded-2xl border border-line py-2.5 text-sm font-medium disabled:opacity-50">
          로그아웃
        </button>
        <button type="button" onClick={() => setConfirm((c) => !c)} className="rounded-2xl px-3 py-2.5 text-sm text-muted">
          탈퇴
        </button>
      </div>
      {confirm && (
        <div className="space-y-3 rounded-2xl border border-diet-no/30 bg-diet-no/5 p-4 text-sm">
          <p>
            탈퇴하면 <b>계정과 Passport·식이 조건·Food DNA 가 모두 지워지고</b> 되돌릴 수 없어요.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                if (!(await deleteAccount())) setErr("탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요.");
                setBusy(false);
              }}
              className="rounded-xl bg-diet-no px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "지우는 중…" : "모두 지우고 탈퇴"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-xl px-4 py-2 text-muted">
              취소
            </button>
          </div>
          {err && <p className="text-diet-no">{err}</p>}
        </div>
      )}
    </div>
  );
}
