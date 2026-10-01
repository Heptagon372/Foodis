// 환경변수로 구현체 선택 (11 문서 §3). 코드 수정 없이 Haiku↔Sonnet, Google↔OpenAI TTS 교체.
// 지연 생성: 키가 없는 빌드·테스트 환경에서 import 만으로 실패하지 않게 한다.
import { env } from "@/lib/env";
import { anthropicLLM } from "./anthropic";
import { googleTTS } from "./google-tts";
import { openaiEmbedder, openaiSTT, openaiTTS } from "./openai";
import type { Embedder, LLMProvider, STTProvider, TTSProvider } from "./types";

const lazy = <T>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};

export const getLLM = lazy<LLMProvider>(() => anthropicLLM()); // LLM_PROVIDER=openai 어댑터는 비용 압박 시 추가
export const getEmbedder = lazy<Embedder>(openaiEmbedder);
export const getSTT = lazy<STTProvider>(openaiSTT);

/** 1순위 → 2순위 순서. 하나가 죽으면 다음 것으로 (11 문서 §6). 최종 fallback 은 브라우저 speechSynthesis.
 *  자격 증명이 없는 제공자는 뺀다 — Google 클라이언트는 키가 없으면 기본 자격 증명을 찾느라 십수 초를 기다린 뒤 실패한다. */
export const getTTSChain = lazy<TTSProvider[]>(() => {
  const google = Boolean(env.googleTtsCredentials || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const chain: [boolean, () => TTSProvider][] = env.ttsProvider === "openai" ? [[openai, openaiTTS], [google, googleTTS]] : [[google, googleTTS], [openai, openaiTTS]];
  return chain.filter(([ok]) => ok).map(([, make]) => make());
});

export * from "./types";
