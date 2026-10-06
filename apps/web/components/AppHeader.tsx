"use client";
// 데스크톱(lg 이상) 상단 상태 바 — 레퍼런스의 '로고 · 상태 알약 · 계정' 줄 (docs/design/17).
// 왼쪽: 워드마크 + 한 줄 슬로건 / 오른쪽: 탐험 국가 · 이번 주 퀘스트 알약 → 새싹 테마 토글 → 계정 알약.
// 모바일은 화면마다 TopBar 가 대신한다
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "@/lib/client/account";
import { exploredCountries, useHydrated, useLocal } from "@/lib/client/passport";
import { useQuest } from "@/lib/client/quest";
import { Wordmark } from "./bits";
import { Icon, type IconName } from "./icons";
import { isBareRoute } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
  const path = usePathname();
  const hydrated = useHydrated();
  const countries = useLocal(exploredCountries);
  const q = useQuest();
  const acct = useAccount();
  if (isBareRoute(path)) return null;
  const user = acct.status === "user" ? acct.user : null;
  const name = user ? (user.name ?? user.email ?? "내 계정") : "로그인";

  return (
    <header className="fixed inset-x-0 top-0 z-40 hidden h-20 items-center justify-between gap-4 bg-gradient-to-b from-canvas via-canvas/85 to-transparent px-6 lg:flex">
      <div className="flex items-center gap-3">
        <Wordmark className="text-xl" />
        <span className="hidden border-l border-line pl-3 text-caption font-medium text-leaf xl:block">Different Cultures, One Table</span>
      </div>

      <div className="flex items-center gap-2.5">
        {hydrated && (
          <>
            <Pill href="/map" icon="earth" label="탐험한 나라">
              {countries.length}개국
            </Pill>
            {q.ready && q.quests.length > 0 && (
              <Pill href="/quests" icon="quest" label="이번 주 퀘스트">
                {q.doneCount}/{q.quests.length}
              </Pill>
            )}
          </>
        )}
        <ThemeToggle className="size-10" />
        {acct.status !== "off" && (
          <Link
            href={user ? "/settings#account" : `/login?next=${encodeURIComponent(path)}`}
            className="glass flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-3 text-sm font-semibold text-ink transition hover:border-leaf/40"
          >
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- 제공자 프로필 이미지(외부 도메인)
              <img src={user.avatar} alt="" className="size-8 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid size-8 place-items-center rounded-full bg-lime-soft text-leaf" aria-hidden>
                <Icon name="user" className="size-[18px]" />
              </span>
            )}
            <span className="max-w-32 truncate">{name}</span>
            <Icon name="next" className="size-4 rotate-90 text-muted" />
          </Link>
        )}
      </div>
    </header>
  );
}

/** 상태 알약 (레퍼런스의 배터리·와이파이 알약) — 숫자는 tabular, 아이콘은 네온 초록 */
function Pill({ href, icon, label, children }: { href: string; icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} title={label} className="glass flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold tabular-nums text-ink transition hover:border-leaf/40">
      <Icon name={icon} className="size-[18px] text-lime" />
      {children}
    </Link>
  );
}
