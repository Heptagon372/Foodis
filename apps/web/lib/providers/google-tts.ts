import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { env } from "@/lib/env";
import { ProviderError, type TTSProvider } from "./types";

// TTS 후보 A: Google Cloud TTS. 월 100만 자 무료 → 경진대회 규모면 사실상 0원 (09 문서 §5.4)
let shared: TextToSpeechClient | undefined;
const client = () =>
  (shared ??= new TextToSpeechClient(env.googleTtsCredentials ? { credentials: JSON.parse(env.googleTtsCredentials) } : {}));

export function googleTTS(): TTSProvider {
  return {
    async synthesize(text, opts) {
      try {
        const [res] = await client().synthesizeSpeech({
          input: { text },
          voice: { languageCode: "ko-KR", name: opts?.voice ?? env.googleTtsVoice },
          audioConfig: { audioEncoding: "MP3" },
        });
        const bytes = res.audioContent;
        if (!bytes || typeof bytes === "string") throw new ProviderError("google_tts", "audioContent 없음", true);
        return {
          audio: new Blob([new Uint8Array(bytes)]).stream(),
          usage: { provider: "google_tts", operation: "tts", units: text.length, unitType: "chars", costUsd: 0 }, // 무료 범위 가정
        };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw new ProviderError("google_tts", (e as Error).message, true);
      }
    },
  };
}
