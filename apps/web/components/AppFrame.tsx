"use client";
// 화면 틀: 모바일은 한 손 폭(max-w-md) + 하단 탭, 태블릿·반쪽 창(md, 768px~)은 본문만 넓게(max-w-2xl) — 폰 폭 열이 가운데 덩그러니 뜨지 않게, 데스크톱(lg)은 sticky 상단 알약 내비(--desk-nav) + 넓은 본문(최대 72rem) + 사이트 푸터 (docs/design/18).
// 어드민·첫 진입 흐름(온보딩·로그인)은 셸 없이 — 경로로 나눈다
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DesktopNav } from "./DesktopNav";
import { isBareRoute } from "./nav";
import { useRadioMiniVisible } from "./RadioMini";
import { SiteFooter } from "./SiteFooter";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // 떠 있는 탭 바(68px + 아래 12px/안전 영역, 가운데 구슬이 18px 솟음) · 미니 플레이어(탭 바 위 92px 부터 약 62px)가 마지막 내용을 가리지 않게 아래 여백.
  // 데스크톱은 탭 바가 없고 미니 플레이어만 아래에 뜬다 → 여백은 푸터 뒤(바깥)에 둬야 미니 플레이어가 푸터를 가리지 않는다
  const mini = useRadioMiniVisible();
  if (path.startsWith("/admin")) return <div className="min-h-dvh bg-canvas">{children}</div>;
  if (isBareRoute(path)) return <div className="mx-auto min-h-dvh max-w-md lg:max-w-lg">{children}</div>;
  return (
    <div className={mini ? "lg:pb-28" : undefined}>
      {/* sticky 내비는 children 앞, 같은 래퍼 안이어야 페이지 끝까지 붙어 있다 (조상에 overflow-hidden 금지) */}
      <DesktopNav />
      <div className={`mx-auto min-h-dvh max-w-md md:max-w-2xl lg:min-h-[calc(100dvh_-_var(--desk-nav))] lg:max-w-6xl lg:px-6 ${mini ? "pb-56 lg:pb-16" : "pb-32 lg:pb-16"}`}>{children}</div>
      <SiteFooter />
    </div>
  );
}
