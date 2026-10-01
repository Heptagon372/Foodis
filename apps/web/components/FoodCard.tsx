import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { DietKey, DietLevel } from "@/lib/foodi/schema";
import { DietBadges } from "./DietBadge";

export type CardFood = {
  slug: string;
  name_ko: string;
  flag: string;
  accent: string;
  country_name?: string;
  summary: string | null;
  image_url: string | null;
  diet: Record<DietKey, DietLevel>;
};

/** 국가 Accent 그라데이션 — 사진이 없을 때도 '그 나라 색'이 카드를 지배하게 (05 문서 §7) */
export const accentBg = (accent: string, image?: string | null): CSSProperties =>
  image
    ? { backgroundImage: `linear-gradient(180deg, ${accent}10 0%, ${accent}cc 100%), url(${image})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${accent}55 0%, transparent 60%), linear-gradient(135deg, ${accent}26 0%, ${accent}0d 100%)` };

/**
 * FoodCard L/M/S
 * - L: 홈 '오늘의 탐험' · 대화 시트 — 이름 + 한 줄 + 식이 배지 + 액션 슬롯
 * - M: 가로 스크롤 추천 — 국기 + 이름 + 한 줄
 * - S: 연결 행·최근 탐험 칩 — 국기 + 이름
 */
export function FoodCard({ food, size = "M", reason, action }: { food: CardFood; size?: "L" | "M" | "S"; reason?: string; action?: ReactNode }) {
  const href = `/food/${food.slug}`;
  if (size === "S") {
    return (
      <Link href={href} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium active:scale-[0.97] transition" style={{ borderColor: `${food.accent}40` }}>
        <span aria-hidden>{food.flag}</span>
        {food.name_ko}
      </Link>
    );
  }
  if (size === "M") {
    return (
      <Link href={href} className="block w-40 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_0_#0000000a,0_6px_16px_-10px_#00000040] active:scale-[0.98] transition">
        <div className="flex h-20 items-end p-3" style={accentBg(food.accent, food.image_url)}>
          <span className="text-3xl drop-shadow-sm" aria-hidden>{food.flag}</span>
        </div>
        <div className="p-3">
          <p className="font-semibold leading-tight">{food.name_ko}</p>
          {food.summary && <p className="mt-1 line-clamp-2 text-caption text-muted">{food.summary}</p>}
        </div>
      </Link>
    );
  }
  return (
    <article className="overflow-hidden rounded-3xl bg-surface shadow-[0_1px_0_#0000000a,0_12px_28px_-16px_#00000055]">
      <Link href={href} className="block">
        <div className="flex h-28 items-end justify-between p-4" style={accentBg(food.accent, food.image_url)}>
          <span className="text-5xl drop-shadow" aria-hidden>{food.flag}</span>
          {food.country_name && <span className="rounded-full bg-surface/80 px-2.5 py-1 text-caption font-medium backdrop-blur">{food.country_name}</span>}
        </div>
        <div className="space-y-2 p-4 pb-3">
          <h3 className="font-display text-h2 font-semibold">{food.name_ko}</h3>
          {food.summary && <p className="text-[15px] leading-relaxed text-charcoal/85">{food.summary}</p>}
          {reason && <p className="text-caption font-medium text-green-800">✦ {reason}</p>}
          <DietBadges diet={food.diet} />
        </div>
      </Link>
      {action && <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">{action}</div>}
    </article>
  );
}
