// 모든 화면 공통 상단 바 — 왼쪽: 뒤로 가기 또는 워드마크 / 오른쪽: 화면 고유 동작 + 설정(모바일만).
// 데스크톱은 사이드바에 워드마크·설정이 있어 뒤로 가기·화면 동작만 남는다 (남을 게 없으면 바 자체를 숨긴다)
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./bits";
import { Icon } from "./icons";
import { BackLink } from "./ui";

export function TopBar({ back, children, settings = true }: { back?: { href: string; label: string }; children?: ReactNode; settings?: boolean }) {
  return (
    <header className={`flex min-h-11 items-center justify-between gap-3 ${!back && !children ? "lg:hidden" : ""}`}>
      {back ? <BackLink href={back.href} label={back.label} /> : <Wordmark className="text-2xl lg:invisible" />}
      <div className="flex items-center gap-2">
        {children}
        {settings && <SettingsLink className="lg:hidden" />}
      </div>
    </header>
  );
}

/** 설정으로 가는 둥근 유리 버튼 (44px) */
export function SettingsLink({ className = "" }: { className?: string }) {
  return (
    <Link href="/settings" aria-label="설정" className={`glass grid size-11 shrink-0 place-items-center rounded-full text-ink transition active:scale-95 ${className}`}>
      <Icon name="settings" className="size-5" />
    </Link>
  );
}
