// 라우트가 쓰는 의존성 조립. 키가 없으면 미리보기 모드: 메모리 Repo + 'LLM 없음'(→ 템플릿 답) 으로 같은 파이프라인을 돌린다.
import "server-only";
import { supabaseRepo } from "@/lib/db/foodis-repo";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { isLive } from "@/lib/content";
import { env } from "@/lib/env";
import { previewRepo } from "@/lib/preview/source";
import { getEmbedder, getLLM, ProviderError, type Embedder, type LLMProvider } from "@/lib/providers";
import type { FoodisRepo } from "./repo";
import type { OrchestratorDeps } from "./orchestrator";

const offlineLLM: LLMProvider = { structured: async () => Promise.reject(new ProviderError("preview", "ANTHROPIC_API_KEY 없음", false)) };
const offlineEmbedder: Embedder = { embed: async () => Promise.reject(new ProviderError("preview", "OPENAI_API_KEY 없음", false)) };

let preview: FoodisRepo | undefined;
export async function getRepo(): Promise<FoodisRepo> {
  return (await isLive()) ? supabaseRepo(supabaseAdmin()) : (preview ??= previewRepo());
}

export async function getOrchestratorDeps(): Promise<OrchestratorDeps> {
  const live = await isLive();
  return {
    repo: live ? supabaseRepo(supabaseAdmin()) : (preview ??= previewRepo()),
    llm: process.env.ANTHROPIC_API_KEY ? getLLM() : offlineLLM,
    embedder: process.env.OPENAI_API_KEY && live ? getEmbedder() : offlineEmbedder,
    dailyBudgetUsd: env.dailyBudgetUsd,
  };
}
