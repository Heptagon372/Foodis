"use client";
// 앱 화면은 모바일 폭(한 손 조작, 05 문서), 어드민은 데스크톱 폭 — 경로로 나눈다
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useRadioMiniVisible } from "./RadioMini";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // 미니 플레이어가 떠 있으면 마지막 내용이 가려지지 않게 아래 여백을 더 준다
  const mini = useRadioMiniVisible();
  if (path.startsWith("/admin")) return <div className="min-h-dvh bg-ivory">{children}</div>;
  return <div className={`mx-auto min-h-dvh max-w-md ${mini ? "pb-52" : "pb-28"}`}>{children}</div>;
}
