// POST /api/events — 베타 KPI 익명 이벤트 수집 (07 문서 §1, docs/design/07_KPI_측정_v1.md). 게스트도 가능
// 클라이언트는 lib/client/track.ts 가 10초 단위 · 페이지 떠날 때(sendBeacon, text/plain) 묶어서 보낸다.
// events 테이블은 RLS 공개 정책이 없어 service_role 로만 쓴다. 미리보기 모드에서는 받기만 하고 버린다.
import { z } from "zod";
import { EVENT_NAMES, PROP_LIMITS } from "@/lib/analytics/events";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { isLive } from "@/lib/content";
import { currentUserId, supabaseAdmin } from "@/lib/db/supabase-server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

const Id = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
// 자유 텍스트(질문 원문 등)가 섞여 들어오지 않게 값 길이·모양을 좁힌다
const Str = z.string().max(PROP_LIMITS.str);
const PropValue = z.union([Str, z.number().finite(), z.boolean(), z.null(), z.array(Str).max(PROP_LIMITS.arr)]);
const Props = z
  .record(z.string().regex(/^[a-z_]{1,32}$/), PropValue)
  .refine((p) => Object.keys(p).length <= PROP_LIMITS.keys, `props 는 ${PROP_LIMITS.keys}개 키까지`);

const Body = z.object({
  anon_id: Id,
  sent_at: z.number().int().positive(),
  events: z
    .array(
      z.object({
        name: z.enum(EVENT_NAMES),
        props: Props.default({}),
        t: z.number().int().positive(),
        session_id: Id,
        path: z.string().max(128).optional(),
      }),
    )
    .min(1)
    .max(50),
});

const DAY = 86_400_000;

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const { anon_id, sent_at, events } = body.data;
  const userId = await currentUserId().catch(() => null);
  // 배치는 10초 간격이라 정상 사용은 분당 수 회 — 브라우저(anon)와 IP·계정 양쪽으로 묶는다
  const byAnon = rateLimit(`anon:${anon_id}:events`, 20, 60_000);
  const byClient = rateLimit(clientKey(req, userId) + ":events", 60, 60_000);
  if (!byAnon.ok || !byClient.ok) return tooMany(byAnon.ok ? byClient.retryAfterSec : byAnon.retryAfterSec);
  if (!(await isLive())) return Response.json({ ok: true, preview: true, accepted: events.length }, { status: 202 });

  // 기기 시계가 틀려도 순서·간격은 유지: 서버 시각 - (보낸 시각 - 이벤트 시각), 최대 하루 전까지
  const now = Date.now();
  const rows = events.map((e) => ({
    at: new Date(now - Math.min(Math.max(sent_at - e.t, 0), DAY)).toISOString(),
    anon_id,
    session_id: e.session_id,
    user_id: userId,
    name: e.name,
    props: e.props,
    path: e.path ?? null,
  }));
  const { error } = await supabaseAdmin().from("events").insert(rows);
  if (error) return jsonError(500, "events_failed", error.message);
  return Response.json({ ok: true, accepted: rows.length }, { status: 202 });
}
