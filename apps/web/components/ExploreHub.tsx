"use client";
// 국가·재료 페이지 공용: 히어로 + 내 탐험 진행 + 사진 카드 그리드 (탐험한 음식은 ✓). 막다른 화면 없이 다음 탐험으로
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { useLocal } from "@/lib/client/passport";
import { signal } from "@/lib/client/taste";
import { FoodCard, accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner } from "./bits";
import { MicIcon } from "./VoiceButton";

export function ExploreHub(p: {
  back: { href: string; label: string };
  accent: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
  foods: FoodSummary[];
  emptyText: string;
  ask?: { label: string; question: string };
  preview: boolean;
  footer?: ReactNode;
  /** 국가 페이지면 나라 코드 — 방문을 취향 신호로 남긴다 */
  countryCode?: string;
}) {
  const { open } = useFoodi();
  useEffect(() => {
    if (p.countryCode) signal("country", null, { cc: p.countryCode, src: "country_page" });
  }, [p.countryCode]);
  const explored = useLocal((s) => Object.keys(s.entries));
  const done = p.foods.filter((f) => explored.includes(f.id)).length;
  // 안 가본 음식 먼저 — 다음 탐험이 위에
  const foods = [...p.foods].sort((a, b) => Number(explored.includes(a.id)) - Number(explored.includes(b.id)));
  return (
    <main>
      <header className="flex h-56 flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))]" style={accentBg(p.accent)}>
        <Link href={p.back.href} className="w-fit rounded-full bg-surface/80 px-3 py-1.5 text-sm backdrop-blur">
          ← {p.back.label}
        </Link>
        <div className="space-y-1">
          <div className="text-6xl leading-none" aria-hidden>
            {p.icon}
          </div>
          <p className="text-caption font-semibold uppercase tracking-wide text-charcoal/60">{p.eyebrow}</p>
          <h1 className="font-display text-h1 font-semibold">{p.title}</h1>
          {p.subtitle && <p className="text-sm text-charcoal/70">{p.subtitle}</p>}
        </div>
      </header>
      <div className="space-y-5 px-5 pt-5">
        {p.preview && <PreviewBanner />}
        {p.foods.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-mint-500 transition-[width] duration-300" style={{ width: `${(done / p.foods.length) * 100}%` }} />
            </span>
            <span className="text-caption font-semibold tabular-nums text-green-800">
              {done}/{p.foods.length} 탐험
            </span>
          </div>
        )}
        {p.ask && (
          <button type="button" onClick={() => open({ question: p.ask!.question })} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-800 py-3.5 font-semibold text-ivory transition active:scale-[0.98]">
            <MicIcon className="size-5" /> {p.ask.label}
          </button>
        )}
        {foods.length ? (
          <div className="grid grid-cols-2 gap-3">
            {foods.map((f) => (
              <FoodCard
                key={f.id}
                food={f}
                size="M"
                fluid
                src={p.countryCode ? "country_page" : "hub"}
                badge={
                  explored.includes(f.id) ? (
                    <span className="rounded-full bg-surface/90 px-2 py-0.5 text-caption font-semibold text-green-800">✓ 탐험</span>
                  ) : p.countryCode && (f.fame_rank ?? 99) <= 3 ? (
                    <span className="rounded-full bg-green-800/90 px-2 py-0.5 text-caption font-semibold text-ivory">★ 대표</span>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-5">
            <span className="text-2xl" aria-hidden>
              🧭
            </span>
            <div className="space-y-1">
              <p className="font-semibold">아직 지도를 그리는 중</p>
              <p className="text-sm text-muted">{p.emptyText}</p>
            </div>
          </div>
        )}
        {p.footer}
      </div>
    </main>
  );
}
