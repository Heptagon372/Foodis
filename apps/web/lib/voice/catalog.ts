// 목소리 카탈로그 (docs/design/11_목소리_카탈로그.md). 목소리 하나 = 제공자 · 모델 · 음성 이름 한 묶음 → 고르면 곧 TTS 모델 선택.
// 클라이언트·서버 공용 (키·환경변수 없음). 준비 여부(키 있음)는 서버가 /api/foodi/voices 로 알려 준다.
// 음성 이름·모델은 공식 문서에서 확인한 것만 (확인일 2026-10-02, 출처는 design/11 문서 §2).
import { ELEVEN_FLASH_LANGS, ELEVEN_V2_LANGS, GEMINI_LANGS, OPENAI_LANGS } from "./langs";
import { usdPer1MChars } from "./pricing";

export const TTS_PROVIDERS = ["google", "openai", "gemini", "elevenlabs", "clova"] as const;
export type TTSProviderId = (typeof TTS_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<TTSProviderId, string> = {
  google: "Google Cloud",
  openai: "OpenAI",
  gemini: "Gemini",
  elevenlabs: "ElevenLabs",
  clova: "NAVER CLOVA",
};

export type VoiceEntry = {
  /** 저장·요청에 쓰는 고정 id (바꾸면 사용자 설정이 풀린다) */
  id: string;
  provider: TTSProviderId;
  /** 제공자에게 넘기는 음성 이름 (ElevenLabs 는 이름 → 서버가 voice_id 로 찾는다) */
  voice: string;
  /** 제공자 모델 id. 없으면 제공자 기본 (Google 은 음성 이름에 모델이 들어 있다) */
  model?: string;
  /** 배지: 어떤 TTS 모델인지 ("Chirp 3 HD", "gpt-4o-mini-tts", "Flash v2.5") */
  modelLabel: string;
  label_ko: string;
  /** 톤·성별 느낌 (해요체) */
  desc_ko: string;
  gender: "female" | "male";
  /** 잘 말하는 언어 (BCP-47 기본 코드). 첫 번째가 주 언어 */
  langs: string[];
  /** MP3 를 받는 대로 흘려보낼 수 있나 — 아니면 다 받은 뒤 재생(첫 소리 늦음) */
  streaming: boolean;
  /** 첫 소리 체감 어림 (스트리밍 여부 · 공식 지연 수치 기준, 실측은 08 문서) */
  speed: "fast" | "normal" | "slow";
  /** 1 = $20/100만 자 미만 · 2 = $50 미만 · 3 = 그 이상 (목록가, 무료 구간 제외 — pricing.ts) */
  priceTier: 1 | 2 | 3;
};

// 다국어 모델이 공식 지원하는 언어 (현지 발음·외국 음식명용) — 한국어를 맨 앞에
const koFirst = (langs: string[]) => ["ko", ...langs.filter((l) => l !== "ko")];
const OPENAI = koFirst(OPENAI_LANGS);
const GEMINI = koFirst(GEMINI_LANGS);
const EL_FLASH_LANGS = koFirst(ELEVEN_FLASH_LANGS);
const EL_HQ_LANGS = koFirst(ELEVEN_V2_LANGS);

const G = "gemini-3.8-flash-tts";
const G_LITE = "gemini-3.8-flash-lite-tts";
const EL_FLASH = "eleven_flash_v2_5";
const EL_HQ = "eleven_multilingual_v2";

const v = (e: Omit<VoiceEntry, "priceTier">): VoiceEntry => ({ ...e, priceTier: tierOf(usdPer1MChars(e.provider, e.model ?? e.voice)) });

export const tierOf = (usdPerM: number): 1 | 2 | 3 => (usdPerM < 20 ? 1 : usdPerM < 50 ? 2 : 3);

export const VOICES: VoiceEntry[] = [
  // ── Google Cloud TTS (synthesizeSpeech MP3 — 한 번에 받는다). Chirp 3 HD 는 Gemini 와 같은 화자 이름을 쓴다
  v({ id: "google-chirp3-aoede", provider: "google", voice: "ko-KR-Chirp3-HD-Aoede", modelLabel: "Chirp 3 HD", label_ko: "아오이데", desc_ko: "여성 · 산뜻하고 가벼운 톤이에요", gender: "female", langs: ["ko"], streaming: false, speed: "normal" }),
  v({ id: "google-chirp3-leda", provider: "google", voice: "ko-KR-Chirp3-HD-Leda", modelLabel: "Chirp 3 HD", label_ko: "레다", desc_ko: "여성 · 앳되고 발랄해요", gender: "female", langs: ["ko"], streaming: false, speed: "normal" }),
  v({ id: "google-chirp3-charon", provider: "google", voice: "ko-KR-Chirp3-HD-Charon", modelLabel: "Chirp 3 HD", label_ko: "카론", desc_ko: "남성 · 차분하게 설명해 주는 해설가 톤", gender: "male", langs: ["ko"], streaming: false, speed: "normal" }),
  v({ id: "google-chirp3-puck", provider: "google", voice: "ko-KR-Chirp3-HD-Puck", modelLabel: "Chirp 3 HD", label_ko: "퍽", desc_ko: "남성 · 경쾌하고 밝아요", gender: "male", langs: ["ko"], streaming: false, speed: "normal" }),
  v({ id: "google-neural2-a", provider: "google", voice: "ko-KR-Neural2-A", modelLabel: "Neural2", label_ko: "뉴럴 A", desc_ko: "여성 · 또렷한 표준 안내 방송 톤", gender: "female", langs: ["ko"], streaming: false, speed: "fast" }),
  v({ id: "google-neural2-c", provider: "google", voice: "ko-KR-Neural2-C", modelLabel: "Neural2", label_ko: "뉴럴 C", desc_ko: "남성 · 또렷한 표준 안내 방송 톤", gender: "male", langs: ["ko"], streaming: false, speed: "fast" }),
  v({ id: "google-wavenet-a", provider: "google", voice: "ko-KR-Wavenet-A", modelLabel: "WaveNet", label_ko: "웨이브넷 A", desc_ko: "여성 · 가장 저렴해요 (예전 기본 목소리)", gender: "female", langs: ["ko"], streaming: false, speed: "fast" }),

  // ── OpenAI gpt-4o-mini-tts (받는 대로 재생 · 말투 지시 instructions). 공식 추천은 marin · cedar
  v({ id: "openai-marin", provider: "openai", voice: "marin", model: "gpt-4o-mini-tts", modelLabel: "gpt-4o-mini-tts", label_ko: "마린", desc_ko: "여성 느낌 · 자연스럽고 따뜻한 대화 톤 (공식 추천)", gender: "female", langs: OPENAI, streaming: true, speed: "fast" }),
  v({ id: "openai-cedar", provider: "openai", voice: "cedar", model: "gpt-4o-mini-tts", modelLabel: "gpt-4o-mini-tts", label_ko: "시더", desc_ko: "남성 느낌 · 낮고 안정적인 톤 (공식 추천)", gender: "male", langs: OPENAI, streaming: true, speed: "fast" }),
  v({ id: "openai-coral", provider: "openai", voice: "coral", model: "gpt-4o-mini-tts", modelLabel: "gpt-4o-mini-tts", label_ko: "코랄", desc_ko: "여성 느낌 · 밝고 친근해요", gender: "female", langs: OPENAI, streaming: true, speed: "fast" }),
  v({ id: "openai-ash", provider: "openai", voice: "ash", model: "gpt-4o-mini-tts", modelLabel: "gpt-4o-mini-tts", label_ko: "애시", desc_ko: "남성 느낌 · 부드럽고 차분해요", gender: "male", langs: OPENAI, streaming: true, speed: "fast" }),

  // ── Gemini TTS (Interactions API · WAV 한 번에 → 다 받은 뒤 재생). 30개 화자 중 안내·라디오에 맞는 것
  v({ id: "gemini-sulafat", provider: "gemini", voice: "Sulafat", model: G, modelLabel: "Gemini 3.8 Flash TTS", label_ko: "술라팟", desc_ko: "여성 · 따뜻한 톤 (Warm)", gender: "female", langs: GEMINI, streaming: false, speed: "slow" }),
  v({ id: "gemini-sulafat-lite", provider: "gemini", voice: "Sulafat", model: G_LITE, modelLabel: "Gemini 3.8 Flash-Lite TTS", label_ko: "술라팟 라이트", desc_ko: "같은 목소리 · 더 가볍고 저렴한 모델", gender: "female", langs: GEMINI, streaming: false, speed: "normal" }),
  v({ id: "gemini-achird", provider: "gemini", voice: "Achird", model: G, modelLabel: "Gemini 3.8 Flash TTS", label_ko: "아키르드", desc_ko: "남성 · 친근한 톤 (Friendly)", gender: "male", langs: GEMINI, streaming: false, speed: "slow" }),
  v({ id: "gemini-sadaltager", provider: "gemini", voice: "Sadaltager", model: G, modelLabel: "Gemini 3.8 Flash TTS", label_ko: "사달타게르", desc_ko: "남성 · 박식한 해설 톤 (Knowledgeable)", gender: "male", langs: GEMINI, streaming: false, speed: "slow" }),

  // ── ElevenLabs (HTTP 스트리밍 MP3). 같은 목소리를 빠른 모델 / 고품질 모델로 나눠 고를 수 있게
  v({ id: "eleven-talia-flash", provider: "elevenlabs", voice: "Talia", model: EL_FLASH, modelLabel: "Flash v2.5", label_ko: "탈리아", desc_ko: "여성 · 따뜻하고 부드러운 안내 톤 · 빠른 모델", gender: "female", langs: EL_FLASH_LANGS, streaming: true, speed: "fast" }),
  v({ id: "eleven-talia-hq", provider: "elevenlabs", voice: "Talia", model: EL_HQ, modelLabel: "Multilingual v2", label_ko: "탈리아 고품질", desc_ko: "같은 목소리 · 감정 표현이 풍부한 고품질 모델", gender: "female", langs: EL_HQ_LANGS, streaming: true, speed: "normal" }),
  v({ id: "eleven-darian-flash", provider: "elevenlabs", voice: "Darian", model: EL_FLASH, modelLabel: "Flash v2.5", label_ko: "대리언", desc_ko: "남성 · 묵직하고 따뜻한 이야기꾼 · 빠른 모델", gender: "male", langs: EL_FLASH_LANGS, streaming: true, speed: "fast" }),
  v({ id: "eleven-darian-hq", provider: "elevenlabs", voice: "Darian", model: EL_HQ, modelLabel: "Multilingual v2", label_ko: "대리언 고품질", desc_ko: "같은 목소리 · 감정 표현이 풍부한 고품질 모델", gender: "male", langs: EL_HQ_LANGS, streaming: true, speed: "normal" }),

  // ── NAVER CLOVA Voice Premium (한국어 원어민 성우 음성, MP3 한 번에)
  v({ id: "clova-vara", provider: "clova", voice: "vara", modelLabel: "CLOVA Voice Pro", label_ko: "아라", desc_ko: "여성 · 한국어 원어민 성우 톤, 감정 표현 지원", gender: "female", langs: ["ko"], streaming: false, speed: "normal" }),
  v({ id: "clova-vian", provider: "clova", voice: "vian", modelLabel: "CLOVA Voice Pro", label_ko: "이안", desc_ko: "남성 · 한국어 원어민 성우 톤, 감정 표현 지원", gender: "male", langs: ["ko"], streaming: false, speed: "normal" }),
];

const BY_ID = new Map(VOICES.map((e) => [e.id, e]));
export const findVoice = (id: string | null | undefined): VoiceEntry | undefined => (id ? BY_ID.get(id) : undefined);
export const isVoiceId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

/** 키는 있는데 사용자가 고르지 않았을 때 제공자별 기본 목소리 (Google·OpenAI 는 env 의 음성이 우선 — registry/tts.ts) */
export const DEFAULT_VOICE: Record<TTSProviderId, string> = {
  google: "google-wavenet-a",
  openai: "openai-coral",
  gemini: "gemini-sulafat",
  elevenlabs: "eleven-talia-flash",
  clova: "clova-vara",
};

// ── 라디오 2인 진행 (11 문서 §4): 이야기(요약·유래·역사·문화) = 진행자 A, 오프닝·연결·클로징 = 진행자 B
export type HostRole = "host-a" | "host-b";
export const HOST_ROLES: HostRole[] = ["host-a", "host-b"];
/** 자동 짝: 준비된 제공자 중 앞에서부터. A 는 차분한 이야기꾼(남성), B 는 밝은 진행자(여성) — 성별·톤이 갈리게 */
export const HOST_PREFS: Record<HostRole, string[]> = {
  "host-a": ["openai-cedar", "eleven-darian-flash", "google-chirp3-charon", "clova-vian", "google-neural2-c", "gemini-sadaltager"],
  "host-b": ["openai-marin", "eleven-talia-flash", "google-chirp3-aoede", "clova-vara", "google-neural2-a", "gemini-sulafat", "google-wavenet-a"],
};
export const HOST_LABEL: Record<HostRole, string> = { "host-a": "이야기꾼", "host-b": "진행자" };

/** 세그먼트 종류 → 진행자. 긴 이야기는 A, 짧은 연결 멘트는 B */
export const hostForSegment = (kind: string): HostRole => (kind === "open" || kind === "bridge" || kind === "close" ? "host-b" : "host-a");

/** 준비된 제공자로 자동 짝 정하기. 둘 다 못 정하면 null (서버 기본 체인 → 브라우저 음성) */
export function autoHosts(ready: (p: TTSProviderId) => boolean): [VoiceEntry, VoiceEntry] | null {
  const pick = (role: HostRole) => HOST_PREFS[role].map((id) => BY_ID.get(id)!).find((e) => ready(e.provider));
  const a = pick("host-a");
  const b = pick("host-b");
  return a && b ? [a, b] : null;
}

/** GET /api/foodi/voices 응답 */
export type VoiceInfo = VoiceEntry & { ready: boolean; usdPer1MChars: number };
export type VoicesResponse = {
  voices: VoiceInfo[];
  providers: { id: TTSProviderId; label: string; ready: boolean; freeTier: string }[];
  /** 고르지 않았을 때 실제로 나갈 목소리 (푸디 = 기본 체인 1순위, 라디오 = 자동 짝) */
  auto: { foodi: string | null; radio: [string, string] | null };
};

export const SPEED_LABEL: Record<VoiceEntry["speed"], string> = { fast: "빠름", normal: "보통", slow: "느림" };
export const PRICE_LABEL: Record<VoiceEntry["priceTier"], string> = { 1: "$", 2: "$$", 3: "$$$" };
