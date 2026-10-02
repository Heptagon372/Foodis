"use client";
// 모임 카드: 표지 · 이름 · 주제 · 회원/글 수 · 급상승 · 가입 여부
import Link from "next/link";
import { CATEGORY } from "@/lib/community/categories";
import type { ClubView } from "@/lib/community/types";
import { Icon } from "../icons";
import { timeAgo } from "./parts";

export function RisingPill({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-6 items-center gap-0.5 rounded-full bg-diet-no px-2 text-[11px] font-bold text-white ${className}`}>
      <Icon name="flame" className="size-3.5" strokeWidth={2.2} />
      급상승
    </span>
  );
}

export function ClubCover({ club, className = "" }: { club: Pick<ClubView, "cover" | "topic">; className?: string }) {
  return club.cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={club.cover.url} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`grid place-items-center bg-lime-soft text-leaf ${className}`} aria-hidden>
      <Icon name={CATEGORY[club.topic].icon} className="size-8" />
    </span>
  );
}

export function ClubCard({ club }: { club: ClubView }) {
  return (
    <Link href={`/community/clubs/${club.id}`} className="card group flex overflow-hidden rounded-3xl transition hover:border-leaf/40">
      <div className="relative">
        <ClubCover club={club} className="h-full min-h-28 w-28 shrink-0 sm:w-32" />
        {club.rising && <RisingPill className="absolute left-2 top-2" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 p-3.5">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-leaf">
          <Icon name={CATEGORY[club.topic].icon} className="size-3.5" />
          {CATEGORY[club.topic].label}
          {club.joined && <span className="ml-auto rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-on-lime">{club.mine ? "운영 중" : "가입함"}</span>}
        </p>
        <h3 className="truncate text-title font-bold text-ink group-hover:underline">{club.name}</h3>
        <p className="line-clamp-2 text-caption text-ink-soft">{club.description}</p>
        <p className="flex flex-wrap gap-x-3 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="users" className="size-3.5" />
            {club.member_count}명
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="message" className="size-3.5" />글 {club.post_count}
          </span>
          {club.last_post_at && <span>새 글 {timeAgo(club.last_post_at)}</span>}
        </p>
      </div>
    </Link>
  );
}

/** 가로로 넘기는 작은 모임 칩 (내 모임 · 급상승 모임 줄) */
export function ClubChip({ club }: { club: ClubView }) {
  return (
    <Link href={`/community/clubs/${club.id}`} className="card flex w-56 items-center gap-3 rounded-2xl p-2.5 transition hover:border-leaf/40">
      <ClubCover club={club} className="size-12 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{club.name}</span>
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          {club.member_count}명 · {CATEGORY[club.topic].label}
          {club.rising && <Icon name="flame" className="size-3.5 text-diet-no" aria-label="급상승" />}
        </span>
      </span>
    </Link>
  );
}
