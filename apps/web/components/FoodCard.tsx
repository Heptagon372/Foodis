import type { CSSProperties, ReactNode } from "react";
import type { DietKey, DietLevel } from "@/lib/foodi/schema";
import { DietBadges } from "./DietBadge";
import { ImageCredit } from "./ImageCredit";
import { Icon } from "./icons";
import { TrackLink as Link } from "./TrackLink";

export type CardFood = {
  slug: string;
  name_ko: string;
  flag: string;
  accent: string;
  country_name?: string;
  summary: string | null;
  image_url: string | null;
  image_credit?: string | null;
  diet: Record<DietKey, DietLevel>;
  /** 취향 엔진 신호용 (있으면 카드 클릭을 기록) */
  country_code?: string;
  taste_tags?: string[];
};

/**
 * 사진 칸 배경. 사진이 있으면 사진 + 아래쪽 옅은 그늘(위에 얹는 글자·칩 가독성),
 * 없으면 국가 Accent 를 옅게 — 팔레트는 흰색·초록·연두라 나라 색은 '사진 대신'일 때만 (05 문서 §7). 바탕은 테마 surface
 */
export const accentBg = (accent: string, image?: string | null): CSSProperties =>
  image
    ? { backgroundImage: `linear-gradient(180deg, rgb(11 26 16 / 0) 48%, rgb(11 26 16 / 0.32) 100%), url(${image})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: `${accent}26` }
    : { backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${accent}40 0%, transparent 62%), linear-gradient(135deg, ${accent}1f 0%, ${accent}0a 100%)`, backgroundColor: "var(--color-surface)" };

/**
 * FoodCard L/M/S
 * - L: 홈 '오늘의 탐험' · 대화 시트 — 사진 + 나라 유리 칩 + 이름 + 한 줄 + 식이 배지 + 액션 슬롯
 * - M: 가로 스크롤 추천 — 안쪽 여백 있는 사진 칸 + 이름 + 한 줄 (레퍼런스 'My Plants' 카드)
 * - S: 연결 행·최근 탐험 칩 — 국기 + 이름
 */
export function FoodCard({ food, size = "M", reason, action, fluid = false, badge, src }: { food: CardFood; size?: "L" | "M" | "S"; reason?: string; action?: ReactNode; fluid?: boolean; badge?: ReactNode; src?: string }) {
  const href = `/food/${food.slug}`;
  if (size === "S") {
    return (
      <Link food={food} src={src} href={href} className="glass inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-ink transition active:scale-[0.97]">
        <span aria-hidden>{food.flag}</span>
        {food.name_ko}
      </Link>
    );
  }
  if (size === "M") {
    return (
      <Link food={food} src={src} href={href} className={`card block rounded-[24px] p-1.5 transition active:scale-[0.98] ${fluid ? "w-full" : "w-40"}`}>
        <div className={`relative flex items-end justify-between overflow-hidden rounded-[18px] p-2.5 ${food.image_url ? (fluid ? "h-32" : "h-28") : "h-24"}`} style={accentBg(food.accent, food.image_url)}>
          <span className="text-[1.75rem] leading-none drop-shadow-sm" aria-hidden>
            {food.flag}
          </span>
          {badge}
        </div>
        <div className="px-2 pb-2 pt-2.5">
          <p className="text-[15px] font-semibold leading-tight text-ink">{food.name_ko}</p>
          {reason && (
            <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-leaf">
              <Icon name="sparkle" className="size-3.5 shrink-0" />
              <span className="line-clamp-1">{reason}</span>
            </p>
          )}
          {food.summary && <p className="mt-1 line-clamp-2 text-caption leading-snug text-muted">{food.summary}</p>}
        </div>
      </Link>
    );
  }
  return (
    <article className="card overflow-hidden rounded-[28px]">
      <Link food={food} src={src} href={href} className="block">
        <div className={`relative flex items-end justify-between p-4 ${food.image_url ? "h-48" : "h-32"}`} style={accentBg(food.accent, food.image_url)}>
          {food.country_name && (
            <span className="glass absolute left-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-caption font-semibold text-ink">
              <span aria-hidden>{food.flag}</span>
              {food.country_name}
            </span>
          )}
          <ImageCredit credit={food.image_credit} link={false} className="absolute bottom-3 right-3" />
          {!food.image_url && (
            <span className="text-5xl drop-shadow-sm" aria-hidden>
              {food.flag}
            </span>
          )}
        </div>
        <div className="space-y-2.5 p-5 pb-4">
          <h3 className="text-h2 font-bold text-ink">{food.name_ko}</h3>
          {food.summary && <p className="text-[15px] leading-relaxed text-ink-soft">{food.summary}</p>}
          {reason && (
            <p className="flex items-start gap-1.5 text-caption font-semibold text-leaf">
              <Icon name="sparkle" className="mt-px size-4 shrink-0" />
              {reason}
            </p>
          )}
          <DietBadges diet={food.diet} />
        </div>
      </Link>
      {action && <div className="flex items-center gap-2 border-t border-line px-4 py-3">{action}</div>}
    </article>
  );
}
