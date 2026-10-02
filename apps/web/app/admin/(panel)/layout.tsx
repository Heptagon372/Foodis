import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/bits";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/admin/ui";
import { hasRole, requirePage } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "검수 어드민 — FOODIS" };

const NAV = [
  ["/admin", "대시보드"],
  ["/admin/foods", "음식"],
  ["/admin/reports", "신고"],
  ["/admin/import", "가져오기"],
  ["/admin/logs", "AI 로그"],
  ["/admin/kpi", "KPI"],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await requirePage("editor");
  return (
    <div className="mx-auto max-w-6xl px-5 py-5">
      <header className="glass mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[28px] px-5 py-3">
        <div className="flex items-baseline gap-2">
          <Wordmark className="text-xl" />
          <span className="text-sm font-semibold text-ink-soft">검수 어드민</span>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {NAV.filter(([href]) => href !== "/admin/kpi" || hasRole(s, "reviewer")).map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex h-10 items-center rounded-full px-4 font-medium text-ink-soft transition hover:bg-lime-soft hover:text-leaf">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-caption">
          <span className="text-muted">{s.email}</span>
          <span className="rounded-full bg-brand px-2.5 py-0.5 font-semibold text-on-brand">{s.role}</span>
          <LogoutButton />
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}
