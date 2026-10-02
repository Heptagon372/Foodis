// 답변·의도·사진 인식 LLM 선택 (11 문서 §3 · docs/design/09_AI_제공자_구성_v2.md). 이 파일은 LLM 영역만 담당한다.
//
// fallback 정책 — LLM_PROVIDERS 순서(기본 gemini,openai)대로:
//   · 키 없는 제공자는 호출 없이 건너뛴다. 전부 없으면 ProviderError("preview") — 라우트가 미리보기 안내를 낸다.
//   · 장애(429·408·5xx·시간 초과·연결 오류)와 설정 오류(401·403·404·400·402)는 다음 제공자로 넘어간다.
//     설정 오류도 넘기는 이유: 한 회사 키가 막혀도 다른 회사는 독립이라 답할 수 있다.
//   · 실패한 제공자는 30초 동안 순서 맨 뒤로 (매 질문마다 4초 타임아웃을 다시 기다리지 않게). 전부 쉬는 중이면 원래 순서로 다 시도.
//   · 응답은 왔지만 쓸 수 없는 출력(LLMOutputError: 스키마 위반·거절·안전 차단·잘림)은 넘기지 않는다.
//     orchestrator 가 이미 1회 재생성 → DB 템플릿으로 처리하고, 다른 회사에 같은 요청을 또 보내면 지연·비용만 두 배가 된다.
import Anthropic from "@anthropic-ai/sdk";
import { LLM_PROVIDER_IDS, type LLMProviderId } from "@/lib/ai/models";
import { env } from "@/lib/env";
import { anthropicLLM } from "../anthropic";
import { geminiLLM } from "../gemini";
import { LLM_TIMEOUT_MS, LLMOutputError } from "../llm-common";
import { openaiLLM } from "../openai-llm";
import { ProviderError, type LLMProvider } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

const KEY: Record<LLMProviderId, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };

/** LLM_PROVIDERS 에 적힌 순서 (모르는 이름·중복은 버린다) */
export const enabledProviders = (): LLMProviderId[] =>
  [...new Set(env.llmProviders)].filter((p): p is LLMProviderId => (LLM_PROVIDER_IDS as readonly string[]).includes(p));

const hasKey = (p: LLMProviderId) => Boolean(process.env[KEY[p]]);
/** 활성(LLM_PROVIDERS) + 키 있음 */
export const llmProviderReady = (p: LLMProviderId) => enabledProviders().includes(p) && hasKey(p);
/** 답할 수 있는 제공자가 하나라도 있나 — 없으면 deps 가 미리보기(템플릿) 모드로 */
export const llmReady = () => enabledProviders().some(hasKey);

/** 제공자별 tier 모델 (환경변수). override 는 사용자가 고른 답변 모델 — smart 와 사진(vision)에 쓴다 */
export type ModelOverride = { smart: string };

export function tierModels(p: LLMProviderId): { fast: string; smart: string; vision?: string } {
  if (p === "gemini") return { fast: env.llmGeminiFast, smart: env.llmGeminiSmart, vision: env.llmGeminiVision };
  if (p === "openai") return { fast: env.llmOpenaiFast, smart: env.llmOpenaiSmart, vision: env.llmOpenaiVision };
  return { fast: env.llmAnthropicFast, smart: env.llmAnthropicSmart, vision: env.llmAnthropicVision };
}

function makeProvider(p: LLMProviderId, o?: ModelOverride): LLMProvider {
  const m = tierModels(p);
  const smart = o?.smart ?? m.smart;
  const vision = o?.smart ?? m.vision;
  if (p === "gemini") return geminiLLM({ models: { fast: m.fast, smart, vision, fastThinking: env.llmGeminiFastThinking, smartThinking: env.llmGeminiSmartThinking } });
  if (p === "openai") return openaiLLM({ models: { fast: m.fast, smart, vision, fastEffort: env.llmOpenaiFastEffort, smartEffort: env.llmOpenaiSmartEffort } });
  return anthropicLLM(anthropicClient(), { fast: m.fast, smart, vision, smartEffort: env.llmAnthropicSmartEffort });
}

// SDK 클라이언트는 하나만 (사용자 선택마다 어댑터를 새로 만들어도 연결은 재사용). Gemini·OpenAI 는 각 어댑터 파일이 공유 클라이언트를 둔다
const anthropicClient = lazy(() => new Anthropic({ timeout: LLM_TIMEOUT_MS.fast, maxRetries: 1 }));

export type LLMMember = { id: string; ready: () => boolean; make: () => LLMProvider };

/** 제공자별 최근 실패 시각 → 이 시각까지 순서 맨 뒤로. 모듈 하나에서 공유 (기본 체인·사용자 선택 체인 모두) */
const sharedCooldown = new Map<string, number>();
export const LLM_COOLDOWN_MS = 30_000;

type FallbackOpts = { now?: () => number; cooldownMs?: number; cooldown?: Map<string, number>; log?: (msg: string) => void };

export function fallbackLLM(members: LLMMember[], opts: FallbackOpts = {}): LLMProvider {
  const now = opts.now ?? Date.now;
  const cooldownMs = opts.cooldownMs ?? LLM_COOLDOWN_MS;
  const cooldown = opts.cooldown ?? sharedCooldown;
  // 키 값은 오류 메시지에 들어 있지 않다(SDK 오류 본문). 그래도 길이는 자른다
  const log = opts.log ?? ((msg: string) => console.warn(msg));
  return {
    async structured(req) {
      const live = members.filter((m) => m.ready());
      if (!live.length) throw new ProviderError("preview", "LLM 키 없음 (GEMINI_API_KEY · OPENAI_API_KEY)", false);
      const t = now();
      const resting = (m: LLMMember) => (cooldown.get(m.id) ?? 0) > t;
      const order = [...live.filter((m) => !resting(m)), ...live.filter(resting)];
      let last: unknown;
      for (const m of order) {
        try {
          const r = await m.make().structured(req);
          cooldown.delete(m.id);
          return r;
        } catch (e) {
          if (e instanceof LLMOutputError) throw e;
          cooldown.set(m.id, now() + cooldownMs);
          log(`[llm] ${m.id} 실패 → 다음 제공자: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`);
          last = e;
        }
      }
      if (last instanceof ProviderError) throw last;
      throw new ProviderError("llm", last instanceof Error ? last.message : "모든 LLM 제공자 실패", true);
    },
  };
}

const defaultAdapters = Object.fromEntries(LLM_PROVIDER_IDS.map((p) => [p, lazy(() => makeProvider(p))])) as Record<LLMProviderId, () => LLMProvider>;
const member = (p: LLMProviderId, o?: ModelOverride): LLMMember => ({ id: p, ready: () => llmProviderReady(p), make: o ? lazy(() => makeProvider(p, o)) : defaultAdapters[p] });

/** 기본 체인 (LLM_PROVIDERS 순서) */
export const getLLM = lazy<LLMProvider>(() => fallbackLLM(enabledProviders().map((p) => member(p))));

/** 사용자 선택 체인의 순서: 고른 제공자(답변·사진 = 고른 모델) → 나머지 활성 제공자(각자 기본 모델) */
export function choiceChain(choice: { provider: LLMProviderId; id: string }, enabled: LLMProviderId[]): { id: LLMProviderId; override?: ModelOverride }[] {
  return [{ id: choice.provider, override: { smart: choice.id } }, ...enabled.filter((p) => p !== choice.provider).map((id) => ({ id }))];
}

/** 사용자가 고른 답변 모델: 그 제공자를 맨 앞에 두고 smart·사진은 그 모델로, 의도 분류(fast)는 그 제공자의 fast 모델로. 실패하면 나머지는 기본 순서 */
export function llmFor(choice: { provider: LLMProviderId; id: string }): LLMProvider {
  return fallbackLLM(choiceChain(choice, enabledProviders()).map((c) => member(c.id, c.override)));
}

/** /api/health 용: 제공자별 준비 상태 + 고른 모델 (키 값은 절대 넣지 않는다) */
export const llmStatus = (): ProviderStatus[] =>
  LLM_PROVIDER_IDS.map((p) => {
    const m = tierModels(p);
    const on = enabledProviders().includes(p);
    return { id: p, ready: llmProviderReady(p), note: `${on ? "" : "꺼짐(LLM_PROVIDERS 밖) · "}${hasKey(p) ? "" : `${KEY[p]} 없음 · `}fast ${m.fast} · smart ${m.smart}` };
  });

/** 실행 순서와 tier 모델 요약 (health · bench 표기용) */
export const llmModels = () => ({
  order: enabledProviders(),
  models: Object.fromEntries(enabledProviders().map((p) => [p, tierModels(p)])) as Partial<Record<LLMProviderId, ReturnType<typeof tierModels>>>,
});
