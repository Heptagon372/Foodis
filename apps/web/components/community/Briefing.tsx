"use client";
// 푸디 브리핑: 모두의 행동 신호 → 카테고리별 열기(막대) + 글에 많이 나온 음식 + 푸디가 쓴 한 줄 요약.
// "푸디에게 묻기"는 커뮤니티 트렌드를 푸디 대화(DB 기반 음식 추천)로 잇는다
import Link from "next/link";
import type { BriefingPage } from "@/lib/client/community";
import { CATEGORY, type CategoryKey } from "@/lib/community/categories";
import { useFoodi } from "../FoodiSheet";
import { Icon } from "../icons";
import { btn, Eyebrow } from "../ui";

export function Briefing({ data, onPick }: { data: BriefingPage | null; onPick: (k: CategoryKey) => void }) {
  const { open } = useFoodi();
  if (!data) return <div className="h-64 animate-pulse rounded-[28px] bg-sunken/70" aria-hidden />;
  const { briefing: b, trends, hot_foods } = data;
  const top = trends.filter((t) => t.score > 0).slice(0, 5);
  return (
    <section className="forest-panel space-y-4 rounded-[28px] p-5" aria-label="푸디 커뮤니티 브리핑">
      <div className="space-y-1.5">
        <Eyebrow className="flex items-center gap-1.5 text-lime">
          <Icon name="sparkle" className="size-3.5" />
          푸디 브리핑 {b.by === "ai" ? "· AI 요약" : ""}
        </Eyebrow>
        <h2 className="text-xl font-bold leading-snug">{b.headline}</h2>
        <p className="text-sm text-white/80">{b.summary}</p>
      </div>

      {top.length > 0 && (
        <ul className="space-y-1.5" aria-label="요즘 활발한 모임">
          {top.map((t) => (
            <li key={t.category}>
              <button type="button" onClick={() => onPick(t.category)} className="group flex w-full items-center gap-2.5 text-left">
                <Icon name={CATEGORY[t.category].icon} className="size-4 shrink-0 text-lime" />
                <span className="w-[4.5rem] shrink-0 truncate text-[13px] font-medium group-hover:underline">{CATEGORY[t.category].label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                  <span className="block h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${Math.max(6, t.heat * 100)}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right text-[11px] font-semibold text-white/70">
                  {t.rising ? (
                    <span className="inline-flex items-center gap-0.5 text-lime">
                      <Icon name="trending" className="size-3.5" />
                      급상승
                    </span>
                  ) : (
                    `${Math.round(t.heat * 100)}`
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hot_foods.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-white/65">많이 나온 음식</span>
          {hot_foods.slice(0, 4).map((f) => (
            <Link key={f.slug} href={`/food/${f.slug}`} className="glass-dark inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-medium">
              #{f.name_ko}
            </Link>
          ))}
        </div>
      )}

      <button type="button" onClick={() => open({ question: b.ask })} className={`${btn("lime", "sm")} w-full justify-between`}>
        <span className="truncate">푸디에게: “{b.ask}”</span>
        <Icon name="mic" className="size-4 shrink-0" />
      </button>
    </section>
  );
}
