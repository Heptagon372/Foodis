"use client";
// 글쓰기: 게시판(밥친구 / 주제 10개) 또는 ?club=<id> 모임 안 · 제목 · 내용 · 위치 · (밥친구·정모) 만날 시각·인원 · 사진 4장 · 투표.
// 쓰는 동안 푸디가 제목·내용 단어로 카테고리를 추천한다 (규칙 기반, lib/community/categories.ts). 고르는 건 언제나 사용자
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ApiError, createPost, fetchClub, shrinkPhoto, type PhotoUpload } from "@/lib/client/community";
import { CATEGORIES, CATEGORY, isCategory, suggestCategories, type CategoryKey } from "@/lib/community/categories";
import { LIMITS, type ClubView } from "@/lib/community/types";
import { Icon } from "../icons";
import { TopBar } from "../TopBar";
import { btn, chip, Eyebrow } from "../ui";
import { LoginPrompt } from "./parts";

const FIELD = "w-full rounded-2xl border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-muted focus:border-leaf/60 focus:outline-none";

/** datetime-local 기본값: 오늘 이 시각 + 3시간, 30분 단위로 */
function defaultMeet(): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ComposeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("category");
  const clubId = params.get("club");
  const [club, setClub] = useState<ClubView | null>(null);
  const [meetOn, setMeetOn] = useState(false);
  const [category, setCategory] = useState<CategoryKey | null>(isCategory(initial) ? initial : null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [place, setPlace] = useState("");
  const [meet, setMeet] = useState(defaultMeet);
  const [capacity, setCapacity] = useState(2);
  const [photos, setPhotos] = useState<{ upload: PhotoUpload; preview: string }[]>([]);
  const [pollOn, setPollOn] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), body: useId(), place: useId(), meet: useId(), q: useId() };

  useEffect(() => {
    if (!clubId) return;
    fetchClub(clubId).then(
      (r) => {
        setClub(r.club);
        setCategory(r.club.topic);
      },
      (e: Error) => setError(e.message),
    );
  }, [clubId]);

  const buddy = category === "buddy" && !clubId;
  // 만날 시각·인원: 밥친구는 항상, 모임 글은 '정모 일정 넣기'를 켰을 때
  const withMeet = buddy || (Boolean(club) && meetOn);
  const suggestions = useMemo(() => suggestCategories(`${title}\n${body}`).filter((k) => k !== category), [title, body, category]);
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
  const pollProblem = pollOn && (cleanOptions.length < 2 ? "투표 선택지를 2개 이상 적어 주세요." : new Set(cleanOptions).size !== cleanOptions.length ? "투표 선택지가 겹쳐요." : null);
  const ready = category && (!clubId || club?.joined) && title.trim().length >= 2 && body.trim().length >= 1 && !pollProblem && !busy && !photoBusy;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const room = LIMITS.photos - photos.length;
      const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
      const done: { upload: PhotoUpload; preview: string }[] = [];
      for (const f of picked) done.push(await shrinkPhoto(f));
      setPhotos((p) => [...p, ...done].slice(0, LIMITS.photos));
      if (files.length > room) setError(`사진은 ${LIMITS.photos}장까지 올릴 수 있어요.`);
    } catch {
      setError("사진을 읽지 못했어요. 다른 사진으로 해 볼까요?");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !category) return;
    setBusy(true);
    setError(null);
    try {
      const post = await createPost({
        category,
        ...(club ? { club_id: club.id } : {}),
        title: title.trim(),
        body: body.trim(),
        place: place.trim() || undefined,
        ...(withMeet ? { meet_at: meet ? new Date(meet).toISOString() : undefined, capacity } : {}),
        photos: photos.map((p) => p.upload),
        poll: pollOn ? { question: question.trim() || undefined, options: cleanOptions } : undefined,
      });
      router.push(`/community/${post.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setLogin(err.message);
      else setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar back={club ? { href: `/community/clubs/${club.id}`, label: club.name } : { href: category ? `/community?c=${category}` : "/community", label: "커뮤니티" }} settings={false} />
      <div className="space-y-1">
        <Eyebrow>{club ? `${CATEGORY[club.topic].label} 모임` : "World Table · 게시판"}</Eyebrow>
        <h1 className="text-h1 font-bold text-ink">{club ? `${club.name}에 글쓰기` : "글쓰기"}</h1>
        {club && !club.joined && (
          <p className="text-sm text-diet-warn-ink">
            모임에 가입해야 글을 쓸 수 있어요.{" "}
            <Link href={`/community/clubs/${club.id}`} className="font-semibold underline">
              가입하러 가기
            </Link>
          </p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* 1. 카테고리 (모임 글은 모임 주제로 고정) */}
        {!clubId && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-ink">어디에 올릴까요?</legend>
            <button
              type="button"
              onClick={() => setCategory("buddy")}
              aria-pressed={buddy}
              className={`flex w-full items-center gap-3 rounded-3xl border p-4 text-left transition active:scale-[0.99] ${buddy ? "border-brand bg-lime-soft" : "card hover:border-leaf/40"}`}
            >
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${buddy ? "bg-brand text-on-brand" : "bg-lime-soft text-leaf"}`}>
                <Icon name="utensils" className="size-5" />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">밥친구 찾기</span>
                <span className="block text-caption text-muted">시간·장소·인원을 정해 같이 먹을 사람을 모아요</span>
              </span>
              {buddy && <Icon name="check-circle" className="size-5 text-leaf" />}
            </button>
            <p className="pt-1 text-caption font-semibold text-muted">주제 게시판</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.board === "club").map((c) => (
                <button key={c.key} type="button" className={chip(category === c.key)} onClick={() => setCategory(c.key)} aria-pressed={category === c.key}>
                  <Icon name={c.icon} className="size-4" />
                  {c.label}
                </button>
              ))}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-sunken/70 px-3 py-2" aria-live="polite">
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-leaf">
                  <Icon name="sparkle" className="size-3.5" />
                  푸디 추천
                </span>
                {suggestions.map((k) => (
                  <button key={k} type="button" onClick={() => setCategory(k)} className="inline-flex h-8 items-center gap-1 rounded-full border border-brand/30 bg-surface px-3 text-[13px] font-medium text-leaf hover:bg-lime-soft">
                    <Icon name={CATEGORY[k].icon} className="size-3.5" />
                    {CATEGORY[k].label}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {/* 2. 제목 · 내용 */}
        <div className="space-y-2">
          <label htmlFor={ids.title} className="flex justify-between text-sm font-semibold text-ink">
            제목<span className="font-normal tabular-nums text-muted">{title.length}/{LIMITS.title}</span>
          </label>
          <input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value.slice(0, LIMITS.title))} placeholder={buddy ? "예: 오늘 저녁 쌀국수 같이 드실 분" : "예: 학교 근처 할랄 식당 정리해요"} className={`${FIELD} h-12`} required minLength={2} />
        </div>
        <div className="space-y-2">
          <label htmlFor={ids.body} className="flex justify-between text-sm font-semibold text-ink">
            내용<span className="font-normal tabular-nums text-muted">{body.length}/{LIMITS.body}</span>
          </label>
          <textarea id={ids.body} value={body} onChange={(e) => setBody(e.target.value.slice(0, LIMITS.body))} rows={6} placeholder="음식 이름을 적으면 푸디가 음식 카드와 이어 줘요." className={`${FIELD} resize-y py-3 leading-relaxed`} required />
        </div>

        {/* 3. 위치 (+ 밥친구: 시각·인원) */}
        <div className="space-y-2">
          <label htmlFor={ids.place} className="text-sm font-semibold text-ink">
            위치 <span className="font-normal text-muted">(선택)</span>
          </label>
          <div className="relative">
            <Icon name="pin" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <input id={ids.place} value={place} onChange={(e) => setPlace(e.target.value.slice(0, LIMITS.place))} placeholder="예: 성공회대 정문, 홍대입구역 9번 출구" className={`${FIELD} h-12 pl-11`} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 text-caption text-muted">
            정확한 집 주소 대신 역·건물처럼 만나기 쉬운 곳을 적어 주세요.
            {place.trim().length >= 2 && (
              <a href={`https://map.kakao.com/?q=${encodeURIComponent(place.trim())}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-leaf">
                지도에서 확인 <Icon name="external" className="size-3.5" />
              </a>
            )}
          </p>
        </div>

        {club && (
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Icon name="calendar" className="size-5 text-leaf" />
              정모 일정 넣기 <span className="font-normal text-muted">(시각 · 인원 · 참여 버튼)</span>
            </span>
            <input type="checkbox" checked={meetOn} onChange={(e) => setMeetOn(e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
          </label>
        )}
        {withMeet && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor={ids.meet} className="text-sm font-semibold text-ink">
                만날 시각
              </label>
              <input id={ids.meet} type="datetime-local" value={meet} onChange={(e) => setMeet(e.target.value)} className={`${FIELD} h-12`} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink">함께할 인원 (나 빼고)</p>
              <div className="flex h-12 items-center justify-between rounded-2xl border border-line bg-surface px-1.5">
                <button type="button" onClick={() => setCapacity((c) => Math.max(1, c - 1))} className="grid size-9 place-items-center rounded-full text-ink hover:bg-ink/5" aria-label="한 명 줄이기">
                  −
                </button>
                <span className="text-[15px] font-semibold tabular-nums text-ink" aria-live="polite">
                  {capacity}명
                </span>
                <button type="button" onClick={() => setCapacity((c) => Math.min(LIMITS.capacity, c + 1))} className="grid size-9 place-items-center rounded-full text-ink hover:bg-ink/5" aria-label="한 명 늘리기">
                  <Icon name="plus" className="size-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. 사진 */}
        <div className="space-y-2">
          <p className="flex justify-between text-sm font-semibold text-ink">
            사진 <span className="font-normal tabular-nums text-muted">{photos.length}/{LIMITS.photos}</span>
          </p>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-2xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={`올릴 사진 ${i + 1}`} className="size-full object-cover" />
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="glass-dark absolute right-1 top-1 grid size-7 place-items-center rounded-full" aria-label={`사진 ${i + 1} 빼기`}>
                  <Icon name="close" className="size-4" />
                </button>
              </div>
            ))}
            {photos.length < LIMITS.photos && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} className="grid aspect-square place-items-center rounded-2xl border border-dashed border-line bg-surface text-muted transition hover:border-leaf/50 hover:text-leaf">
                <span className="flex flex-col items-center gap-1 text-[12px] font-medium">
                  <Icon name="image-plus" className="size-6" />
                  {photoBusy ? "줄이는 중…" : "추가"}
                </span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
          <p className="text-caption text-muted">사진은 긴 변 1280px로 줄여서 올려요. 다른 사람 얼굴이 보이면 동의를 받아 주세요.</p>
        </div>

        {/* 5. 투표 */}
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Icon name="poll" className="size-5 text-leaf" />
              투표 붙이기
            </span>
            <input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
          </label>
          {pollOn && (
            <div className="card space-y-2.5 rounded-3xl p-4">
              <label htmlFor={ids.q} className="sr-only">
                투표 질문
              </label>
              <input id={ids.q} value={question} onChange={(e) => setQuestion(e.target.value.slice(0, LIMITS.pollQuestion))} placeholder="질문 (선택) — 예: 메뉴 뭐로 할까요?" className={`${FIELD} h-11`} />
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value.slice(0, LIMITS.pollOption) : x)))}
                    placeholder={`선택지 ${i + 1}`}
                    aria-label={`선택지 ${i + 1}`}
                    className={`${FIELD} h-11 flex-1`}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => setOptions((os) => os.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-full text-muted hover:bg-ink/5" aria-label={`선택지 ${i + 1} 빼기`}>
                      <Icon name="trash" className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < LIMITS.pollOptions && (
                <button type="button" onClick={() => setOptions((os) => [...os, ""])} className={btn("ghost", "sm")}>
                  <Icon name="plus" className="size-4" />
                  선택지 추가
                </button>
              )}
              {pollProblem && <p className="text-caption text-diet-warn-ink">{pollProblem}</p>}
            </div>
          )}
        </div>

        {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-diet-no/25 bg-diet-no/10 px-3.5 py-2.5 text-sm text-ink">
            <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-diet-no" />
            {error}
          </p>
        )}

        <div className="flex gap-2 pb-4">
          <Link href={club ? `/community/clubs/${club.id}` : "/community"} className={`${btn("outline")} flex-1`}>
            취소
          </Link>
          <button type="submit" disabled={!ready} className={`${btn("lime")} flex-[2]`}>
            {busy ? "올리는 중…" : club ? "모임에 올리기" : category ? `${CATEGORY[category].label}에 올리기` : "카테고리를 골라 주세요"}
          </button>
        </div>
        <p className="-mt-4 pb-6 text-center text-caption text-muted">연락처·오픈채팅 주소는 글에 적지 말고, 댓글로 약속을 정해요. 신고가 3번 쌓인 글은 자동으로 가려져요.</p>
      </form>
    </main>
  );
}
