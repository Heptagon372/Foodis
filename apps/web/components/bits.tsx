// 작은 공용 컴포넌트: FollowUpChip · RelationRow · SourceFooter · Section · Wordmark
import Link from "next/link";
import type { ReactNode } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { FoodCard } from "./FoodCard";
import { Icon } from "./icons";

export function FollowUpChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-2 text-left text-sm font-medium text-ink transition active:scale-95">
      <Icon name="sparkle" className="size-4 shrink-0 text-leaf" />
      {children}
    </button>
  );
}

export function Section({ title, children, more }: { title: string; children: ReactNode; more?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title font-bold text-ink">{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

/** Section 오른쪽 '모두 보기' 링크 */
export function MoreLink({ href, children = "모두 보기" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center text-caption font-semibold text-leaf">
      {children}
      <Icon name="next" className="size-4" />
    </Link>
  );
}

/** 관계 타입 라벨 + 소형 카드 가로 스크롤 (05 문서 S4 '연결' 탭) */
export function RelationRow({ label, note, foods }: { label: string; note?: string; foods: FoodSummary[] }) {
  if (!foods.length) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        {note && <p className="text-caption text-muted">{note}</p>}
      </div>
      <div className="snap-row -mx-5 px-5 pb-1">
        {foods.map((f) => (
          <FoodCard key={f.id} food={f} size="S" />
        ))}
      </div>
    </div>
  );
}

export function SourceFooter({ sources }: { sources: { url: string; title: string | null; license?: string | null }[] }) {
  if (!sources.length) return null;
  return (
    <footer className="border-t border-line pt-4 text-caption text-muted">
      <p className="pb-0.5 font-semibold text-ink-soft">출처</p>
      {sources.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block truncate py-2.5 leading-5 underline decoration-line underline-offset-2 hover:text-ink">
          {s.title ?? s.url}
          {s.license ? ` · ${s.license}` : ""}
        </a>
      ))}
    </footer>
  );
}

/** 워드마크: FOOD(잉크) + IS(리프), Fraunces — UI 에서 세리프는 여기와 영문 이탤릭 강조에만 */
export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return (
    <Link href="/" className={`font-serif font-bold tracking-tight text-ink ${className}`} aria-label="FOODIS 홈">
      FOOD<span className="text-leaf">IS</span>
    </Link>
  );
}

export function PreviewBanner() {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-diet-warn/25 bg-diet-warn/10 px-3.5 py-2.5 text-caption text-diet-warn-ink">
      <Icon name="info" className="mt-px size-4 shrink-0" />
      미리보기 모드 — 검수 전 샘플 데이터예요. Supabase·API 키를 넣으면 실제 DB로 바뀌어요.
    </p>
  );
}
