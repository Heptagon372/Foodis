// 외부 API 어댑터 인터페이스 (11 문서 §3).
// 모든 구현체는 Usage 를 돌려주고, Guard 가 이를 api_usage 테이블에 기록한다 → 비용이 항상 보인다.
import type { z } from "zod";

export type Usage = {
  provider: string;
  operation: string;
  units: number;
  unitType: "tokens" | "seconds" | "chars" | "calls";
  costUsd: number;
  /** 실제로 답한 모델 id (LLM). fallback 으로 다른 제공자가 답했을 때도 정확히 보이게 — 응답의 model_used */
  model?: string;
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
    /** 있으면 user 텍스트 앞에 이미지 블록을 붙인다 (Vision). 비전 모델은 제공자별 LLM_*_VISION, 없으면 tier 모델 */
    image?: ImageInput;
  }): Promise<{ data: z.infer<S>; usage: Usage }>;
}

export interface Embedder {
  /** kind: 검색 질의(query, 기본) / 음식 문서(document), titles: 문서 제목(음식 이름, texts 와 같은 순서).
   *  Gemini 임베딩은 둘을 다른 접두어로 만든다 — OpenAI 는 무시 */
  embed(texts: string[], opts?: { kind?: "query" | "document"; titles?: string[] }): Promise<{ vectors: number[][]; usage: Usage }>;
}

/** 서버 STT 언어 힌트: ko = 한국어(사투리 포함) · auto = 언어 자동 감지(외국어) — 10 문서 */
export type STTLang = "ko" | "auto";

export type STTResult = {
  /** 들은 그대로 (사용자에게 보여 준다) */
  text: string;
  /** 감지된 언어 (ISO 639-1, 예: "ko" "en"). 제공자가 모르면 비움 */
  language?: string;
  /** 사투리·외국어를 표준 한국어로 옮긴 문장 — 제공자가 직접 만들 수 있을 때만 (Gemini). 나머지는 normalize 단계가 채운다 */
  standardKo?: string;
  usage: Usage;
};

export interface STTProvider {
  transcribe(audio: Blob, opts: { lang: STTLang; keywords?: string[]; signal?: AbortSignal }): Promise<STTResult>;
}

export type TTSStream = { stream: ReadableStream<Uint8Array>; contentType: string; usage: Usage };

export interface TTSProvider {
  /** 끝까지 합성한 뒤 돌려준다 — 실패를 응답 전에 알 수 있어 fallback 이 확실하다 */
  synthesize(text: string, opts?: { voice?: string }): Promise<{ audio: ReadableStream<Uint8Array>; usage: Usage }>;
  /** 합성되는 대로 흘려보낸다 (첫 음성 지연 단축, 08 문서). 지원하는 제공자만 — 없으면 /api/foodi/tts 가 synthesize 로 간다 */
  stream?(text: string, opts?: { voice?: string }): Promise<TTSStream>;
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
