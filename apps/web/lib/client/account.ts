"use client";
// 회원 계정 (F-AUTH-01·02). 로그인은 선택 — 안 해도 모든 기능이 브라우저 저장으로 돈다.
// 로그인하면: 처음 1번 이 기기 기록과 계정 기록을 합치고(merge), 그 뒤엔 바뀐 것만 올린다(push).
// 응답은 언제나 계정의 전체 상태라서, 다른 기기에서 쌓은 기록도 이때 같이 내려온다.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/db/supabase-browser";
import type { Allergen, DietKey } from "@/lib/foodi/schema";
import { getState, subscribe as subscribeLocal, update, type LocalState, type PassportEntry, type PassportStatus } from "./passport";

export const authAvailable = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export type AccountUser = { id: string; email: string | null; name: string | null; avatar: string | null; provider: string };
export type Account = {
  status: "off" | "loading" | "guest" | "user";
  user: AccountUser | null;
  sync: "idle" | "syncing" | "ok" | "error" | "preview";
  syncedAt: number | null;
};

let account: Account = { status: authAvailable ? "loading" : "off", user: null, sync: "idle", syncedAt: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<Account>) => {
  account = { ...account, ...patch };
  listeners.forEach((l) => l());
};
const SERVER: Account = { status: authAvailable ? "loading" : "off", user: null, sync: "idle", syncedAt: null };
export const useAccount = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    () => account,
    () => SERVER,
  );

// ── 마지막으로 계정과 맞춘 상태 (무엇이 바뀌었는지 알기 위해)
const MARK = "foodis:account";
type Mark = { uid: string; entries: Record<string, string>; prefs: string };
const readMark = (): Mark | null => {
  try {
    return JSON.parse(localStorage.getItem(MARK) ?? "null");
  } catch {
    return null;
  }
};
const writeMark = (m: Mark | null) => {
  try {
    if (m) localStorage.setItem(MARK, JSON.stringify(m));
    else localStorage.removeItem(MARK);
  } catch {
    /* 무시 — 다음 로드에서 merge 로 다시 맞춘다 */
  }
};
const sigOf = (e: PassportEntry) => [...e.statuses].sort().join(",");
const prefsSig = (s: Pick<LocalState, "diet" | "allergens" | "tastes" | "onboarded">) => JSON.stringify([[...s.diet].sort(), [...s.allergens].sort(), s.tastes, s.onboarded]);

type SyncResponse = {
  prefs: { diet: DietKey[]; allergens: Allergen[]; tastes: string[]; onboarded: boolean } | null;
  entries: (Omit<PassportEntry, "statuses"> & { food_id: string; statuses: PassportStatus[] })[];
};

let inflight: Promise<void> | null = null;
let again = false;

async function sync(uid: string) {
  if (inflight) return void (again = true);
  const mark = readMark();
  const mode = mark?.uid === uid ? "push" : "merge";
  const s = getState();
  const dirty = Object.entries(s.entries).filter(([id, e]) => mode === "merge" || mark!.entries[id] !== sigOf(e));
  const prefsDirty = mode === "merge" || mark!.prefs !== prefsSig(s);
  // 첫 로드에서는 바뀐 게 없어도 한 번 물어본다 — 다른 기기 기록을 받아 오기 위해
  if (mode === "push" && !dirty.length && !prefsDirty && account.syncedAt) return;

  set({ sync: "syncing" });
  inflight = (async () => {
    const res = await fetch("/api/me/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode,
        prefs: prefsDirty ? { diet: s.diet, allergens: s.allergens, tastes: s.tastes.slice(0, 10), onboarded: s.onboarded } : undefined,
        entries: dirty.map(([food_id, e]) => ({ food_id, statuses: e.statuses, at: e.at })),
      }),
    }).catch(() => null);
    if (!res) return set({ sync: "error" });
    if (res.status === 409) return set({ sync: "preview" });
    if (res.status === 401) return set({ status: "guest", user: null, sync: "idle" });
    if (!res.ok) return set({ sync: "error" });
    apply(uid, s, (await res.json()) as SyncResponse);
    set({ sync: "ok", syncedAt: Date.now() });
  })().finally(() => {
    inflight = null;
    if (again) {
      again = false;
      void sync(uid);
    }
  });
  return inflight;
}

/** 서버 결과를 로컬에 반영. 요청을 보낸 뒤 이 기기에서 또 바뀐 음식은 로컬 값을 지킨다(다음 push 로 올라간다) */
function apply(uid: string, sent: LocalState, r: SyncResponse) {
  const fromServer: Record<string, PassportEntry> = {};
  for (const { food_id, ...e } of r.entries) fromServer[food_id] = e;
  update((cur) => {
    const entries = { ...cur.entries };
    for (const [id, e] of Object.entries(fromServer)) {
      const changedMeanwhile = cur.entries[id] && sent.entries[id] !== cur.entries[id];
      if (!changedMeanwhile) entries[id] = e;
    }
    const prefsChangedMeanwhile = prefsSig(cur) !== prefsSig(sent);
    const p = r.prefs && !prefsChangedMeanwhile ? r.prefs : null;
    return p ? { ...cur, entries, diet: p.diet, allergens: p.allergens, tastes: p.tastes, onboarded: cur.onboarded || p.onboarded } : { ...cur, entries };
  });
  const after = getState();
  writeMark({
    uid,
    // 서버가 모르는 음식(미리보기 샘플 등)은 "맞춘 것"으로 기록해 매번 다시 보내지 않게 한다
    entries: Object.fromEntries(Object.entries(after.entries).map(([id, e]) => [id, fromServer[id] ? sigOf(fromServer[id]) : sigOf(e)])),
    prefs: r.prefs ? prefsSig({ ...r.prefs, onboarded: after.onboarded }) : prefsSig(after),
  });
}

const toUser = (session: Session): AccountUser => {
  const u = session.user;
  const m = (u.user_metadata ?? {}) as Record<string, string | undefined>;
  return { id: u.id, email: u.email ?? null, name: m.full_name ?? m.name ?? m.nickname ?? null, avatar: m.avatar_url ?? m.picture ?? null, provider: (u.app_metadata?.provider as string) ?? "email" };
};

let started = false;
/** 앱 전체에서 1번 (components/AccountSync.tsx) */
export function startAccount() {
  if (started || !authAvailable) return;
  started = true;
  const sb = supabaseBrowser();
  let uid: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onSession = (session: Session | null) => {
    const next = session?.user.id ?? null;
    if (next === uid && account.status !== "loading") return;
    uid = next;
    if (!session) return set({ status: "guest", user: null, sync: "idle", syncedAt: null });
    set({ status: "user", user: toUser(session) });
    void sync(session.user.id);
  };
  void sb.auth.getSession().then(({ data }) => onSession(data.session));
  sb.auth.onAuthStateChange((_e, session) => onSession(session));

  // 로컬이 바뀌면 1.5초 모아서 올린다
  subscribeLocal(() => {
    if (!uid) return;
    clearTimeout(timer);
    const id = uid;
    timer = setTimeout(() => void sync(id), 1500);
  });
  // 다른 기기에서 쌓은 기록: 앱으로 돌아올 때 받아 온다
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && uid && account.syncedAt && Date.now() - account.syncedAt > 60_000) {
      set({ syncedAt: null });
      void sync(uid);
    }
  });
}

/** 로그아웃: 기록은 계정에 있으니 이 기기의 개인 기록은 지운다 (공용 기기에서 다음 사람에게 남지 않게) */
export async function signOut() {
  await supabaseBrowser().auth.signOut();
  writeMark(null);
  update((s) => ({ ...s, diet: [], allergens: [], tastes: [], entries: {} }));
}

/** 회원 탈퇴: 계정과 계정의 모든 기록 삭제 (서버) → 로그아웃 */
export async function deleteAccount(): Promise<boolean> {
  const res = await fetch("/api/me", { method: "DELETE" }).catch(() => null);
  if (!res?.ok) return false;
  await signOut();
  return true;
}
