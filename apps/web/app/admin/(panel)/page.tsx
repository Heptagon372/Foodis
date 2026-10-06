// 어드민 대시보드: 데이터 준비 상태 · 검수 진행률 · 신고 · AI 검증 실패 · 오늘 비용
import Link from "next/link";
import { ActionButton } from "@/components/admin/ui";
import { Icon } from "@/components/icons";
import { db } from "@/lib/admin/data";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { dataStatus } from "@/lib/content";

export default async function Dashboard() {
  const s = await getAdminSession();
  const c = db();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const head = { count: "exact" as const, head: false };
  const [countries, total, verified, reports, convs, failed, usage, embeds, status] = await Promise.all([
    c.from("countries").select("code", head).limit(1),
    c.from("foods").select("id", head).limit(1),
    c.from("foods").select("id", head).eq("verified", true).limit(1),
    c.from("reports").select("id", head).eq("status", "open").limit(1),
    c.from("conversations").select("id", head).gte("created_at", since).limit(1),
    c.from("conversations").select("id", head).gte("created_at", since).eq("validated", false).limit(1),
    c.from("api_usage").select("cost_usd").gte("created_at", today.toISOString()),
    c.from("food_embeddings").select("food_id", head).limit(1),
    dataStatus(),
  ]);
  const err = [countries, total, reports].find((r) => r.error)?.error;
  if (err)
    return (
      <div className="space-y-2 rounded-3xl border border-diet-no/30 bg-surface p-5">
        <p className="flex items-center gap-2 font-semibold text-diet-no">
          <Icon name="warn" />
          DB 를 읽을 수 없어요
        </p>
        <p className="text-sm">{err.code === "PGRST205" ? "테이블이 없어요. Supabase SQL Editor 에서 supabase/migrations/0001_init.sql → 0002_data_sources.sql 을 실행하세요." : err.message}</p>
      </div>
    );
  const n = (r: { count: number | null }) => r.count ?? 0;
  const cost = (usage.data ?? []).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  const pct = n(total) ? Math.round((n(verified) / n(total)) * 100) : 0;
  // [이름, 값, 힌트, 손볼 게 있나] — 손볼 게 있으면 경고 아이콘 + 글자로 (색만으로 말하지 않게)
  const cards: [string, string, string?, boolean?][] = [
    ["국가", `${n(countries)} / 30`, n(countries) < 30 ? "국가 동기화가 필요해요" : undefined, n(countries) < 30],
    ["음식 (검수 완료 / 전체)", `${n(verified)} / ${n(total)}`, `검수율 ${pct}% · 목표 150~200`],
    ["임베딩", `${n(embeds)} / ${n(verified)}`, n(embeds) < n(verified) ? "검수된 음식 중 임베딩 없는 것 있음" : undefined, n(embeds) < n(verified)],
    ["열린 신고", String(n(reports)), n(reports) ? "신고 큐 확인" : undefined, n(reports) > 0],
    ["AI 답변 (24시간)", String(n(convs)), n(failed) ? `검증 실패 → 템플릿 ${n(failed)}건` : "검증 실패 0", n(failed) > 0],
    ["오늘 API 비용", `$${cost.toFixed(3)}`, `하루 상한 $${process.env.DAILY_BUDGET_USD ?? 5}`],
  ];
  return (
    <div className="space-y-6">
      <p className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${status.live ? "bg-lime-soft text-leaf" : "bg-diet-warn/15 text-diet-warn-ink"}`}>
        <Icon name={status.live ? "check-circle" : "warn"} className="mt-px size-[18px] shrink-0" />
        <span>
          앱 데이터: <b>{status.live ? "실제 DB" : "미리보기 샘플"}</b> — {status.reason}
          {!status.live && " · 검수 완료 음식이 1개 이상 생기면 앱이 자동으로 실제 DB 로 바뀌어요"}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([label, value, hint, warn]) => (
          <div key={label} className="card space-y-1 rounded-3xl p-5">
            <p className="text-caption text-muted">{label}</p>
            <p className="text-h1 font-bold tabular-nums text-ink">{value}</p>
            {hint && (
              <p className={`flex items-center gap-1 text-caption ${warn ? "font-semibold text-diet-warn-ink" : "text-ink-soft"}`}>
                {warn && <Icon name="warn" className="size-3.5 shrink-0" />}
                {hint}
              </p>
            )}
          </div>
        ))}
      </div>
      {hasRole(s, "admin") && (
        <section className="space-y-2">
          <h2 className="text-title font-bold">운영 작업</h2>
          <div className="flex flex-wrap items-start gap-3">
            <ActionButton url="/api/admin/countries/sync" done={(d) => `국가 ${(d as { countries: number }).countries}개 동기화`}>국가 30개 동기화</ActionButton>
            <ActionButton url="/api/admin/embeddings/rebuild" body={{ onlyMissing: true }} confirm="검수된 음식 중 임베딩이 없는(또는 다른 모델로 만든) 것을 한 번에 1,500개까지 만들어요 (1만 개 전체 약 $0.7 — 터미널에서는 pnpm embed:foods)" done={(d) => `임베딩 ${(d as { embedded: number }).embedded}건 · 남은 ${(d as { remaining: number }).remaining}건 · $${(d as { costUsd: number }).costUsd}`}>
              임베딩 만들기 (없는 것만)
            </ActionButton>
            <ActionButton url="/api/admin/embeddings/rebuild" body={{ onlyMissing: false }} confirm="내용(이름·소개·재료)이 바뀌었거나 다른 모델로 만든 임베딩을 다시 만들어요. 한 번에 1,500개까지 — 남은 게 있으면 다시 누르세요" done={(d) => `임베딩 ${(d as { embedded: number }).embedded}건 갱신 · 남은 ${(d as { remaining: number }).remaining}건 · $${(d as { costUsd: number }).costUsd}`}>
              임베딩 전체 다시 만들기
            </ActionButton>
          </div>
        </section>
      )}
      <section className="space-y-2 text-sm">
        <h2 className="text-title font-bold">검수 흐름</h2>
        <ol className="list-decimal space-y-1 pl-5 text-ink-soft marker:text-leaf">
          <li>콘솔 P → s05 AI 초안 → s07 검수 시트 만들기 (data/draft/review_sheet.csv)</li>
          <li><Link className="text-leaf underline" href="/admin/import">가져오기</Link> 에 시트를 올림 → 전부 <b>검수 대기</b>로 들어옴 (식이는 사람이 적은 final_* 만)</li>
          <li><Link className="text-leaf underline" href="/admin/foods?status=pending">음식 → 검수 대기</Link> 에서 출처를 확인하며 고치고, <b>다른 사람</b>이 승인</li>
          <li>임베딩 만들기 → 앱과 푸디가 검수된 음식만 사용</li>
        </ol>
      </section>
    </div>
  );
}
