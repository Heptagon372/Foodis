"use client";
// 모임 탭: 내 모임 → 급상승 모임 → 주제별 모임 목록 + 모임 만들기 (네이버 카페 목록처럼)
import Link from "next/link";
import { useEffect, useState } from "react";
import { bump, fetchClubs, type ClubsPage } from "@/lib/client/community";
import { CATEGORIES, CATEGORY, type CategoryKey } from "@/lib/community/categories";
import { Icon } from "../icons";
import { ScrollRow } from "../ScrollRow";
import { btn, chip } from "../ui";
import { ClubCard, ClubChip } from "./ClubCard";

export function ClubDirectory() {
  const [topic, setTopic] = useState<CategoryKey | null>(null);
  const [data, setData] = useState<ClubsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetchClubs(topic).then(
      (r) => alive && setData(r),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [topic]);

  const rising = data?.clubs.filter((c) => c.rising).sort((a, b) => b.recent - a.recent) ?? [];

  return (
    <div className="space-y-6">
      <div className="meadow-panel flex flex-wrap items-center gap-4 rounded-3xl p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-on-brand">
          <Icon name="users" className="size-6" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-[15px] font-bold text-ink">취향이 맞는 사람들과 모임을 만들어요</p>
          <p className="text-caption text-ink-soft">가입한 사람만 모임 안에 글을 쓰고, 정모 일정을 잡을 수 있어요.</p>
        </div>
        <Link href={topic ? `/community/clubs/new?topic=${topic}` : "/community/clubs/new"} className={`${btn("primary", "sm")} w-full shrink-0 sm:w-auto`}>
          <Icon name="plus" className="size-4" />
          모임 만들기
        </Link>
      </div>

      {data && data.mine.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-title font-bold text-ink">내 모임</h2>
          <ScrollRow label="모임" className="snap-row -mx-5 flex gap-2.5 px-5 pb-1 lg:mx-0 lg:px-0">
            {data.mine.map((c) => (
              <ClubChip key={c.id} club={c} />
            ))}
          </ScrollRow>
        </section>
      )}

      {rising.length > 0 && !topic && (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-1.5 text-title font-bold text-ink">
            <Icon name="flame" className="size-5 text-diet-no" />
            급상승 모임
            <span className="text-caption font-normal text-muted">최근 48시간 가입·글이 평소보다 2배 넘게</span>
          </h2>
          <ScrollRow label="모임" className="snap-row -mx-5 flex gap-2.5 px-5 pb-1 lg:mx-0 lg:px-0">
            {rising.map((c) => (
              <ClubChip key={c.id} club={c} />
            ))}
          </ScrollRow>
        </section>
      )}

      <section className="space-y-3">
        <ScrollRow label="주제" className="snap-row -mx-5 flex gap-2 px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="모임 주제">
          <button type="button" className={chip(topic === null)} onClick={() => setTopic(null)} aria-pressed={topic === null}>
            전체 모임
          </button>
          {CATEGORIES.filter((c) => c.board === "club").map((c) => (
            <button
              key={c.key}
              type="button"
              className={chip(topic === c.key)}
              aria-pressed={topic === c.key}
              onClick={() => {
                setTopic(c.key);
                bump(c.key, "tap");
              }}
            >
              <Icon name={c.icon} className="size-4" />
              {c.label}
            </button>
          ))}
        </ScrollRow>

        {error ? (
          <p className="card rounded-3xl p-5 text-center text-sm text-ink-soft">{error}</p>
        ) : !data ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-3xl bg-sunken/70" />
            ))}
          </div>
        ) : data.clubs.length === 0 ? (
          <div className="card space-y-3 rounded-3xl p-6 text-center">
            <p className="text-sm text-ink-soft">{topic ? `아직 ${CATEGORY[topic].label} 모임이 없어요. 첫 모임을 만들어 보세요.` : "아직 모임이 없어요."}</p>
            <Link href={topic ? `/community/clubs/new?topic=${topic}` : "/community/clubs/new"} className={btn("primary", "sm")}>
              모임 만들기
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.clubs.map((c) => (
              <li key={c.id}>
                <ClubCard club={c} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
