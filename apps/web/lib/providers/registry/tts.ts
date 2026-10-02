// 음성 합성(TTS) 선택. 목소리 카탈로그(lib/voice/catalog.ts)의 5개 제공자 중 키가 있는 것만 쓴다 (design/11 문서).
// 순서: 사용자가 고른 목소리 → 기본 체인(TTS_PROVIDER 먼저, 나머지는 아래 순서) → 모두 실패하면 브라우저 speechSynthesis (11 문서 §6).
import { env } from "@/lib/env";
import { DEFAULT_VOICE, findVoice, TTS_PROVIDERS, VOICES, type TTSProviderId } from "@/lib/voice/catalog";
import { planTTS, type PlannedVoice, type TTSRequest } from "@/lib/voice/plan";
import { clovaTTS } from "../clova-tts";
import { elevenlabsTTS } from "../elevenlabs-tts";
import { geminiTTS } from "../gemini-tts";
import { googleTTS } from "../google-tts";
import { openaiTTS } from "../openai";
import type { TTSAttempt } from "../tts-response";
import type { TTSProvider } from "../types";
import { lazy, type ProviderStatus } from "./lazy";

/** 자격 증명이 없는 제공자는 뺀다 — Google 클라이언트는 키가 없으면 기본 자격 증명을 찾느라 십수 초를 기다린 뒤 실패한다 */
const READY: Record<TTSProviderId, () => boolean> = {
  google: () => Boolean(env.googleTtsCredentials || process.env.GOOGLE_APPLICATION_CREDENTIALS),
  openai: () => Boolean(process.env.OPENAI_API_KEY),
  gemini: () => Boolean(env.geminiApiKey),
  elevenlabs: () => Boolean(env.elevenlabsApiKey),
  clova: () => Boolean(env.clovaKeyId && env.clovaKey),
};
export const ttsReady = (p: TTSProviderId) => READY[p]();

const MAKE: Record<TTSProviderId, () => TTSProvider> = { google: googleTTS, openai: openaiTTS, gemini: geminiTTS, elevenlabs: elevenlabsTTS, clova: clovaTTS };
const instances = new Map<TTSProviderId, TTSProvider>();
const provider = (p: TTSProviderId) => instances.get(p) ?? (instances.set(p, MAKE[p]()), instances.get(p)!);

/** 기본 체인: TTS_PROVIDER 를 1순위로, 제공자마다 기본 음성 하나 (Google·OpenAI 는 env 음성) */
export const defaultChain = lazy<PlannedVoice[]>(() => {
  const first = TTS_PROVIDERS.includes(env.ttsProvider) ? env.ttsProvider : "google";
  const order = [first, ...TTS_PROVIDERS.filter((p) => p !== first)];
  return order.filter(ttsReady).map((p): PlannedVoice => {
    if (p === "google") return { provider: p, voice: env.googleTtsVoice, id: VOICES.find((v) => v.provider === p && v.voice === env.googleTtsVoice)?.id ?? null };
    if (p === "openai") return { provider: p, voice: env.openaiTtsVoice, model: "gpt-4o-mini-tts", id: VOICES.find((v) => v.provider === p && v.voice === env.openaiTtsVoice)?.id ?? null };
    const e = findVoice(DEFAULT_VOICE[p])!;
    return { provider: p, voice: e.voice, model: e.model, id: e.id };
  });
});

/** 요청 → 시도 목록 (route 가 ttsResponse 에 넘긴다) */
export function ttsAttempts(req: TTSRequest): TTSAttempt[] {
  return planTTS(req, { ready: ttsReady, chain: defaultChain() }).map((v) => ({
    tts: provider(v.provider),
    provider: v.provider,
    voiceId: v.id,
    opts: { voice: v.voice, model: v.model, lang: v.lang, style: v.style },
  }));
}

export const ttsStatus = (): ProviderStatus[] => TTS_PROVIDERS.map((id) => ({ id, ready: ttsReady(id) }));
