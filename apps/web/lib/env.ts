// 서버 전용 설정 (11 문서 §9). 키는 서버 환경변수에만 둔다 — 클라이언트 번들에 들어가면 안 된다.
import "server-only";

const str = (k: string, fallback?: string) => process.env[k] || fallback;

export const env = {
  supabaseUrl: str("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: str("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: str("SUPABASE_SERVICE_ROLE_KEY"),

  llmProvider: str("LLM_PROVIDER", "anthropic") as "anthropic",
  // 09 문서 선정: 의도 분류 = Haiku 4.5, 답변 = Sonnet 5
  llmModelFast: str("LLM_MODEL_FAST", "claude-haiku-4-5")!,
  llmModelSmart: str("LLM_MODEL_SMART", "claude-sonnet-5")!,
  // 사진 인식(F-VIS-01) 모델. 비우면 LLM_MODEL_FAST 를 쓴다 — 후보 목록에서 고르기만 하므로 작은 모델로 충분
  llmModelVision: str("LLM_MODEL_VISION"),
  // 음성 지연 예산(답변 1.5초) 때문에 smart 모델은 낮은 effort 로 시작. Haiku 4.5 는 effort 미지원이라 smart 에만 적용
  llmSmartEffort: str("LLM_SMART_EFFORT", "low") as "low" | "medium" | "high",

  embeddingModel: str("EMBEDDING_MODEL", "text-embedding-3-small")!,
  sttModel: str("STT_MODEL", "gpt-transcribe")!,

  ttsProvider: str("TTS_PROVIDER", "google") as "google" | "openai",
  googleTtsCredentials: str("GOOGLE_TTS_CREDENTIALS_JSON"),
  googleTtsVoice: str("GOOGLE_TTS_VOICE", "ko-KR-Wavenet-A")!, // P3 에서 Chirp 3 HD 한국어 확인 후 교체
  openaiTtsVoice: str("OPENAI_TTS_VOICE", "coral")!,

  dailyBudgetUsd: Number(str("DAILY_BUDGET_USD", "5")),
  demoMode: str("DEMO_MODE", "false") === "true",
};
