// 제공자별 공식 지원 언어 (BCP-47 기본 코드). 확인일 2026-10-02 — 출처는 design/11 문서 §2.
// 현지 발음(local.ts)과 카탈로그 langs 가 같은 목록을 쓴다.

/** Google Chirp 3 HD 로케일 (GA) — docs.cloud.google.com/text-to-speech/docs/chirp3-hd. 기본 코드 → 기본 로케일 */
export const CHIRP3_LOCALE: Record<string, string> = {
  ar: "ar-XA", bn: "bn-IN", bg: "bg-BG", hr: "hr-HR", cs: "cs-CZ", da: "da-DK", nl: "nl-NL", en: "en-US", et: "et-EE", fi: "fi-FI",
  fr: "fr-FR", de: "de-DE", el: "el-GR", gu: "gu-IN", he: "he-IL", hi: "hi-IN", hu: "hu-HU", id: "id-ID", it: "it-IT", ja: "ja-JP",
  kn: "kn-IN", ko: "ko-KR", lv: "lv-LV", lt: "lt-LT", ml: "ml-IN", zh: "cmn-CN", mr: "mr-IN", nb: "nb-NO", pl: "pl-PL", pt: "pt-BR",
  ro: "ro-RO", ru: "ru-RU", sr: "sr-RS", sk: "sk-SK", sl: "sl-SI", es: "es-ES", sw: "sw-KE", sv: "sv-SE", ta: "ta-IN", te: "te-IN",
  th: "th-TH", tr: "tr-TR", uk: "uk-UA", ur: "ur-IN", vi: "vi-VN",
};
/** 같은 언어의 다른 로케일이 Chirp 3 HD 에 있으면 그쪽 (중남미 스페인어 → es-US, 캐나다 프랑스어 → fr-CA …) */
export const CHIRP3_REGIONAL: Record<string, string> = {
  "es-MX": "es-US", "es-AR": "es-US", "es-CO": "es-US", "es-PE": "es-US", "es-CL": "es-US", "es-CU": "es-US", "es-VE": "es-US",
  "es-EC": "es-US", "es-BO": "es-US", "es-GT": "es-US", "es-HN": "es-US", "es-NI": "es-US", "es-PA": "es-US", "es-PY": "es-US",
  "es-SV": "es-US", "es-UY": "es-US", "es-DO": "es-US", "es-CR": "es-US", "es-US": "es-US",
  "fr-CA": "fr-CA", "nl-BE": "nl-BE", "en-GB": "en-GB", "en-AU": "en-AU", "en-NZ": "en-AU", "en-IN": "en-IN", "en-IE": "en-GB",
};

/** OpenAI TTS — "generally follows the Whisper model" (developers.openai.com/api/docs/guides/text-to-speech) */
export const OPENAI_LANGS = [
  "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi", "hu", "is",
  "id", "it", "ja", "kn", "kk", "ko", "lv", "lt", "mk", "ms", "mr", "mi", "ne", "nb", "fa", "pl", "pt", "ro", "ru", "sr", "sk", "sl", "es", "sw",
  "sv", "fil", "ta", "th", "tr", "uk", "ur", "vi", "cy",
];

/** ElevenLabs Flash v2.5 (32개) — elevenlabs.io/docs/models. Multilingual v2 는 이 중 hu·nb·vi 를 뺀 29개 */
export const ELEVEN_FLASH_LANGS = [
  "en", "ja", "zh", "de", "hi", "fr", "ko", "pt", "it", "es", "id", "nl", "tr", "fil", "pl", "sv", "bg", "ro", "ar", "cs", "el", "fi", "hr", "ms",
  "sk", "da", "ta", "uk", "ru", "hu", "nb", "vi",
];
export const ELEVEN_V2_LANGS = ELEVEN_FLASH_LANGS.filter((l) => l !== "hu" && l !== "nb" && l !== "vi");

/** Gemini TTS (130개 이상) — ai.google.dev/gemini-api/docs/speech-generation 표에서 이 앱 나라들에 필요한 것만 */
export const GEMINI_LANGS = [
  "af", "am", "hy", "bn", "eu", "be", "bs", "bg", "my", "ca", "zh", "hr", "cs", "da", "dz", "nl", "en", "et", "fil", "fi", "fr", "gl", "ka", "de", "el",
  "gu", "ht", "ha", "he", "hi", "hu", "is", "id", "it", "ja", "kn", "kk", "km", "rw", "ko", "ky", "lt", "mk", "ml", "mt", "mr", "ne", "az", "nb",
  "pl", "pt", "pa", "ro", "ru", "sr", "si", "sk", "sl", "so", "es", "ar", "lv", "ms", "sw", "sv", "tg", "ta", "te", "th", "ti", "to", "tr", "uz",
  "vi", "fa",
];

/** "ja-JP" → "ja", "zh-Hant-TW" → "zh", "fil" → "fil" */
export const baseLang = (tag: string) => tag.trim().split(/[-_]/)[0].toLowerCase();
