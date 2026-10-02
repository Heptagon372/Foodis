// POST /api/foodi/tts — speech 텍스트 → 오디오 (F-VOI-02). 보통 audio/mpeg 스트림, Gemini 는 audio/wav (다 받은 뒤 재생)
// 스트리밍 가능한 제공자(OpenAI·ElevenLabs)는 합성되는 대로 흘려보낸다 → 클라이언트가 첫 조각부터 재생 (lib/client/stream-audio.ts, 08 문서 §6)
// voice(카탈로그 id · host-a/host-b) 를 주면 그 제공자가 1순위, 실패하면 기본 체인 → 모두 실패하면 503 (클라이언트가 브라우저 speechSynthesis 로, 11 문서 §6)
// lang(한국어 외)은 현지 발음 — 그 언어 목소리만 (lib/voice/plan.ts). 같은 글자·목소리는 메모리 캐시에서 (lib/voice/audio-cache.ts)
import { z } from "zod";
import { jsonError, parseBody, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getRepo } from "@/lib/foodi/deps";
import { env } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { ttsAttempts } from "@/lib/providers";
import { ttsResponse } from "@/lib/providers/tts-response";
import { ttsAudioCache } from "@/lib/voice/audio-cache";
import { isVoiceId } from "@/lib/voice/catalog";
import { isHostRole } from "@/lib/voice/plan";
import { SPEECH_ROLES, type SpeechRole } from "@/lib/voice/styles";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().trim().min(1).max(600),
  voice: z
    .string()
    .refine((v) => isVoiceId(v) || isHostRole(v), "알 수 없는 목소리 id")
    .optional(),
  // BCP-47 (ja-JP, zh-CN, fil-PH …) — 현지 발음
  lang: z
    .string()
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/, "BCP-47 언어 태그")
    .optional(),
  role: z.enum(SPEECH_ROLES as [SpeechRole, ...SpeechRole[]]).optional(),
  /** 미리듣기: 그 목소리만 (다른 목소리로 대신하지 않음) */
  exact: z.boolean().optional(),
});

// 일일 예산 가드 (11 문서 §6): 오늘 쓴 금액은 30초마다만 다시 본다 — 음성 요청마다 DB 를 치면 첫 소리가 늦어진다
let budget: { at: number; over: boolean } | null = null;
async function overBudget(): Promise<boolean> {
  if (budget && Date.now() - budget.at < 30_000) return budget.over;
  const over = await getRepo()
    .then((r) => r.usageTodayUsd())
    .then((u) => u >= env.dailyBudgetUsd)
    .catch(() => false);
  budget = { at: Date.now(), over };
  return over;
}

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId) + ":tts", 20);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const { text, voice, lang, role, exact } = body.data;
  const over = await overBudget();
  const res = await ttsResponse(
    ttsAttempts({ voice, lang, role, exact }),
    text,
    (usage) =>
      void Promise.resolve()
        .then(async () => (await getRepo()).recordUsage([usage], null))
        .catch(() => {}),
    (m) => console.warn("[foodi/tts] provider failed, trying next:", m),
    { cache: ttsAudioCache, cacheOnly: over },
  );
  if (res) return res;
  if (over) return jsonError(503, "tts_budget", "오늘 음성 합성 사용량이 다 찼어요 — 브라우저 음성으로 대체하세요.");
  return jsonError(503, "tts_unavailable", "음성 합성 실패 — 브라우저 음성으로 대체하세요.");
}
