"use client";
// 모임 만들기: 주제(10개) · 이름 · 소개 · 표지 사진(선택). 만든 사람은 자동으로 가입·운영자
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ApiError, createClub, shrinkPhoto, type PhotoUpload } from "@/lib/client/community";
import { CATEGORIES, isCategory, type CategoryKey } from "@/lib/community/categories";
import { CLUB_LIMITS } from "@/lib/community/types";
import { Icon } from "../icons";
import { TopBar } from "../TopBar";
import { btn, chip, Eyebrow } from "../ui";
import { LoginPrompt } from "./parts";

const FIELD = "w-full rounded-2xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-muted focus:border-leaf/60 focus:outline-none";

export function ClubCreateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = params.get("topic");
  const [topic, setTopic] = useState<CategoryKey | null>(isCategory(t) && t !== "buddy" ? t : null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<{ upload: PhotoUpload; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), desc: useId() };
  const ready = topic && name.trim().length >= 2 && description.trim() && !busy;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setCover(await shrinkPhoto(f));
    } catch {
      setError("사진을 읽지 못했어요.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !topic) return;
    setBusy(true);
    setError(null);
    try {
      const club = await createClub({ name: name.trim(), topic, description: description.trim(), cover: cover?.upload });
      router.push(`/community/clubs/${club.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setLogin(err.message);
      else setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar back={{ href: "/community?tab=clubs", label: "모임" }} settings={false} />
      <div className="space-y-1">
        <Eyebrow>World Table · 모임</Eyebrow>
        <h1 className="text-h1 font-bold text-ink">모임 만들기</h1>
        <p className="text-sm text-ink-soft">만든 사람이 운영자가 되고, 가입한 사람만 안에서 글을 쓸 수 있어요.</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-ink">주제</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.filter((c) => c.board === "club").map((c) => (
              <button key={c.key} type="button" className={chip(topic === c.key)} onClick={() => setTopic(c.key)} aria-pressed={topic === c.key}>
                <Icon name={c.icon} className="size-4" />
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor={ids.name} className="flex justify-between text-sm font-semibold text-ink">
            모임 이름<span className="font-normal tabular-nums text-muted">{name.length}/{CLUB_LIMITS.name}</span>
          </label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value.slice(0, CLUB_LIMITS.name))} placeholder="예: 성공회대 할랄 밥상" className={`${FIELD} h-12`} required />
        </div>
        <div className="space-y-2">
          <label htmlFor={ids.desc} className="flex justify-between text-sm font-semibold text-ink">
            소개<span className="font-normal tabular-nums text-muted">{description.length}/{CLUB_LIMITS.description}</span>
          </label>
          <textarea id={ids.desc} value={description} onChange={(e) => setDescription(e.target.value.slice(0, CLUB_LIMITS.description))} rows={4} placeholder="어떤 모임인지, 얼마나 자주 모이는지 적어 주세요." className={`${FIELD} resize-y py-3`} required />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">
            표지 사진 <span className="font-normal text-muted">(선택)</span>
          </p>
          {cover ? (
            <div className="relative overflow-hidden rounded-3xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.preview} alt="표지 미리보기" className="h-40 w-full object-cover" />
              <button type="button" onClick={() => setCover(null)} className="glass-dark absolute right-2 top-2 grid size-8 place-items-center rounded-full" aria-label="표지 빼기">
                <Icon name="close" className="size-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-3xl border border-dashed border-line bg-surface text-[13px] font-medium text-muted hover:border-leaf/50 hover:text-leaf">
              <Icon name="image-plus" className="size-6" />
              표지 고르기
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-diet-no/25 bg-diet-no/10 px-3.5 py-2.5 text-sm text-ink">
            <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-diet-no" />
            {error}
          </p>
        )}
        <button type="submit" disabled={!ready} className={`${btn("lime")} mb-8 w-full`}>
          {busy ? "만드는 중…" : topic ? "모임 만들기" : "주제를 골라 주세요"}
        </button>
      </form>
    </main>
  );
}
