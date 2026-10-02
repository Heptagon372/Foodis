// '푸디의 두뇌' — 사용자가 고를 수 있는 답변 모델 목록(allowlist). 클라이언트가 보낸 값은 이 목록으로만 받아들인다.
// 가격은 llm-prices.ts (단일 출처) 에서 오늘 기준으로 읽는다. 키 상태(ready)는 서버가 registry/llm.ts 로 붙인다.
// 설계: docs/design/09_AI_제공자_구성_v2.md "사용자 모델 선택"
import type { ModelUsed } from "@/lib/foodi/schema";
import { priceOf, UNKNOWN_PRICE } from "@/lib/providers/llm-prices";

export const LLM_PROVIDER_IDS = ["gemini", "openai", "anthropic"] as const;
export type LLMProviderId = (typeof LLM_PROVIDER_IDS)[number];
export const PROVIDER_LABEL: Record<LLMProviderId, string> = { gemini: "Google Gemini", openai: "OpenAI GPT", anthropic: "Anthropic Claude" };

export type ModelSpeed = "fast" | "normal" | "slow";
export type ModelInfo = {
  id: string;
  provider: LLMProviderId;
  label_ko: string;
  /** 한 줄 설명 (빠름 · 똑똑함 · 저렴 같은) */
  desc_ko: string;
  speed: ModelSpeed;
  /** 기본 두뇌(Gemini 3.5 Flash-Lite) 답 1건보다 2배 이상 비싸면 premium — 오늘 사용액이 예산의 80% 를 넘으면 기본 체인으로 내려간다 */
  premium: boolean;
  /** USD / 1M 토큰, 오늘 기준 */
  price: { input: number; output: number };
};

type Entry = Omit<ModelInfo, "price">;
// 답 1건(입력 2,500 · 출력 250 토큰) 어림: Flash-Lite $0.0014 · Luna $0.0004 · 3.6 Flash $0.0028(2027 $0.0056) · Haiku $0.0038 · Sonnet 5 · Sol $0.0075+
const ENTRIES: readonly Entry[] = [
  { id: "gemini-3.5-flash-lite", provider: "gemini", label_ko: "Gemini 3.5 Flash-Lite", desc_ko: "빠르고 저렴한 기본 두뇌", speed: "fast", premium: false },
  { id: "gemini-3.6-flash", provider: "gemini", label_ko: "Gemini 3.6 Flash", desc_ko: "설명이 더 풍부해요 · 조금 느려요", speed: "normal", premium: true },
  { id: "gpt-6-luna", provider: "openai", label_ko: "GPT-6 Luna", desc_ko: "가장 저렴하고 빨라요", speed: "fast", premium: false },
  { id: "gpt-6.1-sol", provider: "openai", label_ko: "GPT-6.1 Sol", desc_ko: "가장 똑똑해요 · 느리고 비싸요", speed: "slow", premium: true },
  { id: "claude-haiku-4-5", provider: "anthropic", label_ko: "Claude Haiku 4.5", desc_ko: "빠르고 차분한 설명", speed: "fast", premium: true },
  { id: "claude-sonnet-5", provider: "anthropic", label_ko: "Claude Sonnet 5", desc_ko: "깊이 있는 이야기 · 비싸요", speed: "normal", premium: true },
];

const withPrice = (e: Entry, now: Date): ModelInfo => {
  const p = priceOf(e.id, now) ?? UNKNOWN_PRICE;
  return { ...e, price: { input: p.input, output: p.output } };
};

export function modelCatalog(now: Date = new Date()): ModelInfo[] {
  return ENTRIES.map((e) => withPrice(e, now));
}

export function findModel(id: string, now: Date = new Date()): ModelInfo | undefined {
  const e = ENTRIES.find((x) => x.id === id);
  return e && withPrice(e, now);
}

/** 요청의 model 값 검증: 목록에 있고 그 제공자가 준비(활성 + 키)됐을 때만. 아니면 null → 기본 체인. 잘못된 값으로 답을 막지는 않는다 */
export function allowedModel(id: unknown, ready: (p: LLMProviderId) => boolean): ModelInfo | null {
  if (typeof id !== "string" || !id) return null;
  const m = findModel(id);
  return m && ready(m.provider) ? m : null;
}

/** 오늘 사용액이 일일 예산의 이 비율을 넘으면 premium 선택을 기본 체인으로 내린다 */
export const PREMIUM_BUDGET_RATIO = 0.8;

export type ModelChoice = { model: ModelInfo | null; downgraded: boolean };

export function applyBudget(model: ModelInfo | null, spentUsd: number, budgetUsd: number): ModelChoice {
  if (model?.premium && spentUsd >= budgetUsd * PREMIUM_BUDGET_RATIO) return { model: null, downgraded: true };
  return { model, downgraded: false };
}

/** 응답의 model_used: 실제로 답한 모델(usage.model). fallback 으로 다른 제공자가 답했으면 그 모델이 보인다 */
export function modelUsed(usage: { model?: string; provider: string } | undefined, downgraded: boolean): ModelUsed | undefined {
  if (!usage?.model) return undefined;
  return { id: usage.model, label: findModel(usage.model)?.label_ko ?? usage.model, provider: usage.provider, ...(downgraded ? { downgraded: true as const } : {}) };
}
