"use client";
// 어드민 공용 클라이언트 조각: API 호출 버튼, 로그아웃
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  const tone = { primary: "bg-green-800 text-ivory", plain: "border border-line bg-surface", danger: "border border-diet-no/40 text-diet-no bg-surface" }[p.tone ?? "plain"];
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
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${tone}`}
      >
        {busy ? "처리 중…" : p.children}
      </button>
      {msg && <span className="max-w-xs whitespace-pre-line text-caption text-muted">{msg}</span>}
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
      className="text-caption text-muted underline"
    >
      로그아웃
    </button>
  );
}
