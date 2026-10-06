// Gemini 어댑터: 가짜 SDK 클라이언트로 요청 모양 · 응답 해석 · 비용 · 오류 분류를 본다 (실제 API 호출 없음).
import { ApiError, FinishReason, type EmbedContentParameters, type GenerateContentParameters } from "@google/genai";
import { describe, expect, it } from "vitest";
import { IntentOutput } from "@/lib/foodi/schema";
import { geminiEmbedder, geminiLLM, geminiThinking, l2normalize, type GeminiClient, type GeminiModels } from "./gemini";
import { LLMOutputError } from "./llm-common";
import { ProviderError } from "./types";

const MODELS: GeminiModels = { fast: "gemini-3.5-flash-lite", smart: "gemini-3.6-flash", fastThinking: "minimal", smartThinking: "minimal" };
const INTENT = { intent: "recommend", diet: ["vegan"], country_code: null, mentioned_food: null, mentioned_place: null };

type GenRes = Awaited<ReturnType<GeminiClient["models"]["generateContent"]>>;
const ok = (data: unknown, usage = { promptTokenCount: 1_000, candidatesTokenCount: 100, thoughtsTokenCount: 20 }): GenRes => ({
  candidates: [{ finishReason: FinishReason.STOP, content: { role: "model", parts: [{ text: "생각 중…", thought: true }, { text: JSON.stringify(data) }] } }],
  usageMetadata: usage,
});

function fake(reply: GenRes | Error) {
  const calls: GenerateContentParameters[] = [];
  const client: GeminiClient = {
    models: {
      async generateContent(p) {
        calls.push(p);
        if (reply instanceof Error) throw reply;
        return reply;
      },
      embedContent: async () => ({ embeddings: [] }),
    },
  };
  return { llm: geminiLLM({ models: MODELS, client: () => client }), calls };
}

const req = { system: "분류기", user: "<utterance>비건 추천</utterance>", schema: IntentOutput, maxTokens: 300, operation: "intent" } as const;

describe("geminiLLM 요청 모양", () => {
  it("JSON Schema 를 붙이고 thinking 은 minimal, 출력 한도에 생각 여유를 더한다", async () => {
    const { llm, calls } = fake(ok(INTENT));
    await llm.structured({ ...req, model: "fast" });
    const p = calls[0];
    expect(p.model).toBe("gemini-3.5-flash-lite");
    expect(p.config?.systemInstruction).toBe("분류기");
    expect(p.config?.responseMimeType).toBe("application/json");
    const schema = p.config?.responseJsonSchema as Record<string, unknown>;
    expect(schema).not.toHaveProperty("$schema"); // Gemini 지원 목록 밖
    expect(schema).toMatchObject({ type: "object", required: expect.arrayContaining(["intent", "diet", "country_code"]) });
    expect(JSON.stringify(schema)).toContain('"null"'); // nullable → anyOf null
    expect(p.config?.responseSchema).toBeUndefined();
    expect(p.config?.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
    expect(p.config?.maxOutputTokens).toBe(300 + 256);
    // 서버 기한은 API 최소 10초, 지연 예산 4초는 클라이언트 abort 로
    expect(p.config?.httpOptions?.timeout).toBe(10_000);
    expect(p.config?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(p.contents).toEqual([{ role: "user", parts: [{ text: req.user }] }]);
  });

  it("smart 는 smart 모델(서버 기한 10초·예산 6초), 사진은 inlineData 를 텍스트 앞에 + 12초", async () => {
    const { llm, calls } = fake(ok(INTENT));
    await llm.structured({ ...req, model: "smart" });
    expect(calls[0].model).toBe("gemini-3.6-flash");
    expect(calls[0].config?.httpOptions?.timeout).toBe(10_000);

    const { llm: v, calls: vc } = fake(ok(INTENT));
    await v.structured({ ...req, model: "fast", image: { mediaType: "image/png", data: "iVBORw0KGgo=" } });
    expect(vc[0].contents).toEqual([{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }, { text: req.user }] }]);
    expect(vc[0].config?.httpOptions?.timeout).toBe(12_000);
  });

  it("minimal 이 없는 모델(3.8 Flash 등)은 low 로 올린다", () => {
    expect(geminiThinking("gemini-3.8-flash", "minimal")).toBe("low");
    expect(geminiThinking("gemini-3.1-pro-preview", "minimal")).toBe("low");
    expect(geminiThinking("gemini-2.5-flash", "minimal")).toBe("low");
    expect(geminiThinking("gemini-3.5-flash-lite", "minimal")).toBe("minimal");
    expect(geminiThinking("gemini-3.6-flash", "minimal")).toBe("minimal");
    expect(geminiThinking("gemini-3.8-flash", "high")).toBe("high");
  });
});

describe("geminiLLM 응답 해석", () => {
  it("생각 파트는 빼고 답 JSON 을 zod 로 검증, 생각 토큰은 출력 단가로 비용 계산", async () => {
    const { llm } = fake(ok(INTENT));
    const { data, usage } = await llm.structured({ ...req, model: "fast" });
    expect(data).toEqual({ ...INTENT, tastes: [], avoid_tastes: [], methods: [], courses: [], ingredients: [], avoid_ingredients: [] }); // 조건 슬롯은 빠지면 [] 로 채운다
    // 3.5 Flash-Lite $0.30 / $2.50: 1000 입력 + (100+20) 출력
    expect(usage).toMatchObject({ provider: "gemini", operation: "intent", units: 1_120, unitType: "tokens", model: "gemini-3.5-flash-lite" });
    expect(usage.costUsd).toBeCloseTo((1_000 * 0.3 + 120 * 2.5) / 1e6, 10);
  });

  it("스키마 위반·잘림·안전 차단은 LLMOutputError (retryable=false)", async () => {
    const bad = await fake(ok({ intent: "날씨", diet: [] })).llm.structured({ ...req, model: "fast" }).catch((e) => e);
    expect(bad).toBeInstanceOf(LLMOutputError);
    expect(bad.retryable).toBe(false);
    expect(bad.message).toMatch(/스키마 위반/);

    const cut = await fake({ candidates: [{ finishReason: FinishReason.MAX_TOKENS, content: { parts: [{ text: '{"intent":' }] } }] }).llm.structured({ ...req, model: "fast" }).catch((e) => e);
    expect(cut).toBeInstanceOf(LLMOutputError);

    const blocked = await fake({ promptFeedback: { blockReason: "SAFETY" as never }, candidates: [] }).llm.structured({ ...req, model: "fast" }).catch((e) => e);
    expect(blocked).toBeInstanceOf(LLMOutputError);

    const notJson = await fake({ candidates: [{ finishReason: FinishReason.STOP, content: { parts: [{ text: "음식 추천이에요" }] } }] }).llm.structured({ ...req, model: "fast" }).catch((e) => e);
    expect(notJson).toBeInstanceOf(LLMOutputError);
  });

  it("429·5xx·연결 오류는 retryable, 400·403 은 아님", async () => {
    const run = async (e: Error) => (await fake(e).llm.structured({ ...req, model: "fast" }).catch((x) => x)) as ProviderError;
    for (const status of [429, 500, 503, 504]) {
      const e = await run(new ApiError({ message: "busy", status }));
      expect(e).toBeInstanceOf(ProviderError);
      expect([status, e.retryable]).toEqual([status, true]);
    }
    for (const status of [400, 401, 403, 404]) expect((await run(new ApiError({ message: "bad", status }))).retryable).toBe(false);
    const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    expect((await run(abort)).retryable).toBe(true);
    expect((await run(new TypeError("fetch failed"))).retryable).toBe(true);
  });
});

describe("geminiEmbedder", () => {
  function fakeEmbed(dims = 1536, count?: number) {
    const calls: EmbedContentParameters[] = [];
    const client: GeminiClient = {
      models: {
        generateContent: async () => ({}),
        async embedContent(p) {
          calls.push(p);
          const n = count ?? (p.contents as unknown[]).length;
          return { embeddings: Array.from({ length: n }, (_, i) => ({ values: Array.from({ length: dims }, (_, j) => (j === 0 ? 3 + i : j === 1 ? 4 : 0)) })) };
        },
      },
    };
    return { calls, client };
  }

  it("텍스트마다 Content 로 감싸 1536차원으로, 질의·문서 접두어, 정규화", async () => {
    const { calls, client } = fakeEmbed();
    const e = geminiEmbedder({ model: "gemini-embedding-2", client: () => client });
    const q = await e.embed(["비건 만두"]);
    expect(calls[0].contents).toEqual([{ role: "user", parts: [{ text: "task: search result | query: 비건 만두" }] }]);
    expect(calls[0].config).toMatchObject({ outputDimensionality: 1536 });
    expect(calls[0].config?.taskType).toBeUndefined();
    expect(q.vectors).toHaveLength(1);
    expect(q.vectors[0].slice(0, 2)).toEqual([0.6, 0.8]); // (3,4) → 단위 벡터
    expect(q.usage).toMatchObject({ provider: "gemini", operation: "embed", model: "gemini-embedding-2" });

    // 문서: 데이터 파이프라인(s09)과 같은 "title: {이름} | text: {본문}", 제목이 없으면 none
    await e.embed(["에티오피아 발효 빵", "속을 채운 반죽"], { kind: "document", titles: ["인제라", ""] });
    expect(calls[1].contents).toEqual([
      { role: "user", parts: [{ text: "title: 인제라 | text: 에티오피아 발효 빵" }] },
      { role: "user", parts: [{ text: "title: none | text: 속을 채운 반죽" }] },
    ]);
  });

  it("embedding-001 은 taskType 으로, 차원·개수가 다르면 오류", async () => {
    const { calls, client } = fakeEmbed();
    await geminiEmbedder({ model: "gemini-embedding-001", client: () => client }).embed(["a"], { kind: "document" });
    expect(calls[0].config?.taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(calls[0].contents).toEqual([{ role: "user", parts: [{ text: "a" }] }]);

    const wrongDims = fakeEmbed(3072);
    await expect(geminiEmbedder({ model: "gemini-embedding-2", client: () => wrongDims.client }).embed(["a"])).rejects.toThrow(/1536/);
    const wrongCount = fakeEmbed(1536, 1);
    await expect(geminiEmbedder({ model: "gemini-embedding-2", client: () => wrongCount.client }).embed(["a", "b"])).rejects.toThrow(ProviderError);
  });

  it("l2normalize: 0 벡터는 그대로", () => {
    expect(l2normalize([0, 0])).toEqual([0, 0]);
    expect(Math.hypot(...l2normalize([1, 2, 2]))).toBeCloseTo(1, 12);
  });
});
