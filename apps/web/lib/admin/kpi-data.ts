// KPI 화면용 events 읽기 (service_role — 페이지에서 reviewer 권한 확인 후에만 호출).
// Supabase(PostgREST)는 한 번에 1,000행까지만 주므로 개수를 먼저 세고 1,000행씩 나눠 받는다.
import "server-only";
import { db } from "./data";
import type { EventRow } from "./kpi";

const PAGE = 1_000;
const MAX_ROWS = 100_000; // 베타 30명 × 90일이면 충분. 넘으면 화면에 '잘림' 표시
const PARALLEL = 8;

export type LoadResult = { rows: EventRow[]; total: number; truncated: boolean; error: null } | { rows: []; total: 0; truncated: false; error: { code?: string; message: string } };

export async function loadEvents(from: Date | null, to: Date): Promise<LoadResult> {
  const base = () => {
    const q = db().from("events").select("at, anon_id, session_id, name, props").lt("at", to.toISOString());
    return from ? q.gte("at", from.toISOString()) : q;
  };
  let countQ = db().from("events").select("id", { count: "exact", head: true }).lt("at", to.toISOString());
  if (from) countQ = countQ.gte("at", from.toISOString());
  const { count, error } = await countQ;
  if (error) return { rows: [], total: 0, truncated: false, error };
  const total = count ?? 0;
  const want = Math.min(total, MAX_ROWS);
  const pages = Array.from({ length: Math.ceil(want / PAGE) }, (_, i) => i * PAGE);
  const rows: EventRow[] = [];
  for (let i = 0; i < pages.length; i += PARALLEL) {
    const chunk = await Promise.all(pages.slice(i, i + PARALLEL).map((start) => base().order("id").range(start, Math.min(start + PAGE, want) - 1)));
    for (const r of chunk) {
      if (r.error) return { rows: [], total: 0, truncated: false, error: r.error };
      rows.push(...(r.data as EventRow[]));
    }
  }
  return { rows, total, truncated: total > want, error: null };
}
