"use client";
// 커뮤니티 공용 부품: 카테고리 배지 · 상대 시간 · 밥약속 시각 · 로그인 안내 · 공유 버튼 · 투표 막대
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { sharePost } from "@/lib/client/community";
import { CATEGORY, type CategoryKey } from "@/lib/community/categories";
import { buddyState, type PostView } from "@/lib/community/types";
import { Icon } from "../icons";
import { btn } from "../ui";

export function CategoryBadge({ category, className = "" }: { category: CategoryKey; className?: string }) {
  const c = CATEGORY[category];
  const buddy = c.board === "buddy";
  return (
    <span className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold ${buddy ? "bg-lime text-on-lime" : "bg-lime-soft text-leaf"} ${className}`}>
      <Icon name={c.icon} className="size-3.5" strokeWidth={2} />
      {buddy ? c.label : `${c.label} 모임`}
    </span>
  );
}

const KST = "Asia/Seoul";
export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  if (m < 60 * 24 * 7) return `${Math.floor(m / 1440)}일 전`;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric" }).format(new Date(iso));
}

/** "오늘 오후 7:00" · "내일 오후 12:30" · "10월 5일 (토) 오후 6:00" */
export function meetLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KST }).format(x);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "numeric", minute: "2-digit" }).format(d);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day(d) === day(now)) return `오늘 ${time}`;
  if (day(d) === day(tomorrow)) return `내일 ${time}`;
  return `${new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric", weekday: "short" }).format(d)} ${time}`;
}

/** 밥친구 모집 상태 알약 */
export function BuddyPill({ post }: { post: Pick<PostView, "category" | "meet_at" | "capacity" | "join_count"> }) {
  const s = buddyState(post);
  if (!s) return null;
  const label = s === "past" ? "약속 지남" : s === "full" ? "모집 완료" : post.capacity ? `${post.join_count}/${post.capacity}명` : `${post.join_count}명 참여`;
  return (
    <span className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold tabular-nums ${s === "open" ? "border-brand/30 text-leaf" : "border-line text-muted"}`}>
      <Icon name="users" className="size-3.5" />
      {label}
    </span>
  );
}

/** 로그인이 필요할 때 — 지금 화면으로 돌아오게 next 를 붙인다 */
export function LoginPrompt({ message, onClose }: { message: string; onClose?: () => void }) {
  const path = usePathname();
  return (
    <div role="alert" className="flex items-center gap-3 rounded-2xl border border-brand/25 bg-lime-soft px-4 py-3">
      <Icon name="user" className="size-5 shrink-0 text-leaf" />
      <p className="flex-1 text-sm text-ink">{message}</p>
      <Link href={`/login?next=${encodeURIComponent(path)}`} className={btn("primary", "sm")}>
        로그인
      </Link>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="닫기" className="grid size-8 place-items-center rounded-full text-muted hover:bg-ink/5">
          <Icon name="close" className="size-4" />
        </button>
      )}
    </div>
  );
}

export function ShareButton({ post, className = "" }: { post: Pick<PostView, "id" | "title" | "category">; className?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = await sharePost(post);
        setMsg(r === "copied" ? "링크 복사됨" : r === "failed" ? "공유 실패" : null);
        if (r === "copied" || r === "failed") setTimeout(() => setMsg(null), 1800);
      }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-soft transition hover:bg-ink/5 active:scale-95 ${className}`}
      aria-label="공유"
    >
      <Icon name="share" className="size-[18px]" />
      <span aria-live="polite">{msg ?? "공유"}</span>
    </button>
  );
}

/** 투표 결과 막대 (내 선택은 체크 + 진하게) */
export function PollBars({ options, counts, mine, onVote, busy }: { options: string[]; counts: number[]; mine: number | null; onVote?: (i: number) => void; busy?: boolean }) {
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...counts);
  const showResult = mine != null || !onVote;
  return (
    <ul className="space-y-2">
      {options.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const on = mine === i;
        const inner = (
          <>
            {showResult && <span className={`absolute inset-y-0 left-0 rounded-2xl transition-[width] duration-500 ${on ? "bg-brand/25" : counts[i] === max && max > 0 ? "bg-lime-soft" : "bg-sunken"}`} style={{ width: `${pct}%` }} aria-hidden />}
            <span className="relative flex flex-1 items-center gap-2 text-left">
              {on && <Icon name="check-circle" className="size-4 shrink-0 text-leaf" />}
              <span className={`truncate ${on ? "font-semibold" : ""}`}>{o}</span>
            </span>
            {showResult && <span className="relative text-caption font-semibold tabular-nums text-ink-soft">{pct}%</span>}
          </>
        );
        return (
          <li key={o}>
            {onVote ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onVote(i)}
                aria-pressed={on}
                className={`relative flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-2xl border px-3.5 text-sm text-ink transition active:scale-[0.99] ${on ? "border-brand" : "border-line hover:border-leaf/40"}`}
              >
                {inner}
              </button>
            ) : (
              <div className="relative flex min-h-10 items-center gap-2 overflow-hidden rounded-2xl border border-line px-3.5 text-sm text-ink">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
