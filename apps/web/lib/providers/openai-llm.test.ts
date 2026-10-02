// OpenAI GPT 어댑터: 가짜 SDK 클라이언트로 요청 모양 · 응답 해석 · 비용 · 오류 분류를 본다 (실제 API 호출 없음).
import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import { GenerateOutput } from "@/lib/foodi/schema";
import { LLMOutputError } from "./llm-common";
import { openaiEffort, openaiLLM, type OpenAIClient, type OpenAIModels } from "./openai-llm";
import { ProviderError } from "./types";

const MODELS: OpenAIModels = { fast: "gpt-6-luna", smart: "gpt-6-luna", fastEffort: "none", smartEffort: "none" };
const ANSWER = { speech: "에티오피아의 인제라 어때요?", picks: [{ food_id: "F1", reason: "안 가본 나라" }], follow_ups: ["문화 이야기", "다른 거"] };

type Res = Awaited<ReturnType<OpenAIClient["responses"]["create"]>>;
const usage = { input_tokens: 2_000, input_tokens_details: { cached_tokens: 1_000, cache_write_tokens: 0 }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 2_200 };
const ok = (data: unknown): Res =>
  ({ status: "completed", incomplete_details: null, output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(data), annotations: [] }] }], usage }) as unknown as Res;

function fake(reply: Res | Error, models: OpenAIModels = MODELS) {
  const calls: { body: ResponseCreateParamsNonStreaming; options?: { timeout?: number } }[] = [];
  const client: OpenAIClient = {
    responses: {
      async create(body, options) {
        calls.push({ body, options });
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
  return { llm: openaiLLM({ models, client: () => client }), calls };
}

const req = { system: "푸디 규칙", user: "<candidates>[]</candidates>", schema: GenerateOutput, maxTokens: 600, operation: "generate" } as const;

describe("openaiLLM 요청 모양", () => {
  it("Responses API: instructions + strict JSON Schema(zodTextFormat) + effort none + 저장 안 함", async () => {
    const { llm, calls } = fake(ok(ANSWER));
    await llm.structured({ ...req, model: "smart" });
    const { body, options } = calls[0];
    expect(body.model).toBe("gpt-6-luna");
    expect(body.instructions).toBe("푸디 규칙");
    expect(body.input).toEqual([{ role: "user", content: [{ type: "input_text", text: req.user }] }]);
    expect(body.text?.format).toMatchObject({ type: "json_schema", strict: true, name: "foodi_output", schema: { type: "object", required: ["speech", "picks", "follow_ups"] } });
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.max_output_tokens).toBe(600); // none → 생각 여유 0
    expect(body.store).toBe(false);
    expect(options?.timeout).toBe(6_000);
  });

  it("사진은 data URL input_image 를 텍스트 앞에 + 12초, vision 모델이 있으면 그 모델", async () => {
    const { llm, calls } = fake(ok(ANSWER), { ...MODELS, vision: "gpt-6.1-sol" });
    await llm.structured({ ...req, model: "fast", image: { mediaType: "image/jpeg", data: "/9j/AAAA" } });
    const { body, options } = calls[0];
    expect(body.model).toBe("gpt-6.1-sol");
    expect(body.input).toEqual([
      { role: "user", content: [{ type: "input_image", image_url: "data:image/jpeg;base64,/9j/AAAA", detail: "auto" }, { type: "input_text", text: req.user }] },
    ]);
    expect(body.reasoning).toEqual({ effort: "low" }); // Sol 은 none 불가 → low
    expect(body.max_output_tokens).toBe(600 + 1_024);
    expect(options?.timeout).toBe(12_000);
  });

  it("effort 보정: Sol·Astra 는 none·minimal 을 low 로, Luna 는 그대로", () => {
    expect(openaiEffort("gpt-6.1-sol", "none")).toBe("low");
    expect(openaiEffort("gpt-6-astra", "minimal")).toBe("low");
    expect(openaiEffort("gpt-6-luna", "none")).toBe("none");
    expect(openaiEffort("gpt-6.1-sol", "medium")).toBe("medium");
  });
});

describe("openaiLLM 응답 해석", () => {
  it("output_text 를 zod 로 검증, 캐시 적중 입력은 캐시 단가로", async () => {
    const { data, usage: u } = await fake(ok(ANSWER)).llm.structured({ ...req, model: "smart" });
    expect(data).toEqual(ANSWER);
    expect(u).toMatchObject({ provider: "openai", operation: "generate", units: 2_200, model: "gpt-6-luna" });
    // Luna $0.10 / 캐시 $0.01 / 출력 $0.50
    expect(u.costUsd).toBeCloseTo((1_000 * 0.1 + 1_000 * 0.01 + 200 * 0.5) / 1e6, 10);
  });

  it("거절·미완료·스키마 위반은 LLMOutputError", async () => {
    const refusal = { ...ok(ANSWER), output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "안 돼요" }] }] } as unknown as Res;
    expect(await fake(refusal).llm.structured({ ...req, model: "smart" }).catch((e) => e)).toBeInstanceOf(LLMOutputError);
    const incomplete = { ...ok(ANSWER), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } as unknown as Res;
    const e = await fake(incomplete).llm.structured({ ...req, model: "smart" }).catch((x) => x);
    expect(e).toBeInstanceOf(LLMOutputError);
    expect(e.message).toMatch(/max_output_tokens/);
    expect(await fake(ok({ speech: "x" })).llm.structured({ ...req, model: "smart" }).catch((x) => x)).toBeInstanceOf(LLMOutputError);
  });

  it("429·5xx·연결/타임아웃은 retryable, 400·401 은 아님", async () => {
    const run = async (err: Error) => (await fake(err).llm.structured({ ...req, model: "fast" }).catch((x) => x)) as ProviderError;
    const gen = (status: number) => OpenAI.APIError.generate(status, { error: { message: "x" } }, "x", new Headers());
    for (const s of [429, 500, 502, 503]) expect((await run(gen(s))).retryable).toBe(true);
    for (const s of [400, 401, 403, 404]) {
      const e = await run(gen(s));
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.retryable).toBe(false);
    }
    expect((await run(new OpenAI.APIConnectionTimeoutError())).retryable).toBe(true);
    expect((await run(new OpenAI.APIConnectionError({ message: "down" }))).retryable).toBe(true);
  });
});
