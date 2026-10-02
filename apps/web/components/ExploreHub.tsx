"use client";
// 국가·재료 페이지 공용: 히어로 + 내 탐험 진행 + 사진 카드 그리드 (탐험한 음식은 체크 칩). 막다른 화면 없이 다음 탐험으로
import type { ReactNode } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { useLocal } from "@/lib/client/passport";
import { FoodCard, accentBg } from "./FoodCard";
import { useFoodi } from "./FoodiSheet";
import { PreviewBanner } from "./bits";
import { Icon } from "./icons";
import { BackLink, Eyebrow, IconTile, ProgressBar, btn } from "./ui";
import { MicIcon } from "./VoiceButton";

export function ExploreHub(p: {
  back: { href: string; label: string };
  accent: string;
  /** 국가 = 국기 이모지(콘텐츠), 재료 = <IconTile> 같은 라인 아이콘 */
  icon: ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
  foods: FoodSummary[];
  emptyText: string;
  ask?: { label: string; question: string };
  preview: boolean;
  footer?: ReactNode;
}) {
  const { open } = useFoodi();
  const explored = useLocal((s) => Object.keys(s.entries));
  const done = p.foods.filter((f) => explored.includes(f.id)).length;
  // 안 가본 음식 먼저 — 다음 탐험이 위에
  const foods = [...p.foods].sort((a, b) => Number(explored.includes(a.id)) - Number(explored.includes(b.id)));
  return (
    <main>
      <header className="flex h-60 flex-col justify-between p-5 pt-[max(1.25rem,env(safe-area-inset-top))]" style={accentBg(p.accent)}>
        <BackLink href={p.back.href} label={p.back.label} />
        <div className="space-y-2">
          <div className="text-6xl leading-none drop-shadow-sm" aria-hidden>
            {p.icon}
          </div>
          <div className="space-y-0.5">
            <Eyebrow>{p.eyebrow}</Eyebrow>
            <h1 className="text-h1 font-bold text-ink">{p.title}</h1>
            {p.subtitle && <p className="text-sm text-ink-soft">{p.subtitle}</p>}
          </div>
        </div>
      </header>
      <div className="space-y-5 px-5 pb-8 pt-5">
        {p.preview && <PreviewBanner />}
        {p.foods.length > 0 && (
          <div className="flex items-center gap-3">
            <ProgressBar value={done} max={p.foods.length} label={`${p.title} 탐험 진행`} />
            <span className="text-caption font-semibold tabular-nums text-leaf">
              {done}/{p.foods.length} 탐험
            </span>
          </div>
        )}
        {p.ask && (
          <button type="button" onClick={() => open({ question: p.ask!.question })} className={`${btn("primary", "md")} w-full`}>
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
                badge={
                  explored.includes(f.id) ? (
                    <span className="glass inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-caption font-semibold text-ink">
                      <Icon name="check" className="size-3.5 text-leaf" strokeWidth={2.5} />
                      탐험
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-3xl border border-dashed border-line bg-surface/60 p-5">
            <IconTile icon="compass" />
            <div className="space-y-1">
              <p className="font-semibold text-ink">아직 지도를 그리는 중</p>
              <p className="text-sm text-muted">{p.emptyText}</p>
            </div>
          </div>
        )}
        {p.footer}
      </div>
    </main>
  );
}
