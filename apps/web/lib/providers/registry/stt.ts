// 서버 음성 인식(STT) 선택 (10 문서 §3). 브라우저 Web Speech 가 안 되거나, 음성 설정이 "정확하게(서버)"일 때 쓰인다.
// 언어 힌트별 체인: ko = STT_KO, auto = STT_MULTI. 키가 없는 엔진은 빼고, 사용자가 고른 엔진은 맨 앞에 둔다.
import { env } from "@/lib/env";
import { openaiSTT } from "../openai";
import { preferFirst, transcribeWithChain, type ChainLink } from "../stt/chain";
import { clovaSTT } from "../stt/clova";
import { elevenlabsSTT } from "../stt/elevenlabs";
import { geminiSTT } from "../stt/gemini";
import type { STTLang, STTProvider } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

export const STT_ENGINE_IDS = ["elevenlabs", "clova", "gemini", "openai"] as const;
export type STTEngineId = (typeof STT_ENGINE_IDS)[number];

type EngineDef = {
  label_ko: string;
  desc_ko: string;
  /** 지원하는 언어 힌트. clova 는 한국어 전용 */
  langs: STTLang[];
  ready(): boolean;
  make(): STTProvider;
};

export const STT_ENGINES: Record<STTEngineId, EngineDef> = {
  elevenlabs: {
    label_ko: "ElevenLabs Scribe",
    desc_ko: "사투리·외국어 자동 감지",
    langs: ["ko", "auto"],
    ready: () => Boolean(env.sttElevenlabsKey),
    make: () => elevenlabsSTT({ apiKey: env.sttElevenlabsKey!, model: env.sttElevenlabsModel }),
  },
  clova: {
    label_ko: "네이버 CLOVA",
    desc_ko: "한국어 전용 엔진",
    langs: ["ko"],
    ready: () => Boolean(env.sttClovaSecret),
    make: () => clovaSTT({ secret: env.sttClovaSecret!, url: env.sttClovaUrl }),
  },
  gemini: {
    label_ko: "Gemini",
    desc_ko: "알아듣고 표준어로 바로 정리",
    langs: ["ko", "auto"],
    ready: () => Boolean(env.sttGeminiKey),
    make: () => geminiSTT({ apiKey: env.sttGeminiKey!, model: env.sttGeminiModel }),
  },
  openai: {
    label_ko: "OpenAI Transcribe",
    desc_ko: "음식 이름 힌트 · 안정적",
    langs: ["ko", "auto"],
    ready: () => Boolean(process.env.OPENAI_API_KEY),
    make: () => openaiSTT(),
  },
};

const isEngine = (id: string): id is STTEngineId => (STT_ENGINE_IDS as readonly string[]).includes(id);

/** "elevenlabs, clova,openai" → 알려진 id 만, 중복 없이. 비거나 다 틀리면 기본값 */
export function parseChain(raw: string | undefined, fallback: STTEngineId[]): STTEngineId[] {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s, i, a) => isEngine(s) && a.indexOf(s) === i) as STTEngineId[];
  return ids.length ? ids : fallback;
}

export const configuredChain = (lang: STTLang): STTEngineId[] =>
  lang === "ko" ? parseChain(env.sttChainKo, ["elevenlabs", "clova", "gemini", "openai"]) : parseChain(env.sttChainMulti, ["elevenlabs", "gemini", "openai"]);

/**
 * 실제로 돌릴 체인. 사용자가 고른 엔진은 허용 목록 + 키 있음 + 이 언어 지원일 때만 맨 앞에 (체인에 없던 엔진이어도).
 * engines 를 바꿔 끼우면 테스트에서 가짜 엔진으로 돈다.
 */
export function resolveChain(lang: STTLang, preferred?: string | null, engines: Record<string, EngineDef> = STT_ENGINES, order: string[] = configuredChain(lang)): ChainLink[] {
  const usable = (id: string) => Boolean(engines[id]?.ready() && engines[id].langs.includes(lang));
  const ids = order.filter(usable);
  const pick = preferred && usable(preferred) ? preferred : null;
  const withPick = pick && !ids.includes(pick) ? [pick, ...ids] : ids;
  return preferFirst(
    withPick.map((id) => ({ id, provider: engineInstance(id, engines) })),
    pick,
  );
}

// 어댑터는 가볍지만 같은 걸 매번 만들 필요는 없다
const instances = new Map<EngineDef, STTProvider>();
function engineInstance(id: string, engines: Record<string, EngineDef>): STTProvider {
  const def = engines[id];
  let p = instances.get(def);
  if (!p) instances.set(def, (p = def.make()));
  return p;
}

/** 예전 호출(단일 제공자)과 측정 스크립트용: opts.lang 에 맞는 체인을 하나의 제공자처럼 */
export const getSTT = lazy<STTProvider>(() => ({
  async transcribe(audio, opts) {
    const { result } = await transcribeWithChain(resolveChain(opts.lang), audio, { lang: opts.lang, keywords: opts.keywords });
    return result;
  },
}));

/** /api/health 용 한 줄씩 (키 값은 넣지 않는다) */
export const sttStatus = (): ProviderStatus[] =>
  STT_ENGINE_IDS.map((id) => ({ id, ready: STT_ENGINES[id].ready(), note: STT_ENGINES[id].langs.length === 1 ? "한국어 전용" : undefined }));

/** GET /api/foodi/stt — 설정 화면이 엔진 칩·순서를 그린다 (키 값은 넣지 않는다) */
export function sttEngineStatus() {
  return {
    engines: STT_ENGINE_IDS.map((id) => {
      const e = STT_ENGINES[id];
      return { id, label_ko: e.label_ko, desc_ko: e.desc_ko, ready: e.ready(), langs: e.langs };
    }),
    chains: { ko: configuredChain("ko"), auto: configuredChain("auto") },
    normalize: env.sttNormalize && Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
