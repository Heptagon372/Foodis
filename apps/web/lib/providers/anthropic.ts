import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@/lib/env";
import { ProviderError, type LLMProvider } from "./types";

// USD / 1M 토큰 (입력, 출력). 2026-09 기준 — 가격 변경 시 여기만 고친다 (09 문서 §5.1)
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-5-5": [2, 10],
};

export function anthropicLLM(client = new Anthropic({ timeout: 4_000, maxRetries: 1 })): LLMProvider {
  return {
    async structured({ system, user, schema, model, maxTokens, operation }) {
      const modelId = model === "fast" ? env.llmModelFast : env.llmModelSmart;
      try {
        const res = await client.messages.parse({
          model: modelId,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          output_config: {
            format: zodOutputFormat(schema),
            ...(model === "smart" ? { effort: env.llmSmartEffort } : {}),
          },
        });
        if (res.stop_reason === "refusal") throw new ProviderError("anthropic", `refusal: ${res.stop_details?.category ?? "unknown"}`, false);
        if (res.stop_reason === "max_tokens") throw new ProviderError("anthropic", "max_tokens 도달 — 출력이 잘림", false);
        if (res.parsed_output == null) throw new ProviderError("anthropic", "스키마 파싱 실패", false);

        const [pin, pout] = PRICES[modelId] ?? [0, 0];
        const { input_tokens: inT, output_tokens: outT } = res.usage;
        return {
          data: res.parsed_output,
          usage: {
            provider: "anthropic",
            operation,
            units: inT + outT,
            unitType: "tokens",
            costUsd: (inT * pin + outT * pout) / 1e6,
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
