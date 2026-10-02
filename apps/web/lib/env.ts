// 서버 전용 설정 (11 문서 §9). 키는 서버 환경변수에만 둔다 — 클라이언트 번들에 들어가면 안 된다.
import "server-only";

const str = (k: string, fallback?: string) => process.env[k] || fallback;

export const env = {
  supabaseUrl: str("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: str("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: str("SUPABASE_SERVICE_ROLE_KEY"),

  // ── LLM (lib/providers/registry/llm.ts)
  llmProvider: str("LLM_PROVIDER", "anthropic") as "anthropic",
  // 09 문서 선정: 의도 분류 = Haiku 4.5, 답변 = Sonnet 5
  llmModelFast: str("LLM_MODEL_FAST", "claude-haiku-4-5")!,
  llmModelSmart: str("LLM_MODEL_SMART", "claude-sonnet-5")!,
  // 사진 인식(F-VIS-01) 모델. 비우면 LLM_MODEL_FAST 를 쓴다 — 후보 목록에서 고르기만 하므로 작은 모델로 충분
  llmModelVision: str("LLM_MODEL_VISION"),
  // 음성 지연 예산(답변 1.5초) 때문에 smart 모델은 낮은 effort 로 시작. Haiku 4.5 는 effort 미지원이라 smart 에만 적용
  llmSmartEffort: str("LLM_SMART_EFFORT", "low") as "low" | "medium" | "high",


  // ── 임베딩 (registry/embed.ts)
  embeddingModel: str("EMBEDDING_MODEL", "text-embedding-3-small")!,

  // ── STT (registry/stt.ts)
  sttModel: str("STT_MODEL", "gpt-transcribe")!,
  // 서버 STT 체인 (10 문서 §3): 쉼표로 1순위부터. 키 없는 엔진은 건너뛰고, 실패하면 다음 엔진으로
  sttChainKo: str("STT_KO", "elevenlabs,clova,gemini,openai")!, // 한국어(사투리 포함)
  sttChainMulti: str("STT_MULTI", "elevenlabs,gemini,openai")!, // 언어 자동 감지(외국어)
  sttElevenlabsKey: str("ELEVENLABS_API_KEY"),
  sttElevenlabsModel: str("STT_ELEVENLABS_MODEL", "scribe_v2")!,
  sttClovaSecret: str("CLOVA_SPEECH_SECRET"), // CLOVA Speech 도메인 Secret Key
  sttClovaUrl: str("CLOVA_SPEECH_STT_URL"), // 비우면 단문 인식 기본 주소
  sttGeminiKey: str("GEMINI_API_KEY", process.env.GOOGLE_API_KEY),
  sttGeminiModel: str("STT_GEMINI_MODEL", "gemini-2.5-flash")!,
  // 사투리·외국어를 표준어로 옮길 때 LLM(빠른 등급)을 부를지. false 면 들은 말 그대로 묻는다
  sttNormalize: str("STT_NORMALIZE", "true") !== "false",

  // ── TTS (registry/tts.ts)
  ttsProvider: str("TTS_PROVIDER", "google") as "google" | "openai",
  googleTtsCredentials: str("GOOGLE_TTS_CREDENTIALS_JSON"),
  googleTtsVoice: str("GOOGLE_TTS_VOICE", "ko-KR-Wavenet-A")!, // P3 에서 Chirp 3 HD 한국어 확인 후 교체
  openaiTtsVoice: str("OPENAI_TTS_VOICE", "coral")!,

  // ── 운영
  dailyBudgetUsd: Number(str("DAILY_BUDGET_USD", "5")),
  demoMode: str("DEMO_MODE", "false") === "true",

  // ── 지도·음식점 (lib/places/, docs/design/12). 키가 없으면 /taste 화면이 "지도 키 설정 필요" 안내를 띄운다
  kakaoRestKey: str("KAKAO_REST_API_KEY"), // 로컬 API(키워드·주소 검색) — 서버 전용
  kakaoMapJsKey: str("NEXT_PUBLIC_KAKAO_MAP_JS_KEY"), // 지도 그리기 — 브라우저에 노출되는 키(도메인 등록으로 보호)
  mapProvider: (str("NEXT_PUBLIC_MAP_PROVIDER", "kakao") === "naver" ? "naver" : "kakao") as "kakao" | "naver",
  naverMapClientId: str("NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"), // NCP Maps(Dynamic Map) Client ID
  googleMapsKey: str("GOOGLE_MAPS_API_KEY"), // Places API (New) 평점 보강 — 선택
  googlePlacesDailyCap: Number(str("GOOGLE_PLACES_DAILY_CAP", "100")),
  ftcFranchiseKey: str("FTC_FRANCHISE_API_KEY"), // data.go.kr 공정위 가맹정보 서비스키 — 어드민 동기화에서만
};
