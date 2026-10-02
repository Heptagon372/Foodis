// LLM 어댑터(gemini · openai-llm · anthropic) 공통 규칙: 출력 오류 구분, 스키마 변환·검증, 재시도 판단, 타임아웃.
import { z } from "zod";
import { ProviderError } from "./types";

/**
 * 호출은 성공했지만 쓸 수 없는 출력 (스키마 위반 · 거절 · 안전 차단 · 출력 잘림).
 * fallback 체인은 이 오류에서 다음 제공자로 넘어가지 않는다 — orchestrator 가 1회 재생성 → 템플릿으로 처리한다 (registry/llm.ts).
 */
export class LLMOutputError extends ProviderError {
  constructor(provider: string, message: string) {
    super(provider, message, false);
  }
}

/** 요청 타임아웃 (ms). 답변 예산 1.5초(11 문서 §4)의 여유분까지만 기다리고 다음 제공자로 넘긴다. 사진은 이미지 처리 때문에 길게 */
export const LLM_TIMEOUT_MS = { fast: 4_000, smart: 6_000, image: 12_000 } as const;

/** 429 · 408 · 5xx 는 잠깐의 장애 → 다시 시도할 만하다. 400 · 401 · 402 · 403 · 404 는 설정·요청 문제
 *  (Gemini 문제 해결 문서: "Only retry on transient errors (like 429, 408, or 5xx)", 확인일 2026-10-02) */
export const isTransientStatus = (status: number | undefined) => status === undefined || status === 408 || status === 429 || status >= 500;

/** fetch 단계 오류(연결 끊김·DNS·타임아웃 abort): 응답 자체가 없었으므로 일시 장애로 본다 */
export function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "AbortError" || e.name === "TimeoutError" || (e instanceof TypeError && /fetch|network|socket/i.test(e.message)) || /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/.test(e.message);
}

/**
 * zod v4 → JSON Schema (z.toJSONSchema). "$schema" 키는 Gemini responseJsonSchema 지원 목록에 없어 뺀다.
 * nullable 은 "type": ["string", "null"] 로 나온다 — Gemini 문서의 nullable 표기와 같다. (OpenAI 는 zodTextFormat 이 따로 변환)
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
  delete out.$schema;
  return out;
}

/** 모델이 낸 JSON 텍스트를 zod 로 다시 검증한다. 제공자의 구조화 출력을 믿되, 앱이 기대하는 모양인지는 우리가 확인한다 */
export function parseStructured<S extends z.ZodType>(provider: string, schema: S, text: string | undefined): z.infer<S> {
  if (!text?.trim()) throw new LLMOutputError(provider, "빈 응답");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LLMOutputError(provider, "JSON 이 아닌 응답");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new LLMOutputError(provider, `스키마 위반: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ").slice(0, 200)}`);
  return r.data;
}
