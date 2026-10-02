// '푸디의 두뇌' 사용자 선택: allowlist 검증 · premium 강등 · 캐시 키 분리 · orchestrator/사진 인식 연결.
import { describe, expect, it, vi } from "vitest";
import { answerCacheKey } from "@/lib/guard/cache";
import { ask, type ModelRouter } from "@/lib/foodi/orchestrator";
import type { UserContext } from "@/lib/foodi/repo";
import { recognizeFood } from "@/lib/foodi/vision";
import { previewRepo } from "@/lib/preview/source";
import { PREVIEW_FOODS, previewId } from "@/lib/preview/foods";
import type { Embedder, LLMProvider } from "@/lib/providers/types";
import { allowedModel, applyBudget, findModel, modelCatalog, modelUsed, PREMIUM_BUDGET_RATIO, type LLMProviderId } from "./models";

const all = () => true;
const only =
  (...ps: LLMProviderId[]) =>
  (p: LLMProviderId) =>
    ps.includes(p);

describe("카탈로그 · allowlist", () => {
  it("id 는 겹치지 않고, 가격은 llm-prices 에서 온다", () => {
    const ids = modelCatalog().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findModel("gpt-6-luna")?.price).toEqual({ input: 0.1, output: 0.5 });
    // 3.6 Flash 는 2027 년부터 두 배
    expect(findModel("gemini-3.6-flash", new Date("2026-10-02"))?.price).toEqual({ input: 0.75, output: 3.75 });
    expect(findModel("gemini-3.6-flash", new Date("2027-01-01"))?.price).toEqual({ input: 1.5, output: 7.5 });
  });

  it("목록 밖 · 빈 값 · 문자열 아님 · 키 없는 제공자는 null (→ 기본 체인)", () => {
    expect(allowedModel("gpt-6-luna", all)?.id).toBe("gpt-6-luna");
    for (const bad of ["gpt-9-ultra", "", undefined, null, 42, { id: "gpt-6-luna" }, "../../etc"]) expect(allowedModel(bad, all)).toBeNull();
    expect(allowedModel("claude-sonnet-5", only("gemini", "openai"))).toBeNull();
    expect(allowedModel("claude-sonnet-5", only("anthropic"))?.provider).toBe("anthropic");
  });

  it("기본 두뇌(Flash-Lite)와 Luna 는 premium 이 아니고, 2배 이상 비싼 모델은 premium", () => {
    const premium = Object.fromEntries(modelCatalog().map((m) => [m.id, m.premium]));
    expect(premium).toMatchObject({ "gemini-3.5-flash-lite": false, "gpt-6-luna": false, "gemini-3.6-flash": true, "gpt-6.1-sol": true, "claude-sonnet-5": true });
  });
});

describe("예산 80% 를 넘으면 premium 은 기본으로", () => {
  const sol = findModel("gpt-6.1-sol")!;
  const luna = findModel("gpt-6-luna")!;
  it("경계값", () => {
    expect(PREMIUM_BUDGET_RATIO).toBe(0.8);
    expect(applyBudget(sol, 3.99, 5)).toEqual({ model: sol, downgraded: false });
    expect(applyBudget(sol, 4, 5)).toEqual({ model: null, downgraded: true });
    expect(applyBudget(luna, 4.9, 5)).toEqual({ model: luna, downgraded: false }); // premium 아니면 그대로
    expect(applyBudget(null, 4.9, 5)).toEqual({ model: null, downgraded: false });
  });

  it("model_used: 실제로 답한 모델 이름 (fallback 이면 그 모델), 강등 표시", () => {
    expect(modelUsed({ provider: "openai", model: "gpt-6-luna" }, false)).toEqual({ id: "gpt-6-luna", label: "GPT-6 Luna", provider: "openai" });
    expect(modelUsed({ provider: "gemini", model: "gemini-3.5-flash-lite" }, true)).toMatchObject({ label: "Gemini 3.5 Flash-Lite", downgraded: true });
    expect(modelUsed({ provider: "gemini", model: "gemini-9-custom" }, false)?.label).toBe("gemini-9-custom");
    expect(modelUsed({ provider: "fake" }, false)).toBeUndefined();
    expect(modelUsed(undefined, false)).toBeUndefined();
  });
});

describe("캐시 키", () => {
  const ctx: UserContext = { userId: null, diet: { vegan: false, vegetarian: false, halal: false, gluten_free: false, dairy_free: false }, allergens: [], tagWeights: {}, exploredCountries: [], exploredFoodIds: [] };
  it("모델 선택마다 다른 키, 자동은 예전 키 그대로", () => {
    const auto = answerCacheKey("오늘은 어디로?", ctx);
    expect(answerCacheKey("오늘은 어디로?", ctx, undefined, null)).toBe(auto);
    const luna = answerCacheKey("오늘은 어디로?", ctx, undefined, "gpt-6-luna");
    const sol = answerCacheKey("오늘은 어디로?", ctx, undefined, "gpt-6.1-sol");
    expect(new Set([auto, luna, sol]).size).toBe(3);
  });
});

// ── orchestrator · 사진 인식 연결 ───────────────────────────
const injeraId = previewId(PREVIEW_FOODS.find((f) => f.slug === "injera")!.n);
const answer = { speech: "에티오피아의 인제라 어때요?", picks: [{ food_id: injeraId, reason: "발효 취향" }], follow_ups: ["문화 이야기", "다른 거"] };
const noEmbed: Embedder = { embed: async () => Promise.reject(new Error("no embed")) };

/** 이름표가 붙은 가짜 LLM: 누가 불렸는지와 usage.model 을 남긴다 */
function tagged(name: string, model: string, log: string[]): LLMProvider {
  return {
    async structured({ operation, image }) {
      log.push(`${name}:${operation}`);
      const data = image ? { is_food: true, candidates: [] } : answer;
      return { data, usage: { provider: name, operation, units: 1, unitType: "tokens", costUsd: 0.001, model } } as never;
    },
  };
}

function setup(spentUsd = 0) {
  const log: string[] = [];
  const repo = previewRepo();
  vi.spyOn(repo, "usageTodayUsd").mockResolvedValue(spentUsd);
  const cacheSet = vi.spyOn(repo, "cacheSet");
  const llmFor = vi.fn((m: { id: string; provider: string }) => tagged(`chosen-${m.provider}`, m.id, log));
  const models: ModelRouter = { ready: only("gemini", "openai"), llmFor };
  const deps = { llm: tagged("default", "gemini-3.5-flash-lite", log), embedder: noEmbed, repo, dailyBudgetUsd: 5, models };
  return { deps, log, llmFor, cacheSet, repo };
}

describe("orchestrator 의 모델 선택", () => {
  it("고른 모델의 체인으로 답하고 model_used 에 표시, 캐시 키에 모델이 들어간다", async () => {
    const { deps, log, llmFor, cacheSet } = setup();
    const res = await ask(deps, { text: "인제라 추천해줘", model: "gpt-6.1-sol" }, null);
    expect(llmFor).toHaveBeenCalledWith(expect.objectContaining({ id: "gpt-6.1-sol", provider: "openai" }));
    expect(log).toEqual(["chosen-openai:generate"]);
    expect(res.model_used).toEqual({ id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "chosen-openai" });
    const ctx = await deps.repo.getUserContext(null);
    expect(cacheSet.mock.calls[0][0]).toBe(answerCacheKey("인제라 추천해줘", ctx, undefined, "gpt-6.1-sol"));
    expect(cacheSet.mock.calls[0][0]).not.toBe(answerCacheKey("인제라 추천해줘", ctx));
  });

  it("목록 밖·키 없는 선택은 무시하고 기본 체인", async () => {
    for (const model of ["gpt-9-ultra", "claude-sonnet-5"]) {
      const { deps, log, llmFor } = setup();
      const res = await ask(deps, { text: "인제라 추천해줘", model }, null);
      expect(llmFor).not.toHaveBeenCalled();
      expect(log).toEqual(["default:generate"]);
      expect(res.model_used?.id).toBe("gemini-3.5-flash-lite");
    }
  });

  it("예산 80% 초과 → premium 선택은 기본 체인 + downgraded 표시, 강등된 답은 캐시하지 않는다", async () => {
    const { deps, log, llmFor, cacheSet } = setup(4.2);
    const res = await ask(deps, { text: "인제라 추천해줘", model: "gemini-3.6-flash" }, null);
    expect(llmFor).not.toHaveBeenCalled();
    expect(log).toEqual(["default:generate"]);
    expect(res.model_used).toMatchObject({ id: "gemini-3.5-flash-lite", downgraded: true });
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it("예산 80% 초과여도 premium 아닌 선택은 그대로", async () => {
    const { deps, llmFor } = setup(4.2);
    await ask(deps, { text: "인제라 추천해줘", model: "gpt-6-luna" }, null);
    expect(llmFor).toHaveBeenCalledWith(expect.objectContaining({ id: "gpt-6-luna" }));
  });

  it("models 가 없는 deps(테스트·eval)는 선택을 무시", async () => {
    const { deps, log } = setup();
    const res = await ask({ ...deps, models: undefined }, { text: "인제라 추천해줘", model: "gpt-6-luna" }, null);
    expect(log).toEqual(["default:generate"]);
    expect(res.model_used?.id).toBe("gemini-3.5-flash-lite");
  });
});

describe("사진 인식도 같은 선택을 따른다", () => {
  const image = { mediaType: "image/jpeg" as const, data: "/9j/AAAA" };
  it("고른 모델 → 그 체인, premium 은 예산 80% 넘으면 기본", async () => {
    const a = setup();
    const r = await recognizeFood(a.deps, image, "gpt-6-luna");
    expect(a.log).toEqual(["chosen-openai:vision"]);
    expect(r.model_used?.id).toBe("gpt-6-luna");

    const b = setup(4.5);
    const r2 = await recognizeFood(b.deps, image, "gpt-6.1-sol");
    expect(b.log).toEqual(["default:vision"]);
    expect(r2.model_used).toMatchObject({ downgraded: true });
  });
});
