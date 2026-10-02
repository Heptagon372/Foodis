// LLM 토큰 단가 — api_usage.cost_usd 와 일일 예산(DAILY_BUDGET_USD) 계산의 단일 출처. 가격이 바뀌면 여기만 고친다.
// USD / 1M 토큰, 표준(유료) 등급 · 짧은 프롬프트 구간. 확인일 2026-10-02:
//   Gemini    https://ai.google.dev/gemini-api/docs/pricing
//   OpenAI    https://developers.openai.com/api/docs/pricing
//   Anthropic https://platform.claude.com/docs/en/about-claude/pricing
// 생각(thinking·reasoning) 토큰은 세 회사 모두 출력 단가로 청구된다 → 어댑터가 출력 토큰에 더해서 넘긴다.
export type Price = {
  input: number;
  output: number;
  /** 자동 프롬프트 캐시 적중 입력 (OpenAI). 없으면 input 단가로 (= 보수적으로 크게) 센다 */
  cachedInput?: number;
  /** 이 날짜(UTC, 포함)부터 적용. 없으면 처음부터 */
  from?: string;
};

export const LLM_PRICES: Record<string, Price[]> = {
  // Gemini
  "gemini-3.5-flash-lite": [{ input: 0.3, output: 2.5 }],
  "gemini-3.1-flash-lite": [{ input: 0.25, output: 1.5 }],
  // 3.6~3.8 Flash 는 2026-12-31 까지 할인가, 2027-01-01 부터 두 배
  "gemini-3.6-flash": [{ input: 0.75, output: 3.75 }, { from: "2027-01-01", input: 1.5, output: 7.5 }],
  "gemini-3.7-flash": [{ input: 0.75, output: 3.75 }, { from: "2027-01-01", input: 1.5, output: 7.5 }],
  "gemini-3.8-flash": [{ input: 0.75, output: 3.75 }, { from: "2027-01-01", input: 1.5, output: 7.5 }],
  "gemini-3.5-flash": [{ input: 1.5, output: 9 }],
  "gemini-3.1-pro-preview": [{ input: 2, output: 12 }],
  // OpenAI
  "gpt-6-luna": [{ input: 0.1, output: 0.5, cachedInput: 0.01 }],
  "gpt-6.1-sol": [{ input: 2, output: 10, cachedInput: 0.1 }],
  "gpt-6-sol": [{ input: 2, output: 10, cachedInput: 0.2 }],
  "gpt-5.4-mini": [{ input: 0.75, output: 4.5, cachedInput: 0.075 }],
  "gpt-5.4-nano": [{ input: 0.2, output: 1.25, cachedInput: 0.02 }],
  // Anthropic
  "claude-haiku-4-5": [{ input: 1, output: 5 }],
  "claude-sonnet-5": [{ input: 2, output: 10 }],
  "claude-sonnet-5-5": [{ input: 2, output: 10 }],
};

/** 표에 없는 모델(환경변수로 바꿔 넣은 새 모델 등): 0 으로 세면 예산 가드가 꺼진다 → 비싼 쪽으로 어림 */
export const UNKNOWN_PRICE: Price = { input: 2, output: 10 };

export function priceOf(model: string, now: Date = new Date()): Price | undefined {
  const rows = LLM_PRICES[model];
  if (!rows) return undefined;
  const day = now.toISOString().slice(0, 10);
  // 적용일이 지난 것 중 가장 늦은 것
  return rows.filter((r) => !r.from || r.from <= day).at(-1) ?? rows[0];
}

export type TokenCount = { input: number; output: number; cachedInput?: number };

export function tokenCostUsd(model: string, t: TokenCount, now?: Date): number {
  const p = priceOf(model, now) ?? UNKNOWN_PRICE;
  const cached = Math.min(t.cachedInput ?? 0, t.input);
  return ((t.input - cached) * p.input + cached * (p.cachedInput ?? p.input) + t.output * p.output) / 1e6;
}
