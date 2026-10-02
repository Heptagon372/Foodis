// 외부 API 어댑터 인터페이스 (11 문서 §3).
// 모든 구현체는 Usage 를 돌려주고, Guard 가 이를 api_usage 테이블에 기록한다 → 비용이 항상 보인다.
import type { z } from "zod";

export type Usage = {
  provider: string;
  operation: string;
  units: number;
  unitType: "tokens" | "seconds" | "chars" | "calls";
  costUsd: number;
};

export type ModelTier = "fast" | "smart";

/** 사진 인식(F-VIS-01)용 이미지 입력. 클라이언트가 1024px 이하로 줄여 보낸 base64 (data: 접두사 없이) */
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";
export type ImageInput = { mediaType: ImageMediaType; data: string };

export interface LLMProvider {
  /** zod 스키마를 강제한 구조화 출력. 스키마 위반·거절이면 throw → 호출 측이 대체 경로로 간다. */
  structured<S extends z.ZodType>(req: {
    system: string;
    user: string;
    schema: S;
    model: ModelTier;
    maxTokens: number;
    operation: string;
    /** 있으면 user 텍스트 앞에 이미지 블록을 붙인다 (Vision). 비전 모델은 LLM_MODEL_VISION, 없으면 tier 모델 */
    image?: ImageInput;
  }): Promise<{ data: z.infer<S>; usage: Usage }>;
}

export interface Embedder {
  embed(texts: string[]): Promise<{ vectors: number[][]; usage: Usage }>;
}

export interface STTProvider {
  transcribe(audio: Blob, opts: { lang: "ko"; keywords?: string[] }): Promise<{ text: string; usage: Usage }>;
}

export type TTSStream = { stream: ReadableStream<Uint8Array>; contentType: string; usage: Usage };

/** 목소리 카탈로그(lib/voice/catalog.ts) 한 줄을 제공자 호출로 옮긴 값. 없는 값은 제공자 기본 */
export type TTSOptions = {
  /** 제공자 음성 이름 (Google "ko-KR-Chirp3-HD-Aoede", OpenAI "marin", ElevenLabs "Talia" 또는 voice_id …) */
  voice?: string;
  /** 제공자 모델 id (gpt-4o-mini-tts, eleven_flash_v2_5, gemini-3.8-flash-tts …) */
  model?: string;
  /** 말할 언어 (BCP-47). 현지 발음용 — 없으면 한국어 */
  lang?: string;
  /** 말투 지시 (OpenAI instructions · Gemini style). 지원하지 않는 제공자는 무시 */
  style?: string;
};

export interface TTSProvider {
  /** 끝까지 합성한 뒤 돌려준다 — 실패를 응답 전에 알 수 있어 fallback 이 확실하다. contentType 이 없으면 audio/mpeg */
  synthesize(text: string, opts?: TTSOptions): Promise<{ audio: ReadableStream<Uint8Array>; usage: Usage; contentType?: string }>;
  /** 합성되는 대로 흘려보낸다 (첫 음성 지연 단축, 08 문서). 지원하는 제공자만 — 없으면 /api/foodi/tts 가 synthesize 로 간다 */
  stream?(text: string, opts?: TTSOptions): Promise<TTSStream>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(`[${provider}] ${message}`);
  }
}
