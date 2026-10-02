import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/bits";
import { LogoutButton } from "@/components/admin/ui";
import { hasRole, requirePage } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "검수 어드민 — FOODIS" };

const NAV = [
  ["/admin", "대시보드"],
  ["/admin/foods", "음식"],
  ["/admin/reports", "신고"],
  ["/admin/places", "음식점"],
  ["/admin/import", "가져오기"],
  ["/admin/logs", "AI 로그"],
  ["/admin/kpi", "KPI"],
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await requirePage("editor");
  return (
    <div className="mx-auto max-w-6xl px-5 py-5">
      <header className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-4">
        <div className="flex items-baseline gap-2">
          <Wordmark className="text-xl" />
          <span className="text-sm font-semibold text-muted">검수 어드민</span>
        </div>
        <nav className="flex flex-wrap gap-1 text-sm">
          {NAV.filter(([href]) => href !== "/admin/kpi" || hasRole(s, "reviewer")).map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-1.5 font-medium text-charcoal/80 hover:bg-mint-100 hover:text-green-800">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-caption">
          <span className="text-muted">{s.email}</span>
          <span className="rounded-full bg-green-800 px-2 py-0.5 font-semibold text-ivory">{s.role}</span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
