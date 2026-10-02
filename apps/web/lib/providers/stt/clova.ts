// STT: NAVER CLOVA Speech 단문 인식 (동기 REST, 60초 이하). 한국어 전용 엔진 + 부스팅 키워드 (10 문서 §2)
// 문서: https://api.ncloud-docs.com/docs/ai-application-service-clovaspeech-shortsentence (확인일 2026-10-02)
// 가격: https://www.ncloud.com/product/aiService/clovaSpeech#pricing — 단문 15초당 4원(VAT 별도), 15초 단위 올림 (확인일 2026-10-02)
// 형식: MP3·AAC·AC3·OGG·FLAC·WAV 만 받는다 (webm·mp4 ✗) → 서버 인식 모드의 클라이언트는 WAV 로 올린다 (lib/client/wav.ts).
import { ProviderError, type STTProvider } from "../types";
import { baseMime, call, type FetchLike } from "./common";

export const CLOVA_STT_URL = "https://clovaspeech-gw.ncloud.com/recog/v1/stt";
const KRW_PER_15S = 4;
const KRW_PER_USD = 1_400; // 환율 가정 (10 문서 §4) — 비용 추적용
const ACCEPTS = ["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3", "audio/aac", "audio/ogg", "audio/flac"];

/**
 * 부스팅: 탭으로 잇고 전체 512자 이하, 한국어 전용, 단어마다 3자 이상 (문서).
 * 음식 이름 중 한글로만 된 것을 앞에서부터 담는다.
 */
export function clovaBoostings(keywords: string[] | undefined): string {
  let out = "";
  for (const k of keywords ?? []) {
    const w = k.trim();
    if (w.length < 3 || !/^[가-힣\s]+$/.test(w) || out.split("\t").includes(w)) continue;
    const next = out ? `${out}\t${w}` : w;
    if (next.length > 512) break;
    out = next;
  }
  return out;
}

export function clovaSTT(o: { secret: string; url?: string; fetch?: FetchLike }): STTProvider {
  const f = o.fetch ?? fetch;
  return {
    async transcribe(audio, { lang, keywords, signal }) {
      // 한국어 전용으로 쓴다: 자동 감지(외국어) 체인에는 넣지 않는다 (registry). 형식이 안 맞으면 바로 다음 엔진으로
      if (lang !== "ko") throw new ProviderError("clova", "자동 감지 미지원 — 한국어 전용", false);
      const type = baseMime(audio.type);
      if (!ACCEPTS.includes(type)) throw new ProviderError("clova", `형식 미지원: ${type}`, false);
      const q = new URLSearchParams({ lang: "Kor" });
      const boost = clovaBoostings(keywords);
      if (boost) q.set("boostings", boost);
      const res = await call("clova", f, `${o.url ?? CLOVA_STT_URL}?${q}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-CLOVASPEECH-API-KEY": o.secret },
        body: audio,
        signal,
      });
      const data = (await res.json()) as { text?: string; quota?: number };
      // quota = 15초 단위 과금 단위 수
      const units = Math.max(1, data.quota ?? 1);
      return {
        text: (data.text ?? "").trim(),
        language: "ko",
        usage: { provider: "clova", operation: "stt", units: units * 15, unitType: "seconds", costUsd: (units * KRW_PER_15S) / KRW_PER_USD },
      };
    },
  };
}
