// POST /api/foodi/vision — 음식 사진 → DB 에 있는 닮은 음식 카드 0~3개 (F-VIS-01)
// 본문: { media_type: "image/jpeg"|"image/png"|"image/webp", data: base64 } — 클라이언트가 1024px·1.5MB 이하로 줄여 보낸다.
// 사진은 메모리에서만 쓰고 저장·로그하지 않는다 (에러 로그에도 본문을 남기지 않는다).
import { NextResponse } from "next/server";
import { jsonError, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getOrchestratorDeps } from "@/lib/foodi/deps";
import { checkImagePayload, recognizeFood, VISION_MAX_BODY, VisionBudgetError } from "@/lib/foodi/vision";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { ProviderError } from "@/lib/providers/types";

export const runtime = "nodejs";

const DAY_MS = 86_400_000;

export async function POST(req: Request) {
  // 큰 본문은 JSON 파싱 전에 거른다
  if (Number(req.headers.get("content-length") ?? 0) > VISION_MAX_BODY) return jsonError(413, "image_too_large", "사진이 너무 커요. 1.5MB 이하로 보내 주세요.");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, "invalid_json", "JSON 본문이 필요합니다.");
  }
  const img = checkImagePayload(raw);
  if (!img.ok) return jsonError(img.status, img.code, img.message);

  // 이미지 토큰은 텍스트 질문보다 비싸다 → 대화(분당 10회)보다 빡빡하게: 분당 5회 · 하루 30회
  const userId = await currentUserId().catch(() => null);
  const key = clientKey(req, userId);
  const rl = rateLimit(`vision:${key}`, 5);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const day = rateLimit(`vision-day:${key}`, 30, DAY_MS);
  if (!day.ok) return jsonError(429, "rate_limited", "오늘 사진 인식은 여기까지예요. 글이나 음성으로 물어봐 주세요.", { "Retry-After": String(day.retryAfterSec) });

  try {
    return NextResponse.json(await recognizeFood(await getOrchestratorDeps(), img.image));
  } catch (e) {
    if (e instanceof VisionBudgetError) return jsonError(503, "vision_budget", "오늘 사진 인식 사용량이 다 찼어요. 글이나 음성으로 물어봐 주세요.");
    // 키가 없는 미리보기 모드: deps 의 offlineLLM 이 'preview' ProviderError 를 던진다
    if (e instanceof ProviderError && e.provider === "preview") return jsonError(503, "vision_unavailable", "사진 인식은 준비 중이에요 (AI 키 설정 후 열려요)");
    console.error("[foodi/vision]", e instanceof Error ? e.message : "unknown error");
    return jsonError(503, "vision_failed", "사진을 잠깐 못 봤어요. 다시 찍어 보거나 글로 물어봐 주세요.");
  }
}
