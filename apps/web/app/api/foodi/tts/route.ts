// POST /api/foodi/tts — speech 텍스트 → audio/mpeg 스트림 (F-VOI-02)
// 1순위 TTS 실패 → 2순위 TTS → 둘 다 실패하면 503 (클라이언트가 브라우저 speechSynthesis 로 대체, 11 문서 §6)
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getRepo } from "@/lib/foodi/deps";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getTTSChain } from "@/lib/providers";

export const runtime = "nodejs";

const Body = z.object({ text: z.string().trim().min(1).max(600) });

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId) + ":tts", 20);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  for (const tts of getTTSChain()) {
    try {
      const { audio, usage } = await tts.synthesize(body.data.text);
      void Promise.resolve()
        .then(() => getRepo().recordUsage([usage], null))
        .catch(() => {});
      return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-TTS-Provider": usage.provider } });
    } catch (e) {
      console.warn("[foodi/tts] provider failed, trying next:", (e as Error).message);
    }
  }
  return jsonError(503, "tts_unavailable", "음성 합성 실패 — 브라우저 음성으로 대체하세요.");
}
