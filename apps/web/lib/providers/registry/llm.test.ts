// LLM fallback 체인: 키 없는 제공자 건너뛰기 · 장애면 다음으로 · 출력 오류는 멈춤 · 쉬는 시간 · 사용자 선택 순서.
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LLMOutputError } from "../llm-common";
import { ProviderError, type LLMProvider } from "../types";
import { choiceChain, enabledProviders, fallbackLLM, llmProviderReady, llmReady, llmStatus, type LLMMember } from "./llm";

const schema = z.object({ ok: z.boolean() });
const req = { system: "s", user: "u", schema, model: "smart" as const, maxTokens: 100, operation: "generate" };

function member(id: string, behave: "ok" | Error, ready = true) {
  const calls: string[] = [];
  const llm: LLMProvider = {
    async structured() {
      calls.push(id);
      if (behave instanceof Error) throw behave;
      return { data: { ok: true }, usage: { provider: id, operation: "generate", units: 1, unitType: "tokens", costUsd: 0, model: `${id}-model` } } as never;
    },
  };
  const m: LLMMember = { id, ready: () => ready, make: () => llm };
  return { m, calls };
}
const quiet = { log: () => {} };

describe("fallbackLLM", () => {
  it("키 없는 제공자는 호출하지 않고 건너뛴다", async () => {
    const a = member("gemini", "ok", false);
    const b = member("openai", "ok");
    const r = await fallbackLLM([a.m, b.m], { ...quiet, cooldown: new Map() }).structured(req);
    expect(a.calls).toEqual([]);
    expect(r.usage.model).toBe("openai-model");
  });

  it("전부 키가 없으면 ProviderError('preview') — 라우트가 미리보기 안내", async () => {
    const e = await fallbackLLM([member("gemini", "ok", false).m], { ...quiet, cooldown: new Map() }).structured(req).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.provider).toBe("preview");
  });

  it("장애(retryable)·설정 오류(401)면 다음 제공자로", async () => {
    for (const err of [new ProviderError("gemini", "503", true), new ProviderError("gemini", "401 API key not valid", false)]) {
      const a = member("gemini", err);
      const b = member("openai", "ok");
      const r = await fallbackLLM([a.m, b.m], { ...quiet, cooldown: new Map() }).structured(req);
      expect([a.calls, b.calls]).toEqual([["gemini"], ["openai"]]);
      expect(r.usage.provider).toBe("openai");
    }
  });

  it("출력 오류(스키마 위반·거절)는 다음 제공자로 넘기지 않는다", async () => {
    const a = member("gemini", new LLMOutputError("gemini", "스키마 위반"));
    const b = member("openai", "ok");
    await expect(fallbackLLM([a.m, b.m], { ...quiet, cooldown: new Map() }).structured(req)).rejects.toBeInstanceOf(LLMOutputError);
    expect(b.calls).toEqual([]);
  });

  it("전부 실패하면 마지막 ProviderError", async () => {
    const a = member("gemini", new ProviderError("gemini", "429", true));
    const b = member("openai", new ProviderError("openai", "500", true));
    const e = await fallbackLLM([a.m, b.m], { ...quiet, cooldown: new Map() }).structured(req).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.message).toContain("[openai] 500");
    expect(e.retryable).toBe(true);
  });

  it("SDK 밖 오류도 다음으로 넘기고, 전부 실패면 ProviderError 로 감싼다", async () => {
    const a = member("gemini", new Error("boom"));
    const e = await fallbackLLM([a.m], { ...quiet, cooldown: new Map() }).structured(req).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.message).toContain("boom");
  });

  it("실패한 제공자는 30초 동안 뒤로 — 그 뒤엔 다시 앞으로", async () => {
    let t = 1_000;
    const cooldown = new Map<string, number>();
    let geminiFails = true;
    const calls: string[] = [];
    const g: LLMMember = {
      id: "gemini",
      ready: () => true,
      make: () => ({
        structured: async () => {
          calls.push("gemini");
          if (geminiFails) throw new ProviderError("gemini", "timeout", true);
          return { data: { ok: true }, usage: { provider: "gemini", operation: "x", units: 1, unitType: "tokens", costUsd: 0 } } as never;
        },
      }),
    };
    const o = member("openai", "ok");
    const llm = fallbackLLM([g, o.m], { ...quiet, cooldown, now: () => t });
    await llm.structured(req); // gemini 실패 → openai
    await llm.structured(req); // gemini 쉬는 중 → openai 먼저
    expect(calls).toEqual(["gemini"]);
    expect(o.calls).toEqual(["openai", "openai"]);
    geminiFails = false;
    t += 30_001;
    await llm.structured(req); // 쉬는 시간 끝 → gemini 다시 1순위
    expect(calls).toEqual(["gemini", "gemini"]);
    expect(o.calls).toHaveLength(2);
  });

  it("전부 쉬는 중이어도 원래 순서대로 다시 시도한다", async () => {
    const cooldown = new Map([
      ["gemini", Number.MAX_SAFE_INTEGER],
      ["openai", Number.MAX_SAFE_INTEGER],
    ]);
    const a = member("gemini", "ok");
    const b = member("openai", "ok");
    await fallbackLLM([a.m, b.m], { ...quiet, cooldown }).structured(req);
    expect(a.calls).toEqual(["gemini"]);
    expect(cooldown.has("gemini")).toBe(false); // 성공하면 쉬는 표시를 지운다
  });
});

describe("사용자 선택 체인", () => {
  it("고른 제공자가 맨 앞(답변·사진 = 고른 모델), 나머지는 기본 모델로 기본 순서", () => {
    expect(choiceChain({ provider: "openai", id: "gpt-6.1-sol" }, ["gemini", "openai"])).toEqual([{ id: "openai", override: { smart: "gpt-6.1-sol" } }, { id: "gemini" }]);
    expect(choiceChain({ provider: "anthropic", id: "claude-sonnet-5" }, ["gemini", "openai", "anthropic"])).toEqual([
      { id: "anthropic", override: { smart: "claude-sonnet-5" } },
      { id: "gemini" },
      { id: "openai" },
    ]);
  });
});

describe("registry 상태", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("기본 순서는 gemini → openai (anthropic 은 넣을 때만)", () => {
    expect(enabledProviders()).toEqual(["gemini", "openai"]);
  });

  it("키 기준 ready, 상태에 키 값은 절대 없다", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(llmReady()).toBe(false);
    vi.stubEnv("GEMINI_API_KEY", "fake-gemini-secret-123");
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-anthropic-secret-456");
    expect(llmReady()).toBe(true);
    expect(llmProviderReady("gemini")).toBe(true);
    expect(llmProviderReady("anthropic")).toBe(false); // 키는 있지만 LLM_PROVIDERS 밖
    const s = JSON.stringify(llmStatus());
    expect(s).not.toContain("secret");
    expect(llmStatus().map((x) => [x.id, x.ready])).toEqual([
      ["gemini", true],
      ["openai", false],
      ["anthropic", false],
    ]);
  });
});
