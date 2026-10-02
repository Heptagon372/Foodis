import OpenAI, { toFile } from "openai";
import { env } from "@/lib/env";
import { ProviderError, type Embedder, type STTProvider, type TTSProvider, type Usage } from "./types";

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
        // API 는 파일 확장자로 형식을 본다: Safari 녹음(mp4)·측정 스크립트(mp3)도 webm 으로 이름 붙이면 거절될 수 있다
        const type = audio.type || "audio/webm";
        const ext = type.includes("mpeg") || type.includes("mp3") ? "mp3" : type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
        const file = await toFile(audio, `speech.${ext}`, { type });
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
  // 헤더가 오면 곧바로 Response 를 준다 — 본문(MP3)은 합성되는 대로 이어서 들어온다
  const open = (text: string, voice?: string) =>
    wrap(async () => {
      const res = await client().audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: voice ?? env.openaiTtsVoice,
        input: text,
        instructions: "밝고 호기심 많은 여행 친구처럼, 또박또박 자연스러운 한국어로 말한다.",
        response_format: "mp3",
      });
      if (!res.body) throw new ProviderError("openai", "TTS 응답 본문 없음", true);
      return res;
    });
  const usage = (text: string): Usage => {
    const seconds = text.length / 15; // 한국어 약 15자/초
    return { provider: "openai", operation: "tts", units: text.length, unitType: "chars", costUsd: (seconds / 60) * 0.015 };
  };
  return {
    async synthesize(text, opts) {
      const res = await open(text, opts?.voice);
      // 끝까지 받아 둔다: 본문이 중간에 끊기면 여기서 throw → 다음 제공자로 (응답을 내보낸 뒤엔 되돌릴 수 없다)
      const bytes = await res.arrayBuffer().catch((e: Error) => {
        throw new ProviderError("openai", `TTS 본문 수신 실패: ${e.message}`, true);
      });
      return { audio: new Blob([bytes]).stream(), usage: usage(text) };
    },
    async stream(text, opts) {
      const res = await open(text, opts?.voice);
      return { stream: res.body as ReadableStream<Uint8Array>, contentType: "audio/mpeg", usage: usage(text) };
    },
  };
}
