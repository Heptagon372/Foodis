// 신고 큐 (F-ADM-03). 같은 음식·필드에 열린 신고 3건이 쌓이면 DB 트리거가 그 식이 값을 unknown 으로 강등한다
import Link from "next/link";
import { ActionButton } from "@/components/admin/ui";
import { db } from "@/lib/admin/data";

export default async function Reports({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status ?? "open";
  const { data, error } = await db()
    .from("reports")
    .select("id, field, message, status, created_at, foods(id, name_ko, slug, countries(flag_emoji))")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return <p className="text-diet-no">{error.message}</p>;
  const rows = data as unknown as { id: string; field: string; message: string | null; status: string; created_at: string; foods: { id: string; name_ko: string; slug: string; countries: { flag_emoji: string } | null } | null }[];
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["open", "resolved", "rejected"] as const).map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${status === s ? "bg-green-800 text-ivory" : "bg-surface"}`}>
            {{ open: "열림", resolved: "해결", rejected: "반려" }[s]}
          </Link>
        ))}
      </div>
      <p className="text-caption text-muted">같은 음식·식이 필드에 열린 신고가 3건 쌓이면 그 값은 자동으로 &lsquo;미확인&rsquo;이 돼요. 확인 후 음식을 고치고 신고를 해결로 바꾸세요.</p>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start gap-4 rounded-2xl bg-surface p-4 shadow-sm">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">
              {r.foods ? (
                <Link href={`/admin/foods/${r.foods.id}`} className="hover:underline">
                  {r.foods.countries?.flag_emoji} {r.foods.name_ko}
                </Link>
              ) : (
                "(삭제된 음식)"
              )}{" "}
              <span className="text-caption font-normal text-muted">· {r.field} · {new Date(r.created_at).toLocaleString("ko-KR")}</span>
            </p>
            <p className="text-sm">{r.message ?? "(내용 없음)"}</p>
          </div>
          {status === "open" ? (
            <div className="flex gap-2">
              <ActionButton url={`/api/admin/reports/${r.id}`} method="PATCH" body={{ status: "resolved" }} tone="primary">
                해결
              </ActionButton>
              <ActionButton url={`/api/admin/reports/${r.id}`} method="PATCH" body={{ status: "rejected" }}>
                반려
              </ActionButton>
            </div>
          ) : (
            <ActionButton url={`/api/admin/reports/${r.id}`} method="PATCH" body={{ status: "open" }}>
              다시 열기
            </ActionButton>
          )}
        </div>
      ))}
      {!rows.length && <p className="py-8 text-center text-muted">신고가 없어요.</p>}
    </div>
  );
}
