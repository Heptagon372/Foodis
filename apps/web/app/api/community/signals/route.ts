// POST /api/community/signals — 카테고리 탭 · 글 열람 · 공유 신호 (게스트 포함). 따봉·댓글·투표·참여·글쓰기는 각 라우트가 직접 남긴다.
// 이 신호가 모여 trends.ts 의 '요즘 열기' → 맞춤 피드·푸디 브리핑에 반영된다. 자유 텍스트는 받지 않는다.
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { CATEGORY_KEYS } from "@/lib/community/categories";
import { getStore, getViewer, recordSignal } from "@/lib/community/server";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

const Body = z.object({
  kind: z.enum(["tap", "view", "share"]),
  category: z.enum(CATEGORY_KEYS),
  post_id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const store = await getStore();
  const viewer = await getViewer(req, store.mode === "live");
  // 같은 사람이 열기를 부풀리지 않게: 분당 30회
  const rl = rateLimit(clientKey(req, viewer.userId ?? viewer.anonId) + ":community-signal", 30, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  try {
    await recordSignal(store, viewer, body.data.kind, body.data.category, body.data.post_id ?? null);
    return Response.json({ ok: true }, { status: 202 });
  } catch (e) {
    return jsonError(500, "signal_failed", (e as Error).message);
  }
}
