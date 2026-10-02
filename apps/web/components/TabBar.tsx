"use client";
// 하단 탭 3개: 홈 · 푸디 · Passport — 떠 있는 유리 바 (레퍼런스 하단 내비). 푸디는 화면 이동이 아니라 시트를 연다 → 어디서든 대화로 돌아온다.
// 높이: 바 68px + 아래 여백 12px(또는 안전 영역) → 위에 얹는 미니 플레이어는 bottom 6rem 부터
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import { useHydrated, useLocal } from "@/lib/client/passport";
import { useFoodi } from "./FoodiSheet";
import { Icon, type IconName } from "./icons";

export function TabBar() {
  const path = usePathname();
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const introSeen = useLocal((s) => s.introSeen);
  // 인트로가 떠 있는 동안(첫 방문 홈)·온보딩·로그인에서는 숨긴다
  if (path.startsWith("/onboarding") || path.startsWith("/intro") || path.startsWith("/admin") || path.startsWith("/login") || (path === "/" && hydrated && !introSeen)) return null;
  const tab = (href: string, label: string, icon: IconName) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link href={href} className={`flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-ink" : "text-muted"}`} aria-current={active ? "page" : undefined}>
        <span className={`grid h-8 w-14 place-items-center rounded-full transition ${active ? "bg-lime text-on-lime" : ""}`}>
          <Icon name={icon} className="size-[22px]" strokeWidth={active ? 2 : 1.75} />
        </span>
        {label}
      </Link>
    );
  };
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label="주 메뉴">
      <div className="glass pointer-events-auto flex h-[68px] items-stretch rounded-[28px] px-2">
        {tab("/", "홈", "home")}
        <button type="button" onClick={() => open({ listen: true })} className="flex flex-1 flex-col items-center justify-end gap-1 pb-2 text-[11px] font-semibold text-ink" aria-label="푸디에게 말하기">
          <span className="-mt-7 grid size-14 place-items-center rounded-full bg-brand text-on-brand shadow-[inset_0_2px_0_rgb(255_255_255/0.28),0_12px_28px_-10px_rgb(43_134_69/0.7)] ring-4 ring-canvas transition active:scale-95">
            <Mic className="size-6" strokeWidth={1.75} aria-hidden />
          </span>
          푸디
        </button>
        {tab("/passport", "Passport", "passport")}
      </div>
    </nav>
  );
}
