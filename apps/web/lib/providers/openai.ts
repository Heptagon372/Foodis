import OpenAI, { toFile } from "openai";
import { env } from "@/lib/env";
import { audioExt, estimateSeconds, normLang, pickKeywords } from "./stt/common";
import { ttsCostUsd } from "@/lib/voice/pricing";
import { SPEECH_STYLE } from "@/lib/voice/styles";
import { ProviderError, type Embedder, type STTProvider, type TTSOptions, type TTSProvider, type Usage } from "./types";

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

// STT: GPT Transcribe + DB 음식명 키워드 힌트 ("인제라", "하차푸리" 인식 보강). 분당 $0.0045 — 서버 STT 체인의 마지막 안전망 (10 문서)
// gpt-transcribe 는 language 대신 languages[] 를 받고, 감지한 언어를 languages[{code}] 로 돌려준다 (둘 다 보내지 말 것 — 공식 가이드)
export function openaiSTT(c: () => OpenAI = client, model = env.sttModel): STTProvider {
  const modern = model === "gpt-transcribe";
  return {
    transcribe: (audio, { lang, keywords, signal }) =>
      wrap(async () => {
        // API 는 파일 확장자로 형식을 본다: Safari 녹음(mp4)·측정 스크립트(mp3)도 webm 으로 이름 붙이면 거절될 수 있다
        const type = audio.type || "audio/webm";
        const file = await toFile(audio, `speech.${audioExt(type)}`, { type });
        const hint = lang === "ko" ? (modern ? { languages: ["ko"] } : { language: "ko" }) : {}; // auto = 자동 감지
        const words = modern ? pickKeywords(keywords, 100) : [];
        const res = await c().audio.transcriptions.create({ model, file, ...hint, ...(words.length ? { keywords: words } : {}) }, { signal });
        // 길이가 응답에 오면 그걸로, 아니면 바이트로 추정 — 비용 추적용 근사치
        const seconds = res.usage?.type === "duration" ? Math.max(1, Math.ceil(res.usage.seconds)) : estimateSeconds(audio);
        return {
          text: res.text.trim(),
          language: normLang(res.languages?.[0]?.code) ?? (lang === "ko" ? "ko" : undefined),
          usage: { provider: "openai", operation: "stt", units: seconds, unitType: "seconds", costUsd: (seconds / 60) * 0.0045 },
        };
      }),
  };
}

// TTS 후보 B: gpt-4o-mini-tts. 말투 지시(instructions)로 "따뜻한 여행 가이드" 페르소나 연출 (09 문서 §5.4)
// 목소리 13개 중 공식 추천은 marin · cedar (developers.openai.com/api/docs/guides/text-to-speech, 확인 2026-10-02)
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";

/** audio.speech.create 파라미터 (테스트에서 모양 확인). instructions 는 gpt-4o-mini-tts 계열만 받는다 (tts-1 은 무시가 아니라 거절될 수 있어 뺀다) */
export function openaiSpeechParams(text: string, opts?: TTSOptions) {
  const model = opts?.model ?? DEFAULT_TTS_MODEL;
  return {
    model,
    voice: opts?.voice ?? env.openaiTtsVoice,
    input: text,
    ...(model.startsWith("gpt-") ? { instructions: opts?.style ?? SPEECH_STYLE.foodi } : {}),
    response_format: "mp3" as const,
  };
}

export function openaiTTS(): TTSProvider {
  // 헤더가 오면 곧바로 Response 를 준다 — 본문(MP3)은 합성되는 대로 이어서 들어온다
  const open = (text: string, opts?: TTSOptions) =>
    wrap(async () => {
      const res = await client().audio.speech.create(openaiSpeechParams(text, opts));
      if (!res.body) throw new ProviderError("openai", "TTS 응답 본문 없음", true);
      return res;
    });
  // 비용: 분당 $0.015 공식 추정치를 한국어 말 속도로 글자당 값으로 (lib/voice/pricing.ts)
  const usage = (text: string, opts?: TTSOptions): Usage => ({
    provider: "openai",
    operation: "tts",
    units: text.length,
    unitType: "chars",
    costUsd: ttsCostUsd("openai", opts?.model ?? DEFAULT_TTS_MODEL, text.length),
  });
  return {
    async synthesize(text, opts) {
      const res = await open(text, opts);
      // 끝까지 받아 둔다: 본문이 중간에 끊기면 여기서 throw → 다음 제공자로 (응답을 내보낸 뒤엔 되돌릴 수 없다)
      const bytes = await res.arrayBuffer().catch((e: Error) => {
        throw new ProviderError("openai", `TTS 본문 수신 실패: ${e.message}`, true);
      });
      return { audio: new Blob([bytes]).stream(), contentType: "audio/mpeg", usage: usage(text, opts) };
    },
    async stream(text, opts) {
      const res = await open(text, opts);
      return { stream: res.body as ReadableStream<Uint8Array>, contentType: "audio/mpeg", usage: usage(text, opts) };
    },
  };
}
