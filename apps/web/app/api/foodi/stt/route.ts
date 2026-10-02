// POST /api/foodi/stt — 녹음 업로드(multipart: audio, mode=ko|auto, engine?) → { text, standard_ko?, language, provider } (F-VOI-01, 10 문서)
// Web Speech 가 안 되는 브라우저 + 음성 설정 "정확하게(서버)" 에서 쓴다. 사투리·외국어면 standard_ko(표준 한국어)를 함께 준다.
// GET — 엔진 준비 상태 (설정 화면용, 키 값 없음).
// 녹음은 메모리에서만 쓰고 저장·로그하지 않는다 (에러 로그에도 본문·인식 결과를 남기지 않는다).
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getOrchestratorDeps } from "@/lib/foodi/deps";
import { env } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { resolveChain, sttEngineStatus } from "@/lib/providers/registry/stt";
import { checkSttUpload, recognizeSpeech, STT_MAX_BYTES } from "@/lib/providers/stt/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(sttEngineStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  // 큰 본문은 읽기 전에 거른다 (multipart 머리 몫으로 64KB 여유)
  if (Number(req.headers.get("content-length") ?? 0) > STT_MAX_BYTES + 65_536) return jsonError(413, "audio_too_large", "녹음이 너무 길어요. 짧게 다시 말해 주세요.");
  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId) + ":stt");
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const up = checkSttUpload(await req.formData().catch(() => null));
  if (!up.ok) return jsonError(up.status, up.code, up.message);
  const { audio, mode, engine } = up.value;

  const chain = resolveChain(mode, engine);
  if (!chain.length) return jsonError(503, "stt_unavailable", "서버 음성 인식이 아직 준비되지 않았어요. 글로 물어봐 주세요.");

  try {
    const deps = await getOrchestratorDeps();
    // 외국 음식 이름 인식 보강: DB 음식명을 키워드 힌트로 (09 문서 §5.3)
    const keywords = await deps.repo
      .allFoodNames()
      .then((n) => n.map((f) => f.name_ko))
      .catch(() => []);
    const { reply, usages } = await recognizeSpeech(
      {
        chain,
        // 미리보기(키 없음)면 offline LLM 이 바로 실패 → 표준어 없이 들은 말 그대로
        llm: env.sttNormalize ? deps.llm : null,
        keywords,
        onFail: (id, e) => console.warn(`[foodi/stt] ${id} 실패, 다음 엔진으로:`, e instanceof Error ? e.message.slice(0, 200) : "unknown"),
      },
      { audio, mode },
    );
    void deps.repo.recordUsage(usages, null).catch(() => {});
    return NextResponse.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[foodi/stt]", e instanceof Error ? e.message.slice(0, 200) : "unknown error");
    return jsonError(503, "stt_unavailable", "한 번 더 들어볼게요. 텍스트로 입력해도 돼요.");
  }
}
