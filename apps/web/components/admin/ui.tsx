"use client";
// 어드민 공용 클라이언트 조각: API 호출 버튼, 로그아웃
// 모양은 디자인 v2 부품(btn) + 테마 토큰만 → 라이트/다크가 같이 맞는다 (docs/design/09)
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { btn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/db/supabase-browser";

export async function callApi(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data?.error?.details) ? `\n· ${data.error.details.join("\n· ")}` : "";
    throw new Error((data?.error?.message ?? `HTTP ${res.status}`) + details);
  }
  return data;
}

/** 누르면 API 를 부르고 화면을 새로 고친다. confirm 문구가 있으면 먼저 묻는다 */
export function ActionButton(p: { url: string; method?: string; body?: unknown; confirm?: string; children: ReactNode; tone?: "primary" | "plain" | "danger"; done?: (data: unknown) => string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 위험 동작은 초록 대신 의미색 테두리 — 주 버튼과 헷갈리지 않게
  const tone = {
    primary: btn("primary", "sm"),
    plain: btn("outline", "sm"),
    danger:
      "inline-flex h-10 select-none items-center justify-center gap-2 rounded-full border border-diet-no/40 bg-surface px-4 text-[13px] font-semibold text-diet-no transition hover:border-diet-no/70 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
  }[p.tone ?? "plain"];
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (p.confirm && !confirm(p.confirm)) return;
          setBusy(true);
          setMsg(null);
          try {
            const data = await callApi(p.url, p.method ?? "POST", p.body);
            setMsg(p.done ? p.done(data) : "완료");
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className={tone}
      >
        {busy ? "처리 중…" : p.children}
      </button>
      {msg && (
        <span role="status" className="max-w-xs whitespace-pre-line text-caption text-ink-soft">
          {msg}
        </span>
      )}
    </span>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/admin/login");
        router.refresh();
      }}
      className={btn("ghost", "sm")}
    >
      <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
      로그아웃
    </button>
  );
}
