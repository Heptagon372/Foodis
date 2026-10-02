// OpenAI GPT 어댑터 (공식 SDK openai, Responses API) — 답변·의도·사진 인식 LLM. STT·TTS·임베딩은 openai.ts 가 맡는다.
// 문서 확인일 2026-10-02:
//   구조화 출력  https://developers.openai.com/api/docs/guides/structured-outputs  (text.format = zodTextFormat(schema, name))
//   reasoning    https://developers.openai.com/api/docs/guides/reasoning           (reasoning.effort, 생각 토큰은 출력으로 청구)
//   이미지 입력  https://developers.openai.com/api/docs/guides/images-vision       (input_image + data URL)
// responses.parse 대신 create + 직접 검증: 형식(zodTextFormat · strict)은 같고, 거절·잘림·스키마 위반을 Gemini 와 같은 규칙으로 가른다.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Response as OAIResponse, ResponseCreateParamsNonStreaming, ResponseInputContent } from "openai/resources/responses/responses";
import { isNetworkError, isTransientStatus, LLM_TIMEOUT_MS, LLMOutputError, parseStructured } from "./llm-common";
import { tokenCostUsd } from "./llm-prices";
import { ProviderError, type LLMProvider } from "./types";

/** 어댑터가 쓰는 SDK 의 최소 모양 — 테스트는 이 모양의 가짜를 넣는다 */
export type OpenAIClient = {
  responses: {
    create(body: ResponseCreateParamsNonStreaming, options?: { timeout?: number }): Promise<Pick<OAIResponse, "status" | "incomplete_details" | "output" | "usage">>;
  };
};

let shared: OpenAIClient | undefined;
/** SDK 재시도는 끈다: 장애면 곧바로 다음 제공자로 넘기는 편이 음성 지연에 낫다 (재시도는 체인과 orchestrator 의 1회 재생성이 맡는다) */
export const openaiLLMClient = (): OpenAIClient => (shared ??= new OpenAI({ timeout: LLM_TIMEOUT_MS.smart, maxRetries: 0 }));

export type OpenAIEffort = "none" | "minimal" | "low" | "medium" | "high";
export type OpenAIModels = { fast: string; smart: string; vision?: string; fastEffort: OpenAIEffort; smartEffort: OpenAIEffort };

// reasoning 문서: GPT-6 Astra 는 none 불가, GPT-6.1 Sol 은 none·minimal 불가(400) → low 로 올린다. GPT-6 Luna 는 none 지원
const NO_NONE = /^gpt-6(\.\d+)?-(sol|astra)/;
export const openaiEffort = (model: string, want: OpenAIEffort): OpenAIEffort => ((want === "none" || want === "minimal") && NO_NONE.test(model) ? "low" : want);
// max_output_tokens 는 생각 토큰까지 포함한다 → 답이 잘리지 않게 effort 만큼 여유 (쓰지 않은 한도는 청구되지 않는다)
const HEADROOM: Record<OpenAIEffort, number> = { none: 0, minimal: 256, low: 1_024, medium: 4_096, high: 8_192 };

export function openaiLLM(opts: { models: OpenAIModels; client?: () => OpenAIClient }): LLMProvider {
  const { models } = opts;
  const client = opts.client ?? openaiLLMClient;
  return {
    async structured({ system, user, schema, model, maxTokens, operation, image }) {
      const tierModel = model === "fast" ? models.fast : models.smart;
      const modelId = image ? (models.vision ?? tierModel) : tierModel;
      const effort = openaiEffort(modelId, model === "fast" ? models.fastEffort : models.smartEffort);
      const content: ResponseInputContent[] = [
        ...(image ? [{ type: "input_image" as const, image_url: `data:${image.mediaType};base64,${image.data}`, detail: "auto" as const }] : []),
        { type: "input_text", text: user },
      ];
      try {
        const res = await client().responses.create(
          {
            model: modelId,
            instructions: system,
            input: [{ role: "user", content }],
            text: { format: zodTextFormat(schema, "foodi_output") },
            reasoning: { effort },
            max_output_tokens: maxTokens + HEADROOM[effort],
            // 응답을 OpenAI 쪽에 저장하지 않는다 (사진·질문은 이 요청 안에서만 쓴다)
            store: false,
          },
          { timeout: image ? LLM_TIMEOUT_MS.image : LLM_TIMEOUT_MS[model] },
        );
        if (res.status === "incomplete") throw new LLMOutputError("openai", `출력 미완료: ${res.incomplete_details?.reason ?? "unknown"}`);
        let text = "";
        for (const item of res.output ?? []) {
          if (item.type !== "message") continue;
          for (const c of item.content) {
            if (c.type === "refusal") throw new LLMOutputError("openai", `refusal: ${c.refusal.slice(0, 120)}`);
            if (c.type === "output_text") text += c.text;
          }
        }
        const data = parseStructured("openai", schema, text);

        const u = res.usage;
        const input = u?.input_tokens ?? 0;
        const output = u?.output_tokens ?? 0; // reasoning_tokens 포함
        const cachedInput = u?.input_tokens_details?.cached_tokens ?? 0;
        return {
          data,
          usage: { provider: "openai", operation, units: input + output, unitType: "tokens", costUsd: tokenCostUsd(modelId, { input, output, cachedInput }), model: modelId },
        };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        if (e instanceof OpenAI.APIError) {
          // 연결 오류·타임아웃은 status 가 없다 → 일시 장애
          const transient = e instanceof OpenAI.APIConnectionError || isTransientStatus(e.status);
          throw new ProviderError("openai", `${e.status ?? "network"} ${e.message}`.slice(0, 300), transient);
        }
        if (isNetworkError(e)) throw new ProviderError("openai", (e as Error).message, true);
        throw e;
      }
    },
  };
}
