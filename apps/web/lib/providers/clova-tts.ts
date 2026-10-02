// TTS 후보 E: NAVER CLOVA Voice Premium — 한국어 원어민 성우 음성. 문서: api.ncloud-docs.com/docs/en/ai-naver-clovavoice-ttspremium (확인 2026-10-02)
//  - POST https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts, application/x-www-form-urlencoded
//  - 헤더 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY (NCP 콘솔 Application 의 Client ID / Secret)
//  - 응답: MP3 바이너리 (한국어 최대 2,000자). 스트리밍 API 가 아니라 synthesize 만
//  - 주의: 서비스를 만들기만 해도 월 기본료가 붙는다 (guide.ncloud-docs.com/docs/en/clovavoice-spec) → 키가 있을 때만 체인에 들어간다
import { env } from "@/lib/env";
import { ttsCostUsd } from "@/lib/voice/pricing";
import { ProviderError, type TTSOptions, type TTSProvider } from "./types";

const URL_ = "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts";
const DEFAULT_SPEAKER = "vara";

/** 요청 (테스트에서 모양 확인) */
export function clovaRequest(text: string, opts: TTSOptions | undefined, keyId: string, key: string) {
  const form = new URLSearchParams({ speaker: opts?.voice ?? DEFAULT_SPEAKER, text, volume: "0", speed: "0", pitch: "0", format: "mp3" });
  return {
    url: URL_,
    init: {
      method: "POST",
      headers: { "X-NCP-APIGW-API-KEY-ID": keyId, "X-NCP-APIGW-API-KEY": key, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    } satisfies RequestInit,
  };
}

export function clovaTTS(deps: { keyId?: string; key?: string; fetch?: typeof fetch } = {}): TTSProvider {
  const keyId = deps.keyId ?? env.clovaKeyId ?? "";
  const key = deps.key ?? env.clovaKey ?? "";
  const doFetch = deps.fetch ?? fetch;
  return {
    async synthesize(text, opts) {
      const { url, init } = clovaRequest(text, opts, keyId, key);
      let res: Response;
      try {
        res = await doFetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
      } catch (e) {
        throw new ProviderError("clova", (e as Error).message, true);
      }
      if (!res.ok) throw new ProviderError("clova", `HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      const bytes = await res.arrayBuffer().catch((e: Error) => {
        throw new ProviderError("clova", `본문 수신 실패: ${e.message}`, true);
      });
      if (!bytes.byteLength) throw new ProviderError("clova", "빈 오디오", true);
      return {
        audio: new Blob([bytes]).stream(),
        contentType: "audio/mpeg",
        usage: { provider: "clova", operation: "tts", units: text.length, unitType: "chars", costUsd: ttsCostUsd("clova", opts?.voice ?? DEFAULT_SPEAKER, text.length) },
      };
    },
  };
}
