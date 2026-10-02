import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { LLM_TIMEOUT_MS, LLMOutputError } from "./llm-common";
import { tokenCostUsd } from "./llm-prices";
import { ProviderError, type LLMProvider } from "./types";

// Anthropic 은 선택 제공자 (LLM_PROVIDERS 에 anthropic 을 넣을 때만). 단가는 llm-prices.ts
export type AnthropicModels = { fast: string; smart: string; vision?: string; smartEffort: "low" | "medium" | "high" };

const defaultModels = (): AnthropicModels => ({ fast: env.llmAnthropicFast, smart: env.llmAnthropicSmart, vision: env.llmAnthropicVision, smartEffort: env.llmAnthropicSmartEffort });

export function anthropicLLM(client = new Anthropic({ timeout: LLM_TIMEOUT_MS.fast, maxRetries: 1 }), models: AnthropicModels = defaultModels()): LLMProvider {
  return {
    async structured({ system, user, schema, model, maxTokens, operation, image }) {
      const tierModel = model === "fast" ? models.fast : models.smart;
      const modelId = image ? (models.vision ?? tierModel) : tierModel;
      // 이미지는 텍스트보다 앞에 둔다 (Vision 권장 순서). 이미지 입력은 처리 시간이 길어 요청 타임아웃만 늘린다
      const content: Anthropic.ContentBlockParam[] | string = image
        ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }, { type: "text", text: user }]
        : user;
      try {
        const res = await client.messages.parse(
          {
            model: modelId,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content }],
            output_config: {
              format: zodOutputFormat(schema),
              ...(model === "smart" ? { effort: models.smartEffort } : {}),
            },
          },
          { timeout: image ? LLM_TIMEOUT_MS.image : LLM_TIMEOUT_MS[model] },
        );
        if (res.stop_reason === "refusal") throw new LLMOutputError("anthropic", `refusal: ${res.stop_details?.category ?? "unknown"}`);
        if (res.stop_reason === "max_tokens") throw new LLMOutputError("anthropic", "max_tokens 도달 — 출력이 잘림");
        if (res.parsed_output == null) throw new LLMOutputError("anthropic", "스키마 파싱 실패");

        const { input_tokens: inT, output_tokens: outT } = res.usage;
        return {
          data: res.parsed_output,
          usage: {
            provider: "anthropic",
            operation,
            units: inT + outT,
            unitType: "tokens",
            costUsd: tokenCostUsd(modelId, { input: inT, output: outT }),
            model: modelId,
          },
        };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError)
          throw new ProviderError("anthropic", (e as Error).message, true);
        if (e instanceof Anthropic.APIError) throw new ProviderError("anthropic", e.message, false);
        throw e;
      }
    },
  };
}
