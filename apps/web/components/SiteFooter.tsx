"use client";
// 데스크톱(lg 이상) 사이트 푸터 (docs/design/18): 워드마크 + 묻기 입력 + 링크 열(nav.ts) → 숲 알약 바 + 가운데 둥근 홈 버튼 (레퍼런스의 바닥 바).
// 뉴스레터·SNS·약관처럼 없는 것은 넣지 않는다
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHydrated, useLocal } from "@/lib/client/passport";
import { Wordmark } from "./bits";
import { Icon } from "./icons";
import { AskForm } from "./landing/parts";
import { FOOTER_COLUMNS } from "./nav";
import { Eyebrow } from "./ui";

// ring-canvas 로 판에 '구멍'을 낸 것처럼 — 페이지 아래쪽은 안개가 없어 바탕과 이어진다
const HOME_BTN =
  "absolute left-1/2 top-0 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-leaf shadow-lift ring-[6px] ring-canvas transition hover:bg-lime hover:text-on-lime";

export function SiteFooter() {
  const path = usePathname();
  const hydrated = useHydrated();
  const introSeen = useLocal((s) => s.introSeen);
  // 첫 방문 인트로 중에는 숨긴다 (DesktopNav 와 같은 조건)
  if (path === "/" && hydrated && !introSeen) return null;
  // 맨 위로: 스크롤 + 키보드 포커스도 히어로 제목으로 (포커스가 바닥에 남지 않게)
  const toTop = () => {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    document.getElementById("desk-hero-title")?.focus({ preventScroll: true });
  };

  return (
    <footer className="mx-auto hidden max-w-6xl px-6 pb-8 pt-16 lg:block">
      <div className="card grid grid-cols-12 gap-8 rounded-[36px] p-10">
        <div className="col-span-4 space-y-4">
          <Wordmark className="text-2xl" />
          <p className="text-[15px] leading-relaxed text-ink-soft">세계 음식 문화를 말로 탐험하는 곳. 검색 대신 푸디에게 물어보세요.</p>
          <AskForm tone="light" label="푸디에게 묻기 (푸터)" />
        </div>
        {FOOTER_COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="col-span-2 space-y-3">
            <Eyebrow className="text-muted">{c.title}</Eyebrow>
            {c.links.map((l) =>
              l.external ? (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="block text-sm text-ink-soft hover:text-ink">
                  {l.label} <Icon name="external" className="inline size-3.5 align-[-2px]" />
                </a>
              ) : (
                <Link key={l.href} href={l.href} className="block text-sm text-ink-soft hover:text-ink">
                  {l.label}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
      <div className="slab relative mt-14 flex h-16 items-center justify-between rounded-full px-12 text-[12px] font-semibold uppercase tracking-[0.4em] text-white/85">
        <span>Different Cultures</span>
        <span>One Table</span>
        {path === "/" ? (
          <button type="button" onClick={toTop} aria-label="맨 위로" className={HOME_BTN}>
            <Icon name="home" className="size-6" />
          </button>
        ) : (
          <Link href="/" aria-label="FOODIS 홈" className={HOME_BTN}>
            <Icon name="home" className="size-6" />
          </Link>
        )}
      </div>
      <p className="mt-5 text-center text-caption text-muted">© 2026 FOODIS · 성공회대 제17회 IT 경진대회 출품작 · 음식 사진의 작가·라이선스는 음식 상세 화면에서 볼 수 있어요 · 국기 Twemoji (CC-BY 4.0)</p>
    </footer>
  );
}
