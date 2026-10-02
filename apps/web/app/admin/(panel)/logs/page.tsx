// AI 응답 로그 (F-ADM-04): 검증 실패 → 템플릿 대체된 답을 먼저. 할루시네이션 테스트·발표 근거용
import { Keyboard } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { chip } from "@/components/ui";
import { db } from "@/lib/admin/data";

type Row = { id: string; created_at: string; input_mode: string; intent: string | null; user_text: string; validated: boolean | null; latency_ms: number | null; ai_json: { speech?: string; cards?: { name_ko: string }[]; not_in_map?: string } | null };

export default async function Logs({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const failed = (await searchParams).failed === "1";
  let q = db().from("conversations").select("id, created_at, input_mode, intent, user_text, validated, latency_ms, ai_json").order("created_at", { ascending: false }).limit(100);
  if (failed) q = q.eq("validated", false);
  const { data, error } = await q;
  if (error) return <p className="text-diet-no">{error.message}</p>;
  const rows = data as Row[];
  const lat = rows.map((r) => r.latency_ms ?? 0).filter(Boolean).sort((a, b) => a - b);
  const p95 = lat.length ? lat[Math.floor(lat.length * 0.95) - (lat.length > 1 ? 1 : 0)] : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/logs" aria-current={!failed ? "page" : undefined} className={chip(!failed)}>
          전체
        </Link>
        <Link href="/admin/logs?failed=1" aria-current={failed ? "page" : undefined} className={chip(failed)}>
          검증 실패만
        </Link>
        <span className="ml-auto text-caption text-muted">최근 {rows.length}건 · 응답 지연 p95 {p95 ? `${(p95 / 1000).toFixed(1)}초` : "—"} (목표: 첫 음성 3초)</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card rounded-3xl p-5">
            <p className="flex flex-wrap items-center gap-2 text-caption text-muted">
              <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
              <span className="inline-flex items-center gap-1">
                ·{" "}
                {r.input_mode === "voice" ? <Icon name="mic" className="size-3.5" /> : <Keyboard aria-hidden className="size-3.5" strokeWidth={1.75} />}
                {r.input_mode === "voice" ? "음성" : "글"}
              </span>
              <span className="rounded-full bg-lime-soft px-2 font-mono text-leaf">{r.intent}</span>
              {r.validated === false && (
                <span className="inline-flex items-center gap-1 rounded-full bg-diet-warn/20 px-2 font-semibold text-diet-warn-ink">
                  <Icon name="warn" className="size-3.5" />
                  검증 실패 → 템플릿
                </span>
              )}
              {r.ai_json?.not_in_map && <span className="rounded-full bg-sunken px-2 text-ink-soft">지도에 없음: {r.ai_json.not_in_map}</span>}
              {r.latency_ms != null && <span>· {(r.latency_ms / 1000).toFixed(1)}초</span>}
            </p>
            <p className="mt-1 font-semibold text-ink">“{r.user_text}”</p>
            <p className="text-sm text-ink-soft">{r.ai_json?.speech}</p>
            {!!r.ai_json?.cards?.length && <p className="text-caption text-muted">카드: {r.ai_json.cards.map((c) => c.name_ko).join(", ")}</p>}
          </div>
        ))}
        {!rows.length && <p className="py-8 text-center text-muted">기록이 없어요. 푸디에게 질문하면 여기에 쌓여요.</p>}
      </div>
    </div>
  );
}
