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

export interface TTSProvider {
  synthesize(text: string, opts?: { voice?: string }): Promise<{ audio: ReadableStream<Uint8Array>; usage: Usage }>;
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
