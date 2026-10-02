// STT: ElevenLabs Scribe v2 (batch REST). 언어 자동 감지 + keyterms 힌트. 외국어(자동 감지) 체인 1순위 (10 문서 §2)
// 문서: https://elevenlabs.io/docs/api-reference/speech-to-text/convert (확인일 2026-10-02)
// 가격: https://elevenlabs.io/pricing/api — Scribe v2 $0.22/시간, keyterms 추가 $0.05/시간 (확인일 2026-10-02)
import type { STTProvider } from "../types";
import { audioExt, call, estimateSeconds, normLang, pickKeywords, type FetchLike } from "./common";

export const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const PER_HOUR = 0.22;
const KEYTERMS_PER_HOUR = 0.05;
// keyterms 100개를 넘으면 요청마다 최소 20초로 과금된다 (API 문서) → 짧은 질문엔 손해. 넉넉히 아래로
const MAX_KEYTERMS = 80;

type Res = { text?: string; language_code?: string; language_probability?: number; audio_duration_secs?: number };

export function elevenlabsSTT(o: { apiKey: string; model?: string; fetch?: FetchLike }): STTProvider {
  const f = o.fetch ?? fetch;
  return {
    async transcribe(audio, { lang, keywords, signal }) {
      const form = new FormData();
      form.append("model_id", o.model ?? "scribe_v2");
      form.append("file", audio, `speech.${audioExt(audio.type)}`);
      // 비우면 자동 감지. ko 힌트면 한국어로 고정 (사투리도 한국어로 받아 적는다)
      if (lang === "ko") form.append("language_code", "ko");
      // 받아 적기만: "(웃음)" 같은 소리 태그가 질문에 섞이지 않게
      form.append("tag_audio_events", "false");
      form.append("diarize", "false");
      const terms = pickKeywords(keywords, MAX_KEYTERMS);
      for (const t of terms) form.append("keyterms", t); // 공식 SDK 와 같은 방식: 항목마다 같은 이름으로 반복
      const res = await call("elevenlabs", f, ELEVENLABS_STT_URL, { method: "POST", headers: { "xi-api-key": o.apiKey }, body: form, signal });
      const data = (await res.json()) as Res;
      const seconds = data.audio_duration_secs ? Math.max(1, Math.ceil(data.audio_duration_secs)) : estimateSeconds(audio);
      const perHour = PER_HOUR + (terms.length ? KEYTERMS_PER_HOUR : 0);
      return {
        text: (data.text ?? "").trim(),
        language: normLang(data.language_code) ?? (lang === "ko" ? "ko" : undefined),
        usage: { provider: "elevenlabs", operation: "stt", units: seconds, unitType: "seconds", costUsd: (seconds / 3600) * perHour },
      };
    },
  };
}
