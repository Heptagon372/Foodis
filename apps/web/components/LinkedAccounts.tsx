"use client";
// "연결된 계정" (06 문서 §7): 카카오 · Google · Instagram 을 한 FOODIS 계정에 붙이고 뗀다. 어느 방법으로 로그인해도 같은 기록이 열린다
// 카카오·Google = Supabase 신원 (linkIdentity / unlinkIdentity — Supabase 의 "Allow manual linking" 이 켜져 있어야 한다)
// Instagram = 우리 OAuth (/auth/instagram?mode=link) + /api/me/links. 마지막 로그인 방법은 못 뗀다 (canUnlink — 서버도 같은 규칙으로 한 번 더 막는다)
import type { UserIdentity } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { authErrorText, canUnlink, LINK_LABEL, LINK_PROVIDERS, UNLINK_BLOCKED, visibleEmail, type LinkProvider } from "@/lib/auth/links";
import { reloadUser, useAccount, useAuthProviders } from "@/lib/client/account";
import { supabaseBrowser } from "@/lib/db/supabase-browser";
import { BrandTile } from "./BrandIcons";
import { Icon } from "./icons";
import { btn } from "./ui";

type SocialLink = { provider: string; username: string | null; avatar_url: string | null };
type Linked = { identities: UserIdentity[]; links: SocialLink[]; instagram: boolean };
type Msg = { tone: "info" | "error"; text: string };

const errText = (e: { code?: string; message: string }, fallback: string) => authErrorText(e.code ?? "") ?? authErrorText(e.message) ?? `${fallback}: ${e.message}`;
// 돌아올 곳 — 설정 화면의 계정 묶음(#account)으로
const here = () => `${location.pathname}#account`;

export function LinkedAccounts() {
  const acct = useAccount();
  const providers = useAuthProviders();
  const [data, setData] = useState<Linked | null>(null);
  const [busy, setBusy] = useState<LinkProvider | null>(null);
  const [confirm, setConfirm] = useState<LinkProvider | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const signedIn = acct.status === "user";

  const load = useCallback(async () => {
    const [ids, res] = await Promise.all([supabaseBrowser().auth.getUserIdentities(), fetch("/api/me/links").catch(() => null)]);
    const body = res?.ok ? ((await res.json()) as Omit<Linked, "identities">) : { instagram: false, links: [] };
    setData({ identities: ids.data?.identities ?? [], links: body.links, instagram: body.instagram });
  }, []);
  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  // 연결하고 돌아오면 ?linked=… / ?link_error=… — 한 번 알려 주고 주소에서 지운다
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const linked = q.get("linked");
    const err = q.get("link_error");
    if (!linked && !err) return;
    q.delete("linked");
    q.delete("link_error");
    const rest = q.toString();
    history.replaceState(history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    const label = LINK_LABEL[linked as LinkProvider] ?? "계정";
    setMsg(err ? { tone: "error", text: authErrorText(err) ?? `연결하지 못했어요: ${err}` } : { tone: "info", text: `${label} 연결을 마쳤어요. 이제 이 방법으로도 로그인할 수 있어요.` });
    if (linked) void reloadUser().catch(() => {});
  }, []);

  if (!signedIn || !data) return null;
  const has = (p: LinkProvider) => (p === "instagram" ? data.links.some((l) => l.provider === "instagram") : data.identities.some((i) => i.provider === p));
  // 켜진 제공자 + (꺼졌어도) 이미 연결된 것
  const rows = LINK_PROVIDERS.filter((p) => has(p) || (p === "instagram" ? data.instagram : !!providers?.[p]));
  if (!rows.length) return null;
  const methods = { identities: data.identities.map((i) => i.provider), instagram: has("instagram"), email: acct.user?.email ?? null };
  const detail = (p: LinkProvider): string | null => {
    if (p === "instagram") {
      const u = data.links.find((l) => l.provider === "instagram")?.username;
      return u ? `@${u}` : null;
    }
    const d = (data.identities.find((i) => i.provider === p)?.identity_data ?? {}) as Record<string, string | undefined>;
    return visibleEmail(d.email) ?? d.full_name ?? d.name ?? null;
  };

  const link = async (p: LinkProvider) => {
    setBusy(p);
    setMsg(null);
    setConfirm(null);
    if (p === "instagram") return location.assign(`/auth/instagram?mode=link&next=${encodeURIComponent(here())}`);
    // 성공이면 제공자 화면으로 이동 → /auth/callback?link= 이 ?linked= 를 붙여 돌려보낸다. 여기로 돌아오는 건 실패뿐
    const { error } = await supabaseBrowser().auth.linkIdentity({ provider: p, options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(here())}&link=${p}` } });
    if (error) {
      setBusy(null);
      setMsg({ tone: "error", text: errText(error, "연결하지 못했어요") });
    }
  };

  const unlink = async (p: LinkProvider) => {
    const verdict = canUnlink(p, methods);
    if (!verdict.ok) return setMsg({ tone: "error", text: UNLINK_BLOCKED[verdict.reason] });
    if (confirm !== p) return setConfirm(p); // 한 번 더 묻는다
    setBusy(p);
    setMsg(null);
    let error: string | null = null;
    if (p === "instagram") {
      const res = await fetch("/api/me/links?provider=instagram", { method: "DELETE" }).catch(() => null);
      if (!res?.ok) error = ((await res?.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "연결을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.";
    } else {
      const identity = data.identities.find((i) => i.provider === p);
      const r = identity ? await supabaseBrowser().auth.unlinkIdentity(identity) : null;
      if (r?.error) error = errText(r.error, "연결을 해제하지 못했어요");
      else await reloadUser().catch(() => {}); // 세션 토큰의 제공자 목록을 새로
    }
    setBusy(null);
    setConfirm(null);
    setMsg(error ? { tone: "error", text: error } : { tone: "info", text: `${LINK_LABEL[p]} 연결을 해제했어요.` });
    await load();
  };

  return (
    <section aria-labelledby="linked-accounts" className="space-y-1 border-t border-line pt-4">
      <h3 id="linked-accounts" className="text-sm font-semibold text-ink">
        연결된 계정
      </h3>
      <p className="text-caption text-muted">연결한 방법 중 어느 것으로 로그인해도 같은 기록이 열려요.</p>
      <ul className="divide-y divide-line">
        {rows.map((p) => {
          const on = has(p);
          const asking = confirm === p;
          const d = detail(p);
          return (
            <li key={p} className="flex min-h-16 items-center gap-3 py-2.5">
              <BrandTile provider={p} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{LINK_LABEL[p]}</p>
                <p className={`truncate text-caption ${asking ? "text-diet-no" : on ? "text-leaf" : "text-muted"}`}>
                  {asking ? "해제하면 이 방법으로 로그인할 수 없어요" : on ? `연결됨${d ? ` · ${d}` : ""}` : "연결 안 됨"}
                </p>
              </div>
              {!on ? (
                <button type="button" disabled={!!busy} onClick={() => void link(p)} className={`${btn("soft", "sm")} shrink-0`}>
                  {busy === p ? "이동 중…" : "연결"}
                </button>
              ) : asking ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setConfirm(null)} className={btn("ghost", "sm")}>
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void unlink(p)}
                    className="inline-flex h-10 items-center rounded-full bg-diet-no px-4 text-[13px] font-semibold text-surface transition active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy === p ? "해제 중…" : "해제"}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => void unlink(p)} className={`${btn("outline", "sm")} shrink-0`}>
                  해제
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {msg && (
        <p
          role={msg.tone === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm ${msg.tone === "error" ? "border border-diet-no/25 bg-diet-no/10 text-diet-no" : "bg-lime-soft text-ink"}`}
        >
          <Icon name={msg.tone === "error" ? "warn" : "check-circle"} className={`mt-0.5 size-4 shrink-0 ${msg.tone === "error" ? "" : "text-leaf"}`} />
          {msg.text}
        </p>
      )}
    </section>
  );
}
