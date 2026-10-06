// Gemini 어댑터 (공식 SDK @google/genai) — 답변·의도·사진 인식 LLM 과 검색 임베딩.
// 문서 확인일 2026-10-02:
//   구조화 출력  https://ai.google.dev/gemini-api/docs/structured-output  (SDK: config.responseMimeType + responseJsonSchema)
//   thinking     https://ai.google.dev/gemini-api/docs/thinking           (thinkingConfig.thinkingLevel, 모델별 지원 단계 표)
//   이미지 입력  https://ai.google.dev/api/generate-content               (parts[].inlineData { mimeType, data })
//   임베딩       https://ai.google.dev/gemini-api/docs/embeddings         (outputDimensionality, 질의·문서 접두어)
// generateContent 를 쓴다: 문서 예시는 Interactions API 로 옮겨 갔지만 SDK 는 둘 다 지원하고(README),
// generateContent 는 서버에 대화 상태를 남기지 않는다 — 사진을 어디에도 저장하지 않는다는 원칙(F-VIS-01)과 맞다.
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type EmbedContentParameters, type EmbedContentResponse, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import { isNetworkError, isTransientStatus, LLM_TIMEOUT_MS, LLMOutputError, parseStructured, toJsonSchema } from "./llm-common";
import { tokenCostUsd } from "./llm-prices";
import { ProviderError, type Embedder, type LLMProvider } from "./types";

/** 어댑터가 쓰는 SDK 의 최소 모양 — 테스트는 이 모양의 가짜를 넣는다 */
export type GeminiClient = {
  models: {
    generateContent(p: GenerateContentParameters): Promise<Pick<GenerateContentResponse, "candidates" | "promptFeedback" | "usageMetadata">>;
    embedContent(p: EmbedContentParameters): Promise<Pick<EmbedContentResponse, "embeddings">>;
  };
};

let shared: GeminiClient | undefined;
/** 키는 GEMINI_API_KEY. 재시도 옵션을 주지 않으면 SDK 는 재시도하지 않는다 → 장애 시 바로 다음 제공자로 (registry/llm.ts) */
export const geminiClient = (): GeminiClient => (shared ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

export type GeminiThinking = "minimal" | "low" | "medium" | "high";
export type GeminiModels = { fast: string; smart: string; vision?: string; fastThinking: GeminiThinking; smartThinking: GeminiThinking };

const LEVEL: Record<GeminiThinking, ThinkingLevel> = { minimal: ThinkingLevel.MINIMAL, low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };
// thinking 문서 표: 3.7·3.8 Flash, Pro, 2.5 계열은 minimal 이 없다(보내면 400) → low 로 올린다
const NO_MINIMAL = /^gemini-(3\.[78]-flash|3(\.\d+)?-pro|2\.5-)/;
export const geminiThinking = (model: string, want: GeminiThinking): GeminiThinking => (want === "minimal" && NO_MINIMAL.test(model) ? "low" : want);
// 생각 토큰도 출력 한도를 쓴다 → 답이 잘리지 않게 단계만큼 여유를 더한다 (쓰지 않은 한도는 청구되지 않는다)
const HEADROOM: Record<GeminiThinking, number> = { minimal: 256, low: 1_024, medium: 4_096, high: 8_192 };
// SDK 는 httpOptions.timeout 을 서버 기한(X-Server-Timeout)으로도 보내는데, API 가 10초 미만을 거절한다
// ("Manually set deadline 4s is too short. Minimum allowed deadline is 10s.", 2026-10-07 실측 — 모든 LLM·임베딩 호출이 400 이 되어 템플릿 답으로 떨어졌다).
// → 서버 기한은 10초 이상으로 보내고, 우리 지연 예산(의도 4초 · 답 6초 · 질의 임베딩 3초)은 클라이언트 쪽 abortSignal 로 지킨다
export const GEMINI_MIN_DEADLINE_MS = 10_000;
export const deadline = (budgetMs: number) => ({ httpOptions: { timeout: Math.max(GEMINI_MIN_DEADLINE_MS, budgetMs) }, abortSignal: AbortSignal.timeout(budgetMs) });

export function geminiLLM(opts: { models: GeminiModels; client?: () => GeminiClient }): LLMProvider {
  const { models } = opts;
  const client = opts.client ?? geminiClient;
  return {
    async structured({ system, user, schema, model, maxTokens, operation, image }) {
      const tierModel = model === "fast" ? models.fast : models.smart;
      const modelId = image ? (models.vision ?? tierModel) : tierModel;
      const level = geminiThinking(modelId, model === "fast" ? models.fastThinking : models.smartThinking);
      // 이미지는 텍스트보다 앞에 (Anthropic 어댑터와 같은 순서)
      const parts: Part[] = [...(image ? [{ inlineData: { mimeType: image.mediaType, data: image.data } }] : []), { text: user }];
      try {
        const res = await client().models.generateContent({
          model: modelId,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: toJsonSchema(schema),
            maxOutputTokens: maxTokens + HEADROOM[level],
            thinkingConfig: { thinkingLevel: LEVEL[level] },
            ...deadline(image ? LLM_TIMEOUT_MS.image : LLM_TIMEOUT_MS[model]),
          },
        });
        if (res.promptFeedback?.blockReason) throw new LLMOutputError("gemini", `입력 차단: ${res.promptFeedback.blockReason}`);
        const cand = res.candidates?.[0];
        if (cand?.finishReason === FinishReason.MAX_TOKENS) throw new LLMOutputError("gemini", "maxOutputTokens 도달 — 출력이 잘림");
        if (cand?.finishReason && cand.finishReason !== FinishReason.STOP && cand.finishReason !== FinishReason.FINISH_REASON_UNSPECIFIED)
          throw new LLMOutputError("gemini", `생성 중단: ${cand.finishReason}`);
        // 생각(thought) 파트는 빼고 답 텍스트만
        const text = (cand?.content?.parts ?? [])
          .filter((p) => !p.thought && typeof p.text === "string")
          .map((p) => p.text)
          .join("");
        const data = parseStructured("gemini", schema, text);

        const u = res.usageMetadata;
        const input = u?.promptTokenCount ?? 0;
        const output = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
        return {
          data,
          usage: { provider: "gemini", operation, units: input + output, unitType: "tokens", costUsd: tokenCostUsd(modelId, { input, output }), model: modelId },
        };
      } catch (e) {
        throw geminiError(e);
      }
    },
  };
}

function geminiError(e: unknown): unknown {
  if (e instanceof ProviderError) return e;
  if (e instanceof ApiError) {
    // 429 는 메시지가 길어 잘리면 어느 한도인지 사라진다 → 하루 한도(무료 등급 임베딩 1,000건/일 등)면 앞에 붙여 둔다 (기다려도 소용없음)
    const daily = e.status === 429 && /PerDay/.test(e.message) ? " [PerDay 하루 한도]" : "";
    return new ProviderError("gemini", `${e.status}${daily} ${e.message}`.slice(0, 300), isTransientStatus(e.status) && !daily);
  }
  if (isNetworkError(e)) return new ProviderError("gemini", (e as Error).message, true);
  return e;
}

// ── 임베딩 ──────────────────────────────────────────────────
// DB 는 vector(1536). gemini-embedding-2 기본은 3072차원 → outputDimensionality 1536 으로 줄인다.
// 문서: embedding-2 는 줄인 차원도 자동 정규화, embedding-001 은 3072 가 아니면 직접 정규화해야 한다 → 모델과 무관하게 항상 L2 정규화 (이미 단위 벡터면 그대로)
export const EMBED_DIMENSIONS = 1536;
// 텍스트 1M 토큰당 (가격 문서, 확인일 2026-10-02). Developer API 응답에는 토큰 수가 없어 글자 수로 어림한다(1글자≈1토큰, 넉넉하게)
const EMBED_PRICE_PER_1M: Record<string, number> = { "gemini-embedding-2": 0.2 };
// batchEmbedContents 한 번에 최대 100건
const EMBED_BATCH = 100;

export function l2normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  return n > 0 ? v.map((x) => x / n) : v;
}

export function geminiEmbedder(opts: { model: string; client?: () => GeminiClient }): Embedder {
  const { model } = opts;
  const client = opts.client ?? geminiClient;
  // embedding-001 은 taskType, embedding-2 는 과제를 텍스트 접두어로 받는다 (임베딩 문서 "task: search result | query: {content}" / "title: {title} | text: {content}")
  // 데이터 파이프라인(s09)과 글자 하나까지 같아야 한다: 문서 제목 = 음식 이름(name_ko), 없으면 "none"
  const legacy = model.startsWith("gemini-embedding-001");
  const format = (t: string, i: number, kind: "query" | "document", titles?: string[]) =>
    legacy ? t : kind === "query" ? `task: search result | query: ${t}` : `title: ${titles?.[i]?.trim() || "none"} | text: ${t}`;
  return {
    async embed(texts, o) {
      const kind = o?.kind ?? "query";
      const inputs = texts.map((t, i) => format(t, i, kind, o?.titles));
      const vectors: number[][] = [];
      try {
        for (let i = 0; i < inputs.length; i += EMBED_BATCH) {
          const batch = inputs.slice(i, i + EMBED_BATCH);
          // 텍스트마다 Content 로 감싸야 따로따로 임베딩된다 (문자열 배열을 그대로 주면 embedding-2 는 하나로 합친다)
          const res = await client().models.embedContent({
            model,
            contents: batch.map((t) => ({ role: "user", parts: [{ text: t }] })),
            config: {
              outputDimensionality: EMBED_DIMENSIONS,
              ...(legacy ? { taskType: kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT" } : {}),
              // 질의는 답변 경로라 짧게, 문서 일괄 생성(어드민)은 넉넉하게
              ...deadline(kind === "query" ? 3_000 : 30_000),
            },
          });
          const got = (res.embeddings ?? []).map((e) => e.values ?? []);
          if (got.length !== batch.length || got.some((v) => v.length !== EMBED_DIMENSIONS))
            throw new ProviderError("gemini", `임베딩 모양이 다름: ${got.length}개 · ${got[0]?.length ?? 0}차원 (기대 ${batch.length}개 · ${EMBED_DIMENSIONS})`, false);
          vectors.push(...got.map(l2normalize));
        }
      } catch (e) {
        throw geminiError(e);
      }
      const units = inputs.reduce((n, t) => n + t.length, 0);
      return { vectors, usage: { provider: "gemini", operation: "embed", units, unitType: "tokens", costUsd: (units * (EMBED_PRICE_PER_1M[model] ?? 0.2)) / 1e6, model } };
    },
  };
}
