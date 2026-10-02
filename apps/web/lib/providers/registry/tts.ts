// 음성 합성(TTS) 선택. 1순위 → 2순위 순서, 하나가 죽으면 다음 것으로 (11 문서 §6). 최종 fallback 은 브라우저 speechSynthesis.
import { env } from "@/lib/env";
import { googleTTS } from "../google-tts";
import { openaiTTS } from "../openai";
import type { TTSProvider } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

const googleReady = () => Boolean(env.googleTtsCredentials || process.env.GOOGLE_APPLICATION_CREDENTIALS);
const openaiReady = () => Boolean(process.env.OPENAI_API_KEY);

/** 자격 증명이 없는 제공자는 뺀다 — Google 클라이언트는 키가 없으면 기본 자격 증명을 찾느라 십수 초를 기다린 뒤 실패한다 */
export const getTTSChain = lazy<TTSProvider[]>(() => {
  const chain: [boolean, () => TTSProvider][] = env.ttsProvider === "openai" ? [[openaiReady(), openaiTTS], [googleReady(), googleTTS]] : [[googleReady(), googleTTS], [openaiReady(), openaiTTS]];
  return chain.filter(([ok]) => ok).map(([, make]) => make());
});

export const ttsStatus = (): ProviderStatus[] => [
  { id: "google", ready: googleReady() },
  { id: "openai", ready: openaiReady() },
];
