"use client";
// 데스크톱(lg 이상) 왼쪽 사이드바: 워드마크 → 푸디에게 묻기 → 카테고리별 메뉴(nav.ts) → 아래에 설정·테마.
// 모바일에서는 숨고 하단 탭 바(TabBar)가 같은 메뉴 표를 쓴다
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { exploredCountries, useHydrated, useLocal } from "@/lib/client/passport";
import { useQuest } from "@/lib/client/quest";
import { useFoodi } from "./FoodiSheet";
import { Wordmark } from "./bits";
import { Icon } from "./icons";
import { activeHref, isBareRoute, NAV_GROUPS, SETTINGS_ITEM, type NavItem } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export function SideNav() {
  const path = usePathname();
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const countries = useLocal(exploredCountries);
  const q = useQuest();
  if (isBareRoute(path)) return null;
  const active = activeHref(path);
  // 메뉴 옆 작은 숫자 (레퍼런스 사이드바의 카운트 배지) — 하이드레이션 뒤에만
  const badge: Record<string, ReactNode> = hydrated
    ? {
        "/passport": countries.length ? `${countries.length}개국` : null,
        "/quests": q.ready && q.quests.length ? `${q.doneCount}/${q.quests.length}` : null,
      }
    : {};

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 p-3 lg:block" aria-label="사이드 메뉴">
      <div className="glass flex h-full flex-col rounded-[28px] px-3 pb-3 pt-5">
        <div className="px-3">
          <Wordmark />
        </div>

        <button type="button" onClick={() => open({ listen: true })} className="mt-6 flex h-12 items-center gap-3 rounded-full bg-brand pl-1.5 pr-4 text-[15px] font-semibold text-on-brand shadow-brand transition hover:bg-brand-strong active:scale-[0.98]">
          <span className="grid size-9 place-items-center rounded-full bg-white/20" aria-hidden>
            <Icon name="mic" className="size-5" />
          </span>
          푸디에게 묻기
        </button>

        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto" aria-label="주 메뉴">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{g.title}</p>
              {g.items.map((it) => (
                <Item key={it.href} item={it} on={active === it.href} badge={badge[it.href]} />
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-line pt-3">
          <Item item={SETTINGS_ITEM} on={active === SETTINGS_ITEM.href} />
          <div className="flex items-center justify-between gap-2 rounded-2xl py-1 pl-3 pr-1">
            <span className="text-sm font-medium text-ink-soft">테마</span>
            <ThemeToggle className="size-10" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function Item({ item, on, badge }: { item: NavItem; on: boolean; badge?: ReactNode }) {
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={`flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition ${on ? "bg-lime text-on-lime" : "text-ink-soft hover:bg-ink/5 hover:text-ink"}`}
    >
      <Icon name={item.icon} className="size-5 shrink-0" strokeWidth={on ? 2 : 1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${on ? "bg-on-lime/10" : "bg-sunken text-muted"}`}>{badge}</span>}
    </Link>
  );
}
