"use client";
// 앱 화면은 모바일 폭(한 손 조작, 05 문서), 어드민은 데스크톱 폭 — 경로로 나눈다
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useRadioMiniVisible } from "./RadioMini";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // 떠 있는 탭 바(68px + 아래 12px/안전 영역, 가운데 구슬이 18px 솟음) · 미니 플레이어(탭 바 위 92px 부터 약 62px)가 마지막 내용을 가리지 않게 아래 여백
  const mini = useRadioMiniVisible();
  if (path.startsWith("/admin")) return <div className="min-h-dvh bg-canvas">{children}</div>;
  return <div className={`mx-auto min-h-dvh max-w-md ${mini ? "pb-56" : "pb-32"}`}>{children}</div>;
}
