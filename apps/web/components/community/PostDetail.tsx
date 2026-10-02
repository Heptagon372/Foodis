"use client";
// /community/:id — 글 전체 · 사진 · 위치 · (밥친구) 참여 · 투표 · 따봉 · 공유 · 신고 · 댓글.
// 서버가 처음 그린 글(initial)로 바로 보여 주고, 마운트 뒤 내 상태(따봉·투표·참여)가 붙은 최신 값으로 바꾼다
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { act, addComment, ApiError, bump, deleteComment, deletePost, fetchPost, type PostPage } from "@/lib/client/community";
import { CATEGORY } from "@/lib/community/categories";
import { buddyState, LIMITS, type CommentView, type PostView } from "@/lib/community/types";
import { useFoodi } from "../FoodiSheet";
import { Icon } from "../icons";
import { TopBar } from "../TopBar";
import { btn } from "../ui";
import { BuddyPill, CategoryBadge, LoginPrompt, meetLabel, PollBars, ShareButton, timeAgo } from "./parts";

export function PostDetail({ id, initial }: { id: string; initial: PostPage | null }) {
  const router = useRouter();
  const { open } = useFoodi();
  const [post, setPost] = useState<PostView | null>(initial?.post ?? null);
  const [comments, setComments] = useState<CommentView[]>(initial?.comments ?? []);
  const [missing, setMissing] = useState(!initial);
  const [login, setLogin] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchPost(id)
      .then((r) => {
        if (!alive) return;
        setPost(r.post);
        setComments(r.comments);
        setMissing(false);
        bump(r.post.category, "view", r.post.id);
      })
      .catch((e) => alive && e instanceof ApiError && e.status === 404 && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!post) {
    return (
      <main className="space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
        <TopBar back={{ href: "/community", label: "커뮤니티" }} />
        {missing ? (
          <div className="card space-y-3 rounded-3xl p-6 text-center">
            <p className="text-sm text-ink-soft">글을 찾을 수 없어요. 지워졌거나 신고로 가려진 글이에요.</p>
            <Link href="/community" className={btn("primary", "sm")}>
              커뮤니티로
            </Link>
          </div>
        ) : (
          <div className="h-72 animate-pulse rounded-3xl bg-sunken/70" aria-busy />
        )}
      </main>
    );
  }

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLogin(e.message);
      else setNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const like = () =>
    run("like", async () => {
      const r = await act(post, { action: "like" });
      setPost((p) => p && { ...p, like_count: r.like_count ?? p.like_count, viewer: { ...p.viewer, liked: Boolean(r.liked) } });
    });
  const join = () =>
    run("join", async () => {
      const r = await act(post, { action: "join" });
      setPost((p) => p && { ...p, join_count: r.join_count ?? p.join_count, viewer: { ...p.viewer, joined: Boolean(r.joined) } });
      if (r.joined) setNote("참여했어요! 댓글로 인사하고 만날 곳을 맞춰 보세요.");
    });
  const vote = (option: number) =>
    run("vote", async () => {
      const r = await act(post, { action: "vote", option });
      setPost((p) => p && { ...p, poll_counts: r.poll_counts ?? p.poll_counts, viewer: { ...p.viewer, vote: r.vote ?? option } });
    });
  const report = () => {
    const reason = window.prompt("어떤 점이 문제인가요? (선택)\n신고가 3번 쌓이면 글이 자동으로 가려지고 운영팀이 확인해요.");
    if (reason === null) return;
    void run("report", async () => {
      const r = await act(post, { action: "report", reason: reason.trim().slice(0, 200) || undefined });
      if (r.hidden) router.push("/community");
      else setNote("신고했어요. 확인 후 조치할게요.");
    });
  };
  const remove = () => {
    if (!window.confirm("이 글을 지울까요? 댓글·투표도 함께 사라져요.")) return;
    void run("delete", async () => {
      await deletePost(post.id);
      router.push(post.club_id ? `/community/clubs/${post.club_id}` : `/community?c=${post.category}`);
    });
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    void run("comment", async () => {
      const c = await addComment(post, body);
      setComments((cs) => [...cs, c]);
      setPost((p) => p && { ...p, comment_count: p.comment_count + 1 });
      setText("");
    });
  };
  const removeComment = (c: CommentView) =>
    run("comment", async () => {
      await deleteComment(post.id, c.id);
      setComments((cs) => cs.filter((x) => x.id !== c.id));
      setPost((p) => p && { ...p, comment_count: Math.max(0, p.comment_count - 1) });
    });

  const state = buddyState(post);
  const voters = post.poll_counts?.reduce((a, b) => a + b, 0) ?? 0;
  const ph = post.photos[photo];

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-8">
      <TopBar back={post.club_id ? { href: `/community/clubs/${post.club_id}`, label: "모임" } : { href: `/community?c=${post.category}`, label: CATEGORY[post.category].label }} />

      <article className="space-y-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={post.category} />
            {post.club_id && (
              <Link href={`/community/clubs/${post.club_id}`} className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] font-semibold text-ink-soft hover:text-ink">
                <Icon name="users" className="size-3.5" />
                모임 글
              </Link>
            )}
            <BuddyPill post={post} />
          </div>
          <h1 className="text-h1 font-bold text-ink">{post.title}</h1>
          <p className="text-caption text-muted">
            {post.author_name} · {timeAgo(post.created_at)}
          </p>
        </header>

        {(post.meet_at || post.place) && (
          <div className="meadow-panel grid gap-2 rounded-3xl p-4 sm:grid-cols-2">
            {post.meet_at && (
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon name="calendar" className="size-5 text-leaf" />
                {meetLabel(post.meet_at)}
              </p>
            )}
            {post.place && (
              <a href={`https://map.kakao.com/?q=${encodeURIComponent(post.place)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-semibold text-ink hover:underline">
                <Icon name="pin" className="size-5 text-leaf" />
                {post.place}
                <Icon name="external" className="size-3.5 text-muted" />
              </a>
            )}
          </div>
        )}

        {ph && (
          <figure className="space-y-2">
            <div className="relative overflow-hidden rounded-3xl border border-line bg-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={`${post.title} 사진 ${photo + 1}`} className="max-h-[28rem] w-full object-cover" />
              {post.photos.length > 1 && (
                <span className="glass-dark absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums">
                  {photo + 1}/{post.photos.length}
                </span>
              )}
            </div>
            {post.photos.length > 1 && (
              <div className="flex gap-2">
                {post.photos.map((p, i) => (
                  <button key={p.url} type="button" onClick={() => setPhoto(i)} aria-label={`사진 ${i + 1}`} aria-pressed={i === photo} className={`size-16 overflow-hidden rounded-xl border-2 ${i === photo ? "border-brand" : "border-transparent opacity-70"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {ph.credit && <figcaption className="truncate text-[11px] text-muted">사진: {ph.credit}</figcaption>}
          </figure>
        )}

        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{post.body}</p>

        {post.poll && post.poll_counts && (
          <section className="card space-y-3 rounded-3xl p-4" aria-label="투표">
            <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
              <span className="flex items-center gap-2">
                <Icon name="poll" className="size-5 text-leaf" />
                {post.poll.question ?? "투표"}
              </span>
              <span className="text-caption font-medium tabular-nums text-muted">{voters}명 참여</span>
            </p>
            <PollBars options={post.poll.options} counts={post.poll_counts} mine={post.viewer.vote} onVote={vote} busy={busy === "vote"} />
            <p className="text-caption text-muted">{post.viewer.vote == null ? "고르면 결과가 보여요. 나중에 바꿀 수 있어요." : "다른 선택지를 누르면 바꿀 수 있어요."}</p>
          </section>
        )}

        {post.foods.length > 0 && (
          <div className="space-y-2">
            <p className="text-caption font-semibold text-muted">글에 나온 음식</p>
            <div className="flex flex-wrap gap-1.5">
              {post.foods.map((f) => (
                <Link key={f.slug} href={`/food/${f.slug}`} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:border-leaf/40">
                  #{f.name_ko}
                  <Icon name="next" className="size-3.5 text-muted" />
                </Link>
              ))}
              <button type="button" onClick={() => open({ question: `${post.foods[0].name_ko} 이야기 들려줘` })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-lime-soft px-3 text-[13px] font-semibold text-leaf">
                <Icon name="mic" className="size-3.5" />
                푸디에게 묻기
              </button>
            </div>
          </div>
        )}

        {login && <LoginPrompt message={login} onClose={() => setLogin(null)} />}
        {note && (
          <p role="status" className="rounded-2xl bg-sunken px-3.5 py-2.5 text-sm text-ink-soft">
            {note}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-y border-line py-3">
          <button type="button" onClick={like} aria-pressed={post.viewer.liked} className={`${btn(post.viewer.liked ? "lime" : "outline", "sm")} tabular-nums`}>
            <Icon name="thumbs-up" className="size-[18px]" strokeWidth={post.viewer.liked ? 2.2 : 1.75} />
            따봉 {post.like_count}
          </button>
          {state && !post.mine && (
            <button type="button" onClick={join} disabled={busy === "join" || (!post.viewer.joined && state !== "open")} aria-pressed={post.viewer.joined} className={btn(post.viewer.joined ? "soft" : "primary", "sm")}>
              <Icon name={post.viewer.joined ? "check" : "users"} className="size-[18px]" />
              {post.viewer.joined ? "참여 중 · 취소" : state === "open" ? "같이 먹을래요" : state === "full" ? "모집 완료" : "약속 지남"}
            </button>
          )}
          <ShareButton post={post} className="border border-line" />
          <span className="flex-1" />
          {post.mine ? (
            <button type="button" onClick={remove} className={btn("ghost", "sm")}>
              <Icon name="trash" className="size-4" />
              지우기
            </button>
          ) : (
            <button type="button" onClick={report} className={btn("ghost", "sm")}>
              <Icon name="flag" className="size-4" />
              신고
            </button>
          )}
        </div>
      </article>

      <section id="comments" className="space-y-3 pb-8" aria-label="댓글">
        <h2 className="text-title font-bold text-ink">댓글 {post.comment_count}</h2>
        {comments.length === 0 ? (
          <p className="text-sm text-muted">{post.category === "buddy" ? "첫 댓글로 인사해 보세요. 만날 곳은 댓글로 맞춰요." : "첫 댓글을 남겨 보세요."}</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="card rounded-2xl px-4 py-3">
                <p className="flex items-center gap-2 text-caption text-muted">
                  <span className="font-semibold text-ink-soft">{c.author_name}</span>· {timeAgo(c.created_at)}
                  {c.mine && (
                    <button type="button" onClick={() => removeComment(c)} className="ml-auto text-caption font-medium text-muted hover:text-diet-no">
                      지우기
                    </button>
                  )}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={send} className="flex items-end gap-2">
          <label htmlFor="comment" className="sr-only">
            댓글
          </label>
          <textarea
            id="comment"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, LIMITS.comment))}
            rows={1}
            placeholder="댓글 남기기"
            className="max-h-40 min-h-12 flex-1 resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:border-leaf/60 focus:outline-none"
          />
          <button type="submit" disabled={!text.trim() || busy === "comment"} className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-on-brand transition active:scale-95 disabled:opacity-45" aria-label="댓글 보내기">
            <Icon name="send" className="size-5" />
          </button>
        </form>
      </section>
    </main>
  );
}
