// 디자인 v2 기본 부품: 버튼·칩 클래스, 뒤로 가기, 세그먼트 탭, 진행 바, 아이콘 타일, 눈썹 라벨.
// 화면은 이 부품과 globals.css 의 glass / glass-dark / card / forest-panel / meadow-panel 유틸리티로만 조립한다 (docs/design/09).
// 색은 모두 테마 토큰 → 라이트/다크가 저절로 맞는다. 흰색·검정 글자색을 직접 쓰지 말 것 (숲 패널·사진 위 text-white 만 예외)
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type BtnVariant = "primary" | "lime" | "soft" | "glass" | "outline" | "ghost" | "on-dark";
type BtnSize = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";
const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-10 px-4 text-[13px]",
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-6 text-base",
};
const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: "bg-brand text-on-brand shadow-brand hover:bg-brand-strong",
  lime: "cta hover:brightness-110",
  soft: "bg-lime-soft text-leaf hover:bg-lime-soft/70",
  glass: "glass text-ink hover:border-leaf/40",
  outline: "border border-line bg-surface text-ink hover:border-leaf/40",
  ghost: "text-ink-soft hover:bg-ink/5",
  "on-dark": "border border-white/20 bg-white/12 text-white hover:bg-white/20",
};

/** 버튼 모양 클래스 — <button>·<Link> 어디에나. 높이 40/48/56px (터치 목표 40px 이상)
 *  primary = 초록(주 동작) · lime = 핵심 CTA(초록 그라데이션 + 네온 글로우, 화면에 한두 개) · soft = 연두 옅은 보조 · on-dark = 숲 패널·사진 위 */
export const btn = (variant: BtnVariant = "primary", size: BtnSize = "md") => `${BTN_BASE} ${BTN_SIZE[size]} ${BTN_VARIANT[variant]}`;

/** 토글 칩 (식이 조건·필터). 켜짐 = 초록 채움 */
export const chip = (on = false) =>
  `inline-flex h-10 select-none items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition active:scale-[0.97] ${
    on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface/80 text-ink-soft hover:border-leaf/40"
  }`;

/** 원형 아이콘 버튼 44px — 반드시 aria-label */
export function IconButton({
  icon,
  label,
  onClick,
  variant = "glass",
  className = "",
  pressed,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  variant?: "glass" | "outline" | "brand" | "lime" | "soft" | "ghost" | "on-dark";
  className?: string;
  pressed?: boolean;
  /** aria-disabled 로 끈다 — 네이티브 disabled 는 누르고 있던 키보드 포커스를 body 로 날린다 */
  disabled?: boolean;
}) {
  const v = {
    glass: "glass text-ink",
    outline: "border border-line bg-surface text-ink",
    brand: "bg-brand text-on-brand",
    lime: "bg-lime text-on-lime",
    soft: "bg-lime-soft text-leaf",
    ghost: "text-ink-soft hover:bg-ink/5",
    "on-dark": "border border-white/20 bg-white/12 text-white",
  }[variant];
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      className={`grid size-11 shrink-0 place-items-center rounded-full transition active:scale-95 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:active:scale-100 ${v} ${className}`}
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
}

/** 상단 뒤로 가기 — 사진 위에서도 읽히는 유리 알약 (사진 위면 onPhoto) */
export function BackLink({ href, label, onPhoto = false }: { href: string; label: string; onPhoto?: boolean }) {
  return (
    <Link href={href} className={`inline-flex h-10 w-fit items-center gap-1 rounded-full pl-2 pr-4 text-sm font-medium transition active:scale-95 ${onPhoto ? "glass-dark" : "glass text-ink"}`}>
      <Icon name="back" className="size-5" />
      {label}
    </Link>
  );
}

/** 세그먼트 탭 (레퍼런스: Today / Upcoming / Completed). 활성 = 초록 알약 */
export function SegTabs<T extends string>({ tabs, value, onChange, label, labels }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; label: string; labels?: Partial<Record<T, ReactNode>> }) {
  return (
    <div role="tablist" aria-label={label} className="glass flex gap-1 rounded-full p-1">
      {tabs.map((t) => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t)}
            className={`h-10 flex-1 rounded-full px-3 text-sm font-semibold transition ${on ? "bg-brand text-on-brand shadow-brand" : "text-ink-soft hover:text-ink"}`}
          >
            {labels?.[t] ?? t}
          </button>
        );
      })}
    </div>
  );
}

/** 진행 바. 보통 = 초록, 숲 패널 위(onDark) = 연두 */
export function ProgressBar({ value, max, label, onDark = false, className = "h-2" }: { value: number; max: number; label: string; onDark?: boolean; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={`block flex-1 overflow-hidden rounded-full ${onDark ? "bg-white/18" : "bg-sunken"} ${className}`}>
      <span className={`block h-full rounded-full transition-[width] duration-300 ${onDark ? "bg-lime" : "bg-brand dark:bg-lime dark:shadow-[0_0_10px_rgb(61_245_122/0.7)]"}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

/** 아이콘 타일 — 기능 바로가기·목록 앞머리 (레퍼런스의 둥근 사각 아이콘 칸) */
export function IconTile({ icon, tone = "soft", size = "md", className = "" }: { icon: IconName; tone?: "soft" | "glass" | "brand" | "lime" | "outline" | "on-dark"; size?: "sm" | "md" | "lg"; className?: string }) {
  const t = {
    soft: "bg-lime-soft text-leaf dark:border dark:border-lime/25 dark:shadow-[inset_0_0_14px_-4px_rgb(61_245_122/0.5)]",
    glass: "glass text-leaf",
    brand: "bg-brand text-on-brand",
    lime: "bg-lime text-on-lime",
    outline: "border border-line bg-surface text-ink-soft",
    "on-dark": "border border-white/15 bg-white/10 text-lime",
  }[tone];
  const s = { sm: "size-9 rounded-xl", md: "size-11 rounded-2xl", lg: "size-14 rounded-[18px]" }[size];
  const i = { sm: "size-[18px]", md: "size-5", lg: "size-6" }[size];
  return (
    <span className={`grid shrink-0 place-items-center ${s} ${t} ${className}`} aria-hidden>
      <Icon name={icon} className={i} />
    </span>
  );
}

/** 눈썹 라벨 — 섹션·카드 위 작은 대문자 */
export function Eyebrow({ children, className = "text-leaf" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${className}`}>{children}</p>;
}
