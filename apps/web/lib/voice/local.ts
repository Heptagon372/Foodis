// 현지 발음 (design/11 문서 §3): 음식 이름을 그 나라 말 목소리로. 나라 → 언어 → 그 언어를 원어민처럼 말하는 목소리 순서.
// 클라이언트(버튼: 무엇을 어떤 언어로)·서버(route: 어떤 제공자·음성으로) 공용.
import type { TTSProviderId } from "./catalog";
import { baseLang, CHIRP3_LOCALE, CHIRP3_REGIONAL, ELEVEN_FLASH_LANGS, GEMINI_LANGS, OPENAI_LANGS } from "./langs";

/**
 * 나라 → 음식 이름에 쓰이는 대표 언어 (BCP-47, 브라우저 음성 대체에도 그대로 쓴다).
 * 공용어가 여럿이면 음식 이름이 주로 붙는 쪽 (캐나다 푸틴 → fr-CA, 남아공 보보티 → af-ZA, 벨기에 → fr-BE).
 */
export const COUNTRY_LANG: Record<string, string> = {
  AE: "ar-AE", AF: "fa-AF", AL: "sq-AL", AM: "hy-AM", AO: "pt-AO", AR: "es-AR", AT: "de-AT", AU: "en-AU", AZ: "az-AZ", BA: "bs-BA",
  BD: "bn-BD", BE: "fr-BE", BG: "bg-BG", BO: "es-BO", BR: "pt-BR", BT: "dz-BT", CA: "fr-CA", CD: "fr-CD", CH: "de-CH", CI: "fr-CI",
  CL: "es-CL", CM: "fr-CM", CN: "zh-CN", CO: "es-CO", CR: "es-CR", CU: "es-CU", CY: "el-CY", CZ: "cs-CZ", DE: "de-DE", DK: "da-DK",
  DO: "es-DO", DZ: "ar-DZ", EC: "es-EC", EE: "et-EE", EG: "ar-EG", ER: "ti-ER", ES: "es-ES", ET: "am-ET", FI: "fi-FI", FJ: "en-FJ",
  FR: "fr-FR", GB: "en-GB", GE: "ka-GE", GH: "en-GH", GR: "el-GR", GT: "es-GT", HN: "es-HN", HR: "hr-HR", HT: "ht-HT", HU: "hu-HU",
  ID: "id-ID", IE: "en-IE", IL: "he-IL", IN: "hi-IN", IQ: "ar-IQ", IR: "fa-IR", IS: "is-IS", IT: "it-IT", JM: "en-JM", JO: "ar-JO",
  JP: "ja-JP", KE: "sw-KE", KG: "ky-KG", KH: "km-KH", KR: "ko-KR", KZ: "kk-KZ", LA: "lo-LA", LB: "ar-LB", LK: "si-LK", LT: "lt-LT",
  LV: "lv-LV", LY: "ar-LY", MA: "ar-MA", MG: "mg-MG", ML: "fr-ML", MM: "my-MM", MN: "mn-MN", MT: "mt-MT", MV: "dv-MV", MX: "es-MX",
  MY: "ms-MY", MZ: "pt-MZ", NG: "en-NG", NI: "es-NI", NL: "nl-NL", NO: "nb-NO", NP: "ne-NP", NZ: "en-NZ", OM: "ar-OM", PA: "es-PA",
  PE: "es-PE", PG: "en-PG", PH: "fil-PH", PK: "ur-PK", PL: "pl-PL", PT: "pt-PT", PY: "es-PY", RO: "ro-RO", RS: "sr-RS", RU: "ru-RU",
  RW: "rw-RW", SA: "ar-SA", SD: "ar-SD", SE: "sv-SE", SG: "en-SG", SK: "sk-SK", SN: "fr-SN", SO: "so-SO", SV: "es-SV", SY: "ar-SY",
  TH: "th-TH", TJ: "tg-TJ", TM: "tk-TM", TN: "ar-TN", TO: "to-TO", TR: "tr-TR", TT: "en-TT", TW: "zh-TW", TZ: "sw-TZ", UA: "uk-UA",
  UG: "en-UG", US: "en-US", UY: "es-UY", UZ: "uz-UZ", VE: "es-VE", VN: "vi-VN", WS: "sm-WS", YE: "ar-YE", ZA: "af-ZA", ZW: "en-ZW",
  // 150개국 확장분 (모리셔스 → 프랑스어, 수리남 → 네덜란드어, 룩셈부르크 → 룩셈부르크어)
  BB: "en-BB", BH: "ar-BH", BJ: "fr-BJ", BN: "ms-BN", BY: "be-BY", BZ: "en-BZ", CV: "pt-CV", GY: "en-GY", KP: "ko-KP", KW: "ar-KW",
  LU: "lb-LU", MD: "ro-MD", ME: "sr-ME", MK: "mk-MK", MU: "fr-MU", MW: "en-MW", QA: "ar-QA", SI: "sl-SI", SR: "nl-SR", ZM: "en-ZM",
};

/** 서버가 시도할 목소리 하나. voice 는 제공자 음성 이름, lang 은 제공자에게 넘길 언어 */
export type LocalVoice = { provider: TTSProviderId; voice: string; model?: string; lang: string; style?: string };

const english = (tag: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(baseLang(tag)) ?? tag;
  } catch {
    return tag;
  }
};

/** Chirp 3 HD 로케일 (없으면 null) */
export function chirpLocale(tag: string): string | null {
  const [b, region] = [baseLang(tag), tag.split(/[-_]/)[1]?.toUpperCase()];
  return (region && CHIRP3_REGIONAL[`${b}-${region}`]) || CHIRP3_LOCALE[b] || null;
}

/**
 * 언어 → 시도할 목소리 순서. 원어민 로케일 음성(Google Chirp 3 HD)을 먼저, 그다음 다국어 모델.
 * 다국어 모델은 같은 목소리가 여러 언어를 말한다 → 말투 지시(style)·language_code 로 그 나라 발음을 강제한다.
 */
export function localVoices(tag: string): LocalVoice[] {
  const b = baseLang(tag);
  const out: LocalVoice[] = [];
  const chirp = chirpLocale(tag);
  if (chirp) out.push({ provider: "google", voice: `${chirp}-Chirp3-HD-Aoede`, lang: chirp });
  const native = `Say only this food name, the way a native ${english(tag)} speaker would pronounce it. Clear and natural, no extra words.`;
  if (OPENAI_LANGS.includes(b)) out.push({ provider: "openai", voice: "marin", model: "gpt-4o-mini-tts", lang: b, style: native });
  if (ELEVEN_FLASH_LANGS.includes(b)) out.push({ provider: "elevenlabs", voice: "Talia", model: "eleven_flash_v2_5", lang: b });
  if (GEMINI_LANGS.includes(b)) out.push({ provider: "gemini", voice: "Sulafat", model: "gemini-3.8-flash-lite-tts", lang: b, style: native });
  return out;
}

export const canSpeakLang = (tag: string) => localVoices(tag).length > 0;

/**
 * 음식 상세 "현지 발음" 버튼: 무엇을 어떤 언어로 말할지.
 * 그 나라 말을 하는 목소리가 없으면(라오어·몽골어 등) 영어 이름을 영어로 — native=false 로 알린다.
 */
export function localSpeech(f: { name_local: string | null; name_en: string; country_code: string }): { text: string; lang: string; native: boolean } {
  const tag = COUNTRY_LANG[f.country_code.toUpperCase()];
  if (tag && canSpeakLang(tag)) return { text: (f.name_local ?? "").trim() || f.name_en, lang: tag, native: true };
  return { text: f.name_en, lang: "en-US", native: false };
}
