import { describe, expect, it } from "vitest";
import { PREVIEW_COUNTRIES } from "@/lib/preview/countries";
import { baseLang } from "./langs";
import { chirpLocale, COUNTRY_LANG, localSpeech, localVoices } from "./local";

describe("현지 발음 — 나라 → 언어 → 목소리", () => {
  it("시드의 모든 나라에 언어가 있다", () => {
    const missing = PREVIEW_COUNTRIES.map((c) => c.code).filter((cc) => !COUNTRY_LANG[cc]);
    expect(missing).toEqual([]);
  });

  it("나라 지도에 있는 모든 언어가 말할 목소리로 풀린다 (없으면 영어 이름·영어 목소리로)", () => {
    for (const [cc, tag] of Object.entries(COUNTRY_LANG)) {
      const s = localSpeech({ name_local: "x", name_en: "Dish", country_code: cc });
      expect(localVoices(s.lang).length, `${cc} ${tag}`).toBeGreaterThan(0);
      if (s.native) expect(s.lang).toBe(tag);
      else expect(s).toEqual({ text: "Dish", lang: "en-US", native: false });
    }
  });

  it("주요 언어는 원어민 로케일 음성(Chirp 3 HD)이 1순위", () => {
    const want: Record<string, string> = { ja: "ja-JP", zh: "cmn-CN", it: "it-IT", fr: "fr-FR", es: "es-ES", de: "de-DE", ar: "ar-XA", tr: "tr-TR", hi: "hi-IN", th: "th-TH", vi: "vi-VN", id: "id-ID", pt: "pt-BR", ru: "ru-RU", ko: "ko-KR" };
    for (const [b, locale] of Object.entries(want)) {
      const first = localVoices(b)[0];
      expect(first, b).toMatchObject({ provider: "google", voice: `${locale}-Chirp3-HD-Aoede`, lang: locale });
    }
  });

  it("지역 로케일: 중남미 스페인어 → es-US, 캐나다 → fr-CA, 오스트리아 독일어 → de-DE", () => {
    expect(chirpLocale("es-MX")).toBe("es-US");
    expect(chirpLocale("es-ES")).toBe("es-ES");
    expect(chirpLocale("fr-CA")).toBe("fr-CA");
    expect(chirpLocale("de-AT")).toBe("de-DE");
    expect(chirpLocale("am-ET")).toBeNull();
  });

  it("Chirp 에 없는 언어(암하라어)는 다국어 모델로 · 말투 지시에 언어 이름", () => {
    const vs = localVoices("am-ET");
    expect(vs.map((v) => v.provider)).toEqual(["gemini"]);
    expect(vs[0].style).toContain("Amharic");
  });

  it("현지 이름이 없으면 영어 이름을 그 나라 목소리로", () => {
    expect(localSpeech({ name_local: null, name_en: "Sushi", country_code: "JP" })).toEqual({ text: "Sushi", lang: "ja-JP", native: true });
    expect(localSpeech({ name_local: "饺子", name_en: "Jiaozi", country_code: "cn" })).toEqual({ text: "饺子", lang: "zh-CN", native: true });
    // 라오어는 지원하는 목소리가 없다 → 영어
    expect(localSpeech({ name_local: "ລາບ", name_en: "Larb", country_code: "LA" })).toEqual({ text: "Larb", lang: "en-US", native: false });
    expect(baseLang("zh-Hant-TW")).toBe("zh");
  });
});
