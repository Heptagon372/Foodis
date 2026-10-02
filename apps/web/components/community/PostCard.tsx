"use client";
// 피드의 글 한 장: 카테고리·모집 상태·AI 추천 이유 → 제목·본문 두 줄·첫 사진 → 위치·약속 시각·투표 요약·음식 태그 → 따봉·댓글·공유
import Link from "next/link";
import { useState } from "react";
import { act, ApiError } from "@/lib/client/community";
import type { PostView } from "@/lib/community/types";
import { Icon } from "../icons";
import { BuddyPill, CategoryBadge, meetLabel, ShareButton, timeAgo } from "./parts";

export function PostCard({ post, onLoginNeeded }: { post: PostView; onLoginNeeded: (msg: string) => void }) {
  const [liked, setLiked] = useState(post.viewer.liked);
  const [likes, setLikes] = useState(post.like_count);
  const [busy, setBusy] = useState(false);
  const href = `/community/${post.id}`;
  const voters = post.poll_counts?.reduce((a, b) => a + b, 0) ?? 0;

  const like = async () => {
    if (busy) return;
    setBusy(true);
    // 먼저 바꿔 보여 주고(낙관적), 실패하면 되돌린다
    setLiked(!liked);
    setLikes(likes + (liked ? -1 : 1));
    try {
      const r = await act(post, { action: "like" });
      setLiked(Boolean(r.liked));
      setLikes(r.like_count ?? likes);
    } catch (e) {
      setLiked(liked);
      setLikes(likes);
      if (e instanceof ApiError && e.status === 401) onLoginNeeded(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card overflow-hidden rounded-3xl">
      <Link href={href} className="block p-4 pb-2 transition hover:bg-ink/[0.02]">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={post.category} />
          <BuddyPill post={post} />
          {post.reason && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] font-medium text-ink-soft" title="AI 맞춤 피드가 이 글을 올린 이유">
              <Icon name="sparkle" className="size-3.5 text-leaf" />
              {post.reason}
            </span>
          )}
        </div>
        <div className="mt-3 flex gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-title font-bold text-ink">{post.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{post.body}</p>
          </div>
          {post.photos[0] && (
            // 사진은 Supabase Storage·위키미디어 등 여러 곳이라 next/image 대신 img (지연 로딩)
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.photos[0].url} alt="" loading="lazy" className="size-20 shrink-0 rounded-2xl object-cover lg:size-24" />
          )}
        </div>
        {(post.place || post.meet_at || post.poll) && (
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted">
            {post.meet_at && (
              <span className="inline-flex items-center gap-1 font-medium text-ink-soft">
                <Icon name="calendar" className="size-3.5" />
                {meetLabel(post.meet_at)}
              </span>
            )}
            {post.place && (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" className="size-3.5" />
                {post.place}
              </span>
            )}
            {post.poll && (
              <span className="inline-flex items-center gap-1">
                <Icon name="poll" className="size-3.5" />
                투표 · {voters}명 참여
              </span>
            )}
            {post.photos.length > 1 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="image" className="size-3.5" />
                사진 {post.photos.length}장
              </span>
            )}
          </div>
        )}
      </Link>
      {post.foods.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-1">
          {post.foods.map((f) => (
            <Link key={f.slug} href={`/food/${f.slug}`} className="inline-flex h-7 items-center rounded-full bg-sunken px-2.5 text-[12px] font-medium text-ink-soft hover:text-ink">
              #{f.name_ko}
            </Link>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <span className="min-w-0 flex-1 truncate px-2 text-caption text-muted">
          {post.author_name} · {timeAgo(post.created_at)}
        </span>
        <button
          type="button"
          onClick={like}
          aria-pressed={liked}
          aria-label={liked ? "따봉 취소" : "따봉"}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold tabular-nums transition active:scale-95 ${liked ? "bg-lime text-on-lime" : "text-ink-soft hover:bg-ink/5"}`}
        >
          <Icon name="thumbs-up" className="size-[18px]" strokeWidth={liked ? 2.2 : 1.75} />
          {likes}
        </button>
        <Link href={`${href}#comments`} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold tabular-nums text-ink-soft hover:bg-ink/5" aria-label={`댓글 ${post.comment_count}개`}>
          <Icon name="message" className="size-[18px]" />
          {post.comment_count}
        </Link>
        <ShareButton post={post} />
      </div>
    </article>
  );
}
