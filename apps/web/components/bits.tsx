// 작은 공용 컴포넌트: FollowUpChip · RelationRow · SourceFooter · Section · Wordmark
import Link from "next/link";
import type { ReactNode } from "react";
import type { FoodSummary } from "@/lib/content/types";
import { FoodCard } from "./FoodCard";

export function FollowUpChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-mint-500/60 bg-mint-100 px-3.5 py-2 text-sm font-medium text-green-800 transition active:scale-95">
      {children}
    </button>
  );
}

export function Section({ title, children, more }: { title: string; children: ReactNode; more?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight text-charcoal/90">{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

/** 관계 타입 라벨 + 소형 카드 가로 스크롤 (05 문서 S4 '연결' 탭) */
export function RelationRow({ label, note, foods }: { label: string; note?: string; foods: FoodSummary[] }) {
  if (!foods.length) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-green-800">{label}</p>
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
    <footer className="space-y-1 border-t border-line pt-3 text-caption text-muted">
      <p className="font-medium">출처</p>
      {sources.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block truncate underline decoration-line underline-offset-2">
          {s.title ?? s.url}
          {s.license ? ` · ${s.license}` : ""}
        </a>
      ))}
    </footer>
  );
}

export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return (
    <Link href="/" className={`font-display font-bold tracking-tight text-green-800 ${className}`} aria-label="FOODIS 홈">
      FOOD<span className="text-mint-600">IS</span>
    </Link>
  );
}

export function PreviewBanner() {
  return (
    <p className="rounded-xl bg-diet-warn/12 px-3 py-2 text-caption text-[#7a5a10]">
      미리보기 모드 — 검수 전 샘플 데이터예요. Supabase·API 키를 넣으면 실제 DB로 바뀌어요.
    </p>
  );
}
