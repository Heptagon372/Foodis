// POST /api/foodi/ask — 질의 → { speech, cards[], follow_ups[], sources[] } (07 문서 §6.2, F-VOI-01~04)
import { NextResponse } from "next/server";
import { parseBody, jsonError, tooMany } from "@/lib/api/http";
import { currentUserId } from "@/lib/db/supabase-server";
import { getOrchestratorDeps } from "@/lib/foodi/deps";
import { ask } from "@/lib/foodi/orchestrator";
import { AskRequest } from "@/lib/foodi/schema";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await parseBody(req, AskRequest);
  if (!body.ok) return body.res;

  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId));
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const res = await ask(await getOrchestratorDeps(), body.data, userId);
    return NextResponse.json(res);
  } catch (e) {
    console.error("[foodi/ask]", e);
    return jsonError(503, "foodi_unavailable", "푸디가 잠시 쉬고 있어요. 텍스트로 다시 물어봐 주세요.");
  }
}
