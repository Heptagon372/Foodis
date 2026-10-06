"use client";
// 데스크톱(lg 이상) 상단 알약 내비 (docs/design/17): [워드마크 유리 알약] [진한 메뉴 알약 + 푸디] [새싹] [따로 떨어진 계정 알약 ▾].
// 문서 흐름 안의 sticky (높이 --desk-nav) — AppFrame 이 children 앞에 둔다. 모바일에서는 숨고 하단 탭 바(TabBar)가 같은 메뉴 표(nav.ts)를 쓴다
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { exploredCountries, useHydrated, useLocal } from "@/lib/client/passport";
import { useQuest } from "@/lib/client/quest";
import { Wordmark } from "./bits";
import { useFoodi } from "./FoodiSheet";
import { Icon } from "./icons";
import { ACCOUNT_ACTIVE, ACCOUNT_ITEMS, activeHref, DESK_PRIMARY, SETTINGS_ITEM, type NavItem } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export function DesktopNav() {
  const path = usePathname();
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const introSeen = useLocal((s) => s.introSeen);
  const countries = useLocal(exploredCountries);
  const q = useQuest();
  // 첫 방문 인트로가 덮고 있을 땐 숨긴다 (TabBar 와 같은 조건 — 키보드 포커스가 덮인 링크로 가지 않게)
  if (path === "/" && hydrated && !introSeen) return null;
  const active = activeHref(path);
  // 메뉴 옆 작은 숫자 — 하이드레이션 뒤에만
  const badge: Record<string, ReactNode> = hydrated
    ? {
        "/passport": countries.length ? `${countries.length}개국` : null,
        "/quests": q.ready && q.quests.length ? `${q.doneCount}/${q.quests.length}` : null,
      }
    : {};
  const summary = !hydrated ? "탐험 기록 보기" : q.ready && q.quests.length ? `${countries.length}개국 · 퀘스트 ${q.doneCount}/${q.quests.length}` : `${countries.length}개국 탐험`;

  return (
    <header data-desk-nav className="pointer-events-none sticky top-0 z-40 hidden lg:block">
      {/* 알약 사이 틈으로 스크롤된 글자가 비치지 않게 하는 옅은 배경막 */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-canvas/70 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" />
      <div className="mx-auto flex h-(--desk-nav) max-w-6xl items-center gap-2.5 px-6 pb-2 pt-3">
        <div className="glass pointer-events-auto flex h-full shrink-0 items-center rounded-full px-5">
          <Wordmark className="text-lg" />
        </div>
        <nav aria-label="주 메뉴" className="slab pointer-events-auto flex h-full min-w-0 flex-1 items-center gap-0.5 rounded-full pl-3 pr-2 shadow-lift">
          {DESK_PRIMARY.map((it) => {
            const on = active === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`relative inline-flex h-11 items-center whitespace-nowrap rounded-full px-3 text-[14px] transition xl:px-3.5 xl:text-[15px] ${on ? "font-semibold text-white" : "font-medium text-white/75 hover:bg-white/10 hover:text-white"}`}
              >
                {it.label}
                {on && <span aria-hidden className="absolute inset-x-3 bottom-1.5 h-[3px] rounded-full bg-lime" />}
              </Link>
            );
          })}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => open({ listen: true })}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full bg-lime text-on-lime shadow-glow transition hover:bg-lime-strong active:scale-[0.97] xl:w-auto xl:pl-1.5 xl:pr-4"
          >
            <span className="grid size-8 place-items-center rounded-full xl:bg-on-lime/10" aria-hidden>
              <Icon name="mic" className="size-[18px]" />
            </span>
            <span className="sr-only text-sm font-semibold xl:not-sr-only">푸디에게 묻기</span>
          </button>
        </nav>
        <ThemeToggle className="pointer-events-auto" />
        <AccountMenu path={path} on={!!active && ACCOUNT_ACTIVE.includes(active)} active={active} badge={badge} summary={summary} />
      </div>
    </header>
  );
}

/** 계정 알약 + 내 기록 드롭다운 (disclosure). 화면을 옮기면 저절로 닫힌다 — 열린 경로를 기억해 비교 */
function AccountMenu({ path, on, active, badge, summary }: { path: string; on: boolean; active: string | null; badge: Record<string, ReactNode>; summary: string }) {
  const id = useId();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const isOpen = openAt === path;
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenAt(null);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);
  const close = () => setOpenAt(null);

  return (
    <div ref={wrap} className="pointer-events-auto relative h-full">
      <button
        ref={button}
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => setOpenAt(isOpen ? null : path)}
        className={`slab flex h-full items-center gap-2.5 rounded-full pl-2 pr-3 shadow-lift transition xl:pr-4 ${on ? "ring-2 ring-lime ring-offset-2 ring-offset-canvas" : ""}`}
      >
        <span className="grid size-11 place-items-center rounded-full bg-lime text-on-lime" aria-hidden>
          <Icon name="passport" className="size-5" />
        </span>
        <span className="sr-only xl:not-sr-only xl:flex xl:flex-col xl:text-left xl:leading-tight">
          <b className="text-sm font-semibold">내 기록</b>
          <span className="text-[11px] text-white/65">{summary}</span>
        </span>
        <Icon name="chevron-down" className={`size-4 text-white/70 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <nav id={id} aria-label="내 기록" className="card absolute right-0 top-[calc(100%_+_0.5rem)] w-64 animate-rise space-y-1 rounded-[24px] p-2 shadow-lift">
          {ACCOUNT_ITEMS.map((it) => (
            <MenuItem key={it.href} item={it} on={active === it.href} badge={badge[it.href]} onPick={close} />
          ))}
          <div className="my-1 border-t border-line" />
          <MenuItem item={SETTINGS_ITEM} on={active === SETTINGS_ITEM.href} onPick={close} />
        </nav>
      )}
    </div>
  );
}

function MenuItem({ item, on, badge, onPick }: { item: NavItem; on: boolean; badge?: ReactNode; onPick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onPick}
      aria-current={on ? "page" : undefined}
      className={`flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition ${on ? "bg-lime text-on-lime" : "text-ink-soft hover:bg-ink/5 hover:text-ink"}`}
    >
      <Icon name={item.icon} className="size-5 shrink-0" strokeWidth={on ? 2 : 1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${on ? "bg-on-lime/10" : "bg-sunken text-muted"}`}>{badge}</span>}
    </Link>
  );
}
