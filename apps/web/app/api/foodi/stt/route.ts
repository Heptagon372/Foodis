// POST /api/foodi/stt — 녹음 업로드(multipart "audio") → 텍스트. Web Speech 실패 시 fallback 전용 (F-VOI-01)
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getRepo } from "@/lib/foodi/deps";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getSTT } from "@/lib/providers";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 질문 하나 ≈ 수십 KB. 2MB 넘으면 거절

export async function POST(req: Request) {
  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId) + ":stt");
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return jsonError(400, "no_audio", "multipart 필드 'audio' 가 필요합니다.");
  if (audio.size > MAX_BYTES) return jsonError(413, "audio_too_large", "녹음이 너무 깁니다.");

  try {
    const repo = getRepo();
    // 외국 음식 이름 인식 보강: DB 음식명을 키워드 힌트로 (09 문서 §5.3)
    const keywords = await repo
      .allFoodNames()
      .then((n) => n.map((f) => f.name_ko))
      .catch(() => []);
    const { text, usage } = await getSTT().transcribe(audio, { lang: "ko", keywords });
    void repo.recordUsage([usage], null).catch(() => {});
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[foodi/stt]", e);
    return jsonError(503, "stt_unavailable", "한 번 더 들어볼게요. 텍스트로 입력해도 돼요.");
  }
}
