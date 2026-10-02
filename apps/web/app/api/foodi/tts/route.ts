// POST /api/foodi/tts — speech 텍스트 → audio/mpeg 스트림 (F-VOI-02)
// 스트리밍 가능한 제공자(OpenAI)는 합성되는 대로 흘려보낸다 → 클라이언트가 첫 조각부터 재생 (lib/client/stream-audio.ts, 08 문서 §6)
// 1순위 TTS 실패 → 2순위 TTS → 둘 다 실패하면 503 (클라이언트가 브라우저 speechSynthesis 로 대체, 11 문서 §6)
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getRepo } from "@/lib/foodi/deps";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getTTSChain } from "@/lib/providers";
import { ttsResponse } from "@/lib/providers/tts-response";

export const runtime = "nodejs";

const Body = z.object({ text: z.string().trim().min(1).max(600) });

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId) + ":tts", 20);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const res = await ttsResponse(
    getTTSChain(),
    body.data.text,
    (usage) =>
      void Promise.resolve()
        .then(async () => (await getRepo()).recordUsage([usage], null))
        .catch(() => {}),
    (m) => console.warn("[foodi/tts] provider failed, trying next:", m),
  );
  return res ?? jsonError(503, "tts_unavailable", "음성 합성 실패 — 브라우저 음성으로 대체하세요.");
}
