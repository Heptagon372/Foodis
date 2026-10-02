// 서버 전용 설정 (11 문서 §9). 키는 서버 환경변수에만 둔다 — 클라이언트 번들에 들어가면 안 된다.
import "server-only";

const str = (k: string, fallback?: string) => process.env[k] || fallback;

export const env = {
  supabaseUrl: str("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: str("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: str("SUPABASE_SERVICE_ROLE_KEY"),

  // ── LLM (lib/providers/registry/llm.ts · docs/design/09_AI_제공자_구성_v2.md)
  // 시도 순서. 키 없는 제공자는 건너뛰고, 장애(429·5xx·시간 초과·키 오류)면 다음 제공자로. anthropic 은 넣을 때만 쓴다
  llmProviders: (str("LLM_PROVIDERS", "gemini,openai")!).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  // Gemini: 의도 분류·답변 모두 3.5 Flash-Lite ($0.30/$2.50). 음성 지연 예산(답변 1.5초) 때문에 thinking 은 minimal
  llmGeminiFast: str("LLM_GEMINI_FAST", "gemini-3.5-flash-lite")!,
  llmGeminiSmart: str("LLM_GEMINI_SMART", "gemini-3.5-flash-lite")!,
  llmGeminiVision: str("LLM_GEMINI_VISION"), // 비우면 fast 모델
  llmGeminiFastThinking: str("LLM_GEMINI_FAST_THINKING", "minimal") as "minimal" | "low" | "medium" | "high",
  llmGeminiSmartThinking: str("LLM_GEMINI_SMART_THINKING", "minimal") as "minimal" | "low" | "medium" | "high",
  // OpenAI: GPT-6 Luna ($0.10/$0.50). reasoning 은 none — 생각 토큰만큼 첫 음성이 늦어진다
  llmOpenaiFast: str("LLM_OPENAI_FAST", "gpt-6-luna")!,
  llmOpenaiSmart: str("LLM_OPENAI_SMART", "gpt-6-luna")!,
  llmOpenaiVision: str("LLM_OPENAI_VISION"),
  llmOpenaiFastEffort: str("LLM_OPENAI_FAST_EFFORT", "none") as "none" | "minimal" | "low" | "medium" | "high",
  llmOpenaiSmartEffort: str("LLM_OPENAI_SMART_EFFORT", "none") as "none" | "minimal" | "low" | "medium" | "high",
  // Anthropic (선택): 예전 이름 LLM_MODEL_FAST · LLM_MODEL_SMART · LLM_MODEL_VISION · LLM_SMART_EFFORT 도 그대로 읽는다
  llmAnthropicFast: (str("LLM_ANTHROPIC_FAST") ?? str("LLM_MODEL_FAST", "claude-haiku-4-5"))!,
  llmAnthropicSmart: (str("LLM_ANTHROPIC_SMART") ?? str("LLM_MODEL_SMART", "claude-sonnet-5"))!,
  llmAnthropicVision: str("LLM_ANTHROPIC_VISION") ?? str("LLM_MODEL_VISION"),
  // Haiku 4.5 는 effort 미지원이라 smart 에만 적용
  llmAnthropicSmartEffort: (str("LLM_ANTHROPIC_SMART_EFFORT") ?? str("LLM_SMART_EFFORT", "low")) as "low" | "medium" | "high",

  // ── 임베딩 (registry/embed.ts) — 제공자를 바꾸면 임베딩 전체를 다시 만들어야 한다 (질의·문서 벡터가 같은 모델이어야 비교 가능)
  // 데이터 파이프라인(s09)도 같은 EMBED_PROVIDER · EMBEDDING_MODEL 을 읽는다. 모델 기본값은 제공자에 따라: openai → text-embedding-3-small, gemini → gemini-embedding-2
  embedProvider: str("EMBED_PROVIDER", "openai") as "openai" | "gemini",
  embeddingModel: str("EMBEDDING_MODEL", str("EMBED_PROVIDER") === "gemini" ? "gemini-embedding-2" : "text-embedding-3-small")!,

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

  // ── TTS (registry/tts.ts · 목소리 카탈로그 lib/voice/catalog.ts · design/11 문서)
  // 기본 체인의 1순위. 사용자가 목소리를 고르면 그 제공자가 먼저, 실패하면 이 순서로
  ttsProvider: str("TTS_PROVIDER", "google") as "google" | "openai" | "gemini" | "elevenlabs" | "clova",
  googleTtsCredentials: str("GOOGLE_TTS_CREDENTIALS_JSON"),
  googleTtsVoice: str("GOOGLE_TTS_VOICE", "ko-KR-Wavenet-A")!, // P3 에서 Chirp 3 HD 한국어 확인 후 교체
  openaiTtsVoice: str("OPENAI_TTS_VOICE", "coral")!,
  geminiApiKey: str("GEMINI_API_KEY"),
  geminiTtsModel: str("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")!,
  elevenlabsApiKey: str("ELEVENLABS_API_KEY"),
  // "Talia=voice_id,Darian=voice_id" — 비우면 이름으로 이 계정의 음성을 찾는다 (첫 요청 때 한 번)
  elevenlabsVoiceIds: str("ELEVENLABS_VOICE_IDS"),
  clovaKeyId: str("CLOVA_VOICE_KEY_ID"),
  clovaKey: str("CLOVA_VOICE_KEY"),

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

  // ── 음식 뉴스 (lib/news/, docs/design/15). 네이버 개발자센터 '검색' API 애플리케이션 — 지도(NCP) 키와 다르다
  naverClientId: str("NAVER_CLIENT_ID"),
  naverClientSecret: str("NAVER_CLIENT_SECRET"),
  cronSecret: str("CRON_SECRET"), // /api/news/crawl 을 스케줄러(Vercel Cron 등)가 부를 때 Bearer 토큰
};
