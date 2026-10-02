// 서버 STT 체인 실행 (10 문서 §3): 1순위 → 2순위 … 하나가 실패하면 다음 제공자. 전체에 시간 상한을 둔다.
// 순수 로직 — 가짜 제공자로 테스트한다 (stt.test.ts).
import { ProviderError, type STTLang, type STTProvider, type STTResult } from "../types";

export type ChainLink = { id: string; provider: STTProvider };

export type ChainOpts = {
  lang: STTLang;
  keywords?: string[];
  /** 체인 전체 상한 (ms). 사용자는 말을 마치고 기다리는 중이다 */
  budgetMs?: number;
  /** 제공자 하나의 상한 (ms). 남은 전체 시간보다 길면 남은 시간까지만 */
  perTryMs?: number;
  onFail?(id: string, e: unknown): void;
  now?(): number;
};

export const CHAIN_BUDGET_MS = 15_000;
export const PER_TRY_MS = 9_000;
/** 남은 시간이 이보다 짧으면 다음 제공자를 시작하지 않는다 (시작해도 못 끝낸다) */
const MIN_TRY_MS = 1_500;

/**
 * 빈 텍스트도 결과로 본다 (묵음·잡음) → 다음 제공자를 부르지 않는다: 같은 녹음을 또 보내도 대개 비고 비용만 는다.
 * 모두 실패하면 마지막 오류를 던진다.
 */
export async function transcribeWithChain(chain: ChainLink[], audio: Blob, o: ChainOpts): Promise<{ result: STTResult; provider: string; tried: string[] }> {
  const now = o.now ?? Date.now;
  const start = now();
  const budget = o.budgetMs ?? CHAIN_BUDGET_MS;
  const tried: string[] = [];
  let last: unknown = new ProviderError("stt", "준비된 음성 인식 엔진이 없음 (키 확인)", false);
  for (const { id, provider } of chain) {
    const left = budget - (now() - start);
    if (left < MIN_TRY_MS) break;
    tried.push(id);
    try {
      const signal = AbortSignal.timeout(Math.min(o.perTryMs ?? PER_TRY_MS, left));
      const result = await provider.transcribe(audio, { lang: o.lang, keywords: o.keywords, signal });
      return { result: { ...result, text: result.text.trim() }, provider: id, tried };
    } catch (e) {
      last = e;
      o.onFail?.(id, e);
    }
  }
  throw last;
}

/** 선택한 엔진을 맨 앞으로 (없거나 준비 안 됐으면 기본 순서 그대로). 실패하면 기본 체인으로 이어진다 */
export function preferFirst<T extends { id: string }>(chain: T[], preferred?: string | null): T[] {
  if (!preferred) return chain;
  const hit = chain.find((c) => c.id === preferred);
  return hit ? [hit, ...chain.filter((c) => c !== hit)] : chain;
}
