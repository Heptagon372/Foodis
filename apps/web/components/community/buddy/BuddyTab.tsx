"use client";
// 커뮤니티 '푸랜드' 탭 (게시판 | 푸랜드 | 모임): 밥친구 찾기.
//  ① 내 정보(원하는 음식·한마디·나이·성별) + ON/OFF 스위치 + 켜 둘 시간(1~8시간, 지나면 자동 OFF)
//  ② 켜면 지도에 나와 주변에 켠 사람들이 보이고, 내 위치는 화면이 열려 있는 동안 자동으로 따라간다(10초마다 서로 갱신)
//  ③ 점을 누르면 그 사람 정보 → '대화하기' 로 바로 1:1 대화 연결 → 대화방에서 '대화 종료'
// 켠 사람끼리만 서로 보인다. 남에게 보이는 위치는 약 110m 로 흐리게, 끄면 바로 사라진다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buddyLocate,
  buddyOff,
  buddyOn,
  currentPosition,
  fetchBuddy,
  GEO_MESSAGE,
  isUnread,
  loadDraft,
  saveDraft,
  startChat,
  type BuddyPage,
} from "@/lib/client/buddy";
import { ApiError } from "@/lib/client/community";
import type { MapProvider } from "@/lib/client/map-provider";
import { BUDDY_LIMITS, CUISINE_LABEL, CUISINES, GENDER_LABEL, GENDERS, remainLabel, type BuddyProfile, type BuddyView, type ChatView, type Cuisine, type Gender } from "@/lib/buddy/types";
import { distanceM, formatDistance } from "@/lib/places/geo";
import { Icon } from "../../icons";
import { btn, chip } from "../../ui";
import { LoginPrompt, timeAgo } from "../parts";
import { BuddyMap, pinLetter } from "./BuddyMap";

const POLL_MS = 10_000;
/** 위치를 서버에 다시 보내는 기준: 25m 이상 움직였거나 1분이 지났을 때 (최소 15초 간격) */
const MOVE_M = 25;
const RESEND_MS = 60_000;
const MIN_GAP_MS = 15_000;

export function BuddyTab({ provider, mapKey }: { provider: MapProvider; mapKey: string | null }) {
  const router = useRouter();
  const [data, setData] = useState<BuddyPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(() => fetchBuddy().then(setData, (e: Error) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const on = Boolean(data?.me.on);

  // 켜져 있는 동안: 10초마다 주변 갱신 (탭이 보일 때만) + 남은 시간 표시 갱신 + 시간이 다 되면 다시 불러와 OFF 로
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      tick((n) => n + 1);
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [data, load]);

  // 위치 자동 추적 (켜져 있고 이 화면이 열려 있는 동안)
  const sent = useRef<{ at: number; lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!on || typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setHere(p);
        const last = sent.current;
        const now = Date.now();
        if (last && now - last.at < MIN_GAP_MS) return;
        if (last && distanceM(last, p) < MOVE_M && now - last.at < RESEND_MS) return;
        sent.current = { at: now, ...p };
        buddyLocate(p).then(
          (r) => setData((d) => (d ? { ...d, me: r.me } : d)),
          (e: ApiError) => {
            if (e.code === "buddy_off") load();
          },
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [on, load]);

  const me = useMemo(() => here ?? (data?.me.lat != null ? { lat: data.me.lat, lng: data.me.lng! } : null), [here, data?.me.lat, data?.me.lng]);
  const buddies = useMemo(() => (data?.buddies ?? []).map((b) => (me ? { ...b, distance_m: distanceM(me, b) } : b)), [data?.buddies, me]);
  const pick = buddies.find((b) => b.id === selected) ?? null;

  const turnOn = async (profile: BuddyProfile, hours: number) => {
    setBusy(true);
    setNotice(null);
    saveDraft({ ...profile, hours });
    try {
      const at = await currentPosition().catch((e: Error) => {
        throw new Error(GEO_MESSAGE[e.message] ?? GEO_MESSAGE.failed);
      });
      setHere(at);
      sent.current = { at: Date.now(), ...at };
      const r = await buddyOn(hours, profile, at);
      setData((d) => (d ? { ...d, me: r.me } : d));
      setEditing(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLogin(e.message);
      else setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const r = await buddyOff();
      setData((d) => (d ? { ...d, me: r.me, buddies: [] } : d));
      setSelected(null);
      sent.current = null;
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const talk = async (b: BuddyView) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await startChat(b.id);
      router.push(`/community/buddy/${r.chat.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLogin(e.message);
      else {
        setNotice((e as Error).message);
        if (e instanceof ApiError && e.code === "buddy_gone") load();
      }
      setBusy(false);
    }
  };

  if (error && !data)
    return (
      <div className="card space-y-3 rounded-3xl p-5 text-center">
        <p className="text-sm text-ink-soft">{error}</p>
        <button type="button" className={btn("outline", "sm")} onClick={() => (setError(null), load())}>
          다시 시도
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-44 animate-pulse rounded-3xl bg-sunken/70" />
        <div className="h-80 animate-pulse rounded-3xl bg-sunken/70" />
      </div>
    );

  const profile = data.me.profile;
  const showForm = !on || editing;

  return (
    <div className="space-y-5">
      {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}
      {!data.can_use && !login && <LoginPrompt message="푸랜드는 로그인한 뒤에 켤 수 있어요." />}

      {/* ① 내 정보 + ON/OFF */}
      <section className="meadow-panel space-y-4 rounded-3xl p-4 sm:p-5" aria-label="내 푸랜드">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-on-brand">
            <Icon name="utensils" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">푸랜드 {on ? "켜짐" : "꺼짐"}</p>
            <p className="text-caption text-ink-soft">{on ? `${remainLabel(data.me.on_until!)} · 지나면 자동으로 꺼져요` : "켜면 근처에서 밥친구를 찾는 사람들과 서로 보여요."}</p>
          </div>
          <Switch on={on} disabled={busy || (!on && !profile) || !data.can_use} onChange={(v) => (v ? profile && turnOn(profile, loadDraft().hours ?? 1) : turnOff())} />
        </div>

        {on && profile && !editing && (
          <>
            <ProfileCard name={data.name} profile={profile} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn("outline", "sm")} onClick={() => setEditing(true)}>
                <Icon name="edit" className="size-4" />
                정보·시간 바꾸기
              </button>
            </div>
          </>
        )}

        {showForm && data.can_use && <ProfileForm initial={profile} on={on} busy={busy} onSubmit={turnOn} onCancel={on ? () => setEditing(false) : undefined} />}
        {notice && (
          <p role="alert" className="text-sm text-diet-no">
            {notice}
          </p>
        )}
      </section>

      {/* ② 지도 + 고른 사람 */}
      {on && me && (
        <section className="space-y-3" aria-label="주변 푸랜드 지도">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-ink">내 주변 푸랜드</h2>
              <p className="text-caption text-muted">
                {buddies.length ? `${buddies.length}명이 켜 두었어요 · 점을 눌러 정보를 봐요` : "아직 근처에 켠 사람이 없어요. 켜 두면 생기는 대로 보여 드려요."}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-leaf">
              <span className="size-2 rounded-full bg-leaf motion-safe:animate-pulse" />
              실시간
            </span>
          </div>
          <BuddyMap provider={provider} mapKey={mapKey} me={me} buddies={buddies} selected={selected} onPick={setSelected} />

          {pick ? (
            <div className="card space-y-3 rounded-3xl p-4">
              <div className="flex items-start justify-between gap-2">
                <ProfileCard name={pick.name} profile={pick} sample={pick.sample} distance={pick.distance_m} updated={pick.updated_at} />
                <button type="button" onClick={() => setSelected(null)} aria-label="닫기" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5">
                  <Icon name="close" className="size-4" />
                </button>
              </div>
              <button type="button" className={`${btn("primary")} w-full`} disabled={busy} onClick={() => talk(pick)}>
                <Icon name="message" className="size-5" />
                {busy ? "연결하는 중…" : "대화하기"}
              </button>
              <p className="text-caption text-muted">처음 만날 땐 사람이 많은 식당에서 만나요. 불편하면 언제든 대화를 종료할 수 있어요.</p>
            </div>
          ) : (
            buddies.length > 0 && (
              <ul className="snap-row -mx-5 flex gap-2 px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" aria-label="가까운 순">
                {buddies.map((b) => (
                  <li key={b.id}>
                    <button type="button" className={chip(false)} onClick={() => setSelected(b.id)}>
                      <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-on-brand">{pinLetter(b)}</span>
                      {b.name}
                      {b.distance_m != null && <span className="text-muted">{formatDistance(b.distance_m)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      )}

      {/* ③ 내 대화 */}
      {data.chats.length > 0 && <ChatList chats={data.chats} />}

      <p className="flex items-start gap-2 text-caption text-muted">
        <Icon name="info" className="mt-px size-4 shrink-0" />
        켠 사람끼리만 서로 보이고, 남에게는 약 100m 범위로 흐리게 보여요. 위치는 이 화면을 열어 둔 동안만 갱신되고, 끄면 바로 지도에서 사라져요.
      </p>
    </div>
  );
}

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="푸랜드 켜기"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-brand" : "bg-ink/20"}`}
    >
      <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      <span className="sr-only">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

export function ProfileCard({ name, profile, sample, distance, updated }: { name: string; profile: BuddyProfile; sample?: boolean; distance?: number | null; updated?: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[16px] font-bold text-ink">{name}</span>
        <span className="text-sm text-ink-soft">
          {profile.age}세 · {GENDER_LABEL[profile.gender]}
        </span>
        {sample && <span className="rounded-full bg-diet-warn/15 px-2 py-0.5 text-[11px] font-semibold text-diet-warn-ink">샘플</span>}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {profile.cuisines.map((c) => (
          <span key={c} className="inline-flex h-7 items-center rounded-full bg-lime px-2.5 text-[12px] font-semibold text-on-lime">
            {CUISINE_LABEL[c]}
          </span>
        ))}
      </div>
      <p className="text-sm text-ink">“{profile.message}”</p>
      {(distance != null || updated) && (
        <p className="flex items-center gap-1.5 text-caption text-muted">
          <Icon name="pin" className="size-3.5" />
          {distance != null && `약 ${formatDistance(distance)}`}
          {updated && ` · 위치 ${timeAgo(updated)}`}
        </p>
      )}
    </div>
  );
}

function ProfileForm({ initial, on, busy, onSubmit, onCancel }: { initial: BuddyProfile | null; on: boolean; busy: boolean; onSubmit: (p: BuddyProfile, hours: number) => void; onCancel?: () => void }) {
  const draft = useMemo(() => ({ ...loadDraft(), ...(initial ?? {}) }), [initial]);
  const [cuisines, setCuisines] = useState<Cuisine[]>(draft.cuisines ?? []);
  const [message, setMessage] = useState(draft.message ?? "");
  const [age, setAge] = useState(draft.age ? String(draft.age) : "");
  const [gender, setGender] = useState<Gender>(draft.gender ?? "none");
  const [hours, setHours] = useState(loadDraft().hours ?? 1);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(age);
    if (!cuisines.length) return setErr("원하는 음식 종류를 하나 이상 골라 주세요.");
    if (!message.trim()) return setErr("한마디를 적어 주세요.");
    if (!Number.isInteger(n) || n < BUDDY_LIMITS.minAge || n > BUDDY_LIMITS.maxAge) return setErr(`나이는 ${BUDDY_LIMITS.minAge}~${BUDDY_LIMITS.maxAge} 사이로 적어 주세요 (만 ${BUDDY_LIMITS.minAge}세 이상).`);
    setErr(null);
    onSubmit({ cuisines, message: message.trim(), age: n, gender }, hours);
  };
  const toggle = (c: Cuisine) => setCuisines((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-surface/70 p-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">원하는 음식 종류</legend>
        <div className="flex flex-wrap gap-2">
          {CUISINES.map((c) => (
            <button key={c} type="button" className={chip(cuisines.includes(c))} aria-pressed={cuisines.includes(c)} onClick={() => toggle(c)}>
              {CUISINE_LABEL[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-ink">한마디</span>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={BUDDY_LIMITS.message}
          placeholder="예) 점심에 국밥 같이 드실 분!"
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
        />
        <span className="block text-right text-[11px] text-muted">
          {message.length}/{BUDDY_LIMITS.message}
        </span>
      </label>

      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-ink">나이</span>
          <input
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="25"
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold text-ink">성별</legend>
          <div className="flex gap-1.5">
            {GENDERS.map((g) => (
              <button key={g} type="button" className={`${chip(gender === g)} flex-1 justify-center`} aria-pressed={gender === g} onClick={() => setGender(g)}>
                {GENDER_LABEL[g]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">켜 둘 시간 · {hours}시간 뒤 자동 OFF</legend>
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: BUDDY_LIMITS.maxHours }, (_, i) => i + 1).map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={hours === h}
              onClick={() => setHours(h)}
              className={`h-10 rounded-xl text-sm font-semibold transition ${hours === h ? "bg-brand text-on-brand" : "bg-sunken text-ink-soft hover:text-ink"}`}
            >
              {h}h
            </button>
          ))}
        </div>
      </fieldset>

      {err && (
        <p role="alert" className="text-sm text-diet-no">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" className={btn("outline")} onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className={`${btn("primary")} flex-1`} disabled={busy}>
          <Icon name="locate" className="size-5" />
          {busy ? "위치 확인 중…" : on ? `저장하고 ${hours}시간 켜 두기` : `푸랜드 켜기 (${hours}시간)`}
        </button>
      </div>
      <p className="text-caption text-muted">켜면 지금 위치를 한 번 묻고, 이 화면을 여는 동안 자동으로 따라가요.</p>
    </form>
  );
}

function ChatList({ chats }: { chats: ChatView[] }) {
  return (
    <section className="space-y-2" aria-label="내 푸랜드 대화">
      <h2 className="text-[17px] font-bold text-ink">대화</h2>
      <ul className="card divide-y divide-line overflow-hidden rounded-3xl">
        {chats.map((c) => {
          const unread = isUnread(c);
          return (
            <li key={c.id}>
              <Link href={`/community/buddy/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.03]">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-sm font-bold text-on-lime">{pinLetter(c.partner)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{c.partner.name}</span>
                    {c.ended_at && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">종료됨</span>}
                  </span>
                  <span className={`block truncate text-caption ${unread ? "font-semibold text-ink" : "text-muted"}`}>{c.last ? `${c.last.mine ? "나: " : ""}${c.last.body}` : "대화가 연결됐어요. 먼저 인사해 보세요!"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted">{timeAgo(c.last?.at ?? c.created_at)}</span>
                  {unread && <span className="size-2.5 rounded-full bg-diet-no" aria-label="새 메시지" />}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
