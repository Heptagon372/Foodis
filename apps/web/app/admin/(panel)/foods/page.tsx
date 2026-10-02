// 음식 목록: 검수 대기 먼저. 상태·국가·검색 필터
import { Clock, Plus, Search } from "lucide-react";
import Link from "next/link";
import { DIET_LABEL } from "@/components/DietBadge";
import { Icon, type IconName } from "@/components/icons";
import { btn, chip } from "@/components/ui";
import { db } from "@/lib/admin/data";
import { levelLabel } from "@/lib/admin/rules";
import { DIET_KEYS, type DietLevel } from "@/lib/foodi/schema";

// 식이 표시: 색 + 모양(체크·경고·X·물음표) 함께 — 색만으로 구분하지 않게
const MARK: Record<DietLevel, [IconName, string]> = {
  yes: ["check", "bg-diet-ok/15 text-diet-ok"],
  depends: ["warn", "bg-diet-warn/20 text-diet-warn-ink"],
  no: ["close", "bg-diet-no/12 text-diet-no"],
  unknown: ["help", "bg-sunken text-muted"],
};
const INPUT = "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-brand";
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
    <Link href={`/admin/foods?status=${key}`} aria-current={status === key ? "page" : undefined} className={chip(status === key)}>
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
          <input name="q" defaultValue={sp.q} placeholder="이름·slug 검색" aria-label="이름·slug 검색" className={INPUT} />
          <input name="country" defaultValue={sp.country} placeholder="국가 KR" aria-label="국가 코드" maxLength={2} className={`${INPUT} w-24 uppercase`} />
          <button className={btn("outline", "sm")}>
            <Search aria-hidden className="size-4" strokeWidth={1.75} />
            찾기
          </button>
        </form>
        <Link href="/admin/foods/new" className={btn("lime", "sm")}>
          <Plus aria-hidden className="size-4" strokeWidth={2} />새 음식
        </Link>
      </div>
      <p className="text-caption text-muted">{rows.length}건 · 식이 표시 순서: 비건·채식·할랄·글루텐·유제품 (체크 가능 · 경고 조리법에 따라 · X 불가 · 물음표 미확인)</p>
      <div className="card overflow-x-auto rounded-3xl">
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
                <tr key={f.id as string} className="border-b border-line last:border-0 hover:bg-lime-soft/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/foods/${f.id}`} className="font-semibold text-ink hover:text-leaf hover:underline">
                      {(f.countries as { flag_emoji: string } | null)?.flag_emoji} {f.name_ko as string}
                    </Link>
                    <span className="block text-caption text-muted">{f.slug as string}</span>
                  </td>
                  <td className="max-w-md px-2 py-2.5 text-caption text-ink-soft">
                    <span className="line-clamp-2">{(f.summary as string) ?? "—"}</span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex gap-1">
                      {DIET_KEYS.map((k) => {
                        const lv = (f[`diet_${k}`] as DietLevel) ?? "unknown";
                        const [icon, tone] = MARK[lv] ?? MARK.unknown;
                        const text = `${DIET_LABEL[k]}: ${levelLabel[lv] ?? lv}`;
                        return (
                          <span key={k} role="img" aria-label={text} title={text} className={`grid size-5 place-items-center rounded-full ${tone}`}>
                            <Icon name={icon} className="size-3" strokeWidth={2.25} />
                          </span>
                        );
                      })}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">{open ? <span className="font-semibold text-diet-no">{open}</span> : <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {f.verified ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-diet-ok">
                        <Icon name="check-circle" className="size-4" />
                        검수 완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-diet-warn-ink">
                        <Clock aria-hidden className="size-4" strokeWidth={1.75} />
                        검수 대기
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  없어요.{" "}
                  <Link href="/admin/import" className="text-leaf underline">
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
