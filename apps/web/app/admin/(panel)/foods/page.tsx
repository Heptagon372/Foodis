// 음식 목록: 검수 대기 먼저. 상태·국가·검색 필터
import Link from "next/link";
import { db } from "@/lib/admin/data";
import { DIET_KEYS } from "@/lib/foodi/schema";

const DOT: Record<string, string> = { yes: "bg-diet-ok", depends: "bg-diet-warn", no: "bg-diet-no", unknown: "bg-diet-unknown/50" };
const clean = (s: string) => s.replace(/[%,()*]/g, "").slice(0, 40);

export default async function FoodsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; country?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? "pending";
  let q = db()
    .from("foods")
    .select(`id, slug, name_ko, name_en, country_code, verified, updated_at, summary, ${DIET_KEYS.map((k) => `diet_${k}`).join(", ")}, countries(flag_emoji), reports(status)`)
    .order("verified", { ascending: true })
    .order("country_code")
    .limit(300);
  if (status === "pending") q = q.eq("verified", false);
  if (status === "verified") q = q.eq("verified", true);
  if (sp.country) q = q.eq("country_code", sp.country.toUpperCase());
  if (sp.q) {
    const t = clean(sp.q);
    q = q.or(`name_ko.ilike.%${t}%,name_en.ilike.%${t}%,slug.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) return <p className="text-diet-no">{error.message}</p>;
  const rows = data as unknown as Record<string, unknown>[];
  const tab = (key: string, label: string) => (
    <Link href={`/admin/foods?status=${key}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === key ? "bg-green-800 text-ivory" : "bg-surface"}`}>
      {label}
    </Link>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tab("pending", "검수 대기")}
        {tab("verified", "검수 완료")}
        {tab("all", "전체")}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={sp.q} placeholder="이름·slug 검색" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm" />
          <input name="country" defaultValue={sp.country} placeholder="국가 KR" maxLength={2} className="w-20 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm uppercase" />
          <button className="rounded-lg bg-surface px-3 py-1.5 text-sm">찾기</button>
        </form>
        <Link href="/admin/foods/new" className="rounded-lg bg-mint-500 px-3 py-1.5 text-sm font-semibold text-green-800">
          + 새 음식
        </Link>
      </div>
      <p className="text-caption text-muted">{rows.length}건 · 식이 점: 비건·채식·할랄·글루텐·유제품 (초록 가능 · 노랑 조리법에 따라 · 빨강 불가 · 회색 미확인)</p>
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-caption text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2">음식</th>
              <th className="px-2 py-2">요약</th>
              <th className="px-2 py-2">식이</th>
              <th className="px-2 py-2">신고</th>
              <th className="px-4 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const open = ((f.reports as { status: string }[]) ?? []).filter((r) => r.status === "open").length;
              return (
                <tr key={f.id as string} className="border-b border-line last:border-0 hover:bg-mint-100/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/foods/${f.id}`} className="font-semibold hover:underline">
                      {(f.countries as { flag_emoji: string } | null)?.flag_emoji} {f.name_ko as string}
                    </Link>
                    <span className="block text-caption text-muted">{f.slug as string}</span>
                  </td>
                  <td className="max-w-md px-2 py-2.5 text-caption text-charcoal/75">
                    <span className="line-clamp-2">{(f.summary as string) ?? "—"}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex gap-1">
                      {DIET_KEYS.map((k) => (
                        <span key={k} title={`${k}: ${f[`diet_${k}`]}`} className={`size-2.5 rounded-full ${DOT[f[`diet_${k}`] as string]}`} />
                      ))}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">{open ? <span className="font-semibold text-diet-no">{open}</span> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5">{f.verified ? <span className="font-semibold text-diet-ok">✓ 검수 완료</span> : <span className="text-[#9a6d0c]">검수 대기</span>}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  없어요.{" "}
                  <Link href="/admin/import" className="underline">
                    검수 시트 가져오기
                  </Link>
                  로 시작하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
