// POST /api/foodi/ask — 질의 → { speech, cards[], follow_ups[], sources[] } (07 문서 §6.2, F-VOI-01~04)
import { NextResponse } from "next/server";
import { parseBody, jsonError, tooMany } from "@/lib/api/http";
import { supabaseRepo } from "@/lib/db/foodis-repo";
import { currentUserId, supabaseAdmin } from "@/lib/db/supabase-server";
import { env } from "@/lib/env";
import { ask } from "@/lib/foodi/orchestrator";
import { AskRequest } from "@/lib/foodi/schema";
import { clientKey, rateLimit } from "@/lib/guard/ratelimit";
import { getEmbedder, getLLM } from "@/lib/providers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await parseBody(req, AskRequest);
  if (!body.ok) return body.res;

  const userId = await currentUserId().catch(() => null);
  const rl = rateLimit(clientKey(req, userId));
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const res = await ask({ llm: getLLM(), embedder: getEmbedder(), repo: supabaseRepo(supabaseAdmin()), dailyBudgetUsd: env.dailyBudgetUsd }, body.data, userId);
    return NextResponse.json(res);
  } catch (e) {
    console.error("[foodi/ask]", e);
    return jsonError(503, "foodi_unavailable", "푸디가 잠시 쉬고 있어요. 텍스트로 다시 물어봐 주세요.");
  }
}
