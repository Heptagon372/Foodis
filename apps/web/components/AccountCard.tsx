"use client";
// Passport 의 계정 영역 (F-AUTH-01·02): 게스트 → 로그인 권유, 회원 → 동기화 상태 · 연결된 계정(카카오·Google·Instagram) · 로그아웃 · 탈퇴
import Link from "next/link";
import { useState } from "react";
import { deleteAccount, signOut, useAccount, type Account } from "@/lib/client/account";
import { Icon } from "./icons";
import { LinkedAccounts } from "./LinkedAccounts";
import { btn, IconTile } from "./ui";

const SYNC_LABEL: Record<Account["sync"], string> = {
  idle: "",
  syncing: "저장하는 중…",
  ok: "계정에 저장됨",
  error: "저장 실패 — 연결되면 다시 시도해요",
  preview: "미리보기 모드라 이 기기에만 저장돼요",
};

const PROVIDER: Record<string, string> = { kakao: "카카오", google: "Google", instagram: "Instagram", email: "이메일" };

/** 게스트용 한 줄 권유 — 기록이 조금 쌓였을 때만 */
export function AccountNudge({ foods }: { foods: number }) {
  const acct = useAccount();
  if (acct.status !== "guest" || foods < 3) return null;
  return (
    <Link href="/login?next=/passport" className="glass flex min-h-14 items-center gap-3 rounded-3xl py-2.5 pl-2.5 pr-4 text-sm text-ink transition active:scale-[0.99]">
      <IconTile icon="user" size="sm" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-leaf">{foods}개 음식</b> 기록, 계정에 저장해 둘까요?
      </span>
      <span className="inline-flex shrink-0 items-center font-semibold text-leaf">
        로그인
        <Icon name="next" className="size-4" />
      </span>
    </Link>
  );
}

export function AccountCard() {
  const acct = useAccount();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [broken, setBroken] = useState(false); // 인스타 프로필 사진 주소는 며칠 뒤 만료된다 → 첫 글자로

  if (acct.status === "off" || acct.status === "loading") return null;
  if (acct.status === "guest") {
    return (
      <div className="card space-y-4 rounded-3xl p-5">
        <div className="flex items-start gap-3">
          <IconTile icon="user" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-ink">로그인 없이 쓰는 중</p>
            <p className="text-sm text-ink-soft">기록이 이 브라우저에만 있어요. 로그인하면 계정에 저장되고 다른 기기에서도 이어져요.</p>
          </div>
        </div>
        <Link href="/login?next=/passport" className={`${btn("primary")} w-full`}>
          로그인하고 저장하기
        </Link>
      </div>
    );
  }

  const u = acct.user!;
  const initial = (u.name ?? u.email ?? "?").replace(/^@/, "").trim().charAt(0).toUpperCase();
  // 이름 옆 보조 표시: 메일, 없으면 인스타 @아이디 (이름이 이미 @아이디면 생략). 인스타 전용 회원의 가짜 메일은 u.email 에 오지 않는다
  const sub = u.name && u.email ? u.email : u.handle && u.name !== `@${u.handle}` ? `@${u.handle}` : null;
  return (
    <div className="card space-y-4 rounded-3xl p-5">
      <div className="flex items-center gap-3">
        {u.avatar && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- 제공자 프로필 이미지(외부 도메인)
          <img src={u.avatar} alt="" className="size-11 rounded-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        ) : (
          <span className="grid size-11 place-items-center rounded-full bg-brand text-lg font-bold text-on-brand" aria-hidden>
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{u.name ?? u.email ?? "내 계정"}</p>
          <p className="truncate text-caption text-muted">
            {PROVIDER[u.provider] ?? u.provider} 로그인{sub ? ` · ${sub}` : ""}
          </p>
        </div>
      </div>
      {acct.sync !== "idle" && (
        <p className={`flex items-center gap-2 text-caption ${acct.sync === "error" ? "text-diet-no" : acct.sync === "preview" ? "text-muted" : "text-leaf"}`}>
          {/* 상태는 색 점 대신 아이콘 + 글자로 */}
          <Icon
            name={acct.sync === "ok" ? "check-circle" : acct.sync === "syncing" ? "replay" : acct.sync === "error" ? "warn" : "info"}
            className={`size-4 shrink-0 ${acct.sync === "syncing" ? "animate-spin-slow motion-reduce:animate-none" : ""}`}
          />
          {SYNC_LABEL[acct.sync]}
        </p>
      )}
      <LinkedAccounts />
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => (setBusy(true), void signOut().finally(() => setBusy(false)))} className={`${btn("outline", "sm")} flex-1`}>
          로그아웃
        </button>
        <button type="button" aria-expanded={confirm} onClick={() => setConfirm((c) => !c)} className={btn("ghost", "sm")}>
          탈퇴
        </button>
      </div>
      {confirm && (
        <div className="space-y-3 rounded-2xl border border-diet-no/30 bg-diet-no/5 p-4 text-sm text-ink">
          <p className="flex gap-2">
            <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-diet-no" />
            <span>
            탈퇴하면 <b>계정과 Passport·식이 조건·Food DNA 가 모두 지워지고</b> 되돌릴 수 없어요.
            </span>
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
              className="inline-flex h-10 items-center rounded-full bg-diet-no px-4 font-semibold text-surface transition active:scale-[0.97] disabled:opacity-50"
            >
              {busy ? "지우는 중…" : "모두 지우고 탈퇴"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className={btn("ghost", "sm")}>
              취소
            </button>
          </div>
          {err && (
            <p role="alert" className="text-diet-no">
              {err}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
