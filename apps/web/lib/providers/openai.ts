import OpenAI, { toFile } from "openai";
import { env } from "@/lib/env";
import { ProviderError, type Embedder, type STTProvider, type TTSProvider } from "./types";

let shared: OpenAI | undefined;
const client = () => (shared ??= new OpenAI({ timeout: 8_000, maxRetries: 1 }));

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OpenAI.APIError) throw new ProviderError("openai", e.message, (e.status ?? 500) >= 429);
    throw e;
  }
};

// 임베딩: text-embedding-3-small, $0.02 / 1M 토큰, 1536차원 (match_foods 의 vector(1536) 과 일치해야 함)
export function openaiEmbedder(): Embedder {
  return {
    embed: (texts) =>
      wrap(async () => {
        const res = await client().embeddings.create({ model: env.embeddingModel, input: texts });
        return {
          vectors: res.data.map((d) => d.embedding),
          usage: { provider: "openai", operation: "embed", units: res.usage.total_tokens, unitType: "tokens", costUsd: (res.usage.total_tokens * 0.02) / 1e6 },
        };
      }),
  };
}

// STT fallback: GPT Transcribe + DB 음식명 키워드 힌트 ("인제라", "하차푸리" 인식 보강). 분당 $0.0045
export function openaiSTT(): STTProvider {
  return {
    transcribe: (audio, { lang, keywords }) =>
      wrap(async () => {
        const file = await toFile(audio, "speech.webm", { type: audio.type || "audio/webm" });
        const res = await client().audio.transcriptions.create({
          model: env.sttModel,
          file,
          language: lang,
          ...(keywords?.length && env.sttModel === "gpt-transcribe" ? { keywords } : {}),
        });
        // 길이를 응답에서 알 수 없어 바이트로 추정 (webm/opus ≈ 4KB/초) — 비용 추적용 근사치
        const seconds = Math.max(1, Math.round(audio.size / 4000));
        return { text: res.text.trim(), usage: { provider: "openai", operation: "stt", units: seconds, unitType: "seconds", costUsd: (seconds / 60) * 0.0045 } };
      }),
  };
}

// TTS 후보 B: gpt-4o-mini-tts. 말투 지시로 "호기심 많은 여행 친구" 페르소나 연출 (09 문서 §5.4)
export function openaiTTS(): TTSProvider {
  return {
    synthesize: (text, opts) =>
      wrap(async () => {
        const res = await client().audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice: opts?.voice ?? env.openaiTtsVoice,
          input: text,
          instructions: "밝고 호기심 많은 여행 친구처럼, 또박또박 자연스러운 한국어로 말한다.",
          response_format: "mp3",
        });
        if (!res.body) throw new ProviderError("openai", "TTS 응답 본문 없음", true);
        const seconds = text.length / 15; // 한국어 약 15자/초
        return {
          audio: res.body as ReadableStream<Uint8Array>,
          usage: { provider: "openai", operation: "tts", units: text.length, unitType: "chars", costUsd: (seconds / 60) * 0.015 },
        };
      }),
  };
}
