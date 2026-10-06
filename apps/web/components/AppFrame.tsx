"use client";
// 화면 틀: 모바일은 한 손 폭(max-w-md) + 하단 탭, 데스크톱(lg)은 상단 상태 바(AppHeader 80px) + 왼쪽 사이드바(16rem) + 넓은 본문(최대 72rem).
// 어드민·첫 진입 흐름(온보딩·로그인)은 셸 없이 — 경로로 나눈다
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isBareRoute } from "./nav";
import { useRadioMiniVisible } from "./RadioMini";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // 떠 있는 탭 바(68px + 아래 12px/안전 영역, 가운데 구슬이 18px 솟음) · 미니 플레이어(탭 바 위 92px 부터 약 62px)가 마지막 내용을 가리지 않게 아래 여백.
  // 데스크톱은 탭 바가 없고 미니 플레이어만 아래에 뜬다
  const mini = useRadioMiniVisible();
  if (path.startsWith("/admin")) return <div className="min-h-dvh bg-canvas">{children}</div>;
  if (isBareRoute(path)) return <div className="mx-auto min-h-dvh max-w-md lg:max-w-lg">{children}</div>;
  return (
    <div className="lg:pl-60 lg:pt-16">
      <div className={`mx-auto min-h-dvh max-w-md lg:max-w-6xl lg:px-6 ${mini ? "pb-56 lg:pb-32" : "pb-32 lg:pb-16"}`}>{children}</div>
    </div>
  );
}
