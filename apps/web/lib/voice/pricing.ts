// TTS 단가 (USD, 목록가 · 월 무료 구간은 빼지 않는다 → 일일 예산 가드가 보수적으로 동작). 확인일 2026-10-02, 출처는 design/11 문서 §5.
// 글자 기준이 아닌 제공자(OpenAI·Gemini 는 오디오 토큰/분)는 한국어 말 속도로 글자당 값으로 바꾼다.
import type { TTSProviderId } from "./catalog";

/** 한국어 TTS 말 속도 어림 (공백·문장부호 포함). 라디오 자막(radio.ts CHARS_PER_SEC)과 같은 값 — 작게 잡을수록 비용을 크게 본다 */
export const KO_CHARS_PER_SEC = 7;

// Google Cloud TTS — https://cloud.google.com/text-to-speech/pricing
//   Standard·WaveNet $4 / 100만 자 (월 400만 자 무료), Neural2 $16 (월 100만 자 무료), Chirp 3 HD $30 (월 100만 자 무료), Studio $160
const GOOGLE_PER_1M: [RegExp, number][] = [
  [/Chirp3-HD|Chirp-HD/i, 30],
  [/Studio/i, 160],
  [/Neural2|Polyglot/i, 16],
  [/Wavenet|Standard/i, 4],
];

// OpenAI gpt-4o-mini-tts — https://developers.openai.com/api/docs/models/gpt-4o-mini-tts
//   텍스트 입력 $0.60 / 100만 토큰 + 오디오 출력 $12 / 100만 토큰 ≈ 분당 $0.015 (공식 추정치). tts-1 $15, tts-1-hd $30 / 100만 자
const OPENAI_PER_MIN = 0.015;
const OPENAI_PER_1M: Record<string, number> = { "tts-1": 15, "tts-1-hd": 30 };

// Gemini TTS — https://ai.google.dev/gemini-api/docs/pricing (2026-12-31 까지 가격, 2027-01-01 부터 약 2배)
//   3.8 Flash TTS: 오디오 출력 $9 / 100만 토큰, 3.8 Flash-Lite TTS: $6, 텍스트 입력 $0.50. 오디오 1초 = 32 토큰 (ai.google.dev/gemini-api/docs/tokens)
const GEMINI_AUDIO_PER_1M_TOKENS: Record<string, number> = { "gemini-3.8-flash-tts": 9, "gemini-3.8-flash-lite-tts": 6, "gemini-2.5-flash-preview-tts": 10, "gemini-2.5-pro-preview-tts": 20 };
const GEMINI_TOKENS_PER_SEC = 32;
const GEMINI_TEXT_PER_1M = 0.5;

// ElevenLabs API — https://elevenlabs.io/pricing/api : Flash $0.04 / 1천 자, Multilingual v2·v3 $0.08 / 1천 자 (유료 플랜 공통)
const ELEVEN_PER_1M: [RegExp, number][] = [
  [/flash|turbo/i, 40],
  [/./, 80],
];

// NAVER CLOVA Voice Premium — 공식 요금표는 콘솔(포털 > 서비스 > AI·NAVER API > CLOVA Voice)에만 있고 공개 문서로 확인하지 못했다.
//   서비스를 만들기만 해도 기본료가 붙는다(guide.ncloud-docs.com/docs/en/clovavoice-spec). 확인 전까지 비싼 쪽으로 어림한다.
const CLOVA_PER_1M_ESTIMATE = 80;

/**
 * 100만 자당 USD. model 은 제공자 모델 id (Google 은 음성 이름 — 이름에 모델이 들어 있다).
 * 모르는 값이면 그 제공자에서 가장 비싼 값 (예산 가드가 덜 잡지 않게).
 */
export function usdPer1MChars(provider: TTSProviderId, model: string): number {
  switch (provider) {
    case "google":
      return GOOGLE_PER_1M.find(([re]) => re.test(model))?.[1] ?? 30;
    case "openai": {
      if (OPENAI_PER_1M[model]) return OPENAI_PER_1M[model];
      return (OPENAI_PER_MIN / (KO_CHARS_PER_SEC * 60)) * 1e6;
    }
    case "gemini": {
      const audio = GEMINI_AUDIO_PER_1M_TOKENS[model] ?? 20;
      // 1글자 ≈ 1/KO_CHARS_PER_SEC 초 × 32 토큰. 텍스트 입력은 한국어 1글자 ≈ 1토큰으로 넉넉히
      return (audio * GEMINI_TOKENS_PER_SEC) / KO_CHARS_PER_SEC + GEMINI_TEXT_PER_1M;
    }
    case "elevenlabs":
      return ELEVEN_PER_1M.find(([re]) => re.test(model))![1];
    case "clova":
      return CLOVA_PER_1M_ESTIMATE;
  }
}

export const ttsCostUsd = (provider: TTSProviderId, model: string, chars: number) => (usdPer1MChars(provider, model) * chars) / 1e6;

/** 화면·문서용 무료 구간 메모 */
export const FREE_TIER_NOTE: Record<TTSProviderId, string> = {
  google: "WaveNet 월 400만 자 · Neural2·Chirp 3 HD 월 100만 자 무료",
  openai: "무료 구간 없음",
  gemini: "무료 등급(Free tier) 키는 무료",
  elevenlabs: "유료 플랜 단가 (무료 플랜 조건은 요금표 확인)",
  clova: "월 기본료 있음 (요금표 확인 필요)",
};
