import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { env } from "@/lib/env";
import { ProviderError, type TTSProvider } from "./types";

// TTS 후보 A: Google Cloud TTS. 월 100만 자 무료 → 경진대회 규모면 사실상 0원 (09 문서 §5.4)
// stream() 은 일부러 없다 → /api/foodi/tts 가 synthesize(한 번에 받기)로 보낸다. streamingSynthesize 를 안 쓰는 이유 (08 문서 §6):
//  - 출력이 PCM·ALAW·MULAW·OGG_OPUS 만 된다 (MP3 불가). 브라우저 MediaSource 는 Ogg 를 거의 못 받고(Safari·Chrome ✗),
//    PCM 은 <audio> 가 아니라 Web Audio 로 직접 이어 붙여야 한다 → iOS 에서 잠금 해제한 <audio> 하나를 재사용하는 라디오 구조와 안 맞는다.
//    서버에서 MP3 로 바꾸려면 인코더(ffmpeg·lame wasm)를 서버리스에 실어야 한다 — 무겁다.
//  - Chirp 3 HD 음성 전용이라 현재 기본(Wavenet)에는 쓸 수 없고, gRPC 양방향 스트림이라 요청마다 연결 비용도 있다.
//  대신 Google 은 데모 팩 미리 만들기 / 첫 문장 먼저 합성으로 대응한다.
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
