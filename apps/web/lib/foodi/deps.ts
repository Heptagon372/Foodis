// 라우트가 쓰는 의존성 조립. 키가 없으면 미리보기 모드: 메모리 Repo + 'LLM 없음'(→ 템플릿 답) 으로 같은 파이프라인을 돌린다.
import "server-only";
import { supabaseRepo } from "@/lib/db/foodis-repo";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { isLive } from "@/lib/content";
import { env } from "@/lib/env";
import { previewRepo } from "@/lib/preview/source";
import { embedKeyName, embedReady, getEmbedder, getLLM, llmFor, llmProviderReady, llmReady, ProviderError, type Embedder, type LLMProvider } from "@/lib/providers";
import type { FoodisRepo } from "./repo";
import type { ModelRouter, OrchestratorDeps } from "./orchestrator";

const offlineLLM: LLMProvider = { structured: async () => Promise.reject(new ProviderError("preview", "LLM 키 없음 (GEMINI_API_KEY · OPENAI_API_KEY)", false)) };
const offlineEmbedder: Embedder = { embed: async () => Promise.reject(new ProviderError("preview", `${embedKeyName()} 없음`, false)) };
const models: ModelRouter = { ready: llmProviderReady, llmFor };

let preview: FoodisRepo | undefined;
export async function getRepo(): Promise<FoodisRepo> {
  return (await isLive()) ? supabaseRepo(supabaseAdmin()) : (preview ??= previewRepo());
}

export async function getOrchestratorDeps(): Promise<OrchestratorDeps> {
  const live = await isLive();
  return {
    repo: live ? supabaseRepo(supabaseAdmin()) : (preview ??= previewRepo()),
    // 기본 체인: LLM_PROVIDERS 순서(기본 gemini → openai)에서 키 있는 것만 (registry/llm.ts)
    llm: llmReady() ? getLLM() : offlineLLM,
    embedder: embedReady() && live ? getEmbedder() : offlineEmbedder,
    dailyBudgetUsd: env.dailyBudgetUsd,
    models,
  };
}
