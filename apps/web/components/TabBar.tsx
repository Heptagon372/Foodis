"use client";
// 하단 탭 3개: 🌎 홈 · 🎙 푸디 · 📕 Passport. 푸디는 화면 이동이 아니라 시트를 연다 → 어디서든 대화로 돌아온다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHydrated, useLocal } from "@/lib/client/passport";
import { useFoodi } from "./FoodiSheet";
import { MicIcon } from "./VoiceButton";

export function TabBar() {
  const path = usePathname();
  const { open } = useFoodi();
  const hydrated = useHydrated();
  const introSeen = useLocal((s) => s.introSeen);
  // 인트로가 떠 있는 동안(첫 방문 홈)·온보딩에서는 숨긴다
  if (path.startsWith("/onboarding") || path.startsWith("/intro") || (path === "/" && hydrated && !introSeen)) return null;
  const tab = (href: string, label: string, icon: string) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-green-800" : "text-muted"}`} aria-current={active ? "page" : undefined}>
        <span className="text-xl leading-none" aria-hidden>{icon}</span>
        {label}
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line bg-ivory/90 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="주 메뉴">
      <div className="flex items-end">
        {tab("/", "홈", "🌎")}
        <button type="button" onClick={() => open({ listen: true })} className="flex flex-1 flex-col items-center gap-0.5 pb-2 text-[11px] font-medium text-green-800">
          <span className="-mt-5 grid size-14 place-items-center rounded-full bg-mint-500 shadow-[0_8px_20px_-8px_#1f5f4680] ring-4 ring-ivory">
            <MicIcon className="size-6" />
          </span>
          푸디
        </button>
        {tab("/passport", "Passport", "📕")}
      </div>
    </nav>
  );
}
