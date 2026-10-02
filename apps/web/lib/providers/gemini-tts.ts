// TTS 후보 D: Gemini TTS (Interactions API). 문서: ai.google.dev/gemini-api/docs/speech-generation (확인 2026-10-02)
//  - POST /v1beta/interactions, 헤더 x-goog-api-key. 모델 gemini-3.8-flash-tts / gemini-3.8-flash-lite-tts (GA), 화자 30명, 130개+ 언어 (언어는 글에서 자동 감지)
//  - 한 번에 받으면 RIFF 헤더가 붙은 WAV(24kHz 16bit 모노). 스트리밍은 헤더 없는 PCM(audio/l16) → <audio> MediaSource 로 이어 붙일 수 없다
//    → stream() 없이 synthesize 만 (클라이언트는 다 받은 뒤 재생). 혹시 PCM 이 오면 WAV 헤더를 붙인다 (lib/voice/wav.ts)
//  - store:false — Interactions 는 기본으로 대화를 서버에 남긴다(유료 55일). 음성 합성엔 필요 없으니 끈다
import { env } from "@/lib/env";
import { ttsCostUsd } from "@/lib/voice/pricing";
import { SPEECH_STYLE } from "@/lib/voice/styles";
import { GEMINI_PCM, isWav, pcmToWav, rateFromMime } from "@/lib/voice/wav";
import { ProviderError, type TTSOptions, type TTSProvider } from "./types";

const URL_ = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_VOICE = "Sulafat";

/** 요청 본문 (테스트에서 모양 확인) */
export function geminiRequest(text: string, opts: TTSOptions | undefined, model: string) {
  return {
    model,
    input: [
      {
        type: "user_input",
        content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: opts?.style ?? SPEECH_STYLE.foodi }] }],
      },
    ],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: opts?.voice ?? DEFAULT_VOICE }] },
    store: false,
  };
}

type Step = { type?: string; content?: { type?: string; data?: string; mime_type?: string; mimeType?: string }[] };

/** 응답에서 마지막 오디오 조각 (REST: steps[].content[].data, base64) */
export function extractGeminiAudio(json: unknown): { data: string; mime: string | null } | null {
  const steps = (json as { steps?: Step[] })?.steps;
  if (!Array.isArray(steps)) return null;
  let found: { data: string; mime: string | null } | null = null;
  for (const s of steps) {
    if (s.type && s.type !== "model_output") continue;
    for (const c of s.content ?? []) if (c.type === "audio" && typeof c.data === "string" && c.data) found = { data: c.data, mime: c.mime_type ?? c.mimeType ?? null };
  }
  return found;
}

/** base64 → WAV 바이트. 이미 WAV 면 그대로, 헤더 없는 PCM 이면 헤더를 붙인다 */
export function toWav(b64: string, mime: string | null): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  if (isWav(bytes)) return bytes;
  return pcmToWav(bytes, { ...GEMINI_PCM, sampleRate: rateFromMime(mime) ?? GEMINI_PCM.sampleRate });
}

export function geminiTTS(deps: { apiKey?: string; model?: string; fetch?: typeof fetch } = {}): TTSProvider {
  const apiKey = deps.apiKey ?? env.geminiApiKey ?? "";
  const doFetch = deps.fetch ?? fetch;
  return {
    async synthesize(text, opts) {
      const model = opts?.model ?? deps.model ?? env.geminiTtsModel;
      let res: Response;
      try {
        // 한 번에 다 만들어 돌려준다 → 긴 라디오 구간은 오래 걸린다. 클라이언트 첫 소리 제한(8초)보다 조금 길게
        res = await doFetch(URL_, {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify(geminiRequest(text, opts, model)),
          signal: AbortSignal.timeout(12_000),
        });
      } catch (e) {
        throw new ProviderError("gemini", (e as Error).message, true);
      }
      if (!res.ok) throw new ProviderError("gemini", `HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      const audio = extractGeminiAudio(await res.json().catch(() => null));
      if (!audio) throw new ProviderError("gemini", "응답에 오디오 없음", true);
      return {
        audio: new Blob([toWav(audio.data, audio.mime)]).stream(),
        contentType: "audio/wav",
        usage: { provider: "gemini", operation: "tts", units: text.length, unitType: "chars", costUsd: ttsCostUsd("gemini", model, text.length) },
      };
    },
  };
}
